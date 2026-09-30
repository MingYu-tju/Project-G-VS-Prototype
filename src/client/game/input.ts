import { emptyInput } from '../../shared/game/types';
import type { Direction, MechInput } from '../../shared/game/types';

const keys = new Set(['w', 'a', 's', 'd', 'j', 'k', 'l', ' ']);
const directionKeys = new Set(['w', 'a', 's', 'd']);
type Edge = { key: string; down: boolean };

export class InputController {
  private held = new Set<string>();
  private pending: Edge[] = [];
  private attached = false;
  enabled = true;
  yaw = Math.PI;

  private onDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!this.enabled || !keys.has(key) || document.hidden || (e.target instanceof HTMLElement &&
      (e.target.matches('input, textarea, select') || e.target.isContentEditable))) return;
    e.preventDefault();
    if (!this.held.has(key)) {
      this.held.add(key);
      if (this.pending.length < 64) this.pending.push({ key, down: true });
    }
  };
  private onUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!this.held.delete(key)) return;
    if (this.pending.length < 64) this.pending.push({ key, down: false });
  };
  private onHidden = () => { if (document.hidden) this.reset(); };
  reset = () => { this.held.clear(); this.pending = []; };
  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.reset);
    document.addEventListener('visibilitychange', this.onHidden);
  }
  dispose() {
    this.attached = false; this.reset();
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.reset);
    document.removeEventListener('visibilitychange', this.onHidden);
  }
  sample(): MechInput {
    const input = emptyInput();
    if (!this.enabled) { this.reset(); return input; }
    input.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    input.moveX = Number(this.held.has('d')) - Number(this.held.has('a'));
    input.moveZ = Number(this.held.has('s')) - Number(this.held.has('w'));
    input.boost = this.held.has('l');
    // Keep separate taps in separate simulation ticks, even when several events arrive in one frame.
    const used = new Set<string>();
    while (this.pending.length) {
      const edge = this.pending[0];
      const channel = directionKeys.has(edge.key) ? 'direction' : edge.key;
      if (used.has(channel)) break;
      used.add(channel); this.pending.shift();
      if (edge.key === 'j' && edge.down) input.shoot = true;
      if (edge.key === 'k' && edge.down) input.melee = true;
      if (edge.key === ' ' && edge.down) input.cycleTarget = true;
      if (edge.key === 'l') { input.boostPressed = edge.down; input.boostReleased = !edge.down; }
      if (directionKeys.has(edge.key)) {
        if (edge.down) input.directionPressed = edge.key as Direction;
        else input.directionReleased = edge.key as Direction;
      }
    }
    return input;
  }
}
