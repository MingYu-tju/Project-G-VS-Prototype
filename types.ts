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
  targetId?: string | null; // The ID of the entity this unit is currently targeting
}

export enum LockState {
  GREEN = 'GREEN', // Far, no tracking
  RED = 'RED' // Close, tracking active
}

export const RED_LOCK_DISTANCE = 55;

export interface Projectile {
  id: string;
  ownerId: string;
  targetId: string | null;
  position: Vector3;
  velocity: Vector3;
  forwardDirection: Vector3; // New: The fixed facing direction of the bullet model
  isHoming: boolean;
  team: Team;
  ttl: number; // Time To Live (frames)
}


// --- GLOBAL CONFIGURATION ---
export const GLOBAL_CONFIG = {
    // Movement
    BOUNDARY_LIMIT: 80,
    WALK_SPEED: 0.25,
    ASCENT_SPEED: 0.38,
    ASCENT_TURN_SPEED: 0.15, // New: Air steering speed (radians per frame)
    
    // Dash
    DASH_BURST_SPEED: 0.7,
    DASH_SUSTAIN_SPEED: 0.4,
    DASH_DECAY_FACTOR: 0.05,
    DASH_TURN_SPEED: 0.08,
    DASH_GRACE_PERIOD: 80,
    DASH_COAST_DURATION: 300, // ms - Time to keep dashing after releasing keys
    DASH_GROUND_HOP_VELOCITY: 0.2, // New: Initial Upward velocity when ground dashing (Smooth Hop)

    // Evade (Step)
    EVADE_SPEED: 0.4,          // Faster than dash burst
    EVADE_DURATION: 20,         // Frames (approx 0.3s)
    EVADE_BOOST_COST: 12,       // Costly maneuver
    DOUBLE_TAP_WINDOW: 250,     // ms

    // Physics
    GRAVITY: 0.018,
    FRICTION_GROUND: 0.99,
    FRICTION_AIR: 0.99,
    
    // Boost
    BOOST_CONSUMPTION_DASH_INIT: 7,
    BOOST_CONSUMPTION_DASH_HOLD: 0.5,
    BOOST_CONSUMPTION_ASCENT: 0.62,

    // Combat / Weapons
    BULLET_SPEED: 1.28, // Increased slightly from 0.5 for better feel
    HOMING_TURN_RATE_HORIZONTAL: 0.02, // Stronger horizontal tracking
    HOMING_TURN_RATE_VERTICAL: 0.02,   // Weaker vertical tracking
    MAX_AMMO: 20,
    AMMO_REGEN_TIME: 1.6, // Seconds per shot
    
    // Combat / Hitboxes (Collision Sizes)
    UNIT_HITBOX_RADIUS: 1.6,       // The size of the mechs (Hurtbox)
    PROJECTILE_HITBOX_RADIUS: 0.6, // The size of the bullet (Hitbox)
                                   // Total hit distance = UNIT + PROJECTILE radii
    
    // Shooting Animation (Frames @ 60fps)
    // Total time = Startup + Recovery
    SHOT_STARTUP_FRAMES: 8,
    SHOT_RECOVERY_FRAMES: 12,
    
    // Hit Response
    KNOCKBACK_DURATION: 350, // ms
    KNOCKBACK_SPEED: 0.2,
    
    // Landing Lag (Frames)
    LANDING_LAG_MIN: 12,
    LANDING_LAG_MAX: 25,
    LANDING_LAG_OVERHEAT: 38,

    
        // --- AI CONFIGURATION (New) ---
    AI_SHOOT_PROBABILITY: 0.08, // Chance per frame to attempt shot (0.08 = very aggressive)
    AI_SHOOT_COOLDOWN_MIN: 0.8, // Seconds
    AI_SHOOT_COOLDOWN_MAX: 1.7, // Seconds
    AI_TARGET_SWITCH_MIN: 5.0,  // Seconds
    AI_TARGET_SWITCH_MAX: 10.0,  // Seconds

};