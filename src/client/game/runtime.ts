import { createWorld, stepWorld } from '../../shared/game/simulation';
import { SIM } from '../../shared/game/config';
import type { CombatEvent, World } from '../../shared/game/types';
import { InputController } from './input';
import { TrainingAI } from './ai';
import { useSettings } from '../state/settings';

export interface GameRuntime {
  localId: string;
  input: InputController;
  world: World;
  display: World;
  advance(delta: number): void;
  takeEvents(): CombatEvent[];
  dispose(): void;
}
export class TrainingRuntime implements GameRuntime {
  localId = 'local';
  input = new InputController();
  world = createWorld([
    { id: 'local', name: 'YOU', team: 'BLUE', position: { x: 0, y: 0, z: 0 } },
    { id: 'red-1', name: 'ZAKU-II Custom', team: 'RED', position: { x: 0, y: 0, z: -50 } },
    { id: 'red-2', name: 'DOM Trooper', team: 'RED', position: { x: 30, y: 0, z: -30 } },
    { id: 'blue-2', name: 'GM Sniper', team: 'BLUE', position: { x: -20, y: 0, z: -10 } },
  ], true);
  display = this.world;
  private accumulator = 0;
  private ai = new TrainingAI();
  private lastEvent = 0;
  advance(delta: number) {
    this.accumulator = Math.min(this.accumulator + Math.min(delta, 0.1), 0.1);
    while (this.accumulator >= SIM.step) {
      const inputs = { [this.localId]: this.input.sample() };
      if (!useSettings.getState().areNPCsPaused) for (const m of this.world.mechs) {
        if (m.id !== this.localId) inputs[m.id] = this.ai.sample(this.world, m);
      }
      stepWorld(this.world, inputs);
      this.accumulator -= SIM.step;
    }
  }
  takeEvents() {
    const events = this.world.events.filter(e => e.id > this.lastEvent);
    if (events.length) this.lastEvent = events[events.length - 1].id;
    return events;
  }
  dispose() { this.input.dispose(); }
}
