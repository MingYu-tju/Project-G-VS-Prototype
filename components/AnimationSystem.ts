import { MathUtils } from 'three';
import { MechPose, AnimationClip, RotationVector, DEFAULT_MECH_POSE, Keyframe } from '../types';

// Optimized deep clone for MechPose to avoid JSON.parse/stringify GC overhead
export const clonePose = (pose: MechPose): MechPose => {
    return {
        TORSO: { ...pose.TORSO },
        CHEST: { ...pose.CHEST },
        HEAD: { ...pose.HEAD },
        LEFT_ARM: {
            SHOULDER: { ...pose.LEFT_ARM.SHOULDER },
            ELBOW: { ...pose.LEFT_ARM.ELBOW },
            FOREARM: { ...pose.LEFT_ARM.FOREARM },
            WRIST: { ...pose.LEFT_ARM.WRIST }
        },
        RIGHT_ARM: {
            SHOULDER: { ...pose.RIGHT_ARM.SHOULDER },
            ELBOW: { ...pose.RIGHT_ARM.ELBOW },
            FOREARM: { ...pose.RIGHT_ARM.FOREARM },
            WRIST: { ...pose.RIGHT_ARM.WRIST }
        },
        LEFT_LEG: {
            THIGH: { ...pose.LEFT_LEG.THIGH },
            KNEE: pose.LEFT_LEG.KNEE,
            ANKLE: { ...pose.LEFT_LEG.ANKLE }
        },
        RIGHT_LEG: {
            THIGH: { ...pose.RIGHT_LEG.THIGH },
            KNEE: pose.RIGHT_LEG.KNEE,
            ANKLE: { ...pose.RIGHT_LEG.ANKLE }
        },
        SHIELD: pose.SHIELD ? {
            POSITION: { ...pose.SHIELD.POSITION },
            ROTATION: { ...pose.SHIELD.ROTATION }
        } : undefined
    };
};

// Helper: Linear Interpolation for RotationVector (Euler)
const lerpVector = (v1: RotationVector, v2: RotationVector, t: number): RotationVector => {
    return {
        x: MathUtils.lerp(v1.x, v2.x, t),
        y: MathUtils.lerp(v1.y, v2.y, t),
        z: MathUtils.lerp(v1.z, v2.z, t),
    };
};

// Helper: Lerp for scalar (knees)
const lerpScalar = (n1: number, n2: number, t: number): number => MathUtils.lerp(n1, n2, t);

// Helper: Get value at a specific time for a set of keyframes
const evaluateKeyframes = (keyframes: Keyframe[], time: number, isVector: boolean): RotationVector | number => {
    if (keyframes.length === 0) return isVector ? { x: 0, y: 0, z: 0 } : 0;
    if (keyframes.length === 1) return keyframes[0].value;

    // Find the keyframe indices surrounding the current time
    let startIndex = 0;
    let endIndex = keyframes.length - 1;

    for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i+1].time) {
            startIndex = i;
            endIndex = i + 1;
            break;
        }
    }
    
    // If time is past the last keyframe
    if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

    const startKf = keyframes[startIndex];
    const endKf = keyframes[endIndex];

    // Calculate local t between these two keyframes
    const duration = endKf.time - startKf.time;
    if (duration <= 0) return startKf.value;

    let t = (time - startKf.time) / duration;

    // Apply Easing (Simple version)
    if (endKf.easing === 'easeIn') t = t * t;
    else if (endKf.easing === 'easeOut') t = t * (2 - t);
    else if (endKf.easing === 'easeInOut') t = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    if (isVector) {
        return lerpVector(startKf.value as RotationVector, endKf.value as RotationVector, t);
    } else {
        return lerpScalar(startKf.value as number, endKf.value as number, t);
    }
};

export class AnimationController {
    currentPose: MechPose;
    
    // Blending State
    private activeClip: AnimationClip | null = null;
    private previousPose: MechPose | null = null; // Snapshot of pose when blend started
    private blendDuration: number = 0;
    private blendTimer: number = 0;
    
    // Playback State
    private currentTime: number = 0;
    private playbackSpeed: number = 1.0;

    constructor() {
        this.currentPose = clonePose(DEFAULT_MECH_POSE);
    }

    play(clip: AnimationClip, blendDuration: number = 0.2, speed: number = 1.0, resetTime: boolean = true) {
        if (this.activeClip === clip) {
            // Update speed on fly
            this.playbackSpeed = speed;
            return; 
        }

        if (blendDuration > 0) {
            // Snapshot current state for blending
            this.previousPose = clonePose(this.currentPose);
            this.blendDuration = blendDuration;
            this.blendTimer = 0;
        } else {
            this.previousPose = null;
            this.blendDuration = 0;
        }

        this.activeClip = clip;
        this.playbackSpeed = speed;
        if (resetTime) this.currentTime = 0;
    }

    update(delta: number) {
        if (!this.activeClip) return;

        // 1. Update Time
        // delta is in seconds usually, or frames if we assume 60fps. 
        // The system usually passes delta in seconds.
        this.currentTime += delta * this.playbackSpeed;
        
        if (this.activeClip.loop) {
            this.currentTime %= 1.0; 
        } else {
            this.currentTime = Math.min(this.currentTime, 1.0);
        }

        // 2. Calculate Pose from Clip
        const targetPose = this.sampleClip(this.activeClip, this.currentTime);

        // 3. Handle Blending
        if (this.previousPose && this.blendTimer < this.blendDuration) {
            this.blendTimer += delta;
            const blendT = Math.min(this.blendTimer / this.blendDuration, 1.0);
            
            // Blend previous -> target
            this.currentPose = this.blendPoses(this.previousPose, targetPose, blendT);
            
            if (blendT >= 1.0) {
                this.previousPose = null; // Blend finished
            }
        } else {
            this.currentPose = targetPose;
        }
    }

    // Extract specific pose at specific time t (0-1)
    sampleClip(clip: AnimationClip, t: number): MechPose {
        const result = clonePose(clip.basePose || DEFAULT_MECH_POSE);
        
        // Apply tracks
        clip.tracks.forEach(track => {
            // Parse path: e.g. "LEFT_ARM.SHOULDER" -> result['LEFT_ARM']['SHOULDER']
            const parts = track.bone.split('.');
            const isVector = typeof track.keyframes[0].value !== 'number';
            const val = evaluateKeyframes(track.keyframes, t, isVector);

            if (parts.length === 1) {
                (result as any)[parts[0]] = val;
            } else if (parts.length === 2) {
                (result as any)[parts[0]][parts[1]] = val;
            }
        });

        return result;
    }

    blendPoses(p1: MechPose, p2: MechPose, t: number): MechPose {
        const res = clonePose(p1);
        
        // Recursively blend (simplified structure assumption based on MechPose)
        res.TORSO = lerpVector(p1.TORSO, p2.TORSO, t);
        res.CHEST = lerpVector(p1.CHEST, p2.CHEST, t);
        res.HEAD = lerpVector(p1.HEAD, p2.HEAD, t);
        
        res.LEFT_ARM.SHOULDER = lerpVector(p1.LEFT_ARM.SHOULDER, p2.LEFT_ARM.SHOULDER, t);
        res.LEFT_ARM.ELBOW = lerpVector(p1.LEFT_ARM.ELBOW, p2.LEFT_ARM.ELBOW, t);
        res.LEFT_ARM.FOREARM = lerpVector(p1.LEFT_ARM.FOREARM, p2.LEFT_ARM.FOREARM, t);
        res.LEFT_ARM.WRIST = lerpVector(p1.LEFT_ARM.WRIST, p2.LEFT_ARM.WRIST, t);

        res.RIGHT_ARM.SHOULDER = lerpVector(p1.RIGHT_ARM.SHOULDER, p2.RIGHT_ARM.SHOULDER, t);
        res.RIGHT_ARM.ELBOW = lerpVector(p1.RIGHT_ARM.ELBOW, p2.RIGHT_ARM.ELBOW, t);
        res.RIGHT_ARM.FOREARM = lerpVector(p1.RIGHT_ARM.FOREARM, p2.RIGHT_ARM.FOREARM, t);
        res.RIGHT_ARM.WRIST = lerpVector(p1.RIGHT_ARM.WRIST, p2.RIGHT_ARM.WRIST, t);

        res.LEFT_LEG.THIGH = lerpVector(p1.LEFT_LEG.THIGH, p2.LEFT_LEG.THIGH, t);
        res.LEFT_LEG.KNEE = lerpScalar(p1.LEFT_LEG.KNEE, p2.LEFT_LEG.KNEE, t);
        res.LEFT_LEG.ANKLE = lerpVector(p1.LEFT_LEG.ANKLE, p2.LEFT_LEG.ANKLE, t);

        res.RIGHT_LEG.THIGH = lerpVector(p1.RIGHT_LEG.THIGH, p2.RIGHT_LEG.THIGH, t);
        res.RIGHT_LEG.KNEE = lerpScalar(p1.RIGHT_LEG.KNEE, p2.RIGHT_LEG.KNEE, t);
        res.RIGHT_LEG.ANKLE = lerpVector(p1.RIGHT_LEG.ANKLE, p2.RIGHT_LEG.ANKLE, t);
        
        if (p1.SHIELD && p2.SHIELD) {
            if (!res.SHIELD) res.SHIELD = { POSITION: {x:0,y:0,z:0}, ROTATION: {x:0,y:0,z:0} };
            res.SHIELD.POSITION = lerpVector(p1.SHIELD.POSITION, p2.SHIELD.POSITION, t);
            res.SHIELD.ROTATION = lerpVector(p1.SHIELD.ROTATION, p2.SHIELD.ROTATION, t);
        }

        return res;
    }
    
    getCurrentPose(): MechPose {
        return this.currentPose;
    }
}