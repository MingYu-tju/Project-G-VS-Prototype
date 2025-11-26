
import { MechPose, DEFAULT_MECH_POSE } from './types';

/**
 * [INSTRUCTION FOR USER]
 * 1. Open the "POSE EDITOR" in the game.
 * 2. Create your desired pose.
 * 3. Click "COPY JSON".
 * 4. Paste the copied JSON into the corresponding section below (overwrite the existing object).
 */

// --- IDLE POSE ---
export const IDLE_POSE: MechPose = {
    TORSO: { x: 0.25, y: 0, z: 0.0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: -0.25, y: 0.25, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: -0, y: -0.3, z: -0.25},
        ELBOW:    { x: -0.6, y: -0.3, z: 0.0 },
        FOREARM:  { x: 0, y: 0, z: 0 },
        WRIST:    { x: 0, y: 0, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.4, y: 0.3, z: 0.15 },
        ELBOW:    { x: -1, y: -0.4, z: 0.0 },
        FOREARM:  { x: 0, y: 0, z: 0 },
        WRIST:    { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: -0.4, y: -0.1, z: -0.3 },
        KNEE:  0.6,
        ANKLE: { x: -0.2, y: 0.1, z: 0.1 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.5, y: 0.1, z: 0.3 },
        KNEE:  0.6,
        ANKLE: { x: -0.25, y: 0.1, z: -0.1 }
    }
};

// --- DASH POSE (Saber Mode - Shield Guarding) ---
export const DASH_POSE_SABER: MechPose = {
    ...DEFAULT_MECH_POSE, // Inherit defaults for unset limbs
    RIGHT_ARM: {
        SHOULDER: { x: -0.5, y: -0.3, z: 0.4 },
        ELBOW: { x: -1, y: 0.0, z: 0.0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.6, z: -0.1 },
        ROTATION: { x: -0.3, y: -1, z: -1.2 }
    }
};

// --- DASH POSE (Gun Mode - Shield Idle) ---
export const DASH_POSE_GUN: MechPose = {
    ...DEFAULT_MECH_POSE,
    RIGHT_ARM: {
        SHOULDER: { x: -0.5, y: -0.3, z: 0.4 },
        ELBOW: { x: -1, y: 0.0, z: 0.0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    }
    // No SHIELD override, falls back to default mount
};

// --- MELEE: STARTUP (Raising Weapon) ---
export const MELEE_STARTUP_POSE: MechPose = {
    TORSO: { x: -0.04, y: -0.44, z: -0.34 },
    CHEST: { x: -0.14, y: -0.09, z: 0 },
    HEAD: { x: -0.14, y: 0.66, z: 0.16 },
    LEFT_ARM: {
        SHOULDER: { x: -2.24, y: 0.26, z: -0.89 },
        ELBOW: { x: -0.14, y: 0.21, z: -0.19 },
        FOREARM: { x: -0.24, y: -0.44, z: -0.04 },
        WRIST: { x: -0.49, y: -0.34, z: 0.06 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 1.26, y: 0.16, z: 0.31 },
        ELBOW: { x: -0.19, y: 1.06, z: 0.01 },
        FOREARM: { x: -0.49, y: 0.56, z: 0.11 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 0.31, y: 0.01, z: -0.09 },
        KNEE: 0.5,
        ANKLE: { x: 0.36, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -1.54, y: 0.46, z: 0.11 },
        KNEE: 1.7,
        ANKLE: { x: 0.66, y: 0, z: 0 }
    }
};

// --- MELEE: SLASH 1 (Diagonal Cut) ---
export const MELEE_SLASH_POSE: MechPose = {
    TORSO: { x: 0.76, y: 0.36, z: 0.11 },
    CHEST: { x: 0.56, y: 0.76, z: -0.19 },
    HEAD: { x: 0, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: -0.84, y: 0.01, z: 0.21 },
        ELBOW: { x: 0, y: -0.39, z: 0 },
        FOREARM: { x: -0.34, y: 0, z: 0 },
        WRIST: { x: -0.12, y: -0.18, z: -0.04 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.91, y: 0.01, z: 0.66 },
        ELBOW: { x: -0.69, y: 0, z: 0 },
        FOREARM: { x: 0, y: 1.16, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 0.71, y: 0, z: 0.36 },
        KNEE: 0.4,
        ANKLE: { x: 0, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.29, y: 0, z: 0.46 },
        KNEE: 1.9,
        ANKLE: { x: 0.61, y: 0, z: 0 }
    }
};

// --- MELEE: SLASH 2 (Wide Horizontal Sweep) ---
export const MELEE_SLASH_2_POSE: MechPose = {
    TORSO: { x: 0.31, y: -0.59, z: -0.29 },
    CHEST: { x: 0.26, y: -0.34, z: -0.04 },
    HEAD: { x: -0.24, y: 0.61, z: 0.01 },
    LEFT_ARM: {
        SHOULDER: { x: -2.74, y: 1.36, z: 0.11 },
        ELBOW: { x: 0.81, y: -0.09, z: -0.09 },
        FOREARM: { x: 0.06, y: 0.01, z: 0.01 },
        WRIST: { x: 1.31, y: 0.01, z: 0.11 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.86, y: 0.06, z: 0.46 },
        ELBOW: { x: -0.19, y: -0.19, z: 0.31 },
        FOREARM: { x: -0.09, y: 1.51, z: 0.16 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: -1.09, y: 0.21, z: -0.39 },
        KNEE: 1.8,
        ANKLE: { x: 0.76, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: 0.31, y: -0.44, z: 0.31 },
        KNEE: 0.95,
        ANKLE: { x: 0.61, y: 0, z: 0 }
    }
};
