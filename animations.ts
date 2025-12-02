
import { MechPose, DEFAULT_MECH_POSE, AnimationClip, AnimationTrack } from './types';

// --- HELPER: CONVERT STATIC POSE TO SINGLE-FRAME CLIP ---
const createStaticClip = (name: string, pose: MechPose): AnimationClip => {
    const tracks: AnimationTrack[] = [];
    
    const add = (bone: string, val: any) => {
        tracks.push({
            bone,
            keyframes: [{ time: 0, value: val }, { time: 1, value: val }]
        });
    };

    add('TORSO', pose.TORSO);
    add('CHEST', pose.CHEST);
    add('HEAD', pose.HEAD);
    
    add('LEFT_ARM.SHOULDER', pose.LEFT_ARM.SHOULDER);
    add('LEFT_ARM.ELBOW', pose.LEFT_ARM.ELBOW);
    add('LEFT_ARM.FOREARM', pose.LEFT_ARM.FOREARM);
    add('LEFT_ARM.WRIST', pose.LEFT_ARM.WRIST);

    add('RIGHT_ARM.SHOULDER', pose.RIGHT_ARM.SHOULDER);
    add('RIGHT_ARM.ELBOW', pose.RIGHT_ARM.ELBOW);
    add('RIGHT_ARM.FOREARM', pose.RIGHT_ARM.FOREARM);
    add('RIGHT_ARM.WRIST', pose.RIGHT_ARM.WRIST);
    
    add('LEFT_LEG.THIGH', pose.LEFT_LEG.THIGH);
    add('LEFT_LEG.KNEE', pose.LEFT_LEG.KNEE);
    add('LEFT_LEG.ANKLE', pose.LEFT_LEG.ANKLE);

    add('RIGHT_LEG.THIGH', pose.RIGHT_LEG.THIGH);
    add('RIGHT_LEG.KNEE', pose.RIGHT_LEG.KNEE);
    add('RIGHT_LEG.ANKLE', pose.RIGHT_LEG.ANKLE);
    
    if(pose.SHIELD) {
        add('SHIELD.POSITION', pose.SHIELD.POSITION);
        add('SHIELD.ROTATION', pose.SHIELD.ROTATION);
    }

    return { name, duration: 1.0, loop: true, tracks, basePose: pose };
};

// --- HELPER: CREATE INTERPOLATION CLIP (Start -> End) ---
const createTransitionClip = (name: string, start: MechPose, end: MechPose, duration: number): AnimationClip => {
    const tracks: AnimationTrack[] = [];
    const add = (bone: string, v1: any, v2: any) => {
        tracks.push({
            bone,
            keyframes: [
                { time: 0.0, value: v1, easing: 'easeOut' }, // Start
                { time: 1.0, value: v2 } // End
            ]
        });
    };

    // Core
    add('TORSO', start.TORSO, end.TORSO);
    add('CHEST', start.CHEST, end.CHEST);
    add('HEAD', start.HEAD, end.HEAD);
    
    // Left Arm
    add('LEFT_ARM.SHOULDER', start.LEFT_ARM.SHOULDER, end.LEFT_ARM.SHOULDER);
    add('LEFT_ARM.ELBOW', start.LEFT_ARM.ELBOW, end.LEFT_ARM.ELBOW);
    add('LEFT_ARM.FOREARM', start.LEFT_ARM.FOREARM, end.LEFT_ARM.FOREARM);
    add('LEFT_ARM.WRIST', start.LEFT_ARM.WRIST, end.LEFT_ARM.WRIST);

    // Right Arm
    add('RIGHT_ARM.SHOULDER', start.RIGHT_ARM.SHOULDER, end.RIGHT_ARM.SHOULDER);
    add('RIGHT_ARM.ELBOW', start.RIGHT_ARM.ELBOW, end.RIGHT_ARM.ELBOW);
    add('RIGHT_ARM.FOREARM', start.RIGHT_ARM.FOREARM, end.RIGHT_ARM.FOREARM);
    add('RIGHT_ARM.WRIST', start.RIGHT_ARM.WRIST, end.RIGHT_ARM.WRIST);

    // Legs
    add('LEFT_LEG.THIGH', start.LEFT_LEG.THIGH, end.LEFT_LEG.THIGH);
    add('LEFT_LEG.KNEE', start.LEFT_LEG.KNEE, end.LEFT_LEG.KNEE);
    add('LEFT_LEG.ANKLE', start.LEFT_LEG.ANKLE, end.LEFT_LEG.ANKLE);

    add('RIGHT_LEG.THIGH', start.RIGHT_LEG.THIGH, end.RIGHT_LEG.THIGH);
    add('RIGHT_LEG.KNEE', start.RIGHT_LEG.KNEE, end.RIGHT_LEG.KNEE);
    add('RIGHT_LEG.ANKLE', start.RIGHT_LEG.ANKLE, end.RIGHT_LEG.ANKLE);

    return { name, duration, loop: false, tracks, basePose: DEFAULT_MECH_POSE };
};

// --- HELPER: CREATE WINDUP->HOLD CLIP ---
// Moves from 'prep' to 'hold' quickly, then stays at 'hold'
const createWindupHoldClip = (name: string, prep: MechPose, hold: MechPose, duration: number): AnimationClip => {
    const tracks: AnimationTrack[] = [];
    const add = (bone: string, vPrep: any, vHold: any) => {
        tracks.push({
            bone,
            keyframes: [
                { time: 0.0, value: vPrep },
                { time: 0.25, value: vHold, easing: 'easeOut' }, // Transition finish at 25%
                { time: 1.0, value: vHold }  // Hold
            ]
        });
    };

    // Core
    add('TORSO', prep.TORSO, hold.TORSO);
    add('CHEST', prep.CHEST, hold.CHEST);
    add('HEAD', prep.HEAD, hold.HEAD);
    
    add('LEFT_ARM.SHOULDER', prep.LEFT_ARM.SHOULDER, hold.LEFT_ARM.SHOULDER);
    add('LEFT_ARM.ELBOW', prep.LEFT_ARM.ELBOW, hold.LEFT_ARM.ELBOW);
    add('LEFT_ARM.FOREARM', prep.LEFT_ARM.FOREARM, hold.LEFT_ARM.FOREARM);
    add('LEFT_ARM.WRIST', prep.LEFT_ARM.WRIST, hold.LEFT_ARM.WRIST);

    add('RIGHT_ARM.SHOULDER', prep.RIGHT_ARM.SHOULDER, hold.RIGHT_ARM.SHOULDER);
    add('RIGHT_ARM.ELBOW', prep.RIGHT_ARM.ELBOW, hold.RIGHT_ARM.ELBOW);
    add('RIGHT_ARM.FOREARM', prep.RIGHT_ARM.FOREARM, hold.RIGHT_ARM.FOREARM);
    add('RIGHT_ARM.WRIST', prep.RIGHT_ARM.WRIST, hold.RIGHT_ARM.WRIST);

    add('LEFT_LEG.THIGH', prep.LEFT_LEG.THIGH, hold.LEFT_LEG.THIGH);
    add('LEFT_LEG.KNEE', prep.LEFT_LEG.KNEE, hold.LEFT_LEG.KNEE);
    add('LEFT_LEG.ANKLE', prep.LEFT_LEG.ANKLE, hold.LEFT_LEG.ANKLE);

    add('RIGHT_LEG.THIGH', prep.RIGHT_LEG.THIGH, hold.RIGHT_LEG.THIGH);
    add('RIGHT_LEG.KNEE', prep.RIGHT_LEG.KNEE, hold.RIGHT_LEG.KNEE);
    add('RIGHT_LEG.ANKLE', prep.RIGHT_LEG.ANKLE, hold.RIGHT_LEG.ANKLE);

    return { name, duration, loop: false, tracks, basePose: prep };
};


// --- RAW POSE DATA ---

const RAW_IDLE: MechPose = {
    TORSO: { x: 0.25, y: 0, z: 0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: -0.25, y: 0.25, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: -0.04, y: -0.34, z: -0.24 },
        ELBOW: { x: -0.14, y: 0.16, z: -0.04 },
        FOREARM: { x: -0.59, y: -0.09, z: 0 },
        WRIST: { x: 0.66, y: 0.01, z: -0.09 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: -0.04, y: 0.26, z: 0.16 },
        ELBOW: { x: -0.19, y: -0.09, z: 0.11 },
        FOREARM: { x: -0.44, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: -0.4, y: -0.1, z: -0.3 },
        KNEE: 0.6,
        ANKLE: { x: -0.2, y: 0.1, z: 0.1 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.5, y: 0.1, z: 0.3 },
        KNEE: 0.6,
        ANKLE: { x: -0.25, y: 0.1, z: -0.1 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }
    }
};

const RAW_DASH_GUN: MechPose = {
    TORSO: { x: 0.65, y: 0, z: 0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: -0.4, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: 0.16, y: -0.3, z: 0 },
        ELBOW: { x: -0.69, y: -0.09, z: 0 },
        FOREARM: { x: -0.54, y: 0.11, z: 0 },
        WRIST: { x: 0.26, y: 0, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.26, y: 0.36, z: 0.11 },
        ELBOW: { x: -0.64, y: 0.11, z: 0 },
        FOREARM: { x: -0.89, y: 0.06, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 1.1, y: -0.5, z: -0.2 },
        KNEE: 0.3,
        ANKLE: { x: 0.25, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -1, y: 0, z: 0 },
        KNEE: 2.6,
        ANKLE: { x: 0.8, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }
    }
};

const RAW_DASH_SABER: MechPose = {
    TORSO: { x: 0.65, y: 0, z: 0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: -0.4, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: -0.39, y: -0.29, z: -0.34 },
        ELBOW: { x: 0.01, y: 0.01, z: -0.09 },
        FOREARM: { x: -0.54, y: 0, z: 0 },
        WRIST: { x: 0.26, y: -0.04, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: -0.5, y: -0.29, z: 0.4 },
        ELBOW: { x: -0.44, y: 0.06, z: 0.16 },
        FOREARM: { x: -0.64, y: 0.11, z: 0.11 },
        WRIST: { x: -0.19, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 1.1, y: -0.5, z: -0.2 },
        KNEE: 0.3,
        ANKLE: { x: 0.25, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -1, y: 0, z: 0 },
        KNEE: 2.6,
        ANKLE: { x: 0.8, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.6, z: -0.1 },
        ROTATION: { x: -0.3, y: -1, z: -1.2 }
    }
}

const RAW_ASCEND: MechPose = {
    TORSO: { x: 0.06, y: 0.01, z: 0 },
    CHEST: { x: -0.29, y: 0, z: 0 },
    HEAD: { x: -0.44, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: 0.71, y: 0, z: -0.3 },
        ELBOW: { x: 0.11, y: 0, z: 0.16 },
        FOREARM: { x: -0.59, y: 0, z: 0 },
        WRIST: { x: 0.61, y: 0, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 1.01, y: 0.16, z: 0.16 },
        ELBOW: { x: -0.14, y: 0, z: -0.04 },
        FOREARM: { x: -0.54, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 0.01, y: 0, z: -0.04 },
        KNEE: 0.45,
        ANKLE: { x: 0.76, y: 0, z: 0.01 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.34, y: 0, z: 0.06 },
        KNEE: 1.1,
        ANKLE: { x: 0.01, y: 0, z: -0.19 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }
    }
};

const RAW_MELEE_STARTUP: MechPose = {
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

// NEW: Side Melee Poses
// Prep: Tucked in, ready to spring
const RAW_SIDE_MELEE_PREP: MechPose = {
    TORSO: { x: -0.09, y: 0.36, z: 0.46 },
    CHEST: { x: 1.36, y: 0.56, z: -1.04 },
    HEAD: { x: -0.4, y: -0.991, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: -2.44, y: 0.36, z: -1.089 },
        ELBOW: { x: 0.26, y: 1.51, z: -0.34 },
        FOREARM: { x: -0.84, y: 0.06, z: 0 },
        WRIST: { x: -0.34, y: 0.11, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.46, y: 0.3, z: 0 },
        ELBOW: { x: -0.69, y: 1.56, z: 0 },
        FOREARM: { x: -0.24, y: -1.49, z: -0.09 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 0.81, y: 0.16, z: -0.19 },
        KNEE: 0.3,
        ANKLE: { x: 0.56, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.59, y: -0.09, z: 1.51 },
        KNEE: 2.25,
        ANKLE: { x: 0.51, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }
    }
};

// Hold: Wide stance, sword arm extended laterally
const RAW_SIDE_MELEE_HOLD: MechPose = {
    TORSO: { x: -0.288, y: 0.809, z: 0.46 },
    CHEST: { x: 1.36, y: 0.858, z: -1.04 },
    HEAD: { x: -0.34, y: -1.389, z: -0.14 },
    LEFT_ARM: {
        SHOULDER: { x: -2.44, y: 0.26, z: -0.445 },
        ELBOW: { x: 0.26, y: 1.51, z: -0.34 },
        FOREARM: { x: -0.84, y: 0.06, z: 0 },
        WRIST: { x: -0.34, y: 0.11, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.86, y: 0.3, z: 0 },
        ELBOW: { x: -1.09, y: 1.71, z: 0.308 },
        FOREARM: { x: -0.49, y: -1.19, z: -0.69 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: 0.611, y: 0.309, z: 0.059 },
        KNEE: 0.648,
        ANKLE: { x: 0.51, y: 0, z: 0.16 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.241, y: 0.457, z: 1.41 },
        KNEE: 2.498,
        ANKLE: { x: 0.51, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }
    }
};

// NEW: Knockdown Poses
const RAW_KNOCKDOWN: MechPose = {
    ...DEFAULT_MECH_POSE,
    TORSO: { x: -1.4, y: 0, z: 0 }, // Lie flat on back
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: 0.3, y: 0, z: 0 }, // Head up slightly
    LEFT_ARM: { 
        SHOULDER: { x: -0.5, y: 0, z: -0.5 },
        ELBOW: { x: -0.2, y: 0, z: 0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    RIGHT_ARM: { 
        SHOULDER: { x: 0.5, y: 0, z: 0.5 },
        ELBOW: { x: -0.2, y: 0, z: 0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: { 
        THIGH: { x: 0.2, y: 0, z: -0.2 },
        KNEE: 0.2,
        ANKLE: { x: 0.5, y: 0, z: 0 }
    },
    RIGHT_LEG: { 
        THIGH: { x: 0.2, y: 0, z: 0.2 },
        KNEE: 0.2,
        ANKLE: { x: 0.5, y: 0, z: 0 }
    }
};

const RAW_WAKEUP: MechPose = {
    ...DEFAULT_MECH_POSE,
    TORSO: { x: -0.6, y: 0, z: 0 }, // Halfway up
    LEFT_LEG: { ...DEFAULT_MECH_POSE.LEFT_LEG, THIGH: { x: -0.5, y: 0, z: -0.3 }, KNEE: 1.5 }, // Knee up to stand
    RIGHT_LEG: { ...DEFAULT_MECH_POSE.RIGHT_LEG, THIGH: { x: 0, y: 0, z: 0.3 }, KNEE: 0.5 }
};

// --- EXPORTED CLIPS ---

export const ANIMATION_CLIPS = {
    IDLE: createStaticClip('IDLE', RAW_IDLE),
    NEUTRAL: createStaticClip('NEUTRAL', DEFAULT_MECH_POSE),
    DASH_GUN: createStaticClip('DASH_GUN', RAW_DASH_GUN),
    DASH_SABER: createStaticClip('DASH_SABER', RAW_DASH_SABER),
    ASCEND: createStaticClip('ASCEND', RAW_ASCEND),
    MELEE_STARTUP: createStaticClip('MELEE_STARTUP', RAW_MELEE_STARTUP),
    
    // Updated: Side Lunge with Windup->Hold transition
    MELEE_SIDE_LUNGE: createWindupHoldClip('MELEE_SIDE_LUNGE', RAW_SIDE_MELEE_PREP, RAW_SIDE_MELEE_HOLD, 1.0),
    
    MELEE_SLASH_1: {
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0, "value": { "x": -0.039, "y": -0.439, "z": -0.339 } }, { "time": 0.083, "value": { "x": 0.05, "y": -0.35, "z": -0.29 } }, { "time": 0.168, "value": { "x": 0.18, "y": -0.22, "z": -0.21 } }, { "time": 0.259, "value": { "x": 0.39, "y": -0.01, "z": -0.1 } }, { "time": 0.353, "value": { "x": 0.58, "y": 0.18, "z": 0.01 } }, { "time": 0.447, "value": { "x": 0.76, "y": 0.36, "z": 0.11 } }, { "time": 1, "value": { "x": 0.76, "y": 0.36, "z": 0.11 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0, "value": { "x": -0.139, "y": -0.088, "z": 0 } }, { "time": 0.083, "value": { "x": -0.06, "y": 0.01, "z": -0.02 } }, { "time": 0.168, "value": { "x": 0.05, "y": 0.15, "z": -0.05 } }, { "time": 0.259, "value": { "x": 0.24, "y": 0.37, "z": -0.1 } }, { "time": 0.353, "value": { "x": 0.4, "y": 0.57, "z": -0.15 } }, { "time": 0.447, "value": { "x": 0.56, "y": 0.76, "z": -0.19 } }, { "time": 1, "value": { "x": 0.56, "y": 0.76, "z": -0.19 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0, "value": { "x": -0.14, "y": 0.659, "z": 0.16 } }, { "time": 0.083, "value": { "x": -0.12, "y": 0.59, "z": 0.14 } }, { "time": 0.168, "value": { "x": -0.1, "y": 0.48, "z": 0.12 } }, { "time": 0.259, "value": { "x": -0.06, "y": 0.3, "z": 0.07 } }, { "time": 0.353, "value": { "x": -0.03, "y": 0.15, "z": 0.04 } }, { "time": 0.447, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": 0, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0, "value": { "x": -2.237, "y": 0.26, "z": -0.888 } }, { "time": 0.083, "value": { "x": -2.08, "y": 0.23, "z": -0.76 } }, { "time": 0.168, "value": { "x": -1.85, "y": 0.19, "z": -0.58 } }, { "time": 0.259, "value": { "x": -1.48, "y": 0.12, "z": -0.29 } }, { "time": 0.353, "value": { "x": -1.15, "y": 0.07, "z": -0.03 } }, { "time": 0.447, "value": { "x": -0.84, "y": 0.01, "z": 0.21 } }, { "time": 1, "value": { "x": -0.84, "y": 0.01, "z": 0.21 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0, "value": { "x": -0.14, "y": 0.209, "z": -0.19 } }, { "time": 0.083, "value": { "x": -0.12, "y": 0.14, "z": -0.17 } }, { "time": 0.168, "value": { "x": -0.1, "y": 0.04, "z": -0.14 } }, { "time": 0.259, "value": { "x": -0.06, "y": -0.12, "z": -0.09 } }, { "time": 0.353, "value": { "x": -0.03, "y": -0.26, "z": -0.04 } }, { "time": 0.447, "value": { "x": 0, "y": -0.39, "z": 0 } }, { "time": 1, "value": { "x": 0, "y": -0.39, "z": 0 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0, "value": { "x": -0.24, "y": -0.439, "z": -0.04 } }, { "time": 0.083, "value": { "x": -0.25, "y": -0.39, "z": -0.04 } }, { "time": 0.168, "value": { "x": -0.27, "y": -0.32, "z": -0.03 } }, { "time": 0.259, "value": { "x": -0.29, "y": -0.2, "z": -0.02 } }, { "time": 0.353, "value": { "x": -0.32, "y": -0.1, "z": -0.01 } }, { "time": 0.447, "value": { "x": -0.34, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": -0.34, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0, "value": { "x": -0.416, "y": -0.566, "z": -0.233 } }, { "time": 0.083, "value": { "x": -0.22, "y": -0.75, "z": -0.23 } }, { "time": 0.168, "value": { "x": -0.11, "y": -0.72, "z": -0.18 } }, { "time": 0.259, "value": { "x": -0.05, "y": -0.53, "z": -0.11 } }, { "time": 0.353, "value": { "x": -0.09, "y": -0.35, "z": -0.08 } }, { "time": 0.447, "value": { "x": -0.15, "y": -0.3, "z": -0.08 } }, { "time": 1, "value": { "x": -0.147, "y": -0.299, "z": -0.076 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0, "value": { "x": 1.259, "y": 0.16, "z": 0.311 } }, { "time": 0.083, "value": { "x": 1.22, "y": 0.14, "z": 0.35 } }, { "time": 0.168, "value": { "x": 1.16, "y": 0.12, "z": 0.41 } }, { "time": 0.259, "value": { "x": 1.07, "y": 0.08, "z": 0.5 } }, { "time": 0.353, "value": { "x": 0.99, "y": 0.04, "z": 0.58 } }, { "time": 0.447, "value": { "x": 0.91, "y": 0.01, "z": 0.66 } }, { "time": 1, "value": { "x": 0.91, "y": 0.01, "z": 0.66 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0, "value": { "x": -0.191, "y": 1.058, "z": 0.01 } }, { "time": 0.083, "value": { "x": -0.25, "y": 0.94, "z": 0.01 } }, { "time": 0.168, "value": { "x": -0.33, "y": 0.77, "z": 0.01 } }, { "time": 0.259, "value": { "x": -0.46, "y": 0.48, "z": 0 } }, { "time": 0.353, "value": { "x": -0.58, "y": 0.24, "z": 0 } }, { "time": 0.447, "value": { "x": -0.69, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": -0.69, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0, "value": { "x": -0.489, "y": 0.561, "z": 0.11 } }, { "time": 0.083, "value": { "x": -0.43, "y": 0.63, "z": 0.1 } }, { "time": 0.168, "value": { "x": -0.35, "y": 0.73, "z": 0.08 } }, { "time": 0.259, "value": { "x": -0.22, "y": 0.89, "z": 0.05 } }, { "time": 0.353, "value": { "x": -0.11, "y": 1.03, "z": 0.02 } }, { "time": 0.447, "value": { "x": 0, "y": 1.16, "z": 0 } }, { "time": 1, "value": { "x": 0, "y": 1.16, "z": 0 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.083, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.168, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.259, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.353, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.447, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": 0, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0, "value": { "x": 0.311, "y": 0.01, "z": -0.089 } }, { "time": 0.083, "value": { "x": 0.36, "y": 0.01, "z": -0.04 } }, { "time": 0.168, "value": { "x": 0.42, "y": 0.01, "z": 0.04 } }, { "time": 0.259, "value": { "x": 0.53, "y": 0, "z": 0.15 } }, { "time": 0.353, "value": { "x": 0.62, "y": 0, "z": 0.26 } }, { "time": 0.447, "value": { "x": 0.71, "y": 0, "z": 0.36 } }, { "time": 1, "value": { "x": 0.71, "y": 0, "z": 0.36 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0, "value": 0.5 }, { "time": 0.083, "value": 0.49 }, { "time": 0.168, "value": 0.47 }, { "time": 0.259, "value": 0.45 }, { "time": 0.353, "value": 0.42 }, { "time": 0.447, "value": 0.4 }, { "time": 1, "value": 0.4 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0, "value": { "x": 0.359, "y": 0, "z": 0 } }, { "time": 0.083, "value": { "x": 0.32, "y": 0, "z": 0 } }, { "time": 0.168, "value": { "x": 0.26, "y": 0, "z": 0 } }, { "time": 0.259, "value": { "x": 0.16, "y": 0, "z": 0 } }, { "time": 0.353, "value": { "x": 0.08, "y": 0, "z": 0 } }, { "time": 0.447, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": 0, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0, "value": { "x": -1.538, "y": 0.459, "z": 0.111 } }, { "time": 0.083, "value": { "x": -1.4, "y": 0.41, "z": 0.15 } }, { "time": 0.168, "value": { "x": -1.19, "y": 0.33, "z": 0.21 } }, { "time": 0.259, "value": { "x": -0.86, "y": 0.21, "z": 0.3 } }, { "time": 0.353, "value": { "x": -0.57, "y": 0.1, "z": 0.38 } }, { "time": 0.447, "value": { "x": -0.29, "y": 0, "z": 0.46 } }, { "time": 1, "value": { "x": -0.29, "y": 0, "z": 0.46 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0, "value": 1.7 }, { "time": 0.083, "value": 1.72 }, { "time": 0.168, "value": 1.76 }, { "time": 0.259, "value": 1.81 }, { "time": 0.353, "value": 1.86 }, { "time": 0.447, "value": 1.9 }, { "time": 1, "value": 1.9 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0, "value": { "x": 0.66, "y": 0, "z": 0 } }, { "time": 0.083, "value": { "x": 0.65, "y": 0, "z": 0 } }, { "time": 0.168, "value": { "x": 0.65, "y": 0, "z": 0 } }, { "time": 0.259, "value": { "x": 0.63, "y": 0, "z": 0 } }, { "time": 0.353, "value": { "x": 0.62, "y": 0, "z": 0 } }, { "time": 0.447, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": 0.61, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.083, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.168, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.259, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.353, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.447, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 1, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.083, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.168, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.259, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.353, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.447, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 1, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},
    MELEE_SLASH_2: {
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0.001, "value": { "x": 0.76, "y": 0.36, "z": 0.11 } }, { "time": 0.151, "value": { "x": 0.709, "y": 0.31, "z": -0.39 } }, { "time": 0.266, "value": { "x": 0.366, "y": 0.276, "z": -0.397 } }, { "time": 0.351, "value": { "x": 0.233, "y": 0.26, "z": -0.4 } }, { "time": 0.402, "value": { "x": 0.152, "y": 0.182, "z": -0.415 } }, { "time": 0.448, "value": { "x": 0.029, "y": 0.015, "z": -0.448 } }, { "time": 0.533, "value": { "x": -0.13, "y": -0.2, "z": -0.49 } }, { "time": 0.999, "value": { "x": -0.13, "y": -0.2, "z": -0.49 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0.001, "value": { "x": 0.56, "y": 0.76, "z": -0.19 } }, { "time": 0.151, "value": { "x": 0.55, "y": 0.549, "z": -0.29 } }, { "time": 0.266, "value": { "x": 0.351, "y": 0.282, "z": -0.324 } }, { "time": 0.351, "value": { "x": 0.274, "y": 0.181, "z": -0.337 } }, { "time": 0.402, "value": { "x": 0.263, "y": 0.206, "z": -0.323 } }, { "time": 0.448, "value": { "x": 0.271, "y": -0.033, "z": -0.287 } }, { "time": 0.533, "value": { "x": 0.28, "y": -0.341, "z": -0.24 } }, { "time": 0.999, "value": { "x": 0.28, "y": -0.341, "z": -0.24 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": -0.02, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": -0.048, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": -0.059, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": -0.111, "y": 0.002, "z": 0.002 } }, { "time": 0.448, "value": { "x": -0.22, "y": 0.005, "z": 0.005 } }, { "time": 0.533, "value": { "x": -0.36, "y": 0.01, "z": 0.01 } }, { "time": 0.999, "value": { "x": -0.36, "y": 0.01, "z": 0.01 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": -0.84, "y": 0.01, "z": 0.21 } }, { "time": 0.151, "value": { "x": -2.09, "y": 0.46, "z": -0.29 } }, { "time": 0.266, "value": { "x": -1.74, "y": 0.21, "z": -0.29 } }, { "time": 0.351, "value": { "x": -1.74, "y": 0.71, "z": -0.79 } }, { "time": 0.402, "value": { "x": -1.243, "y": 0.71, "z": -1.389 } }, { "time": 0.448, "value": { "x": -1.591, "y": 0.61, "z": -1.302 } }, { "time": 0.533, "value": { "x": -2.04, "y": 0.11, "z": -1.19 } }, { "time": 0.999, "value": { "x": -2.04, "y": 0.11, "z": -1.19 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": -0.39, "z": 0 } }, { "time": 0.151, "value": { "x": 0.399, "y": -1.04, "z": 0.199 } }, { "time": 0.266, "value": { "x": -0.109, "y": -1.349, "z": -0.343 } }, { "time": 0.351, "value": { "x": -0.299, "y": -1.49, "z": -0.544 } }, { "time": 0.402, "value": { "x": -0.179, "y": -1.74, "z": -0.332 } }, { "time": 0.448, "value": { "x": 0.166, "y": -1.806, "z": 0.145 } }, { "time": 0.533, "value": { "x": 0.61, "y": -1.89, "z": 0.76 } }, { "time": 0.999, "value": { "x": 0.61, "y": -1.89, "z": 0.76 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0.91, "y": -0.04, "z": -0.14 } }, { "time": 0.266, "value": { "x": 0.944, "y": 0.11, "z": -0.044 } }, { "time": 0.351, "value": { "x": 0.955, "y": -0.131, "z": -0.007 } }, { "time": 0.402, "value": { "x": 0.361, "y": 0.011, "z": 0.002 } }, { "time": 0.448, "value": { "x": 0.426, "y": 0.076, "z": 0.005 } }, { "time": 0.533, "value": { "x": 0.51, "y": 0.16, "z": 0.01 } }, { "time": 0.999, "value": { "x": 0.51, "y": 0.16, "z": 0.01 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": -0.19, "y": -0.27, "z": -0.07 } }, { "time": 0.151, "value": { "x": 0.61, "y": -0.16, "z": -0.029 } }, { "time": 0.266, "value": { "x": 1.213, "y": 0.06, "z": -0.09 } }, { "time": 0.351, "value": { "x": 2.16, "y": -0.04, "z": 0.054 } }, { "time": 0.402, "value": { "x": 2.057, "y": 0.023, "z": 0.004 } }, { "time": 0.448, "value": { "x": 1.731, "y": -0.001, "z": 0 } }, { "time": 0.533, "value": { "x": 1.31, "y": -0.032, "z": -0.006 } }, { "time": 0.999, "value": { "x": 1.31, "y": -0.032, "z": -0.006 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": 0.91, "y": 0.01, "z": 0.66 } }, { "time": 0.151, "value": { "x": 0.91, "y": -0.09, "z": 0.65 } }, { "time": 0.266, "value": { "x": 0.903, "y": -0.076, "z": 0.636 } }, { "time": 0.351, "value": { "x": 0.9, "y": -0.07, "z": 0.63 } }, { "time": 0.402, "value": { "x": 0.893, "y": -0.048, "z": 0.605 } }, { "time": 0.448, "value": { "x": 0.879, "y": -0.001, "z": 0.55 } }, { "time": 0.533, "value": { "x": 0.86, "y": 0.06, "z": 0.48 } }, { "time": 0.999, "value": { "x": 0.86, "y": 0.06, "z": 0.48 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": -0.69, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": -0.67, "y": -0.01, "z": 0.01 } }, { "time": 0.266, "value": { "x": -0.636, "y": -0.024, "z": 0.031 } }, { "time": 0.351, "value": { "x": -0.621, "y": -0.03, "z": 0.04 } }, { "time": 0.402, "value": { "x": -0.554, "y": -0.055, "z": 0.082 } }, { "time": 0.448, "value": { "x": -0.412, "y": -0.11, "z": 0.173 } }, { "time": 0.533, "value": { "x": -0.23, "y": -0.18, "z": 0.29 } }, { "time": 0.999, "value": { "x": -0.23, "y": -0.18, "z": 0.29 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 1.16, "z": 0 } }, { "time": 0.151, "value": { "x": 0, "y": 1.17, "z": 0.01 } }, { "time": 0.266, "value": { "x": -0.007, "y": 1.191, "z": 0.024 } }, { "time": 0.351, "value": { "x": -0.01, "y": 1.2, "z": 0.03 } }, { "time": 0.402, "value": { "x": -0.022, "y": 1.247, "z": 0.05 } }, { "time": 0.448, "value": { "x": -0.047, "y": 1.349, "z": 0.094 } }, { "time": 0.533, "value": { "x": -0.08, "y": 1.48, "z": 0.15 } }, { "time": 0.999, "value": { "x": -0.08, "y": 1.48, "z": 0.15 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": -0.007, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": -0.021, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.04, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": 0.71, "y": 0, "z": 0.36 } }, { "time": 0.151, "value": { "x": 0.63, "y": 0.01, "z": 0.33 } }, { "time": 0.266, "value": { "x": 0.52, "y": 0.024, "z": 0.282 } }, { "time": 0.351, "value": { "x": 0.471, "y": 0.03, "z": 0.261 } }, { "time": 0.402, "value": { "x": 0.229, "y": 0.057, "z": 0.16 } }, { "time": 0.448, "value": { "x": -0.286, "y": 0.115, "z": -0.054 } }, { "time": 0.533, "value": { "x": -0.951, "y": 0.19, "z": -0.33 } }, { "time": 0.999, "value": { "x": -0.951, "y": 0.19, "z": -0.33 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 0.4 }, { "time": 0.151, "value": 0.47 }, { "time": 0.266, "value": 0.553 }, { "time": 0.351, "value": 0.589 }, { "time": 0.402, "value": 0.776 }, { "time": 0.448, "value": 1.176 }, { "time": 0.533, "value": 1.691 }, { "time": 0.999, "value": 1.691 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0.03, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": 0.078, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": 0.099, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": 0.202, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": 0.42, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": 0.7, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.7, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": -0.3, "y": 0, "z": 0.46 } }, { "time": 0.151, "value": { "x": -0.27, "y": -0.02, "z": 0.45 } }, { "time": 0.266, "value": { "x": -0.229, "y": -0.048, "z": 0.443 } }, { "time": 0.351, "value": { "x": -0.211, "y": -0.06, "z": 0.44 } }, { "time": 0.402, "value": { "x": -0.13, "y": -0.119, "z": 0.42 } }, { "time": 0.448, "value": { "x": 0.04, "y": -0.246, "z": 0.376 } }, { "time": 0.533, "value": { "x": 0.26, "y": -0.41, "z": 0.32 } }, { "time": 0.999, "value": { "x": 0.26, "y": -0.41, "z": 0.32 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 1.9 }, { "time": 0.151, "value": 1.86 }, { "time": 0.266, "value": 1.798 }, { "time": 0.351, "value": 1.771 }, { "time": 0.402, "value": 1.643 }, { "time": 0.448, "value": 1.371 }, { "time": 0.533, "value": 1.02 }, { "time": 0.999, "value": 1.02 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.61, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.151, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.266, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.351, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.402, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.448, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.533, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.999, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0.001, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},
    MELEE_SLASH_3: {
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0.001, "value": { "x": -0.13, "y": -0.2, "z": -0.49 } }, { "time": 0.201, "value": { "x": -0.13, "y": -0.2, "z": -0.19 } }, { "time": 0.417, "value": { "x": -0.04, "y": 0.159, "z": -0.041 } }, { "time": 0.498, "value": { "x": -0.041, "y": 0.157, "z": -0.041 } }, { "time": 0.511, "value": { "x": -0.041, "y": 0.157, "z": -0.041 } }, { "time": 0.568, "value": { "x": 0.51, "y": 0.51, "z": 0.16 } }, { "time": 0.999, "value": { "x": 0.51, "y": 0.51, "z": 0.16 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0.001, "value": { "x": 0.28, "y": -0.34, "z": -0.24 } }, { "time": 0.201, "value": { "x": 0.28, "y": -0.34, "z": -0.19 } }, { "time": 0.417, "value": { "x": -0.238, "y": -0.141, "z": 0.059 } }, { "time": 0.498, "value": { "x": -0.236, "y": -0.142, "z": 0.058 } }, { "time": 0.511, "value": { "x": -0.236, "y": -0.142, "z": 0.058 } }, { "time": 0.568, "value": { "x": 0.36, "y": 0.01, "z": 0.01 } }, { "time": 0.999, "value": { "x": 0.36, "y": 0.01, "z": 0.01 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0.001, "value": { "x": -0.36, "y": 0.01, "z": 0.01 } }, { "time": 0.201, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.417, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.498, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.511, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.568, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.999, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": -2.04, "y": 0.11, "z": -1.19 } }, { "time": 0.201, "value": { "x": -2.237, "y": 0.159, "z": -0.389 } }, { "time": 0.417, "value": { "x": -2.689, "y": 0.16, "z": 0.108 } }, { "time": 0.498, "value": { "x": -2.74, "y": 0.16, "z": 0.106 } }, { "time": 0.511, "value": { "x": -2.687, "y": 0.16, "z": 0.106 } }, { "time": 0.568, "value": { "x": -1.44, "y": 0.15, "z": 0.111 } }, { "time": 0.999, "value": { "x": -1.44, "y": 0.15, "z": 0.111 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": 0.61, "y": -1.89, "z": 0.76 } }, { "time": 0.201, "value": { "x": 0.658, "y": -1.388, "z": 0.609 } }, { "time": 0.417, "value": { "x": 0.65, "y": -1.24, "z": 0.6 } }, { "time": 0.498, "value": { "x": 0.65, "y": -1.241, "z": 0.6 } }, { "time": 0.511, "value": { "x": 0.65, "y": -1.241, "z": 0.6 } }, { "time": 0.568, "value": { "x": 0.64, "y": -1.37, "z": 0.6 } }, { "time": 0.999, "value": { "x": 0.64, "y": -1.37, "z": 0.6 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": 0.51, "y": 0.16, "z": 0.01 } }, { "time": 0.201, "value": { "x": 0.509, "y": -0.04, "z": 0.01 } }, { "time": 0.417, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.498, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.511, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.568, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.999, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": 1.31, "y": -0.03, "z": -0.01 } }, { "time": 0.201, "value": { "x": 1.308, "y": -0.03, "z": -0.01 } }, { "time": 0.417, "value": { "x": -1.386, "y": 1.256, "z": 0.01 } }, { "time": 0.498, "value": { "x": -1.94, "y": 1.06, "z": 0.01 } }, { "time": 0.511, "value": { "x": -1.374, "y": 1.25, "z": 0.01 } }, { "time": 0.568, "value": { "x": 0.76, "y": 0.01, "z": -0.015 } }, { "time": 0.999, "value": { "x": 0.76, "y": 0.01, "z": -0.015 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": 0.86, "y": 0.06, "z": 0.48 } }, { "time": 0.201, "value": { "x": 1.009, "y": 0.06, "z": 1.758 } }, { "time": 0.417, "value": { "x": -0.438, "y": -1.724, "z": 1.9 } }, { "time": 0.498, "value": { "x": -0.59, "y": -1.716, "z": 1.899 } }, { "time": 0.511, "value": { "x": -0.431, "y": -1.716, "z": 1.899 } }, { "time": 0.568, "value": { "x": 0.71, "y": -1.731, "z": 1.901 } }, { "time": 0.999, "value": { "x": 0.71, "y": -1.731, "z": 1.901 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": -0.23, "y": -0.18, "z": 0.29 } }, { "time": 0.201, "value": { "x": -0.231, "y": -0.18, "z": 0.29 } }, { "time": 0.417, "value": { "x": -0.389, "y": 0.259, "z": -0.139 } }, { "time": 0.498, "value": { "x": -0.389, "y": 0.257, "z": -0.137 } }, { "time": 0.511, "value": { "x": -0.389, "y": 0.257, "z": -0.137 } }, { "time": 0.568, "value": { "x": -0.39, "y": 0.26, "z": -0.14 } }, { "time": 0.999, "value": { "x": -0.39, "y": 0.26, "z": -0.14 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": -0.08, "y": 1.48, "z": 0.15 } }, { "time": 0.201, "value": { "x": -0.08, "y": 1.478, "z": 0.15 } }, { "time": 0.417, "value": { "x": -0.239, "y": 1.301, "z": 0.15 } }, { "time": 0.498, "value": { "x": -0.239, "y": 1.301, "z": 0.15 } }, { "time": 0.511, "value": { "x": -0.239, "y": 1.301, "z": 0.15 } }, { "time": 0.568, "value": { "x": -0.24, "y": 1.3, "z": 0.15 } }, { "time": 0.999, "value": { "x": -0.24, "y": 1.3, "z": 0.15 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.04, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": -0.95, "y": 0.19, "z": -0.33 } }, { "time": 0.201, "value": { "x": -0.09, "y": 0.19, "z": -0.33 } }, { "time": 0.417, "value": { "x": 0.608, "y": 0.19, "z": -0.33 } }, { "time": 0.498, "value": { "x": 0.605, "y": 0.19, "z": -0.33 } }, { "time": 0.511, "value": { "x": 0.605, "y": 0.19, "z": -0.33 } }, { "time": 0.568, "value": { "x": 0.611, "y": 0.19, "z": -0.33 } }, { "time": 0.999, "value": { "x": 0.611, "y": 0.19, "z": -0.33 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 1.69 }, { "time": 0.201, "value": 1.35 }, { "time": 0.417, "value": 0.553 }, { "time": 0.498, "value": 0.556 }, { "time": 0.511, "value": 0.556 }, { "time": 0.568, "value": 0.549 }, { "time": 0.999, "value": 0.549 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0.7, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": -0.24, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": 1.056, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": 1.05, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": 1.05, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": 1.06, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 1.06, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": 0.26, "y": -0.41, "z": 0.32 } }, { "time": 0.201, "value": { "x": -0.24, "y": -0.409, "z": 0.32 } }, { "time": 0.417, "value": { "x": -0.938, "y": -0.41, "z": 0.32 } }, { "time": 0.498, "value": { "x": -0.935, "y": -0.41, "z": 0.32 } }, { "time": 0.511, "value": { "x": -0.935, "y": -0.41, "z": 0.32 } }, { "time": 0.568, "value": { "x": -0.941, "y": -0.41, "z": 0.32 } }, { "time": 0.999, "value": { "x": -0.941, "y": -0.41, "z": 0.32 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 1.02 }, { "time": 0.201, "value": 1.019 }, { "time": 0.417, "value": 1.598 }, { "time": 0.498, "value": 1.596 }, { "time": 0.511, "value": 1.596 }, { "time": 0.568, "value": 1.6 }, { "time": 0.999, "value": 1.6 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": 0.01, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": 0.658, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": 0.655, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": 0.655, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": 0.66, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.66, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.201, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.417, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.498, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.511, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.568, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.999, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0.001, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},
    SIDE_SLASH_1:{
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0, "value": { "x": -0.288, "y": 0.809, "z": 0.46 } }, { "time": 0.217, "value": { "x": 0.558, "y": 0.212, "z": 0.31 } }, { "time": 0.304, "value": { "x": 0.556, "y": 0.354, "z": 0.262 } }, { "time": 0.355, "value": { "x": 0.554, "y": 0.51, "z": 0.21 } }, { "time": 0.392, "value": { "x": 1.104, "y": -0.331, "z": 0.606 } }, { "time": 0.432, "value": { "x": 0.987, "y": -0.474, "z": 0.413 } }, { "time": 0.477, "value": { "x": 0.852, "y": -0.638, "z": 0.193 } }, { "time": 0.541, "value": { "x": 0.751, "y": -0.761, "z": 0.027 } }, { "time": 0.999, "value": { "x": 0.751, "y": -0.761, "z": 0.027 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0, "value": { "x": 1.36, "y": 0.858, "z": -1.04 } }, { "time": 0.217, "value": { "x": 1.36, "y": 0.858, "z": -1.04 } }, { "time": 0.304, "value": { "x": 0.885, "y": 0.74, "z": -0.446 } }, { "time": 0.355, "value": { "x": 0.36, "y": 0.61, "z": 0.21 } }, { "time": 0.392, "value": { "x": 0.657, "y": 0.462, "z": 0.062 } }, { "time": 0.432, "value": { "x": 0.63, "y": 0.287, "z": 0.055 } }, { "time": 0.477, "value": { "x": 0.599, "y": 0.087, "z": 0.046 } }, { "time": 0.541, "value": { "x": 0.576, "y": -0.064, "z": 0.04 } }, { "time": 0.999, "value": { "x": 0.576, "y": -0.064, "z": 0.04 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0, "value": { "x": -0.34, "y": -1.389, "z": -0.14 } }, { "time": 0.217, "value": { "x": -0.34, "y": -1.389, "z": -0.14 } }, { "time": 0.304, "value": { "x": -0.34, "y": -1.389, "z": -0.14 } }, { "time": 0.355, "value": { "x": -0.34, "y": -1.389, "z": -0.14 } }, { "time": 0.392, "value": { "x": -0.34, "y": -1.389, "z": -0.14 } }, { "time": 0.432, "value": { "x": -0.517, "y": -0.779, "z": 0.101 } }, { "time": 0.477, "value": { "x": -0.719, "y": -0.082, "z": 0.376 } }, { "time": 0.541, "value": { "x": -0.871, "y": 0.443, "z": 0.583 } }, { "time": 0.999, "value": { "x": -0.871, "y": 0.443, "z": 0.583 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0, "value": { "x": -2.44, "y": 0.26, "z": -0.445 } }, { "time": 0.217, "value": { "x": -3.09, "y": 0.61, "z": -1.14 } }, { "time": 0.304, "value": { "x": -2.79, "y": 0.51, "z": -2.19 } }, { "time": 0.355, "value": { "x": -2.59, "y": 0.61, "z": -2.79 } }, { "time": 0.392, "value": { "x": -2.639, "y": -0.34, "z": -2.39 } }, { "time": 0.432, "value": { "x": -1.74, "y": -1.04, "z": -1.589 } }, { "time": 0.477, "value": { "x": -0.573, "y": -1.512, "z": -0.673 } }, { "time": 0.541, "value": { "x": 0.305, "y": -1.868, "z": 0.017 } }, { "time": 0.999, "value": { "x": 0.305, "y": -1.868, "z": 0.017 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0, "value": { "x": 0.26, "y": 1.51, "z": -0.34 } }, { "time": 0.217, "value": { "x": 0.26, "y": 1.51, "z": -0.34 } }, { "time": 0.304, "value": { "x": 0.26, "y": 1.51, "z": -0.34 } }, { "time": 0.355, "value": { "x": 0.26, "y": 1.51, "z": -0.34 } }, { "time": 0.392, "value": { "x": 0.26, "y": 1.411, "z": -0.736 } }, { "time": 0.432, "value": { "x": 0.26, "y": 0.81, "z": -0.574 } }, { "time": 0.477, "value": { "x": 0.26, "y": 1.227, "z": -0.388 } }, { "time": 0.541, "value": { "x": 0.26, "y": 1.54, "z": -0.249 } }, { "time": 0.999, "value": { "x": 0.26, "y": 1.54, "z": -0.249 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0, "value": { "x": -0.84, "y": 0.06, "z": 0 } }, { "time": 0.217, "value": { "x": -0.59, "y": 0.06, "z": 0.26 } }, { "time": 0.304, "value": { "x": -0.59, "y": 0.06, "z": 0.16 } }, { "time": 0.355, "value": { "x": -0.39, "y": 0.06, "z": 0.259 } }, { "time": 0.392, "value": { "x": -0.489, "y": 0.06, "z": 0.359 } }, { "time": 0.432, "value": { "x": -0.342, "y": 0.158, "z": 0.179 } }, { "time": 0.477, "value": { "x": -0.174, "y": 0.27, "z": -0.026 } }, { "time": 0.541, "value": { "x": -0.048, "y": 0.355, "z": -0.18 } }, { "time": 0.999, "value": { "x": -0.048, "y": 0.355, "z": -0.18 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0, "value": { "x": -0.34, "y": 0.11, "z": 0 } }, { "time": 0.217, "value": { "x": -0.09, "y": 0.01, "z": 0 } }, { "time": 0.304, "value": { "x": 0.06, "y": -0.14, "z": 0.029 } }, { "time": 0.355, "value": { "x": -0.04, "y": -0.04, "z": 0.36 } }, { "time": 0.392, "value": { "x": 0.01, "y": -0.44, "z": 0.063 } }, { "time": 0.432, "value": { "x": 1.01, "y": -0.44, "z": 0.71 } }, { "time": 0.477, "value": { "x": 0.56, "y": -0.84, "z": 0.61 } }, { "time": 0.541, "value": { "x": 0.71, "y": -0.39, "z": -0.24 } }, { "time": 0.999, "value": { "x": 0.708, "y": -0.39, "z": -0.239 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0, "value": { "x": 0.86, "y": 0.3, "z": 0 } }, { "time": 0.217, "value": { "x": 0.86, "y": 0.3, "z": 0 } }, { "time": 0.304, "value": { "x": 0.86, "y": 0.3, "z": 0 } }, { "time": 0.355, "value": { "x": 0.86, "y": 0.3, "z": 0 } }, { "time": 0.392, "value": { "x": 0.81, "y": 0.3, "z": 0 } }, { "time": 0.432, "value": { "x": 0.242, "y": 0.303, "z": 0.604 } }, { "time": 0.477, "value": { "x": -0.407, "y": 0.307, "z": 1.293 } }, { "time": 0.541, "value": { "x": -0.895, "y": 0.31, "z": 1.813 } }, { "time": 0.999, "value": { "x": -0.896, "y": 0.31, "z": 1.813 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0, "value": { "x": -1.09, "y": 1.71, "z": 0.308 } }, { "time": 0.217, "value": { "x": -1.09, "y": 1.71, "z": 0.308 } }, { "time": 0.304, "value": { "x": -1.09, "y": 1.71, "z": 0.308 } }, { "time": 0.355, "value": { "x": -1.09, "y": 1.71, "z": 0.308 } }, { "time": 0.392, "value": { "x": -1.09, "y": 1.71, "z": 0.308 } }, { "time": 0.432, "value": { "x": -0.747, "y": 1.106, "z": 0.211 } }, { "time": 0.477, "value": { "x": -0.356, "y": 0.417, "z": 0.1 } }, { "time": 0.541, "value": { "x": -0.061, "y": -0.103, "z": 0.016 } }, { "time": 0.999, "value": { "x": -0.061, "y": -0.103, "z": 0.016 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0, "value": { "x": -0.49, "y": -1.19, "z": -0.69 } }, { "time": 0.217, "value": { "x": -0.49, "y": -1.19, "z": -0.69 } }, { "time": 0.304, "value": { "x": -0.49, "y": -1.19, "z": -0.69 } }, { "time": 0.355, "value": { "x": -0.49, "y": -1.19, "z": -0.69 } }, { "time": 0.392, "value": { "x": -0.49, "y": -1.19, "z": -0.69 } }, { "time": 0.432, "value": { "x": -0.376, "y": -0.619, "z": -0.625 } }, { "time": 0.477, "value": { "x": -0.245, "y": 0.033, "z": -0.55 } }, { "time": 0.541, "value": { "x": -0.147, "y": 0.524, "z": -0.494 } }, { "time": 0.999, "value": { "x": -0.147, "y": 0.524, "z": -0.494 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.217, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.304, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.355, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.392, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.432, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.477, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.541, "value": { "x": -0.14, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.14, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0, "value": { "x": 0.611, "y": 0.309, "z": 0.059 } }, { "time": 0.217, "value": { "x": 0.023, "y": 0.268, "z": -0.297 } }, { "time": 0.304, "value": { "x": -0.102, "y": 0.259, "z": -0.373 } }, { "time": 0.355, "value": { "x": -0.241, "y": 0.249, "z": -0.457 } }, { "time": 0.392, "value": { "x": -0.241, "y": 0.249, "z": -0.457 } }, { "time": 0.432, "value": { "x": -0.415, "y": 0.237, "z": -0.563 } }, { "time": 0.477, "value": { "x": -0.614, "y": 0.222, "z": -0.683 } }, { "time": 0.541, "value": { "x": -0.764, "y": 0.212, "z": -0.774 } }, { "time": 0.999, "value": { "x": -0.764, "y": 0.212, "z": -0.774 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0, "value": 0.648 }, { "time": 0.217, "value": 0.942 }, { "time": 0.304, "value": 1.005 }, { "time": 0.355, "value": 1.074 }, { "time": 0.392, "value": 1.074 }, { "time": 0.432, "value": 1.162 }, { "time": 0.477, "value": 1.262 }, { "time": 0.541, "value": 1.337 }, { "time": 0.999, "value": 1.337 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0, "value": { "x": 0.51, "y": 0, "z": 0.16 } }, { "time": 0.217, "value": { "x": 0.112, "y": 0, "z": 0.055 } }, { "time": 0.304, "value": { "x": 0.027, "y": 0, "z": 0.033 } }, { "time": 0.355, "value": { "x": -0.067, "y": 0, "z": 0.008 } }, { "time": 0.392, "value": { "x": -0.067, "y": 0, "z": 0.008 } }, { "time": 0.432, "value": { "x": -0.185, "y": 0, "z": -0.023 } }, { "time": 0.477, "value": { "x": -0.321, "y": 0, "z": -0.059 } }, { "time": 0.541, "value": { "x": -0.423, "y": 0, "z": -0.085 } }, { "time": 0.999, "value": { "x": -0.423, "y": 0, "z": -0.085 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0, "value": { "x": -0.241, "y": 0.457, "z": 1.41 } }, { "time": 0.217, "value": { "x": 0.011, "y": 0.207, "z": 1.159 } }, { "time": 0.304, "value": { "x": 0.065, "y": 0.153, "z": 1.105 } }, { "time": 0.355, "value": { "x": 0.125, "y": 0.094, "z": 1.045 } }, { "time": 0.392, "value": { "x": 0.125, "y": 0.094, "z": 1.045 } }, { "time": 0.432, "value": { "x": 0.2, "y": 0.02, "z": 0.97 } }, { "time": 0.477, "value": { "x": 0.285, "y": -0.065, "z": 0.885 } }, { "time": 0.541, "value": { "x": 0.349, "y": -0.129, "z": 0.821 } }, { "time": 0.999, "value": { "x": 0.349, "y": -0.129, "z": 0.821 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0, "value": 2.498 }, { "time": 0.217, "value": 1.849 }, { "time": 0.304, "value": 1.71 }, { "time": 0.355, "value": 1.557 }, { "time": 0.392, "value": 1.557 }, { "time": 0.432, "value": 1.364 }, { "time": 0.477, "value": 1.144 }, { "time": 0.541, "value": 0.978 }, { "time": 0.999, "value": 0.978 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0, "value": { "x": 0.51, "y": 0, "z": 0 } }, { "time": 0.217, "value": { "x": 0.384, "y": 0, "z": 0 } }, { "time": 0.304, "value": { "x": 0.357, "y": 0, "z": 0 } }, { "time": 0.355, "value": { "x": 0.328, "y": 0, "z": 0 } }, { "time": 0.392, "value": { "x": 0.328, "y": 0, "z": 0 } }, { "time": 0.432, "value": { "x": 0.291, "y": 0, "z": 0 } }, { "time": 0.477, "value": { "x": 0.248, "y": 0, "z": 0 } }, { "time": 0.541, "value": { "x": 0.216, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.216, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.217, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.304, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.355, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.392, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.432, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.477, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.541, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.999, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.217, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.304, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.355, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.392, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.432, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.477, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.541, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},
    SIDE_SLASH_2:{
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0.001, "value": { "x": 0.76, "y": 0.36, "z": 0.11 } }, { "time": 0.151, "value": { "x": 0.709, "y": 0.31, "z": -0.39 } }, { "time": 0.266, "value": { "x": 0.366, "y": 0.276, "z": -0.397 } }, { "time": 0.351, "value": { "x": 0.233, "y": 0.26, "z": -0.4 } }, { "time": 0.402, "value": { "x": 0.152, "y": 0.182, "z": -0.415 } }, { "time": 0.448, "value": { "x": 0.029, "y": 0.015, "z": -0.448 } }, { "time": 0.533, "value": { "x": -0.13, "y": -0.2, "z": -0.49 } }, { "time": 0.999, "value": { "x": -0.13, "y": -0.2, "z": -0.49 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0.001, "value": { "x": 0.56, "y": 0.76, "z": -0.19 } }, { "time": 0.151, "value": { "x": 0.55, "y": 0.549, "z": -0.29 } }, { "time": 0.266, "value": { "x": 0.351, "y": 0.282, "z": -0.324 } }, { "time": 0.351, "value": { "x": 0.274, "y": 0.181, "z": -0.337 } }, { "time": 0.402, "value": { "x": 0.263, "y": 0.206, "z": -0.323 } }, { "time": 0.448, "value": { "x": 0.271, "y": -0.033, "z": -0.287 } }, { "time": 0.533, "value": { "x": 0.28, "y": -0.341, "z": -0.24 } }, { "time": 0.999, "value": { "x": 0.28, "y": -0.341, "z": -0.24 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": -0.02, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": -0.048, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": -0.059, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": -0.111, "y": 0.002, "z": 0.002 } }, { "time": 0.448, "value": { "x": -0.22, "y": 0.005, "z": 0.005 } }, { "time": 0.533, "value": { "x": -0.36, "y": 0.01, "z": 0.01 } }, { "time": 0.999, "value": { "x": -0.36, "y": 0.01, "z": 0.01 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": -0.84, "y": 0.01, "z": 0.21 } }, { "time": 0.151, "value": { "x": -2.09, "y": 0.46, "z": -0.29 } }, { "time": 0.266, "value": { "x": -1.74, "y": 0.21, "z": -0.29 } }, { "time": 0.351, "value": { "x": -1.74, "y": 0.71, "z": -0.79 } }, { "time": 0.402, "value": { "x": -1.243, "y": 0.71, "z": -1.389 } }, { "time": 0.448, "value": { "x": -1.591, "y": 0.61, "z": -1.302 } }, { "time": 0.533, "value": { "x": -2.04, "y": 0.11, "z": -1.19 } }, { "time": 0.999, "value": { "x": -2.04, "y": 0.11, "z": -1.19 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": -0.39, "z": 0 } }, { "time": 0.151, "value": { "x": 0.399, "y": -1.04, "z": 0.199 } }, { "time": 0.266, "value": { "x": -0.109, "y": -1.349, "z": -0.343 } }, { "time": 0.351, "value": { "x": -0.299, "y": -1.49, "z": -0.544 } }, { "time": 0.402, "value": { "x": -0.179, "y": -1.74, "z": -0.332 } }, { "time": 0.448, "value": { "x": 0.166, "y": -1.806, "z": 0.145 } }, { "time": 0.533, "value": { "x": 0.61, "y": -1.89, "z": 0.76 } }, { "time": 0.999, "value": { "x": 0.61, "y": -1.89, "z": 0.76 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0.91, "y": -0.04, "z": -0.14 } }, { "time": 0.266, "value": { "x": 0.944, "y": 0.11, "z": -0.044 } }, { "time": 0.351, "value": { "x": 0.955, "y": -0.131, "z": -0.007 } }, { "time": 0.402, "value": { "x": 0.361, "y": 0.011, "z": 0.002 } }, { "time": 0.448, "value": { "x": 0.426, "y": 0.076, "z": 0.005 } }, { "time": 0.533, "value": { "x": 0.51, "y": 0.16, "z": 0.01 } }, { "time": 0.999, "value": { "x": 0.51, "y": 0.16, "z": 0.01 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": -0.19, "y": -0.27, "z": -0.07 } }, { "time": 0.151, "value": { "x": 0.61, "y": -0.16, "z": -0.029 } }, { "time": 0.266, "value": { "x": 1.213, "y": 0.06, "z": -0.09 } }, { "time": 0.351, "value": { "x": 2.16, "y": -0.04, "z": 0.054 } }, { "time": 0.402, "value": { "x": 2.057, "y": 0.023, "z": 0.004 } }, { "time": 0.448, "value": { "x": 1.731, "y": -0.001, "z": 0 } }, { "time": 0.533, "value": { "x": 1.31, "y": -0.032, "z": -0.006 } }, { "time": 0.999, "value": { "x": 1.31, "y": -0.032, "z": -0.006 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": 0.91, "y": 0.01, "z": 0.66 } }, { "time": 0.151, "value": { "x": 0.91, "y": -0.09, "z": 0.65 } }, { "time": 0.266, "value": { "x": 0.903, "y": -0.076, "z": 0.636 } }, { "time": 0.351, "value": { "x": 0.9, "y": -0.07, "z": 0.63 } }, { "time": 0.402, "value": { "x": 0.893, "y": -0.048, "z": 0.605 } }, { "time": 0.448, "value": { "x": 0.879, "y": -0.001, "z": 0.55 } }, { "time": 0.533, "value": { "x": 0.86, "y": 0.06, "z": 0.48 } }, { "time": 0.999, "value": { "x": 0.86, "y": 0.06, "z": 0.48 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": -0.69, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": -0.67, "y": -0.01, "z": 0.01 } }, { "time": 0.266, "value": { "x": -0.636, "y": -0.024, "z": 0.031 } }, { "time": 0.351, "value": { "x": -0.621, "y": -0.03, "z": 0.04 } }, { "time": 0.402, "value": { "x": -0.554, "y": -0.055, "z": 0.082 } }, { "time": 0.448, "value": { "x": -0.412, "y": -0.11, "z": 0.173 } }, { "time": 0.533, "value": { "x": -0.23, "y": -0.18, "z": 0.29 } }, { "time": 0.999, "value": { "x": -0.23, "y": -0.18, "z": 0.29 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 1.16, "z": 0 } }, { "time": 0.151, "value": { "x": 0, "y": 1.17, "z": 0.01 } }, { "time": 0.266, "value": { "x": -0.007, "y": 1.191, "z": 0.024 } }, { "time": 0.351, "value": { "x": -0.01, "y": 1.2, "z": 0.03 } }, { "time": 0.402, "value": { "x": -0.022, "y": 1.247, "z": 0.05 } }, { "time": 0.448, "value": { "x": -0.047, "y": 1.349, "z": 0.094 } }, { "time": 0.533, "value": { "x": -0.08, "y": 1.48, "z": 0.15 } }, { "time": 0.999, "value": { "x": -0.08, "y": 1.48, "z": 0.15 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": -0.007, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": -0.021, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.04, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": 0.71, "y": 0, "z": 0.36 } }, { "time": 0.151, "value": { "x": 0.63, "y": 0.01, "z": 0.33 } }, { "time": 0.266, "value": { "x": 0.52, "y": 0.024, "z": 0.282 } }, { "time": 0.351, "value": { "x": 0.471, "y": 0.03, "z": 0.261 } }, { "time": 0.402, "value": { "x": 0.229, "y": 0.057, "z": 0.16 } }, { "time": 0.448, "value": { "x": -0.286, "y": 0.115, "z": -0.054 } }, { "time": 0.533, "value": { "x": -0.951, "y": 0.19, "z": -0.33 } }, { "time": 0.999, "value": { "x": -0.951, "y": 0.19, "z": -0.33 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 0.4 }, { "time": 0.151, "value": 0.47 }, { "time": 0.266, "value": 0.553 }, { "time": 0.351, "value": 0.589 }, { "time": 0.402, "value": 0.776 }, { "time": 0.448, "value": 1.176 }, { "time": 0.533, "value": 1.691 }, { "time": 0.999, "value": 1.691 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0.03, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": 0.078, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": 0.099, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": 0.202, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": 0.42, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": 0.7, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.7, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": -0.3, "y": 0, "z": 0.46 } }, { "time": 0.151, "value": { "x": -0.27, "y": -0.02, "z": 0.45 } }, { "time": 0.266, "value": { "x": -0.229, "y": -0.048, "z": 0.443 } }, { "time": 0.351, "value": { "x": -0.211, "y": -0.06, "z": 0.44 } }, { "time": 0.402, "value": { "x": -0.13, "y": -0.119, "z": 0.42 } }, { "time": 0.448, "value": { "x": 0.04, "y": -0.246, "z": 0.376 } }, { "time": 0.533, "value": { "x": 0.26, "y": -0.41, "z": 0.32 } }, { "time": 0.999, "value": { "x": 0.26, "y": -0.41, "z": 0.32 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 1.9 }, { "time": 0.151, "value": 1.86 }, { "time": 0.266, "value": 1.798 }, { "time": 0.351, "value": 1.771 }, { "time": 0.402, "value": 1.643 }, { "time": 0.448, "value": 1.371 }, { "time": 0.533, "value": 1.02 }, { "time": 0.999, "value": 1.02 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.61, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.151, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.266, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.351, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.402, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.448, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.533, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.999, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0.001, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.151, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.266, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.351, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.402, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.448, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.533, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},
    SIDE_SLASH_3:{
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0.001, "value": { "x": -0.13, "y": -0.2, "z": -0.49 } }, { "time": 0.201, "value": { "x": -0.13, "y": -0.2, "z": -0.19 } }, { "time": 0.417, "value": { "x": -0.04, "y": 0.159, "z": -0.041 } }, { "time": 0.498, "value": { "x": -0.041, "y": 0.157, "z": -0.041 } }, { "time": 0.511, "value": { "x": -0.041, "y": 0.157, "z": -0.041 } }, { "time": 0.568, "value": { "x": 0.51, "y": 0.51, "z": 0.16 } }, { "time": 0.999, "value": { "x": 0.51, "y": 0.51, "z": 0.16 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0.001, "value": { "x": 0.28, "y": -0.34, "z": -0.24 } }, { "time": 0.201, "value": { "x": 0.28, "y": -0.34, "z": -0.19 } }, { "time": 0.417, "value": { "x": -0.238, "y": -0.141, "z": 0.059 } }, { "time": 0.498, "value": { "x": -0.236, "y": -0.142, "z": 0.058 } }, { "time": 0.511, "value": { "x": -0.236, "y": -0.142, "z": 0.058 } }, { "time": 0.568, "value": { "x": 0.36, "y": 0.01, "z": 0.01 } }, { "time": 0.999, "value": { "x": 0.36, "y": 0.01, "z": 0.01 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0.001, "value": { "x": -0.36, "y": 0.01, "z": 0.01 } }, { "time": 0.201, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.417, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.498, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.511, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.568, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } }, { "time": 0.999, "value": { "x": -0.36, "y": 0.01, "z": 0.11 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": -2.04, "y": 0.11, "z": -1.19 } }, { "time": 0.201, "value": { "x": -2.237, "y": 0.159, "z": -0.389 } }, { "time": 0.417, "value": { "x": -2.689, "y": 0.16, "z": 0.108 } }, { "time": 0.498, "value": { "x": -2.74, "y": 0.16, "z": 0.106 } }, { "time": 0.511, "value": { "x": -2.687, "y": 0.16, "z": 0.106 } }, { "time": 0.568, "value": { "x": -1.44, "y": 0.15, "z": 0.111 } }, { "time": 0.999, "value": { "x": -1.44, "y": 0.15, "z": 0.111 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": 0.61, "y": -1.89, "z": 0.76 } }, { "time": 0.201, "value": { "x": 0.658, "y": -1.388, "z": 0.609 } }, { "time": 0.417, "value": { "x": 0.65, "y": -1.24, "z": 0.6 } }, { "time": 0.498, "value": { "x": 0.65, "y": -1.241, "z": 0.6 } }, { "time": 0.511, "value": { "x": 0.65, "y": -1.241, "z": 0.6 } }, { "time": 0.568, "value": { "x": 0.64, "y": -1.37, "z": 0.6 } }, { "time": 0.999, "value": { "x": 0.64, "y": -1.37, "z": 0.6 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": 0.51, "y": 0.16, "z": 0.01 } }, { "time": 0.201, "value": { "x": 0.509, "y": -0.04, "z": 0.01 } }, { "time": 0.417, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.498, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.511, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.568, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } }, { "time": 0.999, "value": { "x": 0.5, "y": -0.04, "z": 0.01 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": 1.31, "y": -0.03, "z": -0.01 } }, { "time": 0.201, "value": { "x": 1.308, "y": -0.03, "z": -0.01 } }, { "time": 0.417, "value": { "x": -1.386, "y": 1.256, "z": 0.01 } }, { "time": 0.498, "value": { "x": -1.94, "y": 1.06, "z": 0.01 } }, { "time": 0.511, "value": { "x": -1.374, "y": 1.25, "z": 0.01 } }, { "time": 0.568, "value": { "x": 0.76, "y": 0.01, "z": -0.015 } }, { "time": 0.999, "value": { "x": 0.76, "y": 0.01, "z": -0.015 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0.001, "value": { "x": 0.86, "y": 0.06, "z": 0.48 } }, { "time": 0.201, "value": { "x": 1.009, "y": 0.06, "z": 1.758 } }, { "time": 0.417, "value": { "x": -0.438, "y": -1.724, "z": 1.9 } }, { "time": 0.498, "value": { "x": -0.59, "y": -1.716, "z": 1.899 } }, { "time": 0.511, "value": { "x": -0.431, "y": -1.716, "z": 1.899 } }, { "time": 0.568, "value": { "x": 0.71, "y": -1.731, "z": 1.901 } }, { "time": 0.999, "value": { "x": 0.71, "y": -1.731, "z": 1.901 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0.001, "value": { "x": -0.23, "y": -0.18, "z": 0.29 } }, { "time": 0.201, "value": { "x": -0.231, "y": -0.18, "z": 0.29 } }, { "time": 0.417, "value": { "x": -0.389, "y": 0.259, "z": -0.139 } }, { "time": 0.498, "value": { "x": -0.389, "y": 0.257, "z": -0.137 } }, { "time": 0.511, "value": { "x": -0.389, "y": 0.257, "z": -0.137 } }, { "time": 0.568, "value": { "x": -0.39, "y": 0.26, "z": -0.14 } }, { "time": 0.999, "value": { "x": -0.39, "y": 0.26, "z": -0.14 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0.001, "value": { "x": -0.08, "y": 1.48, "z": 0.15 } }, { "time": 0.201, "value": { "x": -0.08, "y": 1.478, "z": 0.15 } }, { "time": 0.417, "value": { "x": -0.239, "y": 1.301, "z": 0.15 } }, { "time": 0.498, "value": { "x": -0.239, "y": 1.301, "z": 0.15 } }, { "time": 0.511, "value": { "x": -0.239, "y": 1.301, "z": 0.15 } }, { "time": 0.568, "value": { "x": -0.24, "y": 1.3, "z": 0.15 } }, { "time": 0.999, "value": { "x": -0.24, "y": 1.3, "z": 0.15 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0.001, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": -0.04, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.04, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": -0.95, "y": 0.19, "z": -0.33 } }, { "time": 0.201, "value": { "x": -0.09, "y": 0.19, "z": -0.33 } }, { "time": 0.417, "value": { "x": 0.608, "y": 0.19, "z": -0.33 } }, { "time": 0.498, "value": { "x": 0.605, "y": 0.19, "z": -0.33 } }, { "time": 0.511, "value": { "x": 0.605, "y": 0.19, "z": -0.33 } }, { "time": 0.568, "value": { "x": 0.611, "y": 0.19, "z": -0.33 } }, { "time": 0.999, "value": { "x": 0.611, "y": 0.19, "z": -0.33 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 1.69 }, { "time": 0.201, "value": 1.35 }, { "time": 0.417, "value": 0.553 }, { "time": 0.498, "value": 0.556 }, { "time": 0.511, "value": 0.556 }, { "time": 0.568, "value": 0.549 }, { "time": 0.999, "value": 0.549 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0.7, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": -0.24, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": 1.056, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": 1.05, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": 1.05, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": 1.06, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 1.06, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0.001, "value": { "x": 0.26, "y": -0.41, "z": 0.32 } }, { "time": 0.201, "value": { "x": -0.24, "y": -0.409, "z": 0.32 } }, { "time": 0.417, "value": { "x": -0.938, "y": -0.41, "z": 0.32 } }, { "time": 0.498, "value": { "x": -0.935, "y": -0.41, "z": 0.32 } }, { "time": 0.511, "value": { "x": -0.935, "y": -0.41, "z": 0.32 } }, { "time": 0.568, "value": { "x": -0.941, "y": -0.41, "z": 0.32 } }, { "time": 0.999, "value": { "x": -0.941, "y": -0.41, "z": 0.32 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0.001, "value": 1.02 }, { "time": 0.201, "value": 1.019 }, { "time": 0.417, "value": 1.598 }, { "time": 0.498, "value": 1.596 }, { "time": 0.511, "value": 1.596 }, { "time": 0.568, "value": 1.6 }, { "time": 0.999, "value": 1.6 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0.001, "value": { "x": 0.61, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": 0.01, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": 0.658, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": 0.655, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": 0.655, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": 0.66, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": 0.66, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0.001, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.201, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.417, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.498, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.511, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.568, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.999, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0.001, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.201, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.417, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.498, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.511, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.568, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.999, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},

    MELEE_RECOVERY: createStaticClip('RECOVERY', RAW_IDLE),
    KNOCKDOWN: createStaticClip('KNOCKDOWN', RAW_KNOCKDOWN),
    WAKEUP: createTransitionClip('WAKEUP', RAW_KNOCKDOWN, RAW_WAKEUP, 1.0)
};

// Legacy exports
export { 
    RAW_IDLE as IDLE_POSE, 
    RAW_DASH_GUN as DASH_POSE_GUN, 
    RAW_DASH_SABER as DASH_POSE_SABER,
    RAW_ASCEND as ASCEND_POSE,
    RAW_MELEE_STARTUP as MELEE_STARTUP_POSE
};
