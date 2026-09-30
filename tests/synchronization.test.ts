import test from 'node:test';
import assert from 'node:assert/strict';
import { Prediction, SnapshotBuffer } from '../src/client/network/synchronization.ts';
import { createWorld, stepWorld, copyWorld } from '../src/shared/game/simulation.ts';
import { emptyInput } from '../src/shared/game/types.ts';

const create = () => createWorld([{ id: 'a', name: 'A', team: 'BLUE' }, { id: 'b', name: 'B', team: 'RED' }]);
for (const rtt of [50, 100, 200]) test(`prediction reconciles at ${rtt}ms RTT without duplicating damage`, () => {
  const world = create(), prediction = new Prediction('a', world);
  const delay = Math.ceil(rtt / 1000 * 60);
  const snapshots: { world: ReturnType<typeof create>; ack: number; due: number }[] = [];
  for (let tick = 1; tick <= 180; tick++) {
    const input = { ...emptyInput(), yaw: Math.PI, moveX: tick < 90 ? 1 : 0, shoot: tick === 20 };
    prediction.push(tick, input);
    stepWorld(world, { a: input });
    if (tick % 3 === 0) snapshots.push({ world: copyWorld(world), ack: tick, due: tick + delay + tick % 2 });
    while (snapshots[0]?.due <= tick) { const s = snapshots.shift()!; prediction.reconcile(s.world, s.ack); }
  }
  prediction.reconcile(world, 180);
  assert.deepEqual(prediction.predicted.mechs[0], world.mechs[0]);
  assert.equal(prediction.history.length, 0);
  assert.equal(prediction.predicted.mechs[1].hp, world.mechs[1].hp);
});
test('prediction history is bounded during a stalled connection', () => {
  const prediction = new Prediction('a', create());
  for (let i = 1; i <= 200; i++) prediction.push(i, emptyInput());
  assert.equal(prediction.history.length, 90);
});
test('interpolation does not mutate authoritative frames or extrapolate forever', () => {
  const b = new SnapshotBuffer(); const w = create();
  b.add(w, 0);
  for (let i = 0; i < 6; i++) stepWorld(w, { b: { ...emptyInput(), moveX: 1 } });
  b.add(w, 100); const original = copyWorld(w);
  const result = b.sample(150)!;
  assert.ok(result.tick >= 0 && result.tick <= w.tick);
  result.mechs[0].position.x = 123;
  assert.deepEqual(w, original);
  assert.equal(b.sample(10000)!.tick, w.tick);
});
