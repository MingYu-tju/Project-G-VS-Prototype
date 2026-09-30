// Original prototype values use distance per 60 Hz tick. Keep those units during extraction.
export const SIM = {
  hz: 60, step: 1 / 60, snapshotEvery: 3,
  maxHp: 600, roundTicks: 180 * 60, countdownTicks: 3 * 60,
  boundary: 79, walkSpeed: 0.2, groundTurn: 0.1, gravity: 0.016,
  ascentSpeed: 0.38, ascentTurn: 0.04, ascentAcceleration: 0.01, ascentMaxSpeed: 0.2,
  dashBurstSpeed: 0.75, dashSustainSpeed: 0.5, dashDecay: 0.058, dashTurn: 0.04,
  dashBurstTicks: 25, dashCoastTicks: 18, dashCooldown: 30, dashHop: 0.2,
  dashInitialCost: 6, dashCost: 0.45, ascentCost: 0.55, jumpCost: 4,
  jumpSpeed: 0.28, jumpTicks: 5, holdTicks: 7, doubleBoostTicks: 13, doubleDirectionTicks: 9,
  stepSpeed: 0.45, stepTicks: 28, stepCost: 10, stepRecovery: 20,
  rainbowSpeed: 0.75, rainbowTicks: 17, rainbowCost: 18, rainbowRecovery: 20,
  friction: 0.99, landingMin: 12, landingMax: 25, landingOverheat: 38, landingBuffer: 18,
  landingVisualTicks: 35,
  maxAmmo: 20, ammoRegenTicks: 114, shotStartup: 20, shotRecovery: 60, shotStopRecovery: 25,
  lockDistance: 70, bulletSpeed: 1.28, homingLateralSpeed: 0.28, bulletLife: 300,
  bulletDamage: 60, hitRadius: 1.9, bodyRadius: 0.9, bodyHeight: 1,
  meleeRange: 6.5, meleeLungeSpeed: 0.62 * 1.1, meleeSideArc: 0.8,
  meleeCost: 0.4, meleeLungeTicks: 50, meleeStartup: 10, sideStartup: 11,
  meleeRecovery: 15, meleeMagnet: 0.25,
  knockbackSpeed: 0.1, bulletStun: 30, downGravity: 0.03, downLaunch: 0.7,
  downDrag: 0.98, wakeupTicks: 240,
} as const;

export interface ComboMove { duration: number; damage: number; force: number; stun: number; hitStop: number; damageDelay: number; spacing: number; chase: number }
export const COMBO: readonly ComboMove[] = [
  { duration: 17, damage: 55, force: 2.5, stun: 60, hitStop: 3, damageDelay: 3, spacing: 0.9, chase: 0.5 },
  { duration: 17, damage: 55, force: 4, stun: 60, hitStop: 5, damageDelay: 5, spacing: 1, chase: 0.5 },
  { duration: 36, damage: 80, force: 9, stun: 120, hitStop: 15, damageDelay: 19, spacing: 2, chase: 0.5 },
];
export const SIDE_COMBO: readonly ComboMove[] = [
  { duration: 20, damage: 50, force: 2, stun: 60, hitStop: 5, damageDelay: 5, spacing: 1.3, chase: 0.6 },
  { duration: 23, damage: 60, force: 4, stun: 60, hitStop: 5, damageDelay: 10, spacing: 1, chase: 0.5 },
  COMBO[2],
];
