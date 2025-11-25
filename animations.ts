
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

// --- DASH POSE (Shield Guarding) ---
export const DASH_POSE: MechPose = {
    ...DEFAULT_MECH_POSE, // Inherit defaults for unset limbs
    RIGHT_ARM: {
        SHOULDER: { x: -0.5, y: -0.3, z: 0.4 },
        ELBOW: { x: -1, y: 0.0, z: 0.0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    // Note: Shield position/rotation is handled procedurally in Player.tsx currently, 
    // but arm positions are taken from here.
};

// --- MELEE: STARTUP (Raising Weapon) ---
export const MELEE_STARTUP_POSE: MechPose = {
    TORSO: { x: -0.04, y: -0.44, z: -0.34 },
    CHEST: { x: -0.14, y: -0.09, z: 0 },
    HEAD: { x: -0.14, y: 0.66, z: 0.16 },
    LEFT_ARM: { 
        SHOULDER: { x: -2.24, y: 0.26, z: -0.89},
        ELBOW: { x: -0.14, y: 0.21, z: -0.19},
        FOREARM: { x: -0.24, y: -0.44, z: -0.04 },
        WRIST: { x: -0.49, y: -0.34, z: 0.06 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 1.26, y: 0.16, z: 0.31 },
        ELBOW: { x: -0.19, y: 1.06, z: 0.01 },
        FOREARM: { x: -0.49, y: 0.56, z: 0.11 },
        WRIST: { x: 0, y: 0, z: 0}
    },
    LEFT_LEG: {
        THIGH: { x: 0.71, y: 0.01, z: -0.34 },
        KNEE: 0.5,
        ANKLE: { x: 0.36, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -1.44, y: 0.56, z: 0.11 },
        KNEE: 1.7,
        ANKLE: { x: 0.66, y: 0, z: 0 }
    }
};

// --- MELEE: SLASH (End of Swing) ---
export const MELEE_SLASH_POSE: MechPose = {
    TORSO: { x: 0.2, y: -0.8, z: 0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: 0, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: 0.2, y: -0.8, z: 0.8 }, 
        ELBOW: { x: -0.1, y: 0, z: 0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.4, y: 0.3, z: 0.15 },
        ELBOW: { x: -1, y: -0.4, z: 0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 0.5, y: 0, z: 0 },
        KNEE: 0.2,
        ANKLE: { x: 0, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.5, y: 0, z: 0 },
        KNEE: 0.2,
        ANKLE: { x: 0, y: 0, z: 0 }
    }
};
