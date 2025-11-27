import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Html } from '@react-three/drei';
import { DoubleSide, Vector3, Matrix4, Quaternion, Euler, MathUtils } from 'three'; 
import { MechPose, DEFAULT_MECH_POSE, RotationVector, AnimationClip, AnimationTrack, Keyframe } from '../types';
import { PosableUnit } from './PosableUnit';
import { clonePose } from './AnimationSystem';

// --- HELPER TYPES & UTILS ---

interface KeyframeSnapshot {
    time: number; // 0.0 to 1.0
    pose: MechPose;
}

const RangeControl: React.FC<{ 
    label: string; 
    value: number; 
    onChange: (val: number) => void; 
    min?: number; 
    max?: number;
    step?: number;
}> = ({ label, value, onChange, min = -3.14, max = 3.14, step = 0.05 }) => {
    return (
        <div className="flex items-center space-x-2 mb-1">
            <span className="w-8 text-[10px] font-mono text-gray-400">{label}</span>
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={value} 
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <span className="w-8 text-[10px] font-mono text-right text-cyan-400">{value.toFixed(2)}</span>
        </div>
    );
};

const VectorControl: React.FC<{
    label: string;
    vector: { x: number, y: number, z: number };
    onChange: (axis: 'x'|'y'|'z', val: number) => void;
    singleAxis?: boolean; // For knees
}> = ({ label, vector, onChange, singleAxis }) => {
    return (
        <div className="mb-3 border-b border-gray-800 pb-2">
            <div className="text-xs font-bold text-gray-300 mb-1">{label}</div>
            <RangeControl label="X" value={vector.x} onChange={(v) => onChange('x', v)} />
            {!singleAxis && (
                <>
                    <RangeControl label="Y" value={vector.y} onChange={(v) => onChange('y', v)} />
                    <RangeControl label="Z" value={vector.z} onChange={(v) => onChange('z', v)} />
                </>
            )}
        </div>
    );
};

// --- SLASH PLANE GUIDE TOOL ---
const SlashPlaneGuide: React.FC<{
    visible: boolean;
    position: { x: number, y: number, z: number };
    rotation: { x: number, y: number, z: number };
}> = ({ visible, position, rotation }) => {
    if (!visible) return null;

    return (
        <group position={[position.x, position.y, position.z]} rotation={[rotation.x, rotation.y, rotation.z]}>
            <mesh>
                <circleGeometry args={[4, 32]} />
                <meshBasicMaterial color="#00ffaa" transparent opacity={0.1} side={DoubleSide} depthWrite={false} />
            </mesh>
            <mesh>
                <ringGeometry args={[3.95, 4, 64]} />
                <meshBasicMaterial color="#00ffaa" transparent opacity={0.6} side={DoubleSide} />
            </mesh>
            <group rotation={[Math.PI/2, 0, 0]}>
                <gridHelper args={[8, 8, 0x00ffaa, 0x004433]} />
            </group>
            <mesh position={[0, 0, 1]}>
                <boxGeometry args={[0.05, 0.05, 2]} />
                <meshBasicMaterial color="#00ffaa" transparent opacity={0.5} />
            </mesh>
        </group>
    );
};

// --- INTERPOLATION LOGIC ---
const lerpVector = (v1: RotationVector, v2: RotationVector, t: number) => ({
    x: MathUtils.lerp(v1.x, v2.x, t),
    y: MathUtils.lerp(v1.y, v2.y, t),
    z: MathUtils.lerp(v1.z, v2.z, t),
});

const interpolatePose = (p1: MechPose, p2: MechPose, t: number): MechPose => {
    const res = clonePose(p1);
    
    // Core
    res.TORSO = lerpVector(p1.TORSO, p2.TORSO, t);
    res.CHEST = lerpVector(p1.CHEST, p2.CHEST, t);
    res.HEAD = lerpVector(p1.HEAD, p2.HEAD, t);
    
    // Arms
    res.LEFT_ARM.SHOULDER = lerpVector(p1.LEFT_ARM.SHOULDER, p2.LEFT_ARM.SHOULDER, t);
    res.LEFT_ARM.ELBOW = lerpVector(p1.LEFT_ARM.ELBOW, p2.LEFT_ARM.ELBOW, t);
    res.LEFT_ARM.FOREARM = lerpVector(p1.LEFT_ARM.FOREARM, p2.LEFT_ARM.FOREARM, t);
    res.LEFT_ARM.WRIST = lerpVector(p1.LEFT_ARM.WRIST, p2.LEFT_ARM.WRIST, t);

    res.RIGHT_ARM.SHOULDER = lerpVector(p1.RIGHT_ARM.SHOULDER, p2.RIGHT_ARM.SHOULDER, t);
    res.RIGHT_ARM.ELBOW = lerpVector(p1.RIGHT_ARM.ELBOW, p2.RIGHT_ARM.ELBOW, t);
    res.RIGHT_ARM.FOREARM = lerpVector(p1.RIGHT_ARM.FOREARM, p2.RIGHT_ARM.FOREARM, t);
    res.RIGHT_ARM.WRIST = lerpVector(p1.RIGHT_ARM.WRIST, p2.RIGHT_ARM.WRIST, t);

    // Legs
    res.LEFT_LEG.THIGH = lerpVector(p1.LEFT_LEG.THIGH, p2.LEFT_LEG.THIGH, t);
    res.LEFT_LEG.KNEE = MathUtils.lerp(p1.LEFT_LEG.KNEE, p2.LEFT_LEG.KNEE, t);
    res.LEFT_LEG.ANKLE = lerpVector(p1.LEFT_LEG.ANKLE, p2.LEFT_LEG.ANKLE, t);

    res.RIGHT_LEG.THIGH = lerpVector(p1.RIGHT_LEG.THIGH, p2.RIGHT_LEG.THIGH, t);
    res.RIGHT_LEG.KNEE = MathUtils.lerp(p1.RIGHT_LEG.KNEE, p2.RIGHT_LEG.KNEE, t);
    res.RIGHT_LEG.ANKLE = lerpVector(p1.RIGHT_LEG.ANKLE, p2.RIGHT_LEG.ANKLE, t);
    
    if (p1.SHIELD && p2.SHIELD) {
        if (!res.SHIELD) res.SHIELD = { POSITION: {x:0,y:0,z:0}, ROTATION: {x:0,y:0,z:0} };
        res.SHIELD.POSITION = lerpVector(p1.SHIELD.POSITION, p2.SHIELD.POSITION, t);
        res.SHIELD.ROTATION = lerpVector(p1.SHIELD.ROTATION, p2.SHIELD.ROTATION, t);
    }
    return res;
};

// --- EXPORT HELPERS ---
// Helper to round numbers for cleaner output
const r = (num: number) => parseFloat(num.toFixed(2));
const fmtVec = (v: RotationVector) => `{ x: ${r(v.x)}, y: ${r(v.y)}, z: ${r(v.z)} }`;

const formatPoseToObj = (pose: MechPose): string => {
    return `{
    TORSO: ${fmtVec(pose.TORSO)},
    CHEST: ${fmtVec(pose.CHEST)},
    HEAD: ${fmtVec(pose.HEAD)},
    LEFT_ARM: {
        SHOULDER: ${fmtVec(pose.LEFT_ARM.SHOULDER)},
        ELBOW: ${fmtVec(pose.LEFT_ARM.ELBOW)},
        FOREARM: ${fmtVec(pose.LEFT_ARM.FOREARM)},
        WRIST: ${fmtVec(pose.LEFT_ARM.WRIST)}
    },
    RIGHT_ARM: {
        SHOULDER: ${fmtVec(pose.RIGHT_ARM.SHOULDER)},
        ELBOW: ${fmtVec(pose.RIGHT_ARM.ELBOW)},
        FOREARM: ${fmtVec(pose.RIGHT_ARM.FOREARM)},
        WRIST: ${fmtVec(pose.RIGHT_ARM.WRIST)}
    },
    LEFT_LEG: {
        THIGH: ${fmtVec(pose.LEFT_LEG.THIGH)},
        KNEE: ${r(pose.LEFT_LEG.KNEE)},
        ANKLE: ${fmtVec(pose.LEFT_LEG.ANKLE)}
    },
    RIGHT_LEG: {
        THIGH: ${fmtVec(pose.RIGHT_LEG.THIGH)},
        KNEE: ${r(pose.RIGHT_LEG.KNEE)},
        ANKLE: ${fmtVec(pose.RIGHT_LEG.ANKLE)}
    },
    SHIELD: {
        POSITION: ${pose.SHIELD ? fmtVec(pose.SHIELD.POSITION) : "{x:0,y:0,z:0}"},
        ROTATION: ${pose.SHIELD ? fmtVec(pose.SHIELD.ROTATION) : "{x:0,y:0,z:0}"}
    }
}`;
};

export const PoseEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    // --- STATE ---
    const [weapon, setWeapon] = useState<'GUN' | 'SABER'>('SABER');
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    
    // Animation Data
    const [keyframes, setKeyframes] = useState<KeyframeSnapshot[]>([
        { time: 0.0, pose: clonePose(DEFAULT_MECH_POSE) },
        { time: 1.0, pose: clonePose(DEFAULT_MECH_POSE) }
    ]);
    
    // Playback
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(0.5); // Speed multiplier

    // Editing
    // This holds the pose currently being edited/viewed
    const [displayPose, setDisplayPose] = useState<MechPose>(clonePose(DEFAULT_MECH_POSE));
    
    // Guide
    const [guideVisible, setGuideVisible] = useState(false);
    const [guidePos, setGuidePos] = useState({ x: 0, y: 1.5, z: 0 });
    const [guideRot, setGuideRot] = useState({ x: 0, y: 0, z: 0 });

    // --- LOGIC ---

    // Calculate current pose based on time and keyframes
    const calculatePoseAtTime = (t: number): MechPose => {
        // Sort keyframes just in case
        const sorted = [...keyframes].sort((a, b) => a.time - b.time);
        
        if (sorted.length === 0) return clonePose(DEFAULT_MECH_POSE);
        if (sorted.length === 1) return clonePose(sorted[0].pose);

        // Find surrounding frames
        let prev = sorted[0];
        let next = sorted[sorted.length - 1];

        for (let i = 0; i < sorted.length - 1; i++) {
            if (t >= sorted[i].time && t <= sorted[i+1].time) {
                prev = sorted[i];
                next = sorted[i+1];
                break;
            }
        }

        if (next.time === prev.time) return clonePose(prev.pose);

        const localT = (t - prev.time) / (next.time - prev.time);
        return interpolatePose(prev.pose, next.pose, localT);
    };

    // Playback Loop
    useEffect(() => {
        let animationFrame: number;
        let lastTime = performance.now();

        const loop = (time: number) => {
            const delta = (time - lastTime) / 1000;
            lastTime = time;

            if (isPlaying) {
                setCurrentTime(prev => {
                    let next = prev + (delta * playbackSpeed);
                    if (next > 1.0) next = 0;
                    return next;
                });
            }
            animationFrame = requestAnimationFrame(loop);
        };

        if (isPlaying) {
            animationFrame = requestAnimationFrame(loop);
        }

        return () => cancelAnimationFrame(animationFrame);
    }, [isPlaying, playbackSpeed]);

    // Sync Display Pose with Time (when playing or scrubbing)
    useEffect(() => {
        // Only auto-update pose if we are NOT manually editing a keyframe right now
        // Actually, simplified: Always update display from timeline unless user drags a slider
        const p = calculatePoseAtTime(currentTime);
        setDisplayPose(p);
    }, [currentTime, keyframes]);

    // --- HANDLERS ---

    const handlePoseChange = (path: string[], axis: string, val: number) => {
        // Pause if editing
        setIsPlaying(false);
        
        setDisplayPose(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            let current = next;
            for (let i = 0; i < path.length; i++) {
                current = current[path[i]];
            }
            current[axis] = val;
            return next;
        });
    };
    
    const handleKneeChange = (leg: 'LEFT_LEG' | 'RIGHT_LEG', val: number) => {
        setIsPlaying(false);
        setDisplayPose(prev => ({
            ...prev,
            [leg]: { ...prev[leg], KNEE: val }
        }));
    };

    const addOrUpdateKeyframe = () => {
        // Check if a keyframe exists at exactly this time (tolerance 0.01)
        const existingIdx = keyframes.findIndex(k => Math.abs(k.time - currentTime) < 0.01);
        
        const newKeyframe = {
            time: currentTime,
            pose: clonePose(displayPose)
        };

        if (existingIdx >= 0) {
            // Update
            const newKeys = [...keyframes];
            newKeys[existingIdx] = newKeyframe;
            setKeyframes(newKeys.sort((a, b) => a.time - b.time));
        } else {
            // Add
            setKeyframes([...keyframes, newKeyframe].sort((a, b) => a.time - b.time));
        }
    };

    const deleteKeyframe = () => {
         const existingIdx = keyframes.findIndex(k => Math.abs(k.time - currentTime) < 0.01);
         if (existingIdx >= 0 && keyframes.length > 1) {
             const newKeys = [...keyframes];
             newKeys.splice(existingIdx, 1);
             setKeyframes(newKeys);
         }
    };

    // --- EXPORT CLIP ---
    const exportClipJSON = () => {
        const clipName = "CUSTOM_ANIM";
        // Manually build JSON string for super-compact single-line tracks
        let json = `{\n`;
        json += `  "name": "${clipName}",\n`;
        json += `  "duration": 1.0,\n`;
        json += `  "loop": false,\n`;
        json += `  "tracks": [\n`;

        const getValue = (pose: any, path: string[]) => {
            let val = pose;
            for (const p of path) val = val[p];
            return val;
        };

        const bonePaths = [
            ['TORSO'], ['CHEST'], ['HEAD'],
            ['LEFT_ARM', 'SHOULDER'], ['LEFT_ARM', 'ELBOW'], ['LEFT_ARM', 'FOREARM'], ['LEFT_ARM', 'WRIST'],
            ['RIGHT_ARM', 'SHOULDER'], ['RIGHT_ARM', 'ELBOW'], ['RIGHT_ARM', 'FOREARM'], ['RIGHT_ARM', 'WRIST'],
            ['LEFT_LEG', 'THIGH'], ['LEFT_LEG', 'KNEE'], ['LEFT_LEG', 'ANKLE'],
            ['RIGHT_LEG', 'THIGH'], ['RIGHT_LEG', 'KNEE'], ['RIGHT_LEG', 'ANKLE'],
            ['SHIELD', 'POSITION'], ['SHIELD', 'ROTATION']
        ];

        bonePaths.forEach((path, tIdx) => {
            json += `    { "bone": "${path.join('.')}", "keyframes": [ `;
            
            const kfs = keyframes.map((kf) => {
                const val = getValue(kf.pose, path);
                const t = parseFloat(kf.time.toFixed(4));
                
                let vStr = "";
                if (typeof val === 'number') {
                    vStr = parseFloat(val.toFixed(3)).toString();
                } else {
                    // Compact Vector3 {x:0,y:0,z:0} without extra spaces
                    vStr = `{ "x": ${parseFloat(val.x.toFixed(3))}, "y": ${parseFloat(val.y.toFixed(3))}, "z": ${parseFloat(val.z.toFixed(3))} }`;
                }
                
                return `{ "time": ${t}, "value": ${vStr} }`;
            });

            json += kfs.join(", ");
            json += ` ] }${tIdx === bonePaths.length - 1 ? '' : ','}\n`;
        });

        json += `  ]\n`;
        json += `}`;

        navigator.clipboard.writeText(json);
        alert("Animation Clip JSON copied to clipboard! (Compact Single-Line Tracks)");
    };

    // --- EXPORT FRAME (Pose Object) ---
    const exportFrameObj = () => {
        const objStr = formatPoseToObj(displayPose);
        navigator.clipboard.writeText(objStr);
        alert("Single Pose Object copied to clipboard!");
    };

    // --- IMPORT ---
    const handleImport = () => {
        try {
            // eslint-disable-next-line no-new-func
            const parseFn = new Function(`return ${importText}`);
            const importedData = parseFn();

            if (importedData.tracks) {
                // It's an Animation Clip with Tracks
                // We need to reconstruct "Keyframe Snapshots" from the tracks.
                // 1. Collect all unique timestamps
                const uniqueTimes = new Set<number>();
                const tracks: AnimationTrack[] = importedData.tracks;
                
                tracks.forEach(t => {
                    t.keyframes.forEach(kf => uniqueTimes.add(kf.time));
                });
                
                // 2. Sort timestamps
                const sortedTimes = Array.from(uniqueTimes).sort((a, b) => a - b);
                
                // 3. Reconstruct Pose for each timestamp
                const newSnapshots: KeyframeSnapshot[] = sortedTimes.map(time => {
                    const pose = clonePose(DEFAULT_MECH_POSE);
                    
                    tracks.forEach(track => {
                        // Find keyframe matching time (approx match for floats)
                        const kf = track.keyframes.find(k => Math.abs(k.time - time) < 0.0001);
                        if (kf) {
                             // Apply value to pose
                             const path = track.bone.split('.');
                             if (path.length === 1) {
                                 (pose as any)[path[0]] = kf.value;
                             } else if (path.length === 2) {
                                 (pose as any)[path[0]][path[1]] = kf.value;
                             }
                        }
                    });
                    
                    return { time, pose };
                });
                
                setKeyframes(newSnapshots);
                if (newSnapshots.length > 0) {
                    setDisplayPose(newSnapshots[0].pose);
                    setCurrentTime(newSnapshots[0].time);
                }
                alert(`Imported Animation Clip with ${newSnapshots.length} keyframes.`);
                setShowImport(false);

            } 
            else if (importedData.TORSO) {
                 // It's a Single Pose Object
                 const merged = { ...DEFAULT_MECH_POSE, ...importedData };
                 if(importedData.LEFT_ARM) merged.LEFT_ARM = { ...DEFAULT_MECH_POSE.LEFT_ARM, ...importedData.LEFT_ARM };
                 if(importedData.RIGHT_ARM) merged.RIGHT_ARM = { ...DEFAULT_MECH_POSE.RIGHT_ARM, ...importedData.RIGHT_ARM };
                 
                 setDisplayPose(merged);
                 alert("Imported Pose. Click 'Keyframe' to add it to timeline.");
                 setShowImport(false);
            } else {
                alert("Invalid format.");
            }
        } catch (e) {
            alert("Failed to parse. Ensure valid JS object string.");
            console.error(e);
        }
    };

    // --- GUIDE LOGIC ---
    const updateGuidePos = (axis: 'x'|'y'|'z', val: number) => setGuidePos(p => ({...p, [axis]: val}));
    const updateGuideRot = (axis: 'x'|'y'|'z', val: number) => setGuideRot(p => ({...p, [axis]: val}));
    
    const autoAlignBlade = () => {
        const planeQuat = new Quaternion().setFromEuler(new Euler(guideRot.x, guideRot.y, guideRot.z));
        const planeNormal = new Vector3(0, 0, 1).applyQuaternion(planeQuat).normalize();

        // Reconstruct Left Arm Chain using `displayPose`
        const p = displayPose;
        
        const mTorso = new Matrix4().makeRotationFromEuler(new Euler(p.TORSO.x, p.TORSO.y, p.TORSO.z));
        const mChest = new Matrix4().makeRotationFromEuler(new Euler(p.CHEST.x, p.CHEST.y, p.CHEST.z));
        mChest.setPosition(0, 0.65, 0); mChest.premultiply(mTorso);
        
        const mShoulder = new Matrix4().makeRotationFromEuler(new Euler(p.LEFT_ARM.SHOULDER.x, p.LEFT_ARM.SHOULDER.y, p.LEFT_ARM.SHOULDER.z));
        mShoulder.setPosition(-0.65, 0.1, 0); mShoulder.premultiply(mChest);
        
        const mElbow = new Matrix4().makeRotationFromEuler(new Euler(p.LEFT_ARM.ELBOW.x, p.LEFT_ARM.ELBOW.y, p.LEFT_ARM.ELBOW.z));
        mElbow.setPosition(0, -0.4, 0); mElbow.premultiply(mShoulder);
        
        const mForearm = new Matrix4().makeRotationFromEuler(new Euler(p.LEFT_ARM.FOREARM.x, p.LEFT_ARM.FOREARM.y, p.LEFT_ARM.FOREARM.z));
        mForearm.premultiply(mElbow);

        const mWristPivot = new Matrix4().makeTranslation(0, -0.35, 0); 
        mWristPivot.premultiply(new Matrix4().makeRotationFromEuler(new Euler(-0.2, 0, 0))); 
        mWristPivot.premultiply(new Matrix4().makeTranslation(0, -0.5, 0.1)); 
        mWristPivot.premultiply(mForearm);

        const saberRot = new Euler(Math.PI/1.8, 0, 0);
        const bladeLocalVec = new Vector3(0, 1, 0).applyEuler(saberRot); 
        const invWristPivot = mWristPivot.clone().invert();
        const localNormal = planeNormal.clone().transformDirection(invWristPivot).normalize();
        const projection = bladeLocalVec.clone().sub(localNormal.clone().multiplyScalar(bladeLocalVec.dot(localNormal)));
        
        if (projection.lengthSq() < 0.0001) return;
        projection.normalize();
        const alignQuat = new Quaternion().setFromUnitVectors(bladeLocalVec, projection);
        const newWristEuler = new Euler().setFromQuaternion(alignQuat);

        handlePoseChange(['LEFT_ARM', 'WRIST'], 'x', newWristEuler.x);
        handlePoseChange(['LEFT_ARM', 'WRIST'], 'y', newWristEuler.y);
        handlePoseChange(['LEFT_ARM', 'WRIST'], 'z', newWristEuler.z);
    };

    return (
        <div className="absolute inset-0 z-[100] bg-[#111] flex flex-col md:flex-row text-gray-200 font-sans">
            
            {/* IMPORT MODAL */}
            {showImport && (
                <div className="absolute inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-600 p-6 rounded-lg w-full max-w-2xl shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">IMPORT DATA</h3>
                         <div className="text-xs text-gray-400 mb-2">Paste either a single Pose Object OR a full Animation Clip JSON</div>
                        <textarea 
                            className="w-full h-64 bg-black/50 border border-gray-700 p-4 font-mono text-xs text-green-400 mb-4 focus:outline-none focus:border-cyan-500"
                            placeholder="{ TORSO: ... } OR { tracks: ... }"
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                        />
                        <div className="flex justify-end space-x-3">
                            <button 
                                onClick={() => setShowImport(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-bold"
                            >
                                CANCEL
                            </button>
                            <button 
                                onClick={handleImport}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold"
                            >
                                LOAD DATA
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 3D VIEWPORT */}
            <div className="flex-1 relative h-[60vh] md:h-auto bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col">
                <div className="flex-1 relative">
                    <Canvas> 
                        <PerspectiveCamera makeDefault position={[2.5, 2, 4.5]} fov={45} />
                        <color attach="background" args={['#1a1d26']} />
                        <OrbitControls makeDefault target={[0, 1, 0]} />
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[5, 10, 5]} intensity={1.8} />
                        <group position={[0, 0, 0]}>
                            <PosableUnit pose={displayPose} weapon={weapon} />
                            <SlashPlaneGuide visible={guideVisible} position={guidePos} rotation={guideRot} />
                        </group>
                        <Grid position={[0, -0.01, 0]} args={[20, 20]} />
                    </Canvas>
                    
                    {/* Top Bar */}
                    <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                        <div className="bg-black/60 px-3 py-1 rounded border border-white/10 text-xs font-bold backdrop-blur-sm">
                            TIMELINE EDITOR
                        </div>
                        <div className="pointer-events-auto space-x-2">
                             <button onClick={() => setWeapon(w => w === 'GUN' ? 'SABER' : 'GUN')} className="bg-gray-700 px-3 py-1 rounded text-[10px] font-bold border border-gray-500">
                                {weapon}
                            </button>
                             <button onClick={() => setShowImport(true)} className="bg-purple-700 hover:bg-purple-600 px-3 py-1 rounded text-[10px] font-bold border border-purple-500">
                                IMPORT
                            </button>
                            <button onClick={onClose} className="bg-red-600/80 hover:bg-red-500 px-3 py-1 rounded text-[10px] font-bold border border-red-400">
                                EXIT
                            </button>
                        </div>
                    </div>
                </div>

                {/* TIMELINE UI (Bottom Panel) */}
                <div className="h-32 bg-[#0a0a0a] border-t border-gray-700 p-4 flex flex-col justify-center">
                    {/* Controls Row */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                            <button 
                                onClick={() => setIsPlaying(!isPlaying)}
                                className={`w-8 h-8 flex items-center justify-center rounded ${isPlaying ? 'bg-yellow-600 text-black' : 'bg-green-600 text-white'}`}
                            >
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                            <div className="text-xs font-mono text-cyan-400 w-16">
                                {(currentTime * 100).toFixed(0)}%
                            </div>
                            <div className="flex flex-col">
                                <label className="text-[8px] text-gray-500">SPEED</label>
                                <input 
                                    type="range" min="0.1" max="2.0" step="0.1" 
                                    value={playbackSpeed} onChange={e => setPlaybackSpeed(parseFloat(e.target.value))} 
                                    className="w-20 h-1"
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                             <button onClick={deleteKeyframe} className="px-3 py-1 bg-red-900/50 border border-red-700 text-red-400 text-[10px] rounded hover:bg-red-800">
                                DELETE KEY
                            </button>
                            <button onClick={addOrUpdateKeyframe} className="px-4 py-1.5 bg-cyan-700 border border-cyan-500 text-white text-xs font-bold rounded hover:bg-cyan-600 shadow-lg shadow-cyan-500/20">
                                ◆ KEYFRAME
                            </button>
                             {/* EXPORT BUTTONS */}
                             <div className="flex space-x-1 ml-4">
                                <button onClick={exportFrameObj} className="px-3 py-1.5 bg-gray-700 border border-gray-500 text-white text-[10px] font-bold rounded hover:bg-gray-600">
                                    EXP POSE
                                </button>
                                <button onClick={exportClipJSON} className="px-3 py-1.5 bg-purple-700 border border-purple-500 text-white text-[10px] font-bold rounded hover:bg-purple-600">
                                    EXP ANIM
                                </button>
                             </div>
                        </div>
                    </div>

                    {/* Timeline Bar */}
                    <div className="relative w-full h-8 bg-gray-800 rounded-lg cursor-pointer group"
                         onClick={(e) => {
                             const rect = e.currentTarget.getBoundingClientRect();
                             const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                             setCurrentTime(x);
                             setIsPlaying(false);
                         }}
                    >
                        {/* Ticks for existing keyframes */}
                        {keyframes.map((kf, i) => (
                            <div 
                                key={i} 
                                className="absolute top-0 bottom-0 w-1 bg-yellow-400 z-10 hover:bg-white transition-colors"
                                style={{ left: `${kf.time * 100}%` }}
                                title={`Keyframe ${i}: ${(kf.time*100).toFixed(0)}%`}
                            />
                        ))}

                        {/* Playhead */}
                        <div 
                            className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-red-500 z-20 pointer-events-none shadow-[0_0_10px_rgba(255,0,0,0.8)]"
                            style={{ left: `${currentTime * 100}%` }}
                        >
                            <div className="absolute -top-2 -left-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500"></div>
                        </div>
                        
                        {/* Ruler Lines */}
                        <div className="absolute inset-0 flex justify-between px-0.5 pointer-events-none opacity-20">
                            {[...Array(11)].map((_, i) => (
                                <div key={i} className="w-px h-full bg-white"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* CONTROLS SIDEBAR */}
            <div className="w-full md:w-96 bg-[#0f1115] border-l border-gray-800 h-[40vh] md:h-auto overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-700">
                 {/* --- GUIDE CONTROLS --- */}
                 <section className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-bold text-green-400 uppercase flex items-center">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                SLASH PLANE GUIDE
                            </h3>
                            <button
                                onClick={() => setGuideVisible(!guideVisible)}
                                className={`px-3 py-1 rounded text-[9px] font-bold border transition-colors ${
                                    guideVisible 
                                        ? 'bg-green-900/50 border-green-500 text-green-300 hover:bg-green-900' 
                                        : 'bg-gray-800 border-gray-600 text-gray-500 hover:bg-gray-700'
                                }`}
                            >
                                {guideVisible ? 'VISIBLE' : 'HIDDEN'}
                            </button>
                        </div>
                        
                        {guideVisible && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <VectorControl label="PLANE POS (位置)" vector={guidePos} onChange={updateGuidePos} />
                                <VectorControl label="PLANE ROT (角度)" vector={guideRot} onChange={updateGuideRot} />
                                <button onClick={autoAlignBlade} className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold tracking-widest shadow-lg transition-all active:scale-95">
                                    ⚡ AUTO-ALIGN
                                </button>
                            </div>
                        )}
                    </section>

                <div className="space-y-6">
                    {/* POSE CONTROLS - Same as before but operating on displayPose via handlePoseChange */}
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Core (躯干)</h3>
                        <VectorControl label="HEAD" vector={displayPose.HEAD} onChange={(a, v) => handlePoseChange(['HEAD'], a, v)} />
                        <VectorControl label="TORSO" vector={displayPose.TORSO} onChange={(a, v) => handlePoseChange(['TORSO'], a, v)} />
                        <VectorControl label="CHEST" vector={displayPose.CHEST} onChange={(a, v) => handlePoseChange(['CHEST'], a, v)} />
                    </section>
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Left Arm (Saber)</h3>
                        <VectorControl label="SHOULDER" vector={displayPose.LEFT_ARM.SHOULDER} onChange={(a, v) => handlePoseChange(['LEFT_ARM', 'SHOULDER'], a, v)} />
                        <VectorControl label="ELBOW" vector={displayPose.LEFT_ARM.ELBOW} onChange={(a, v) => handlePoseChange(['LEFT_ARM', 'ELBOW'], a, v)} />
                        <VectorControl label="FOREARM" vector={displayPose.LEFT_ARM.FOREARM} onChange={(a, v) => handlePoseChange(['LEFT_ARM', 'FOREARM'], a, v)} />
                        <VectorControl label="WRIST" vector={displayPose.LEFT_ARM.WRIST} onChange={(a, v) => handlePoseChange(['LEFT_ARM', 'WRIST'], a, v)} />
                    </section>
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Right Arm</h3>
                        <VectorControl label="SHOULDER" vector={displayPose.RIGHT_ARM.SHOULDER} onChange={(a, v) => handlePoseChange(['RIGHT_ARM', 'SHOULDER'], a, v)} />
                        <VectorControl label="ELBOW" vector={displayPose.RIGHT_ARM.ELBOW} onChange={(a, v) => handlePoseChange(['RIGHT_ARM', 'ELBOW'], a, v)} />
                        {/* RESTORED FOREARM CONTROL */}
                        <VectorControl label="FOREARM" vector={displayPose.RIGHT_ARM.FOREARM} onChange={(a, v) => handlePoseChange(['RIGHT_ARM', 'FOREARM'], a, v)} />
                        <VectorControl label="WRIST" vector={displayPose.RIGHT_ARM.WRIST} onChange={(a, v) => handlePoseChange(['RIGHT_ARM', 'WRIST'], a, v)} />
                    </section>
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Legs</h3>
                        <VectorControl label="L. THIGH" vector={displayPose.LEFT_LEG.THIGH} onChange={(a, v) => handlePoseChange(['LEFT_LEG', 'THIGH'], a, v)} />
                        <RangeControl label="L. KNEE" value={displayPose.LEFT_LEG.KNEE} onChange={(v) => handleKneeChange('LEFT_LEG', v)} min={0} max={2.5} />
                        <VectorControl label="L. ANKLE" vector={displayPose.LEFT_LEG.ANKLE} onChange={(a, v) => handlePoseChange(['LEFT_LEG', 'ANKLE'], a, v)} />
                        <div className="h-4"></div>
                        <VectorControl label="R. THIGH" vector={displayPose.RIGHT_LEG.THIGH} onChange={(a, v) => handlePoseChange(['RIGHT_LEG', 'THIGH'], a, v)} />
                        <RangeControl label="R. KNEE" value={displayPose.RIGHT_LEG.KNEE} onChange={(v) => handleKneeChange('RIGHT_LEG', v)} min={0} max={2.5} />
                        <VectorControl label="R. ANKLE" vector={displayPose.RIGHT_LEG.ANKLE} onChange={(a, v) => handlePoseChange(['RIGHT_LEG', 'ANKLE'], a, v)} />
                    </section>
                </div>
                <div className="h-20"></div>
            </div>
        </div>
    );
};