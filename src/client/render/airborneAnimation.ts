import { SIM } from '../../shared/game/config';
import type { MechState } from '../../shared/game/types';
import { DEFAULT_MECH_POSE } from './types';
import type { MechPose } from './types';

export interface AirborneAnimationState {
  falling: boolean;
  fallFrames: number;
  predictedFallFrames: number;
  landing: boolean;
  landingFrames: number;
  hipOffset: number;
}
export const createAirborneAnimation = (): AirborneAnimationState => ({
  falling: false, fallFrames: 0, predictedFallFrames: 60,
  landing: false, landingFrames: 0, hipOffset: 0,
});

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const envelope = (progress: number, peak: number) => {
  const t = Math.max(0, Math.min(1, progress));
  return t < peak ? t / peak : (1 - t) / (1 - peak);
};

/** Prototype fall/landing overlays, blended from the last displayed pose rather than a fresh idle pose. */
export function applyAirborneAnimation(
  pose: MechPose, previous: MechPose, state: AirborneAnimationState, mech: MechState, delta: number,
): number {
  const frames = delta * SIM.hz;
  const smoothing = Math.min(1, 0.25 * frames);
  const smooth = (value: number, target: number) => mix(value, target, smoothing);
  const falling = !mech.grounded && !mech.dash && !mech.down && mech.stun <= 0
    && !['ASCEND', 'EVADE', 'MELEE'].includes(mech.visual);
  if (falling && !state.falling) {
    const vy = mech.velocity.y;
    const height = Math.max(0, mech.position.y);
    state.predictedFallFrames = Math.max(1, (vy + Math.sqrt(vy * vy + 2 * SIM.gravity * height)) / SIM.gravity);
    state.fallFrames = 0;
  }
  state.falling = falling;
  if (falling) {
    state.fallFrames += frames;
    const weight = envelope(state.fallFrames / state.predictedFallFrames, 0.2);
    pose.RIGHT_LEG.THIGH.x = smooth(previous.RIGHT_LEG.THIGH.x, mix(DEFAULT_MECH_POSE.RIGHT_LEG.THIGH.x, -1.4, weight));
    pose.LEFT_LEG.THIGH.x = smooth(previous.LEFT_LEG.THIGH.x, mix(DEFAULT_MECH_POSE.LEFT_LEG.THIGH.x, -0.8, weight));
    pose.RIGHT_LEG.KNEE = smooth(previous.RIGHT_LEG.KNEE, mix(DEFAULT_MECH_POSE.RIGHT_LEG.KNEE, 2.6, weight));
    pose.LEFT_LEG.KNEE = smooth(previous.LEFT_LEG.KNEE, mix(DEFAULT_MECH_POSE.LEFT_LEG.KNEE, 1.6, weight));
    pose.RIGHT_LEG.THIGH.z = smooth(previous.RIGHT_LEG.THIGH.z, mix(DEFAULT_MECH_POSE.RIGHT_LEG.THIGH.z, 0.2, weight));
    pose.LEFT_LEG.THIGH.z = smooth(previous.LEFT_LEG.THIGH.z, mix(DEFAULT_MECH_POSE.LEFT_LEG.THIGH.z, -0.2, weight));
    pose.TORSO.x = smooth(previous.TORSO.x, mix(DEFAULT_MECH_POSE.TORSO.x, 0.4, weight));
  }

  const landing = mech.grounded && mech.visual === 'LANDING' && mech.visualLanding > 0 && !mech.down && mech.stun <= 0;
  if (landing) {
    // Advance between network snapshots, but never restart the compression on a timer correction.
    state.landingFrames = state.landing
      ? Math.max(0, Math.min(state.landingFrames - frames, mech.visualLanding))
      : Math.max(0, mech.visualLanding - frames);
    const weight = envelope(1 - state.landingFrames / SIM.landingVisualTicks, 0.06);
    pose.RIGHT_LEG.THIGH.x = smooth(previous.RIGHT_LEG.THIGH.x, -1.8 * weight);
    pose.LEFT_LEG.THIGH.x = smooth(previous.LEFT_LEG.THIGH.x, -0.8 * weight);
    pose.RIGHT_LEG.KNEE = smooth(previous.RIGHT_LEG.KNEE, mix(0.2, 2.5, weight));
    pose.LEFT_LEG.KNEE = smooth(previous.LEFT_LEG.KNEE, mix(0.2, 2, weight));
    pose.RIGHT_LEG.ANKLE.x = smooth(previous.RIGHT_LEG.ANKLE.x, mix(-0.2, -1, weight));
    pose.LEFT_LEG.ANKLE.x = smooth(previous.LEFT_LEG.ANKLE.x, mix(-0.2, -1.3, weight));
    pose.RIGHT_LEG.THIGH.z = smooth(previous.RIGHT_LEG.THIGH.z, 0.05 + 0.3 * weight);
    pose.LEFT_LEG.THIGH.z = smooth(previous.LEFT_LEG.THIGH.z, -0.05 - 0.3 * weight);
    pose.TORSO.x = smooth(previous.TORSO.x, 0.7 * weight);
    state.hipOffset = -0.8 * weight;
  } else {
    state.landingFrames = 0;
    state.hipOffset = mix(state.hipOffset, 0, Math.min(1, 0.2 * frames));
  }
  state.landing = landing;
  return state.hipOffset;
}
