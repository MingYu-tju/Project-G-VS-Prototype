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


// --- RAW POSE DATA ---

const RAW_IDLE: MechPose = {
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

// Restored Dash Pose with heavy forward lean and leg spread
const RAW_DASH_GUN: MechPose = {
    ...DEFAULT_MECH_POSE,
    TORSO: { x: 0.65, y: 0, z: 0 }, // Forward Tilt
    RIGHT_ARM: {
        SHOULDER: { x: -0.5, y: -0.3, z: 0.4 },
        ELBOW: { x: -1, y: 0.0, z: 0.0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    // Drag Left Leg
    LEFT_LEG: {
        THIGH: { x: 1.1, y: -0.5, z: -0.2 },
        KNEE: 0.3,
        ANKLE: { x: 0.25, y: 0, z: 0 }
    },
    // Lift Right Leg High
    RIGHT_LEG: {
        THIGH: { x: -1.0, y: 0, z: 0 },
        KNEE: 2.6,
        ANKLE: { x: 0.8, y: 0, z: 0 }
    }
};

const RAW_DASH_SABER: MechPose = {
    ...DEFAULT_MECH_POSE,
    TORSO: { x: 0.65, y: 0, z: 0 }, // Forward Tilt
    RIGHT_ARM: {
        SHOULDER: { x: -0.5, y: -0.3, z: 0.4 },
        ELBOW: { x: -1, y: 0.0, z: 0.0 },
        FOREARM: { x: 0, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.6, z: -0.1 },
        ROTATION: { x: -0.3, y: -1, z: -1.2 }
    },
    // Same Legs as Dash Gun
    LEFT_LEG: {
        THIGH: { x: 1.1, y: -0.5, z: -0.2 },
        KNEE: 0.3,
        ANKLE: { x: 0.25, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -1.0, y: 0, z: 0 },
        KNEE: 2.6,
        ANKLE: { x: 0.8, y: 0, z: 0 }
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

const RAW_MELEE_SLASH: MechPose = {
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

const RAW_MELEE_SLASH_2: MechPose = {
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

// --- EXPORTED CLIPS ---

export const ANIMATION_CLIPS = {
    IDLE: createStaticClip('IDLE', RAW_IDLE),
    NEUTRAL: createStaticClip('NEUTRAL', DEFAULT_MECH_POSE),
    DASH_GUN: createStaticClip('DASH_GUN', RAW_DASH_GUN),
    DASH_SABER: createStaticClip('DASH_SABER', RAW_DASH_SABER),
    MELEE_STARTUP: createStaticClip('MELEE_STARTUP', RAW_MELEE_STARTUP),
    MELEE_SLASH_1: {
  "name": "CUSTOM_ANIM",
  "duration": 1.0,
  "loop": false,
  "tracks": [
    { "bone": "TORSO", "keyframes": [ { "time": 0.0, "value": { "x": -0.039, "y": -0.439, "z": -0.339 } }, { "time": 0.2, "value": { "x": 0.051, "y": -0.349, "z": -0.289 } }, { "time": 0.4, "value": { "x": 0.182, "y": -0.218, "z": -0.215 } }, { "time": 0.6, "value": { "x": 0.394, "y": -0.006, "z": -0.096 } }, { "time": 0.8, "value": { "x": 0.581, "y": 0.181, "z": 0.009 } }, { "time": 1.0, "value": { "x": 0.76, "y": 0.36, "z": 0.11 } } ] },
    { "bone": "CHEST", "keyframes": [ { "time": 0.0, "value": { "x": -0.139, "y": -0.088, "z": 0 } }, { "time": 0.2, "value": { "x": -0.06, "y": 0.007, "z": -0.022 } }, { "time": 0.4, "value": { "x": 0.054, "y": 0.146, "z": -0.053 } }, { "time": 0.6, "value": { "x": 0.239, "y": 0.371, "z": -0.103 } }, { "time": 0.8, "value": { "x": 0.404, "y": 0.57, "z": -0.148 } }, { "time": 1.0, "value": { "x": 0.56, "y": 0.76, "z": -0.19 } } ] },
    { "bone": "HEAD", "keyframes": [ { "time": 0.0, "value": { "x": -0.14, "y": 0.659, "z": 0.16 } }, { "time": 0.2, "value": { "x": -0.124, "y": 0.585, "z": 0.142 } }, { "time": 0.4, "value": { "x": -0.101, "y": 0.477, "z": 0.116 } }, { "time": 0.6, "value": { "x": -0.064, "y": 0.302, "z": 0.073 } }, { "time": 0.8, "value": { "x": -0.031, "y": 0.148, "z": 0.036 } }, { "time": 1.0, "value": { "x": 0, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_ARM.SHOULDER", "keyframes": [ { "time": 0.0, "value": { "x": -2.237, "y": 0.26, "z": -0.888 } }, { "time": 0.2, "value": { "x": -2.08, "y": 0.231, "z": -0.764 } }, { "time": 0.4, "value": { "x": -1.852, "y": 0.191, "z": -0.585 } }, { "time": 0.6, "value": { "x": -1.481, "y": 0.125, "z": -0.294 } }, { "time": 0.8, "value": { "x": -1.153, "y": 0.066, "z": -0.036 } }, { "time": 1.0, "value": { "x": -0.84, "y": 0.01, "z": 0.21 } } ] },
    { "bone": "LEFT_ARM.ELBOW", "keyframes": [ { "time": 0.0, "value": { "x": -0.14, "y": 0.209, "z": -0.19 } }, { "time": 0.2, "value": { "x": -0.124, "y": 0.141, "z": -0.168 } }, { "time": 0.4, "value": { "x": -0.101, "y": 0.044, "z": -0.137 } }, { "time": 0.6, "value": { "x": -0.064, "y": -0.115, "z": -0.087 } }, { "time": 0.8, "value": { "x": -0.031, "y": -0.256, "z": -0.042 } }, { "time": 1.0, "value": { "x": 0, "y": -0.39, "z": 0 } } ] },
    { "bone": "LEFT_ARM.FOREARM", "keyframes": [ { "time": 0.0, "value": { "x": -0.24, "y": -0.439, "z": -0.04 } }, { "time": 0.2, "value": { "x": -0.251, "y": -0.39, "z": -0.035 } }, { "time": 0.4, "value": { "x": -0.268, "y": -0.318, "z": -0.029 } }, { "time": 0.6, "value": { "x": -0.294, "y": -0.202, "z": -0.018 } }, { "time": 0.8, "value": { "x": -0.318, "y": -0.098, "z": -0.009 } }, { "time": 1.0, "value": { "x": -0.34, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_ARM.WRIST", "keyframes": [ { "time": 0.0, "value": { "x": -0.416, "y": -0.566, "z": -0.233 } }, { "time": 0.2, "value": { "x": -0.216, "y": -0.747, "z": -0.227 } }, { "time": 0.4, "value": { "x": -0.115, "y": -0.722, "z": -0.178 } }, { "time": 0.6, "value": { "x": -0.052, "y": -0.532, "z": -0.111 } }, { "time": 0.8, "value": { "x": -0.087, "y": -0.354, "z": -0.079 } }, { "time": 1.0, "value": { "x": -0.147, "y": -0.299, "z": -0.076 } } ] },
    { "bone": "RIGHT_ARM.SHOULDER", "keyframes": [ { "time": 0.0, "value": { "x": 1.259, "y": 0.16, "z": 0.311 } }, { "time": 0.2, "value": { "x": 1.22, "y": 0.143, "z": 0.35 } }, { "time": 0.4, "value": { "x": 1.163, "y": 0.118, "z": 0.407 } }, { "time": 0.6, "value": { "x": 1.07, "y": 0.079, "z": 0.5 } }, { "time": 0.8, "value": { "x": 0.988, "y": 0.044, "z": 0.582 } }, { "time": 1.0, "value": { "x": 0.91, "y": 0.01, "z": 0.66 } } ] },
    { "bone": "RIGHT_ARM.ELBOW", "keyframes": [ { "time": 0.0, "value": { "x": -0.191, "y": 1.058, "z": 0.01 } }, { "time": 0.2, "value": { "x": -0.247, "y": 0.939, "z": 0.009 } }, { "time": 0.4, "value": { "x": -0.329, "y": 0.766, "z": 0.007 } }, { "time": 0.6, "value": { "x": -0.461, "y": 0.485, "z": 0.005 } }, { "time": 0.8, "value": { "x": -0.578, "y": 0.237, "z": 0.002 } }, { "time": 1.0, "value": { "x": -0.69, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_ARM.FOREARM", "keyframes": [ { "time": 0.0, "value": { "x": -0.489, "y": 0.561, "z": 0.11 } }, { "time": 0.2, "value": { "x": -0.434, "y": 0.629, "z": 0.097 } }, { "time": 0.4, "value": { "x": -0.354, "y": 0.726, "z": 0.079 } }, { "time": 0.6, "value": { "x": -0.224, "y": 0.885, "z": 0.05 } }, { "time": 0.8, "value": { "x": -0.11, "y": 1.026, "z": 0.025 } }, { "time": 1.0, "value": { "x": 0, "y": 1.16, "z": 0 } } ] },
    { "bone": "RIGHT_ARM.WRIST", "keyframes": [ { "time": 0.0, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.2, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.4, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.6, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 0.8, "value": { "x": 0, "y": 0, "z": 0 } }, { "time": 1.0, "value": { "x": 0, "y": 0, "z": 0 } } ] },
    { "bone": "LEFT_LEG.THIGH", "keyframes": [ { "time": 0.0, "value": { "x": 0.311, "y": 0.01, "z": -0.089 } }, { "time": 0.2, "value": { "x": 0.356, "y": 0.009, "z": -0.039 } }, { "time": 0.4, "value": { "x": 0.421, "y": 0.007, "z": 0.035 } }, { "time": 0.6, "value": { "x": 0.527, "y": 0.005, "z": 0.154 } }, { "time": 0.8, "value": { "x": 0.621, "y": 0.002, "z": 0.259 } }, { "time": 1.0, "value": { "x": 0.71, "y": 0, "z": 0.36 } } ] },
    { "bone": "LEFT_LEG.KNEE", "keyframes": [ { "time": 0.0, "value": 0.5 }, { "time": 0.2, "value": 0.489 }, { "time": 0.4, "value": 0.472 }, { "time": 0.6, "value": 0.446 }, { "time": 0.8, "value": 0.422 }, { "time": 1.0, "value": 0.4 } ] },
    { "bone": "LEFT_LEG.ANKLE", "keyframes": [ { "time": 0.0, "value": { "x": 0.359, "y": 0, "z": 0 } }, { "time": 0.2, "value": { "x": 0.319, "y": 0, "z": 0 } }, { "time": 0.4, "value": { "x": 0.26, "y": 0, "z": 0 } }, { "time": 0.6, "value": { "x": 0.165, "y": 0, "z": 0 } }, { "time": 0.8, "value": { "x": 0.08, "y": 0, "z": 0 } }, { "time": 1.0, "value": { "x": 0, "y": 0, "z": 0 } } ] },
    { "bone": "RIGHT_LEG.THIGH", "keyframes": [ { "time": 0.0, "value": { "x": -1.538, "y": 0.459, "z": 0.111 } }, { "time": 0.2, "value": { "x": -1.397, "y": 0.407, "z": 0.15 } }, { "time": 0.4, "value": { "x": -1.193, "y": 0.332, "z": 0.207 } }, { "time": 0.6, "value": { "x": -0.863, "y": 0.211, "z": 0.3 } }, { "time": 0.8, "value": { "x": -0.569, "y": 0.103, "z": 0.382 } }, { "time": 1.0, "value": { "x": -0.29, "y": 0, "z": 0.46 } } ] },
    { "bone": "RIGHT_LEG.KNEE", "keyframes": [ { "time": 0.0, "value": 1.7 }, { "time": 0.2, "value": 1.723 }, { "time": 0.4, "value": 1.755 }, { "time": 0.6, "value": 1.808 }, { "time": 0.8, "value": 1.855 }, { "time": 1.0, "value": 1.9 } ] },
    { "bone": "RIGHT_LEG.ANKLE", "keyframes": [ { "time": 0.0, "value": { "x": 0.66, "y": 0, "z": 0 } }, { "time": 0.2, "value": { "x": 0.654, "y": 0, "z": 0 } }, { "time": 0.4, "value": { "x": 0.646, "y": 0, "z": 0 } }, { "time": 0.6, "value": { "x": 0.633, "y": 0, "z": 0 } }, { "time": 0.8, "value": { "x": 0.621, "y": 0, "z": 0 } }, { "time": 1.0, "value": { "x": 0.61, "y": 0, "z": 0 } } ] },
    { "bone": "SHIELD.POSITION", "keyframes": [ { "time": 0.0, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.2, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.4, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.6, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 0.8, "value": { "x": 0, "y": -0.5, "z": 0.1 } }, { "time": 1.0, "value": { "x": 0, "y": -0.5, "z": 0.1 } } ] },
    { "bone": "SHIELD.ROTATION", "keyframes": [ { "time": 0.0, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.2, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.4, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.6, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 0.8, "value": { "x": -0.2, "y": 0, "z": 0 } }, { "time": 1.0, "value": { "x": -0.2, "y": 0, "z": 0 } } ] }
  ]
},
    MELEE_SLASH_2: createTransitionClip('SLASH_2', RAW_MELEE_SLASH, RAW_MELEE_SLASH_2, 1.0),
    MELEE_RECOVERY: createTransitionClip('RECOVERY', RAW_MELEE_SLASH_2, RAW_IDLE, 1.0),
    
};

// Legacy exports
export { 
    RAW_IDLE as IDLE_POSE, 
    RAW_DASH_GUN as DASH_POSE_GUN, 
    RAW_DASH_SABER as DASH_POSE_SABER,
    RAW_MELEE_STARTUP as MELEE_STARTUP_POSE, 
    RAW_MELEE_SLASH as MELEE_SLASH_POSE, 
    RAW_MELEE_SLASH_2 as MELEE_SLASH_2_POSE 
};