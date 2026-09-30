import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createBattleServer } from '../src/server/server.js';
import { emptyInput } from '../src/shared/game/types.js';
import type { ClientMessage, ServerMessage } from '../src/shared/protocol.js';

class Client {
  messages: ServerMessage[] = [];
  ws: WebSocket;
  pending: { predicate: (m: ServerMessage) => boolean; resolve: (m: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:3000' });
    this.ws.on('message', data => {
      const msg: ServerMessage = JSON.parse(data.toString()); this.messages.push(msg);
      for (const waiter of [...this.pending]) if (waiter.predicate(msg)) {
        this.pending.splice(this.pending.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(msg);
      }
    });
  }
  wait<T extends ServerMessage['type']>(type: T, predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 5000): Promise<Extract<ServerMessage, { type: T }>> {
    const match = (m: ServerMessage) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>);
    const found = this.messages.find(match); if (found) return Promise.resolve(found as Extract<ServerMessage, { type: T }>);
    return new Promise((resolve, reject) => {
      const entry = { predicate: match, resolve, reject, timer: setTimeout(() => {
        this.pending.splice(this.pending.indexOf(entry), 1); reject(new Error(`Timeout waiting for ${type}`));
      }, timeout) };
      this.pending.push(entry);
    });
  }
  send(msg: ClientMessage) { this.ws.send(JSON.stringify(msg)); }
  clear() { this.messages = []; }
  close() { for (const p of this.pending) clearTimeout(p.timer); this.pending = []; this.ws.terminate(); }
}

test('real WebSocket room: join errors, combat, disconnect verdict, rematch and cleanup', { timeout: 20000 }, async () => {
  const server = createBattleServer({ port: 0, countdownTicks: 3 }); const port = await server.listen();
  const a = new Client(port), b = new Client(port), c = new Client(port);
  try {
    const wa = await a.wait('welcome'), wb = await b.wait('welcome'); await c.wait('welcome');
    a.send({ type: 'create', version: 1, name: 'Alice' });
    const created = await a.wait('room'); const code = created.room.code;
    b.send({ type: 'join', version: 1, name: 'Bob', code: 'ZZZZZZ' });
    assert.match((await b.wait('error')).message, /不存在/);
    b.send({ type: 'join', version: 1, name: 'Bob', code });
    await b.wait('room', m => m.room.players.length === 2);
    c.send({ type: 'join', version: 1, name: 'Third', code });
    assert.match((await c.wait('error')).message, /已满/);
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    const started = await a.wait('room', m => m.room.phase === 'playing'); const matchId = started.room.matchId;
    a.send({ type: 'input', matchId, seq: 1, input: { ...emptyInput(), shoot: true } });
    // Retransmitting the same sequence must not execute a second shot.
    a.send({ type: 'input', matchId, seq: 1, input: { ...emptyInput(), shoot: true } });
    const damaged = await b.wait('snapshot', m => m.world.mechs.find(p => p.id === wb.playerId)!.hp < 600);
    assert.equal(damaged.world.mechs.find(p => p.id === wb.playerId)!.hp, 540);
    assert.equal(damaged.world.mechs.find(p => p.id === wa.playerId)!.ammo, 19);
    assert.equal(damaged.ack[wa.playerId], 1);
    b.close();
    const ended = await a.wait('snapshot', m => m.world.result?.reason === 'disconnect');
    assert.equal(ended.world.result!.winner, 'BLUE');
    c.clear(); c.send({ type: 'join', version: 1, name: 'Third', code });
    await c.wait('room', m => m.room.players.length === 2);
    a.clear();
    a.send({ type: 'ready', ready: true }); c.send({ type: 'ready', ready: true });
    const restarted = await a.wait('room', m => m.room.phase === 'playing');
    assert.notEqual(restarted.room.matchId, matchId);
    const reset = await a.wait('snapshot', m => m.matchId === restarted.room.matchId);
    assert.ok(reset.world.mechs.every(p => p.hp === 600));
    assert.equal(reset.ack[wa.playerId], 0);
    a.send({ type: 'input', matchId, seq: 2, input: { ...emptyInput(), shoot: true } });
    const later = await a.wait('snapshot', m => m.matchId === restarted.room.matchId && m.world.tick >= 6);
    assert.equal(later.ack[wa.playerId], 0);
    a.send({ type: 'leave' }); c.send({ type: 'leave' });
    await a.wait('left'); await c.wait('left');
    const health = await fetch(`http://127.0.0.1:${port}/healthz`).then(r => r.json());
    assert.equal(health.rooms, 0);
  } finally { a.close(); b.close(); c.close(); await server.close(); }
});

test('room isolation, heartbeat expiry, payload cap and input queue bounds', { timeout: 10000 }, async () => {
  const server = createBattleServer({ port: 0, heartbeatMs: 250, heartbeatTimeoutMs: 500, countdownTicks: 1, maxRooms: 3 });
  const port = await server.listen();
  const a = new Client(port), b = new Client(port), c = new Client(port);
  try {
    await a.wait('welcome'); await b.wait('welcome'); await c.wait('welcome');
    a.send({ type: 'create', version: 1, name: 'A' }); const code = (await a.wait('room')).room.code;
    c.send({ type: 'create', version: 1, name: 'C' }); const other = (await c.wait('room')).room.code;
    assert.notEqual(code, other);
    b.send({ type: 'join', version: 1, name: 'B', code }); await b.wait('room');
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    const matchId = (await a.wait('room', m => m.room.phase === 'playing')).room.matchId;
    await a.wait('snapshot', m => m.world.tick > 3);
    assert.equal(c.messages.some(m => m.type === 'snapshot'), false);
    // A short burst represents delayed TCP delivery, not an automatic disconnect.
    for (let seq = 1; seq <= 30; seq++) a.send({ type: 'input', matchId, seq, input: { ...emptyInput(), shoot: true } });
    await a.wait('snapshot', m => m.matchId === matchId && Object.values(m.ack).includes(30));
    assert.equal(a.ws.readyState, WebSocket.OPEN);
    // An invalid sequence jump still closes the connection.
    const closed = new Promise<number>(resolve => a.ws.once('close', resolve));
    a.send({ type: 'input', matchId, seq: 151, input: emptyInput() });
    assert.equal(await closed, 1008);
    await b.wait('snapshot', m => m.world.result?.reason === 'disconnect');
    const oversized = new Promise<number>(resolve => c.ws.once('close', resolve));
    c.ws.send('x'.repeat(9000));
    assert.equal(await oversized, 1009);
    const silent = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:3000', autoPong: false });
    await new Promise<void>(resolve => silent.once('close', () => resolve()));
    assert.equal(silent.readyState, WebSocket.CLOSED);
  } finally { a.close(); b.close(); c.close(); await server.close(); }
});

test('inactive room expires and connected clients can create a new room', async () => {
  const server = createBattleServer({ port: 0, idleMs: 80 }); const port = await server.listen();
  const a = new Client(port);
  try {
    await a.wait('welcome'); a.send({ type: 'create', version: 1, name: 'A' }); await a.wait('room');
    await a.wait('left'); a.clear();
    a.send({ type: 'create', version: 1, name: 'A' }); assert.equal((await a.wait('room')).room.phase, 'waiting');
  } finally { a.close(); await server.close(); }
});

test('server refuses untrusted Origin and malformed payloads do not crash a room', async () => {
  const server = createBattleServer({ port: 0 }); const port = await server.listen();
  const bad = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://not-allowed.example' });
  const refused = new Promise<void>(resolve => bad.on('unexpected-response', (_req, res) => { assert.equal(res.statusCode, 403); res.resume(); resolve(); }));
  const good = new Client(port);
  try {
    await refused; await good.wait('welcome');
    good.ws.send('{broken'); assert.match((await good.wait('error')).message, /格式/);
    good.send({ type: 'create', version: 1, name: 'Pilot' });
    assert.equal((await good.wait('room')).room.players.length, 1);
  } finally { good.close(); bad.on('error', () => {}); bad.terminate(); await server.close(); }
});

test('countdown departure cancels start and missing input eventually releases movement', async () => {
  const server = createBattleServer({ port: 0, countdownTicks: 30 }); const port = await server.listen();
  const a = new Client(port), b = new Client(port);
  try {
    const wa = await a.wait('welcome'); await b.wait('welcome');
    a.send({ type: 'create', version: 1, name: 'A' }); const code = (await a.wait('room')).room.code;
    b.send({ type: 'join', version: 1, name: 'B', code }); await b.wait('room');
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    await b.wait('room', m => m.room.phase === 'countdown'); a.clear();
    b.send({ type: 'leave' }); await b.wait('left');
    assert.equal((await a.wait('room', m => m.room.players.length === 1)).room.phase, 'waiting');
    b.clear(); b.send({ type: 'join', version: 1, name: 'B', code }); await b.wait('room'); a.clear();
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    const match = (await a.wait('room', m => m.room.phase === 'playing')).room.matchId;
    a.send({ type: 'input', matchId: match, seq: 1, input: { ...emptyInput(), moveZ: -1, yaw: Math.PI } });
    const s1 = await a.wait('snapshot', m => m.world.tick >= 24);
    const s2 = await a.wait('snapshot', m => m.world.tick >= 36);
    assert.deepEqual(s1.world.mechs.find(m => m.id === wa.playerId)!.position, s2.world.mechs.find(m => m.id === wa.playerId)!.position);
  } finally { a.close(); b.close(); await server.close(); }
});
