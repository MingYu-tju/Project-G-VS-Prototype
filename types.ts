

import { Vector3 } from 'three';
import React from 'react';

// --- FIX: Add missing JSX Intrinsic Elements for React Three Fiber ---
// Define the interface for R3F elements to ensure they are recognized in JSX
interface ThreeElements {
  group: any;
  mesh: any;
  boxGeometry: any;
  sphereGeometry: any;
  cylinderGeometry: any;
  planeGeometry: any;
  circleGeometry: any;
  ringGeometry: any;
  icosahedronGeometry: any;
  meshBasicMaterial: any;
  meshStandardMaterial: any;
  meshToonMaterial: any;
  ambientLight: any;
  directionalLight: any;
  pointLight: any;
  hemisphereLight: any;
  color: any;
  fog: any;
  primitive: any;
  [elemName: string]: any;
}

// Augment global JSX namespace (for legacy or global-based setups)
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

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

export const RED_LOCK_DISTANCE = 45;

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
    GROUND_TURN_SPEED: 0.10, // New: Ground steering speed (radians per frame)
    ASCENT_SPEED: 0.38,
    ASCENT_TURN_SPEED: 0.04, // New: Air steering speed (radians per frame)
    ASCENT_HORIZONTAL_ACCEL: 0.01, // New: Horizontal acceleration during ascent (Drift control)
    ASCENT_MAX_HORIZONTAL_SPEED: 0.2, // New: Cap for horizontal speed gained via input during ascent

    // Dash
    DASH_BURST_SPEED: 0.75,
    DASH_SUSTAIN_SPEED: 0.5,
    DASH_DECAY_FACTOR: 0.058,
    DASH_TURN_SPEED: 0.04,
    DASH_GRACE_PERIOD: 80, // (Deprecated/Secondary check)
    DASH_BURST_DURATION: 25, // Frames where Jump Cancel is locked (Speed decays during this)
    DASH_COAST_DURATION: 320, // ms - Time to keep dashing after releasing keys
    DASH_GROUND_HOP_VELOCITY: 0.2, // New: Initial Upward velocity when ground dashing (Smooth Hop)
    DASH_COOLDOWN_FRAMES: 30, // New: Minimum frames between dashes

    // Jump / Ascend / Short Hop
    JUMP_SHORT_HOP_FRAMES: 5, // Frames to ascend if jump buffer was triggered but key released
    JUMP_SHORT_HOP_SPEED: 0.28, // Velocity for a single-tap short hop

    // Falling Animation
    FALL_ANIM_RATIO: 0.2,       // Ratio: 0.25 means the animation tries to complete in the first 25% of the predicted fall duration.
    FALL_ANIM_EXIT_SPEED: 0.1,   // How fast to recover to idle (Lerp factor)
    
    // Separate Left/Right Config for Asymmetrical Poses (Falling)
    FALL_LEG_PITCH_RIGHT: -1.4,  // Right leg rotates forward (negative X)
    FALL_LEG_PITCH_LEFT: -0.8,   // Left leg rotates forward more (negative X)
    
    FALL_KNEE_BEND_RIGHT: 2.6,   // Right knee bends deeply
    FALL_KNEE_BEND_LEFT: 1.6,    // Left knee bends slightly
    
    FALL_LEG_SPREAD: 0.2,       // Legs splay outward (Z axis)
    FALL_BODY_TILT: 0.4,         // Upper body tilts forward (positive X)

    // Landing Animation (New: Fixed Duration Visuals)
    LANDING_VISUAL_DURATION: 40, // Total frames for the landing animation (independent of stun)
    LANDING_ANIM_RATIO: 0.06,     // 25% of time going down (impact), 75% recovering
    
    LANDING_BODY_TILT: 0.7,      // Upper body tilts forward heavily
    LANDING_LEG_SPLAY: 0.3,      // Legs splay out wider
    
    // Separate Left/Right Config for Asymmetrical Poses (Landing)
    LANDING_LEG_PITCH_RIGHT: -1.2, // Thighs pitch forward (negative X)
    LANDING_LEG_PITCH_LEFT: -0.5,
    
    LANDING_KNEE_BEND_RIGHT: 2.5,  // Knees bend back (crouch)
    LANDING_KNEE_BEND_LEFT: 2,
    
    LANDING_ANKLE_PITCH_RIGHT: -1, // New: Right ankle pitches forward
    LANDING_ANKLE_PITCH_LEFT: -1.3,  // New: Left ankle pitches forward
    
    LANDING_HIP_DIP: 0.5, // New: Visual vertical drop distance when landing (Crouch height)

    // Evade (Step)
    EVADE_SPEED: 0.45,          // Faster than dash burst
    EVADE_DURATION: 28,         // Frames (approx 0.3s)
    EVADE_BOOST_COST: 10,       // Costly maneuver
    DOUBLE_TAP_WINDOW: 250,     // ms

    // Input Configuration (New)
    INPUT_ASCENT_HOLD_THRESHOLD: 115, // ms: Time to hold L to trigger ascent
    INPUT_DASH_WINDOW: 210,      // ms: Time window for double tap L to trigger dash

    // Physics
    GRAVITY: 0.016,
    FRICTION_GROUND: 0.99,
    FRICTION_AIR: 0.99,
    
    // Boost
    BOOST_CONSUMPTION_DASH_INIT: 6,
    BOOST_CONSUMPTION_DASH_HOLD: 0.45,
    BOOST_CONSUMPTION_ASCENT: 0.55,
    BOOST_CONSUMPTION_SHORT_HOP: 4, // Cost for a short hop

    // Combat / Weapons
    BULLET_SPEED: 1.28, 
    HOMING_LATERAL_SPEED: 0.28, // New: Constant sideways speed for homing (drift speed)
    MAX_AMMO: 20,
    AMMO_REGEN_TIME: 1.6, // Seconds per shot
    
    // Combat / Hitboxes (Collision Sizes)
    UNIT_HITBOX_RADIUS: 1.4,       // The size of the mechs (Hurtbox)
    PROJECTILE_HITBOX_RADIUS: 0.5, // The size of the bullet (Hitbox)
                                   // Total hit distance = UNIT + PROJECTILE radii
    
    // Shooting Animation (Frames @ 60fps)
    // Total time = Startup + Recovery
    SHOT_STARTUP_FRAMES: 12,
    SHOT_RECOVERY_FRAMES: 60,       // Normal Recovery (Move Shot)
    SHOT_RECOVERY_FRAMES_STOP: 25,  // NEW: Recovery for Stop Shot (Usually faster or distinct)
    
    // Hit Response
    KNOCKBACK_DURATION: 350, // ms
    KNOCKBACK_SPEED: 0.2,
    
    // Landing Lag (Frames - Gameplay Impact)
    LANDING_LAG_MIN: 12,
    LANDING_LAG_MAX: 25,
    LANDING_LAG_OVERHEAT: 38,
    LANDING_LAG_BUFFER_WINDOW: 18, // New: Only buffer inputs in the last X frames of lag

    
    // --- AI CONFIGURATION (New) ---
    AI_SHOOT_PROBABILITY: 0.05, // Chance per frame to attempt shot (0.08 = very aggressive)
    AI_SHOOT_COOLDOWN_MIN: 1.2, // Seconds
    AI_SHOOT_COOLDOWN_MAX: 2.4, // Seconds
    AI_TARGET_SWITCH_MIN: 5.0,  // Seconds
    AI_TARGET_SWITCH_MAX: 10.0,  // Seconds

};