import { Vector3 } from 'three';

export enum Team {
  BLUE = 'BLUE',
  RED = 'RED'
}

export interface GameEntity {
  id: string;
  position: Vector3;
  type: 'PLAYER' | 'ALLY' | 'ENEMY';
  team: Team;
  name: string;
  lastHitTime: number; // Timestamp of the last hit received
  knockbackDir?: Vector3; // The direction of the knockback force
}

export enum LockState {
  GREEN = 'GREEN', // Far, no tracking
  RED = 'RED' // Close, tracking active
}

export const RED_LOCK_DISTANCE = 50;

export interface Projectile {
  id: string;
  ownerId: string;
  targetId: string | null;
  position: Vector3;
  velocity: Vector3;
  isHoming: boolean;
  team: Team;
  ttl: number; // Time To Live (frames)
}

// --- GLOBAL CONFIGURATION ---
export const GLOBAL_CONFIG = {
    // Movement
    BOUNDARY_LIMIT: 60,
    WALK_SPEED: 0.08,
    ASCENT_SPEED: 0.21,
    
    // Dash
    DASH_BURST_SPEED: 0.4,
    DASH_SUSTAIN_SPEED: 0.20,
    DASH_DECAY_FACTOR: 0.05,
    DASH_TURN_SPEED: 0.02,
    DASH_GRACE_PERIOD: 80,

    // Physics
    GRAVITY: 0.004,
    FRICTION_GROUND: 0.99,
    FRICTION_AIR: 0.99,
    
    // Boost
    BOOST_CONSUMPTION_DASH_INIT: 8,
    BOOST_CONSUMPTION_DASH_HOLD: 0.25,
    BOOST_CONSUMPTION_ASCENT: 0.3,

    // Combat / Weapons
    BULLET_SPEED: 0.7, // Increased slightly from 0.5 for better feel
    HOMING_TURN_RATE_HORIZONTAL: 0.03, // Stronger horizontal tracking
    HOMING_TURN_RATE_VERTICAL: 0.06,   // Weaker vertical tracking
    MAX_AMMO: 20,
    AMMO_REGEN_TIME: 2.0, // Seconds per shot
    
    // Shooting Animation (Frames @ 60fps)
    // Total time = Startup + Recovery
    SHOT_STARTUP_FRAMES: 20,
    SHOT_RECOVERY_FRAMES: 30,
    
    // Hit Response
    KNOCKBACK_DURATION: 350, // ms
    KNOCKBACK_SPEED: 0.1,
    
    // Landing Lag (Frames)
    LANDING_LAG_MIN: 30,
    LANDING_LAG_MAX: 60,
    LANDING_LAG_OVERHEAT: 90,
};