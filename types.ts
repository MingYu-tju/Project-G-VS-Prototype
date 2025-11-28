import { Vector3 } from 'three';
import React from 'react';

// ... (ThreeElements interface unchanged) ...
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
  torusGeometry: any; 
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
  instancedMesh: any; 
  [elemName: string]: any;
}

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
  lastHitTime: number;
  lastHitDuration: number;
  knockbackDir?: Vector3;
  knockbackPower?: number;
  targetId?: string | null;
  // NEW: Knockdown State
  isKnockedDown?: boolean; 
  wakeUpTime?: number;
}

export enum LockState {
  GREEN = 'GREEN',
  RED = 'RED'
}

export const RED_LOCK_DISTANCE = 70;

export interface Projectile {
  id: string;
  ownerId: string;
  targetId: string | null;
  position: Vector3;
  velocity: Vector3;
  forwardDirection: Vector3;
  isHoming: boolean;
  team: Team;
  ttl: number;
}

export interface HitEffectData {
    id: string;
    position: Vector3;
    startTime: number;
    type: 'SLASH' | 'EXPLOSION';
    scale: number;
}

// --- ANIMATION SYSTEM TYPES ---

export interface RotationVector {
    x: number;
    y: number;
    z: number;
}

// A snapshot of the entire mech's rotation state
export interface MechPose {
    TORSO: RotationVector;
    CHEST: RotationVector;
    HEAD: RotationVector;
    LEFT_ARM: {
        SHOULDER: RotationVector;
        ELBOW: RotationVector;
        FOREARM: RotationVector;
        WRIST: RotationVector;
    };
    RIGHT_ARM: {
        SHOULDER: RotationVector;
        ELBOW: RotationVector;
        FOREARM: RotationVector;
        WRIST: RotationVector;
    };
    LEFT_LEG: {
        THIGH: RotationVector;
        KNEE: number;
        ANKLE: RotationVector;
    };
    RIGHT_LEG: {
        THIGH: RotationVector;
        KNEE: number;
        ANKLE: RotationVector;
    };
    SHIELD?: {
        POSITION: RotationVector;
        ROTATION: RotationVector;
    };
}

// Identifies a specific bone path (e.g., "LEFT_ARM.SHOULDER")
export type BonePath = string;

export interface Keyframe {
    time: number; // Normalized time (0.0 to 1.0)
    value: RotationVector | number; // Euler angles or scalar (for knee)
    easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface AnimationTrack {
    bone: BonePath;
    keyframes: Keyframe[];
}

export interface AnimationClip {
    name: string;
    duration: number; // Normalized duration concept (1.0), speed handled by controller
    loop: boolean;
    tracks: AnimationTrack[];
    basePose?: MechPose; 
}

// --- SLASH VFX CONFIGURATION TYPES ---
export interface SlashSpec {
    color: string;
    pos: [number, number, number];
    rot: [number, number, number];
    startAngle: number;
    speed: number;
    delay: number;
}

export interface SlashSpecsGroup {
    SIZE: number;
    WIDTH: number;
    ARC: number;
    SLASH_1: SlashSpec;
    SLASH_2: SlashSpec;
    SLASH_3: SlashSpec;
    SIDE_SLASH_1: SlashSpec;
    SIDE_SLASH_2: SlashSpec;
    SIDE_SLASH_3: SlashSpec;
}

// Matches the initial JSX rotations in Player.tsx exactly
export const DEFAULT_MECH_POSE: MechPose = {
    TORSO: { x: 0, y: 0, z: 0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: -0.4, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: 0.35, y: -0.3, z: 0 },       // gunArmRef (no rotation in JSX)
        ELBOW: { x: -0.65, y: 0.3, z: 0 },    // leftForeArmRef
        FOREARM: { x: -0.2, y: 0, z: 0 },     // leftForearmTwistRef
        WRIST: { x: 0, y: 0, z: 0 }           // leftWristRef
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.35, y: 0.3, z: 0 },  // rightArmRef
        ELBOW: { x: -0.65, y: -0.3, z: 0 },   // rightForeArmRef
        FOREARM: { x: -0.2, y: 0, z: 0 },     // rightForearmTwistRef
        WRIST: { x: 0, y: 0, z: 0 }           // rightWristRef
    },
    LEFT_LEG: {
        THIGH: { x: -0.1, y: 0, z: -0.05 },   // leftLegRef
        KNEE: 0.2,                            // leftLowerLegRef (x axis)
        ANKLE: { x: -0.1, y: 0, z: 0 }        // leftFootRef
    },
    RIGHT_LEG: {
        THIGH: { x: -0.1, y: 0, z: 0.05 },    // rightLegRef
        KNEE: 0.3,                            // rightLowerLegRef (x axis)
        ANKLE: { x: -0.2, y: 0, z: 0 }        // rightFootRef
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }     // shieldRef
    }
};


// --- GLOBAL CONFIGURATION ---
export const GLOBAL_CONFIG = {
    // Movement
    BOUNDARY_LIMIT: 80,
    WALK_SPEED: 0.2,
    GROUND_TURN_SPEED: 0.10,
    ASCENT_SPEED: 0.38,
    ASCENT_TURN_SPEED: 0.04,
    ASCENT_HORIZONTAL_ACCEL: 0.01,
    ASCENT_MAX_HORIZONTAL_SPEED: 0.2,

    // Dash
    DASH_BURST_SPEED: 0.75,
    DASH_SUSTAIN_SPEED: 0.5,
    DASH_DECAY_FACTOR: 0.058,
    DASH_TURN_SPEED: 0.04,
    DASH_GRACE_PERIOD: 80,
    DASH_BURST_DURATION: 25,
    DASH_COAST_DURATION: 290,
    DASH_GROUND_HOP_VELOCITY: 0.2,
    DASH_COOLDOWN_FRAMES: 30,

    // Jump / Ascend
    JUMP_SHORT_HOP_FRAMES: 5,
    JUMP_SHORT_HOP_SPEED: 0.28,

    // Falling Animation
    FALL_ANIM_RATIO: 0.2,
    FALL_ANIM_EXIT_SPEED: 0.1,
    
    FALL_LEG_PITCH_RIGHT: -1.4,
    FALL_LEG_PITCH_LEFT: -0.8,
    FALL_KNEE_BEND_RIGHT: 2.6,
    FALL_KNEE_BEND_LEFT: 1.6,
    FALL_LEG_SPREAD: 0.2,
    FALL_BODY_TILT: 0.4,

    // Landing Animation
    LANDING_VISUAL_DURATION: 35,
    LANDING_ANIM_RATIO: 0.06, 
    LANDING_BODY_TILT: 0.7,
    LANDING_LEG_SPLAY: 0.3,
    LANDING_LEG_PITCH_RIGHT: -1.8,
    LANDING_LEG_PITCH_LEFT: -0.8,
    LANDING_KNEE_BEND_RIGHT: 2.5,
    LANDING_KNEE_BEND_LEFT: 2,
    LANDING_ANKLE_PITCH_RIGHT: -1,
    LANDING_ANKLE_PITCH_LEFT: -1.3,
    LANDING_HIP_DIP: 0.8,

    // Evade
    EVADE_SPEED: 0.45,
    EVADE_DURATION: 28,
    EVADE_BOOST_COST: 10,
    DOUBLE_TAP_WINDOW:180,
    EVADE_ASCENT_INERTIA_RATIO: 0.7,
    EVADE_RECOVERY_FRAMES: 20,
    EVADE_TRAIL_DURATION: 28,

    // Rainbow Step
    RAINBOW_STEP_SPEED: 0.75,
    RAINBOW_STEP_DURATION: 17,
    RAINBOW_STEP_BOOST_COST: 18,
    RAINBOW_STEP_ASCENT_INERTIA_RATIO: 0.7,
    RAINBOW_STEP_RECOVERY_FRAMES: 20,
    RAINBOW_STEP_TRAIL_DURATION:17,
    
    // Melee - Neutral
    MELEE_LUNGE_SPEED: 0.62,
    MELEE_BOOST_CONSUMPTION: 0.4,
    MELEE_MAX_LUNGE_TIME: 50,
    MELEE_STARTUP_FRAMES: 10,
    MELEE_RECOVERY_FRAMES: 15,
    MELEE_RANGE: 3.2,
    MELEE_HIT_TOLERANCE: 0, 
    
    // Melee - Side (Horizontal)
    SIDE_MELEE_LUNGE_SPEED: 0.62, // Slightly faster to flank
    SIDE_MELEE_ARC_STRENGTH: 0.8, // Controls how wide the curve is
    SIDE_MELEE_STARTUP_FRAMES: 11, // Frames to play prep animation during lunge
    
    // --- MELEE COMBO ADJUSTMENTS (NEUTRAL) ---
    MELEE_COMBO_DATA: {
        SLASH_1: {
            DURATION_FRAMES: 17,
            KNOCKBACK_POWER: 2.5,
            CHASE_VELOCITY: 0.5, 
            APPROACH_SPEED: 1, 
            FORWARD_STEP_SPEED: 0.1,
            STUN_DURATION: 1000,
            HIT_STOP_FRAMES: 5,
            DAMAGE_DELAY: 5, 
        },
        SLASH_2: {
            DURATION_FRAMES: 17,
            KNOCKBACK_POWER: 3,
            CHASE_VELOCITY: 0.5, 
            APPROACH_SPEED: 1, 
            FORWARD_STEP_SPEED: 0.1,
            STUN_DURATION: 1000,
            HIT_STOP_FRAMES: 8,
            DAMAGE_DELAY: 7, 
        },
        SLASH_3: {
            DURATION_FRAMES: 36, // Slower, heavier hit
            KNOCKBACK_POWER: 9.0, 
            CHASE_VELOCITY: 0.5, 
            APPROACH_SPEED: 0.5, 
            FORWARD_STEP_SPEED: 0.1,
            STUN_DURATION: 2000,
            HIT_STOP_FRAMES: 20, 
            DAMAGE_DELAY: 19,
            IS_KNOCKDOWN: true, 
        }
    },

    // --- SIDE MELEE COMBO DATA (Independent) ---
    SIDE_MELEE_COMBO_DATA: {
        SLASH_1: {
            DURATION_FRAMES: 20,
            KNOCKBACK_POWER: 2.0,
            CHASE_VELOCITY: 0.6,
            APPROACH_SPEED: 0.8,
            FORWARD_STEP_SPEED: 0.1,
            STUN_DURATION: 1000,
            HIT_STOP_FRAMES: 8,
            DAMAGE_DELAY: 5,
        },
        SLASH_2: {
             DURATION_FRAMES: 17,
            KNOCKBACK_POWER: 3,
            CHASE_VELOCITY: 0.5, 
            APPROACH_SPEED: 1, 
            FORWARD_STEP_SPEED: 0.1,
            STUN_DURATION: 1000,
            HIT_STOP_FRAMES: 8,
            DAMAGE_DELAY: 7, 
        },
        SLASH_3: {
            DURATION_FRAMES: 36, // Slower, heavier hit
            KNOCKBACK_POWER: 9.0, 
            CHASE_VELOCITY: 0.5, 
            APPROACH_SPEED: 0.5, 
            FORWARD_STEP_SPEED: 0.1,
            STUN_DURATION: 2000,
            HIT_STOP_FRAMES: 20, 
            DAMAGE_DELAY: 19,
            IS_KNOCKDOWN: true, 
        }
    },
    
    // --- CINEMATIC CAMERA ---
    CINEMATIC_CAMERA: {
        OFFSET: { x: 8, y: 4.0, z: 6.0 }, // Left-Front relative to player
        FOV: 75,
        SMOOTHING: 0.8,
        DURATION: 1200 // Duration in ms
    },
    
    // --- KNOCKDOWN PHYSICS ---
    KNOCKDOWN: {
        GRAVITY: 0.03,
        INIT_Y_VELOCITY: 0.7, // Pop up
        AIR_DRAG: 0.98,
        GROUND_FRICTION: 0.8,
        WAKEUP_DELAY: 1200, // ms lying on ground before standing
    },

    // Input
    INPUT_ASCENT_HOLD_THRESHOLD: 115,
    INPUT_DASH_WINDOW: 210,

    // Physics
    GRAVITY: 0.016,
    MELEE_GRAVITY_SCALE: 0.0, // Antigravity during combos
    FRICTION_GROUND: 0.99,
    FRICTION_AIR: 0.99,
    MECH_COLLISION_RADIUS: 0.9, 
    MECH_COLLISION_HEIGHT: 2, 
    
    // Boost
    BOOST_CONSUMPTION_DASH_INIT: 6,
    BOOST_CONSUMPTION_DASH_HOLD: 0.45,
    BOOST_CONSUMPTION_ASCENT: 0.55,
    BOOST_CONSUMPTION_SHORT_HOP: 4,

    // Combat
    BULLET_SPEED: 1.28, 
    HOMING_LATERAL_SPEED: 0.28,
    MAX_AMMO: 20,
    AMMO_REGEN_TIME: 1.9,
    
    UNIT_HITBOX_RADIUS: 1.4,
    PROJECTILE_HITBOX_RADIUS: 0.5,
    
    // Shooting Animation
    SHOT_STARTUP_FRAMES: 20,
    SHOT_AIM_DURATION: 8,
    SHOT_RECOVERY_FRAMES: 60,
    SHOT_RECOVERY_FRAMES_STOP: 25,
    
    // Hit Response
    KNOCKBACK_DURATION: 500,
    KNOCKBACK_SPEED: 0.1,
    
    // Landing Lag
    LANDING_LAG_MIN: 12,
    LANDING_LAG_MAX: 25,
    LANDING_LAG_OVERHEAT: 38,
    LANDING_LAG_BUFFER_WINDOW: 18,
    
    // AI
    AI_SHOOT_PROBABILITY: 0.05,
    AI_SHOOT_COOLDOWN_MIN: 1.2,
    AI_SHOOT_COOLDOWN_MAX: 2.4,
    AI_TARGET_SWITCH_MIN: 5.0,
    AI_TARGET_SWITCH_MAX: 10.0,
};