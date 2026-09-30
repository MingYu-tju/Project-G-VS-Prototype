import type { MechPose } from './types';

export interface WalkAnimationState { cycle: number; weight: number }

/** Ground-walk overlay extracted from the original Player animation, before aiming overrides. */
export function applyWalkAnimation(
  pose: MechPose, state: WalkAnimationState, walking: boolean, horizontalSpeed: number, delta: number,
): boolean {
  const blend = Math.min(1, 0.15 * delta * 60);
  state.weight += ((walking ? 1 : 0) - state.weight) * blend;
  if (state.weight <= 0.01) return false;

  let footstep = false;
  if (walking && horizontalSpeed > 0.05) {
    const previous = state.cycle;
    state.cycle += delta * 9.5;
    footstep = Math.floor(state.cycle / Math.PI) !== Math.floor(previous / Math.PI);
  }
  const sin = Math.sin(state.cycle), cos = Math.cos(state.cycle);
  const mix = (current: number, target: number) => current + (target - current) * state.weight;
  const rightKnee = Math.max(0, cos) * 1.8 + 0.7;
  const leftKnee = Math.max(0, -cos) * 1.8 + 0.7;

  pose.RIGHT_LEG.THIGH.x = mix(pose.RIGHT_LEG.THIGH.x, -sin * 0.9);
  pose.LEFT_LEG.THIGH.x = mix(pose.LEFT_LEG.THIGH.x, sin * 0.9);
  pose.RIGHT_LEG.KNEE = mix(pose.RIGHT_LEG.KNEE, rightKnee);
  pose.LEFT_LEG.KNEE = mix(pose.LEFT_LEG.KNEE, leftKnee);
  pose.RIGHT_LEG.ANKLE.x = mix(pose.RIGHT_LEG.ANKLE.x, rightKnee * 0.1 - sin * 0.6);
  pose.LEFT_LEG.ANKLE.x = mix(pose.LEFT_LEG.ANKLE.x, leftKnee * 0.1 + sin * 0.6);
  pose.TORSO.x = mix(pose.TORSO.x, 0.5);
  pose.TORSO.y = mix(pose.TORSO.y, -cos * 0.05);
  pose.CHEST.y = mix(pose.CHEST.y, sin * 0.22);
  pose.CHEST.z = mix(pose.CHEST.z, cos * 0.1);
  pose.HEAD.y = mix(pose.HEAD.y, -sin * 0.22);
  pose.RIGHT_LEG.THIGH.z = mix(pose.RIGHT_LEG.THIGH.z, 0);
  pose.LEFT_LEG.THIGH.z = mix(pose.LEFT_LEG.THIGH.z, 0);
  pose.RIGHT_LEG.THIGH.y = mix(pose.RIGHT_LEG.THIGH.y, 0);
  pose.LEFT_LEG.THIGH.y = mix(pose.LEFT_LEG.THIGH.y, 0);
  return footstep;
}
