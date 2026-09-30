import { copyWorld, predictMech } from '../../shared/game/simulation';
import { lerp, angleDelta } from '../../shared/game/math';
import type { World, MechInput } from '../../shared/game/types';

export class Prediction {
  history: { seq: number; input: MechInput }[] = [];
  predicted: World;
  constructor(public localId: string, world: World) { this.predicted = copyWorld(world); }
  push(seq: number, input: MechInput) {
    if (this.history.length >= 90) return false;
    this.history.push({ seq, input: { ...input } });
    predictMech(this.predicted, this.localId, input);
    return true;
  }
  reconcile(world: World, ack: number) {
    this.history = this.history.filter(h => h.seq > ack);
    this.predicted = copyWorld(world);
    for (const command of this.history) predictMech(this.predicted, this.localId, command.input);
  }
}

export class SnapshotBuffer {
  private frames: { world: World; at: number }[] = [];
  add(world: World, at: number) {
    if (this.frames.length && world.tick < this.frames[this.frames.length - 1].world.tick) return;
    this.frames.push({ world: copyWorld(world), at });
    if (this.frames.length > 20) this.frames.shift();
  }
  sample(now: number): World | null {
    const newest = this.frames[this.frames.length - 1];
    if (!newest) return null;
    // Three server ticks of jitter protection; never extrapolate beyond the newest state.
    const target = newest.world.tick - 6 + Math.min(6, Math.max(0, (now - newest.at) * 0.06));
    let a = this.frames[0], b = newest;
    for (let i = 0; i < this.frames.length - 1; i++) {
      if (this.frames[i].world.tick <= target && this.frames[i + 1].world.tick >= target) {
        a = this.frames[i]; b = this.frames[i + 1]; break;
      }
    }
    if (target >= newest.world.tick) return copyWorld(newest.world);
    const t = Math.max(0, Math.min(1, (target - a.world.tick) / (b.world.tick - a.world.tick || 1)));
    const result = copyWorld(a.world);
    result.tick = a.world.tick + (b.world.tick - a.world.tick) * t;
    for (const m of result.mechs) {
      const next = b.world.mechs.find(n => n.id === m.id);
      if (next) { m.position = lerp(m.position, next.position, t); m.yaw += angleDelta(m.yaw, next.yaw) * t; }
    }
    for (const bullet of result.bullets) {
      const next = b.world.bullets.find(n => n.id === bullet.id);
      if (next) bullet.position = lerp(bullet.position, next.position, t);
    }
    return result;
  }
}
