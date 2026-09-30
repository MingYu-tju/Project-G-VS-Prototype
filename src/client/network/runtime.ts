import { SIM } from '../../shared/game/config';
import { copyWorld } from '../../shared/game/simulation';
import type { CombatEvent, World } from '../../shared/game/types';
import { InputController } from '../game/input';
import type { GameRuntime } from '../game/runtime';
import { battleClient, useNetwork } from './client';
import { Prediction, SnapshotBuffer } from './synchronization';

export class OnlineRuntime implements GameRuntime {
  input = new InputController();
  world: World;
  display: World;
  private prediction: Prediction;
  private snapshots = new SnapshotBuffer();
  private accumulator = 0;
  private seq = 0;
  private lastEvent = 0;
  private lastSnapshotAt = performance.now();
  private detach: () => void;
  constructor(public localId: string, private matchId: string, initial: World) {
    this.world = initial; this.display = copyWorld(initial);
    this.prediction = new Prediction(localId, initial);
    this.snapshots.add(initial, performance.now());
    this.detach = battleClient.subscribe(msg => {
      if (msg.matchId !== this.matchId || msg.world.tick < this.world.tick) return;
      this.lastSnapshotAt = performance.now();
      this.world = msg.world;
      this.prediction.reconcile(msg.world, msg.ack[this.localId] ?? 0);
      this.snapshots.add(msg.world, this.lastSnapshotAt);
    });
  }
  advance(delta: number) {
    const active = useNetwork.getState().room?.phase === 'playing' && !this.world.result;
    this.input.enabled = active;
    this.accumulator = Math.min(0.1, this.accumulator + Math.min(delta, 0.1));
    while (this.accumulator >= SIM.step) {
      if (active && performance.now() - this.lastSnapshotAt < 1000 && this.prediction.history.length < 90) {
        const input = this.input.sample();
        const seq = this.seq + 1;
        if (battleClient.send({ type: 'input', matchId: this.matchId, seq, input })) {
          this.seq = seq; this.prediction.push(seq, input);
        }
      } else this.input.reset();
      this.accumulator -= SIM.step;
    }
    this.display = this.snapshots.sample(performance.now()) ?? copyWorld(this.world);
    if (active && performance.now() - this.lastSnapshotAt < 1000) {
      const local = this.prediction.predicted.mechs.find(m => m.id === this.localId);
      if (local) this.display.mechs = this.display.mechs.map(m => m.id === this.localId ? local : m);
    }
  }
  takeEvents(): CombatEvent[] {
    const events = this.world.events.filter(e => e.id > this.lastEvent);
    if (events.length) this.lastEvent = events[events.length - 1].id;
    return events;
  }
  get stale() { return performance.now() - this.lastSnapshotAt > 1000 && !this.world.result; }
  dispose() { this.detach(); this.input.dispose(); }
}
