import { emptyInput } from '../../shared/game/types';
import { distance, sub, yawOf } from '../../shared/game/math';
import type { MechInput, MechState, World } from '../../shared/game/types';

export class TrainingAI {
  private seed = 1234567;
  private random() {
    this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
  sample(world: World, m: MechState): MechInput {
    const input = emptyInput();
    const target = world.mechs.find(t => t.id === m.targetId);
    if (!target) return input;
    input.yaw = yawOf(sub(target.position, m.position));
    const dist = distance(m.position, target.position);
    const offset = world.mechs.indexOf(m) * 41;
    const t = (world.tick + offset) % 240;
    if (t === 0) input.cycleTarget = true;
    input.moveZ = dist > 35 ? -1 : dist < 12 ? 1 : 0;
    input.moveX = Math.floor((world.tick + offset) / 180) % 2 ? 0.6 : -0.6;
    input.boost = t === 2 || (t >= 6 && t < 90) || (t >= 140 && t < 180);
    if (world.tick % 24 === 0) {
      input.shoot = dist > 12 && this.random() < 0.45;
      input.melee = dist < 25 && this.random() < 0.7;
    }
    if (m.meleePhase.includes('SLASH') && m.meleeTimer < 8) input.melee = true;
    if (t === 108 || t === 112) input.directionPressed = 'a';
    if (t === 110) input.directionReleased = 'a';
    return input;
  }
}
