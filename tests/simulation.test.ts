import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, copyWorld } from '../src/shared/game/simulation.js';
import { emptyInput } from '../src/shared/game/types.js';
import { SIM } from '../src/shared/game/config.js';
import { parseClientMessage } from '../src/shared/protocol.js';

const world = () => createWorld([{ id: 'a', name: 'A', team: 'BLUE' }, { id: 'b', name: 'B', team: 'RED' }]);
const input = (fields = {}) => ({ ...emptyInput(), ...fields });

test('movement uses fixed ticks and survives a full JSON snapshot restore', () => {
  const a = world();
  for (let i = 0; i < 100; i++) stepWorld(a, { a: input({ moveZ: -1, yaw: Math.PI }) });
  const b = copyWorld(a);
  for (let i = 0; i < 120; i++) {
    const inputs = { a: input({ moveX: 1, yaw: Math.PI, boost: i < 50 }) };
    stepWorld(a, inputs); stepWorld(b, inputs);
  }
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.mechs[0].position.x) > 0);
});
test('diagonal movement does not increase speed', () => {
  const a = world(), b = world();
  a.mechs[0].yaw = Math.PI; b.mechs[0].yaw = Math.PI * 3 / 4;
  stepWorld(a, { a: input({ moveZ: -1, yaw: Math.PI }) });
  stepWorld(b, { a: input({ moveZ: -1, moveX: 1, yaw: Math.PI }) });
  assert.ok(Math.abs(Math.hypot(a.mechs[0].velocity.x, a.mechs[0].velocity.z) - Math.hypot(b.mechs[0].velocity.x, b.mechs[0].velocity.z)) < 1e-10);
});
test('shot damages opposing team exactly once and uses ammunition', () => {
  const w = world(); stepWorld(w, { a: input({ shoot: true }) });
  for (let i = 0; i < 90; i++) stepWorld(w);
  assert.equal(w.mechs[1].hp, SIM.maxHp - SIM.bulletDamage);
  assert.equal(w.mechs[0].hp, SIM.maxHp);
  assert.equal(w.mechs[0].ammo, SIM.maxAmmo - 1);
  assert.equal(w.events.filter(e => e.kind === 'hit').length, 1);
});
test('both teams shoot with the same rules', () => {
  const w = world(); stepWorld(w, { a: input({ shoot: true }), b: input({ shoot: true }) });
  for (let i = 0; i < 90; i++) stepWorld(w);
  assert.equal(w.mechs[0].hp, w.mechs[1].hp);
  assert.equal(w.mechs[0].hp, SIM.maxHp - SIM.bulletDamage);
});
test('a short boost tap jumps, while a second tap starts dash', () => {
  const jump = world();
  stepWorld(jump, { a: input({ boost: true }) }); stepWorld(jump);
  for (let i = 0; i < 14; i++) stepWorld(jump);
  assert.ok(jump.mechs[0].position.y > 0);
  const dash = world();
  stepWorld(dash, { a: input({ boost: true }) }); stepWorld(dash);
  stepWorld(dash, { a: input({ boost: true }) });
  assert.equal(dash.mechs[0].dash, true);
  assert.ok(dash.mechs[0].boost < 100);
});
test('step cuts existing homing projectiles', () => {
  const w = world();
  stepWorld(w, { b: input({ shoot: true }) });
  for (let i = 0; i < 22; i++) stepWorld(w);
  assert.ok(w.bullets.some(b => b.homing));
  stepWorld(w, { a: input({ directionReleased: 'a' }) });
  stepWorld(w, { a: input({ directionPressed: 'a', yaw: Math.PI }) });
  assert.ok(w.bullets.every(b => !b.homing));
  assert.ok(w.mechs[0].evade > 0);
});
test('combo applies staged damage and a knockdown; training never ends', () => {
  const w = world(); w.training = true;
  w.mechs[0].position.z = 3; w.mechs[1].position.z = -3;
  stepWorld(w, { a: input({ melee: true }) });
  let knockedDown = false;
  for (let i = 0; i < 170; i++) {
    stepWorld(w, { a: input({ melee: w.mechs[0].meleePhase.includes('SLASH') }) });
    knockedDown ||= w.mechs[1].down;
  }
  assert.ok(knockedDown);
  assert.equal(w.mechs[1].hp, SIM.maxHp);
  assert.equal(w.result, null);
  for (let i = 0; i < 400; i++) stepWorld(w);
  assert.equal(w.mechs[1].down, false);
});
test('simultaneous KO is a draw; timeout compares remaining health', () => {
  const w = world(); w.mechs.forEach(m => m.hp = SIM.bulletDamage);
  stepWorld(w, { a: input({ shoot: true }), b: input({ shoot: true }) });
  for (let i = 0; i < 100; i++) stepWorld(w);
  assert.deepEqual(w.result, { winner: null, reason: 'ko' });
  const timeout = world(); timeout.timeRemaining = 1; timeout.mechs[1].hp--;
  stepWorld(timeout); assert.deepEqual(timeout.result, { winner: 'BLUE', reason: 'timeout' });
});
test('ground step and melee recovery eventually refill boost', () => {
  for (const melee of [false, true]) {
    const w = world(); w.training = true;
    w.mechs[0].boost = 20;
    if (melee) stepWorld(w, { a: input({ melee: true }) });
    else {
      stepWorld(w, { a: input({ directionReleased: 'a' }) });
      stepWorld(w, { a: input({ directionPressed: 'a' }) });
    }
    for (let i = 0; i < 250; i++) stepWorld(w);
    assert.equal(w.mechs[0].boost, 100);
  }
});

test('held ascent overheats, lands, then recovers boost', () => {
  const w = world();
  for (let i = 0; i < 195; i++) stepWorld(w, { a: input({ boost: true }) });
  assert.ok(w.mechs[0].overheated);
  assert.equal(w.mechs[0].boost, 0);
  for (let i = 0; i < 250; i++) stepWorld(w);
  assert.equal(w.mechs[0].boost, 100);
  assert.equal(w.mechs[0].overheated, false);
  assert.equal(w.mechs[0].position.y, 0);
});

test('protocol rejects invalid numeric values, sequence and version', () => {
  assert.equal(parseClientMessage('not-json'), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'create', version: 99, name: 'a' })), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'input', matchId: 'a', seq: -1, input: input() })), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'input', matchId: 'a', seq: 1, input: input({ yaw: 999 }) })), null);
  assert.ok(parseClientMessage(JSON.stringify({ type: 'input', matchId: 'a', seq: 1, input: input() })));
});
