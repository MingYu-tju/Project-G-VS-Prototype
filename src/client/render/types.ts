export interface RotationVector {
    x: number;
    y: number;
    z: number;
}

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

export type BonePath = string;

export interface Keyframe {
    time: number; 
    value: RotationVector | number; 
    easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface AnimationTrack {
    bone: BonePath;
    keyframes: Keyframe[];
}

export interface AnimationClip {
    name: string;
    duration: number; 
    loop: boolean;
    tracks: AnimationTrack[];
    basePose?: MechPose; 
}

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

export const DEFAULT_MECH_POSE: MechPose = {
    TORSO: { x: 0, y: 0, z: 0 },
    CHEST: { x: 0, y: 0, z: 0 },
    HEAD: { x: -0.4, y: 0, z: 0 },
    LEFT_ARM: {
        SHOULDER: { x: 0.11, y: -0.3, z: -0.24 },
        ELBOW: { x: -0.29, y: 0.3, z: 0.01 },
        FOREARM: { x: -0.39, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    RIGHT_ARM: {
        SHOULDER: { x: 0.01, y: 0.06, z: 0.36 },
        ELBOW: { x: -0.04, y: -0.29, z: 0.01 },
        FOREARM: { x: -0.39, y: 0, z: 0 },
        WRIST: { x: 0, y: 0, z: 0 }
    },
    LEFT_LEG: {
        THIGH: { x: -0.1, y: 0, z: -0.05 },
        KNEE: 0.2,
        ANKLE: { x: -0.1, y: 0, z: 0 }
    },
    RIGHT_LEG: {
        THIGH: { x: -0.1, y: 0, z: 0.05 },
        KNEE: 0.3,
        ANKLE: { x: -0.2, y: 0, z: 0 }
    },
    SHIELD: {
        POSITION: { x: 0, y: -0.5, z: 0.1 },
        ROTATION: { x: -0.2, y: 0, z: 0 }
    }
};

