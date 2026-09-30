import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, MAX_PAYLOAD, PROTOCOL_VERSION } from '../shared/protocol.js';
import type { ClientMessage, ServerMessage, RoomInfo, RoomPlayer } from '../shared/protocol.js';
import { createWorld, stepWorld } from '../shared/game/simulation.js';
import { SIM } from '../shared/game/config.js';
import { emptyInput, heldInput } from '../shared/game/types.js';
import type { MechInput, World } from '../shared/game/types.js';

interface Peer {
  id: string; ws: WebSocket; room: string | null; name: string;
  queue: { seq: number; input: MechInput }[]; held: MechInput; ack: number; lastSeq: number;
  lastInputAt: number; alive: boolean; rateAt: number; messages: number;
}
interface Room extends RoomInfo { world: World | null; idleAt: number }
export interface ServerOptions {
  host?: string; port?: number; allowedOrigins?: string[]; maxRooms?: number; maxConnections?: number;
  countdownTicks?: number; heartbeatMs?: number; idleMs?: number;
}

export function createBattleServer(options: ServerOptions = {}) {
  const rooms = new Map<string, Room>();
  const peers = new Map<string, Peer>();
  const origins = options.allowedOrigins ?? ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const http = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, version: PROTOCOL_VERSION, rooms: rooms.size }));
    } else { res.writeHead(404); res.end('Not found'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
  http.on('upgrade', (req, socket, head) => {
    if ((req.url !== '/' && req.url !== '/ws') || !req.headers.origin || !origins.includes(req.headers.origin) || peers.size >= (options.maxConnections ?? 200)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  const send = (peer: Peer, message: ServerMessage) => {
    if (peer.ws.readyState !== WebSocket.OPEN) return;
    if (peer.ws.bufferedAmount > 512 * 1024) { peer.ws.close(1013, 'Slow connection'); return; }
    peer.ws.send(JSON.stringify(message));
  };
  const broadcast = (room: Room, message: ServerMessage) => {
    for (const player of room.players) { const p = peers.get(player.id); if (p) send(p, message); }
  };
  const roomInfo = (room: Room): RoomInfo => ({ code: room.code, phase: room.phase, players: room.players,
    matchId: room.matchId, countdown: room.countdown });
  const notifyRoom = (room: Room) => broadcast(room, { type: 'room', room: roomInfo(room) });
  const snapshot = (room: Room) => {
    if (room.world) broadcast(room, { type: 'snapshot', matchId: room.matchId, world: room.world,
      ack: Object.fromEntries(room.players.map(p => [p.id, peers.get(p.id)?.ack ?? 0])) });
  };
  const resetInput = (peer: Peer) => {
    peer.queue = []; peer.held = emptyInput(); peer.ack = 0; peer.lastSeq = 0; peer.lastInputAt = 0;
  };
  const leave = (peer: Peer) => {
    const room = peer.room ? rooms.get(peer.room) : undefined;
    peer.room = null; resetInput(peer);
    if (!room) return;
    const departing = room.players.find(p => p.id === peer.id);
    if (room.phase === 'playing' && room.world && departing) {
      room.world.result = { winner: departing.team === 'BLUE' ? 'RED' : 'BLUE', reason: 'disconnect' };
      room.phase = 'finished';
      snapshot(room);
    } else if (room.phase === 'countdown') { room.phase = 'waiting'; room.world = null; room.countdown = 0; }
    room.players = room.players.filter(p => p.id !== peer.id);
    for (const p of room.players) p.ready = false;
    room.idleAt = performance.now();
    if (!room.players.length) rooms.delete(room.code);
    else notifyRoom(room);
  };
  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do { code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (rooms.has(code));
    return code;
  };
  const error = (peer: Peer, message: string) => send(peer, { type: 'error', message });
  function handle(peer: Peer, msg: ClientMessage) {
    if (msg.type === 'ping') { send(peer, { type: 'pong', time: msg.time }); return; }
    if (msg.type === 'leave') { leave(peer); send(peer, { type: 'left' }); return; }
    if (msg.type === 'create' || msg.type === 'join') {
      if (peer.room) { error(peer, '请先退出当前房间。'); return; }
      let room: Room | undefined;
      if (msg.type === 'create') {
        if (rooms.size >= (options.maxRooms ?? 80)) { error(peer, '服务器房间已满，请稍后重试。'); return; }
        room = { code: generateCode(), phase: 'waiting', players: [], matchId: '', countdown: 0, world: null, idleAt: performance.now() };
        rooms.set(room.code, room);
      } else {
        room = rooms.get(msg.code);
        if (!room) { error(peer, '房间不存在或已关闭。'); return; }
        if (room.players.length >= 2) { error(peer, '房间已满。'); return; }
        if (room.phase === 'playing' || room.phase === 'countdown') { error(peer, '对局已开始。'); return; }
      }
      const player: RoomPlayer = { id: peer.id, name: msg.name,
        team: room.players.some(p => p.team === 'BLUE') ? 'RED' : 'BLUE', ready: false };
      peer.name = msg.name; peer.room = room.code; room.players.push(player); room.phase = 'waiting';
      room.world = null; room.matchId = ''; room.idleAt = performance.now();
      for (const p of room.players) p.ready = false;
      notifyRoom(room); return;
    }
    const room = peer.room ? rooms.get(peer.room) : undefined;
    if (!room) { error(peer, '请先加入房间。'); return; }
    if (msg.type === 'ready') {
      if (room.phase !== 'waiting' && room.phase !== 'finished') { error(peer, '当前不能修改准备状态。'); return; }
      room.players.find(p => p.id === peer.id)!.ready = msg.ready;
      room.idleAt = performance.now();
      if (room.players.length === 2 && room.players.every(p => p.ready)) {
        room.matchId = randomUUID(); room.world = createWorld(room.players);
        room.phase = 'countdown'; room.countdown = options.countdownTicks ?? SIM.countdownTicks;
        for (const p of room.players) { const client = peers.get(p.id); if (client) resetInput(client); }
        notifyRoom(room); snapshot(room);
      } else notifyRoom(room);
    } else if (msg.type === 'input') {
      if (room.phase !== 'playing' || msg.matchId !== room.matchId || msg.seq <= peer.lastSeq) return;
      if (msg.seq > peer.lastSeq + 120 || peer.queue.length >= 12) { error(peer, '输入队列异常，请重新进入房间。'); peer.ws.close(1008, 'Input queue exceeded'); return; }
      peer.lastSeq = msg.seq; peer.lastInputAt = performance.now();
      peer.queue.push({ seq: msg.seq, input: msg.input });
    }
  }
  wss.on('connection', ws => {
    const peer: Peer = { id: randomUUID(), ws, room: null, name: '', queue: [], held: emptyInput(), ack: 0,
      lastSeq: 0, lastInputAt: 0, alive: true, rateAt: performance.now(), messages: 0 };
    peers.set(peer.id, peer);
    send(peer, { type: 'welcome', version: PROTOCOL_VERSION, playerId: peer.id });
    ws.on('pong', () => { peer.alive = true; });
    ws.on('error', () => { /* close performs room cleanup */ });
    ws.on('close', () => { leave(peer); peers.delete(peer.id); });
    ws.on('message', (raw, binary) => {
      const now = performance.now();
      if (now - peer.rateAt >= 1000) { peer.rateAt = now; peer.messages = 0; }
      if (++peer.messages > 150) { ws.close(1008, 'Rate limit'); return; }
      const msg = binary ? null : parseClientMessage(raw.toString());
      if (!msg) { error(peer, '通信格式或协议版本不正确，请刷新网页。'); return; }
      handle(peer, msg);
    });
  });

  function tick() {
    const now = performance.now();
    for (const room of rooms.values()) {
      if (room.phase === 'countdown') {
        room.countdown--;
        if (room.countdown <= 0) { room.phase = 'playing'; room.countdown = 0; notifyRoom(room); snapshot(room); }
        else if (room.countdown % 60 === 0) notifyRoom(room);
      } else if (room.phase === 'playing' && room.world) {
        const inputs: Record<string, MechInput> = {};
        for (const p of room.players) {
          const peer = peers.get(p.id);
          if (!peer) continue;
          if (now - peer.lastInputAt > 250) { peer.held = emptyInput(); peer.queue = []; }
          const command = peer.queue.shift();
          if (command) { inputs[p.id] = command.input; peer.ack = command.seq; peer.held = heldInput(command.input); }
          else inputs[p.id] = peer.held;
        }
        stepWorld(room.world, inputs);
        if (room.world.result) {
          room.phase = 'finished'; room.idleAt = now;
          for (const p of room.players) p.ready = false;
          snapshot(room); notifyRoom(room);
        } else if (room.world.tick % SIM.snapshotEvery === 0) snapshot(room);
      } else if (now - room.idleAt > (options.idleMs ?? 20 * 60_000)) {
        for (const p of [...room.players]) {
          const peer = peers.get(p.id);
          if (peer) { leave(peer); send(peer, { type: 'left' }); error(peer, '房间长时间未开始，已关闭。'); }
        }
      }
    }
  }
  let previous = performance.now(), accumulator = 0;
  const loop = setInterval(() => {
    const now = performance.now(); accumulator = Math.min(100, accumulator + now - previous); previous = now;
    while (accumulator >= 1000 / SIM.hz) { tick(); accumulator -= 1000 / SIM.hz; }
  }, 5);
  const heartbeat = setInterval(() => {
    for (const peer of peers.values()) {
      if (!peer.alive) { peer.ws.terminate(); continue; }
      peer.alive = false; peer.ws.ping();
    }
  }, options.heartbeatMs ?? 5000);
  return {
    http,
    listen: () => new Promise<number>((resolve, reject) => {
      http.once('error', reject);
      http.listen(options.port ?? 2567, options.host ?? '127.0.0.1', () => {
        http.off('error', reject); const address = http.address();
        resolve(typeof address === 'object' && address ? address.port : 2567);
      });
    }),
    close: () => new Promise<void>(resolve => {
      clearInterval(loop); clearInterval(heartbeat);
      for (const p of peers.values()) p.ws.terminate();
      wss.close(); http.close(() => resolve());
    }),
  };
}
