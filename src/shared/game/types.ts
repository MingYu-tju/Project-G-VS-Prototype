export type Team = 'BLUE' | 'RED';
export type Vec3 = { x: number; y: number; z: number };
export type Direction = 'w' | 'a' | 's' | 'd';
export type MeleePhase = 'NONE' | 'STARTUP' | 'LUNGE' | 'SLASH_1' | 'SLASH_2' | 'SLASH_3' | 'RECOVERY' |
  'SIDE_STARTUP' | 'SIDE_LUNGE' | 'SIDE_SLASH_1' | 'SIDE_SLASH_2' | 'SIDE_SLASH_3' | 'SIDE_RECOVERY';
export type VisualState = 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' | 'MELEE' | 'STUN' | 'DOWN' | 'WAKEUP';

/** One simulation tick of input. Edges are consumed once; yaw is a camera-relative input basis. */
export interface MechInput {
  moveX: number;
  moveZ: number;
  yaw: number;
  boost: boolean;
  shoot: boolean;
  melee: boolean;
  cycleTarget: boolean;
  boostPressed: boolean;
  boostReleased: boolean;
  directionPressed: Direction | null;
  directionReleased: Direction | null;
}
export const emptyInput = (): MechInput => ({
  moveX: 0, moveZ: 0, yaw: 0, boost: false, shoot: false, melee: false, cycleTarget: false,
  boostPressed: false, boostReleased: false, directionPressed: null, directionReleased: null,
});
export function heldInput(input: MechInput): MechInput {
  return { ...input, shoot: false, melee: false, cycleTarget: false, boostPressed: false,
    boostReleased: false, directionPressed: null, directionReleased: null };
}

export interface MechState {
  id: string;
  name: string;
  team: Team;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  targetId: string | null;
  hp: number;
  boost: number;
  ammo: number;
  ammoTimer: number;
  overheated: boolean;
  grounded: boolean;
  landing: number;
  visualLanding: number;
  dash: boolean;
  dashDirection: Vec3;
  dashSpeed: number;
  dashBurst: number;
  dashCooldown: number;
  dashCoast: number;
  dashBuffer: boolean;
  jumpBuffer: boolean;
  forcedAscent: number;
  boostHeld: number;
  boostWasHeld: boolean;
  boostReleaseTick: number;
  boostConsumed: boolean;
  boostUsedForDash: boolean;
  directionReleaseTicks: Record<Direction, number>;
  evade: number;
  evadeRecovery: number;
  evadeDirection: Vec3;
  evadeCircular: number;
  rainbow: boolean;
  shootTimer: number;
  shootMoving: boolean;
  fired: boolean;
  meleePhase: MeleePhase;
  meleeTimer: number;
  meleeStartup: number;
  meleeTargetId: string | null;
  meleeSide: number;
  meleePenalty: boolean;
  comboBuffered: boolean;
  meleeConfirmed: boolean;
  meleeHit: boolean;
  stun: number;
  hitStop: number;
  knockback: Vec3;
  knockbackPower: number;
  down: boolean;
  wakeup: number;
  lastHitTick: number;
  visual: VisualState;
  actionTick: number;
  weapon: 'GUN' | 'SABER';
}
export interface Bullet {
  id: number;
  ownerId: string;
  team: Team;
  targetId: string | null;
  position: Vec3;
  velocity: Vec3;
  forward: Vec3;
  homing: boolean;
  ttl: number;
}
export interface CombatEvent {
  id: number;
  tick: number;
  kind: 'shot' | 'hit' | 'dash' | 'step' | 'land';
  actorId: string;
  targetId?: string;
  position: Vec3;
}
export interface World {
  tick: number;
  training: boolean;
  mechs: MechState[];
  bullets: Bullet[];
  events: CombatEvent[];
  nextBulletId: number;
  nextEventId: number;
  timeRemaining: number;
  result: { winner: Team | null; reason: 'ko' | 'timeout' | 'disconnect' } | null;
}
export interface PlayerSpec { id: string; name: string; team: Team; position?: Vec3 }
