import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import { DoubleSide, Vector3, Matrix4, Quaternion, Euler, MathUtils } from 'three'; 
import { MechPose, DEFAULT_MECH_POSE, RotationVector } from '../types';
import { PosableUnit } from './PosableUnit';

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
            {/* Visual Plane (Disk) */}
            <mesh>
                <circleGeometry args={[4, 32]} />
                <meshBasicMaterial color="#00ffaa" transparent opacity={0.1} side={DoubleSide} depthWrite={false} />
            </mesh>
            
            {/* Wireframe / Ring */}
            <mesh>
                <ringGeometry args={[3.95, 4, 64]} />
                <meshBasicMaterial color="#00ffaa" transparent opacity={0.6} side={DoubleSide} />
            </mesh>

            {/* Grid Lines (Simulated using GridHelper rotated to match Circle on XY plane) */}
            <group rotation={[Math.PI/2, 0, 0]}>
                <gridHelper args={[8, 8, 0x00ffaa, 0x004433]} />
            </group>

            {/* Normal Indicator (Stick sticking out) */}
            <mesh position={[0, 0, 1]}>
                <boxGeometry args={[0.05, 0.05, 2]} />
                <meshBasicMaterial color="#00ffaa" transparent opacity={0.5} />
            </mesh>
        </group>
    );
};

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
    }
}`;
};

export const PoseEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [pose, setPose] = useState<MechPose>(JSON.parse(JSON.stringify(DEFAULT_MECH_POSE)));
    const [weapon, setWeapon] = useState<'GUN' | 'SABER'>('SABER');
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');

    // GUIDE STATE
    const [guideVisible, setGuideVisible] = useState(false);
    const [guidePos, setGuidePos] = useState({ x: 0, y: 1.5, z: 0 });
    const [guideRot, setGuideRot] = useState({ x: 0, y: 0, z: 0 });

    const updatePose = (path: string[], axis: string, val: number) => {
        setPose(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            let current = next;
            for (let i = 0; i < path.length; i++) {
                current = current[path[i]];
            }
            current[axis] = val;
            return next;
        });
    };

    const updateKnee = (leg: 'LEFT_LEG' | 'RIGHT_LEG', val: number) => {
        setPose(prev => ({
            ...prev,
            [leg]: {
                ...prev[leg],
                KNEE: val
            }
        }));
    };

    // GUIDE UPDATE HELPERS
    const updateGuidePos = (axis: 'x'|'y'|'z', val: number) => {
        setGuidePos(prev => ({ ...prev, [axis]: val }));
    };
    const updateGuideRot = (axis: 'x'|'y'|'z', val: number) => {
        setGuideRot(prev => ({ ...prev, [axis]: val }));
    };

    const copyData = () => {
        const objStr = formatPoseToObj(pose);
        navigator.clipboard.writeText(objStr);
        alert("Pose Object copied to clipboard! You can paste it directly into animations.ts");
    };

    // --- 自动对齐刀刃逻辑 (AUTO ALIGN LOGIC) ---
    const autoAlignBlade = () => {
        // 1. 获取辅助平面的法线 (Plane Normal)
        const planeQuat = new Quaternion().setFromEuler(new Euler(guideRot.x, guideRot.y, guideRot.z));
        const planeNormal = new Vector3(0, 0, 1).applyQuaternion(planeQuat).normalize();

        // 2. 构建左臂的运动学链矩阵 (Kinematic Chain) - 修正为 LEFT_ARM
        
        // Torso (Root)
        const mTorso = new Matrix4().makeRotationFromEuler(new Euler(pose.TORSO.x, pose.TORSO.y, pose.TORSO.z));
        
        // Chest (Parent: Torso)
        const mChest = new Matrix4().makeRotationFromEuler(new Euler(pose.CHEST.x, pose.CHEST.y, pose.CHEST.z));
        mChest.setPosition(0, 0.65, 0);
        mChest.premultiply(mTorso);

        // Left Shoulder (Parent: Chest)
        const mShoulder = new Matrix4().makeRotationFromEuler(new Euler(pose.LEFT_ARM.SHOULDER.x, pose.LEFT_ARM.SHOULDER.y, pose.LEFT_ARM.SHOULDER.z));
        mShoulder.setPosition(-0.65, 0.1, 0); // 注意：左臂 X 偏移为负
        mShoulder.premultiply(mChest);

        // Left Elbow (Parent: Shoulder)
        // 左右臂的 Elbow 偏移在 PosableUnit 中是对称的，都是 [0, -0.4, 0]
        const mElbow = new Matrix4().makeRotationFromEuler(new Euler(pose.LEFT_ARM.ELBOW.x, pose.LEFT_ARM.ELBOW.y, pose.LEFT_ARM.ELBOW.z));
        mElbow.setPosition(0, -0.4, 0);
        mElbow.premultiply(mShoulder);

        // Left Forearm Twist (Parent: Elbow)
        const mForearm = new Matrix4().makeRotationFromEuler(new Euler(pose.LEFT_ARM.FOREARM.x, pose.LEFT_ARM.FOREARM.y, pose.LEFT_ARM.FOREARM.z));
        mForearm.premultiply(mElbow);

        // Wrist Pivot Container (Offsets inside Forearm)
        // PosableUnit: Forearm Twist -> Group([0, -0.5, 0.1]) -> Wrist Group([0, -0.35, 0])
        const mWristPivot = new Matrix4().makeTranslation(0, -0.35, 0); // Wrist offset
        mWristPivot.premultiply(new Matrix4().makeRotationFromEuler(new Euler(-0.2, 0, 0))); // Armor rotation
        mWristPivot.premultiply(new Matrix4().makeTranslation(0, -0.5, 0.1)); // Armor offset
        mWristPivot.premultiply(mForearm);

        // 3. 计算光剑在手腕局部空间的方向
        // Saber 位于手腕内的 [0, 0, 0.1]，旋转为 [Math.PI/1.8, 0, 0]
        const saberRot = new Euler(Math.PI/1.8, 0, 0);
        const bladeLocalVec = new Vector3(0, 1, 0).applyEuler(saberRot); 
        
        // 4. 将平面法线转换到“手腕父级”坐标系
        const invWristPivot = mWristPivot.clone().invert();
        const localNormal = planeNormal.clone().transformDirection(invWristPivot).normalize();

        // 5. 计算目标向量
        const projection = bladeLocalVec.clone().sub(localNormal.clone().multiplyScalar(bladeLocalVec.dot(localNormal)));
        
        if (projection.lengthSq() < 0.0001) {
            alert("Blade is already perpendicular to plane! Move arm slightly.");
            return;
        }
        projection.normalize();

        // 6. 计算旋转
        const alignQuat = new Quaternion().setFromUnitVectors(bladeLocalVec, projection);
        const newWristEuler = new Euler().setFromQuaternion(alignQuat);

        // 7. 应用更新到 LEFT_ARM
        updatePose(['LEFT_ARM', 'WRIST'], 'x', newWristEuler.x);
        updatePose(['LEFT_ARM', 'WRIST'], 'y', newWristEuler.y);
        updatePose(['LEFT_ARM', 'WRIST'], 'z', newWristEuler.z);
    };

    const handleImport = () => {
        try {
            // Use Function constructor to parse the JS object string loosely
            // eslint-disable-next-line no-new-func
            const parseFn = new Function(`return ${importText}`);
            const importedPose = parseFn();
            
            if (importedPose && importedPose.TORSO && importedPose.LEFT_ARM) {
                const merged = { ...DEFAULT_MECH_POSE, ...importedPose };
                if(importedPose.LEFT_ARM) merged.LEFT_ARM = { ...DEFAULT_MECH_POSE.LEFT_ARM, ...importedPose.LEFT_ARM };
                if(importedPose.RIGHT_ARM) merged.RIGHT_ARM = { ...DEFAULT_MECH_POSE.RIGHT_ARM, ...importedPose.RIGHT_ARM };
                setPose(merged);
                setShowImport(false);
            } else {
                alert("Invalid pose object structure.");
            }
        } catch (e) {
            alert("Failed to parse object. Ensure it is a valid JS object string.");
            console.error(e);
        }
    };

    return (
        <div className="absolute inset-0 z-[100] bg-[#111] flex flex-col md:flex-row text-gray-200 font-sans">
            
            {/* IMPORT MODAL */}
            {showImport && (
                <div className="absolute inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-600 p-6 rounded-lg w-full max-w-2xl shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">IMPORT POSE OBJECT</h3>
                        <textarea 
                            className="w-full h-64 bg-black/50 border border-gray-700 p-4 font-mono text-xs text-green-400 mb-4 focus:outline-none focus:border-cyan-500"
                            placeholder="Paste the pose object here (e.g. { TORSO: { x: 0... } })..."
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
                                APPLY POSE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 3D VIEWPORT */}
            <div className="flex-1 relative h-[50vh] md:h-auto bg-gradient-to-b from-gray-900 to-gray-800">
                <Canvas> 
                    <PerspectiveCamera makeDefault position={[2.5, 2, 4.5]} fov={45} />
                    <color attach="background" args={['#1a1d26']} />
                    
                    <OrbitControls makeDefault target={[0, 1, 0]} />

                    <ambientLight intensity={0.6} />
                    <directionalLight position={[5, 10, 5]} intensity={1.8} />
                    <pointLight position={[-5, 5, -5]} intensity={5} color="#00aaff" distance={15} />
                    <pointLight position={[5, 2, 5]} intensity={3} color="#ff0066" distance={15} />

                    {/* Scene Content */}
                    <group position={[0, 0, 0]}>
                        <PosableUnit pose={pose} weapon={weapon} />
                        <SlashPlaneGuide visible={guideVisible} position={guidePos} rotation={guideRot} />
                    </group>

                    <Grid position={[0, -0.01, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.6} cellColor="#444" sectionSize={2.5} sectionThickness={1} sectionColor="#666" fadeDistance={20} infiniteGrid />
                </Canvas>
                
                <div className="absolute top-4 left-4 flex space-x-4 pointer-events-none">
                    <div className="bg-black/60 text-white px-4 py-2 text-xs font-bold rounded border border-white/10 backdrop-blur-sm">
                        POSE EDITOR TOOL
                    </div>
                </div>
                
                <div className="absolute top-4 right-4 pointer-events-auto">
                    <button onClick={onClose} className="bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 text-xs rounded font-bold border border-red-400/50 transition-colors">
                        CLOSE
                    </button>
                </div>
                
                {/* Bottom Overlay */}
                <div className="absolute bottom-6 right-6 flex space-x-3 pointer-events-auto">
                     <button 
                        onClick={() => setWeapon(w => w === 'GUN' ? 'SABER' : 'GUN')}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-xs font-bold border border-gray-500"
                    >
                        WEAPON: <span className="text-cyan-400">{weapon}</span>
                    </button>
                    <button 
                        onClick={() => setShowImport(true)}
                        className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded text-xs font-bold border border-purple-500"
                    >
                        IMPORT
                    </button>
                    <button 
                        onClick={copyData}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded text-xs font-bold shadow-lg border border-cyan-400"
                    >
                        COPY OBJ
                    </button>
                </div>
            </div>

            {/* CONTROLS SIDEBAR */}
            <div className="w-full md:w-96 bg-[#0f1115] border-l border-gray-800 h-[50vh] md:h-auto overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-700">
                <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
                    <h2 className="text-sm font-bold text-white tracking-widest">
                        JOINT CONFIG
                    </h2>
                    <div className="text-[10px] text-gray-500 font-mono">ALL ANGLES IN RADIANS</div>
                </div>

                <div className="space-y-6">
                    {/* --- GUIDE CONTROLS --- */}
                    <section className="bg-gray-900/50 p-3 rounded border border-gray-700 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-bold text-green-400 uppercase flex items-center">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                切面辅助规 (SLASH GUIDE)
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
                                <div className="bg-black/20 p-2 rounded border border-white/5 mb-2">
                                    <p className="text-[9px] text-gray-400 leading-relaxed">
                                        1. 调整圆盘代表挥砍轨迹面。<br/>
                                        2. 调整左肩/肘使手靠近圆盘。<br/>
                                        3. 点击对齐，自动旋转手腕贴合。
                                    </p>
                                </div>
                                <VectorControl label="PLANE POS (位置)" vector={guidePos} onChange={updateGuidePos} />
                                <VectorControl label="PLANE ROT (角度)" vector={guideRot} onChange={updateGuideRot} />
                                
                                <button
                                    onClick={autoAlignBlade}
                                    className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center"
                                >
                                    <span className="mr-1">⚡</span> AUTO-ALIGN (左手对齐)
                                </button>
                            </div>
                        )}
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Core (躯干)</h3>
                        <VectorControl label="HEAD" vector={pose.HEAD} onChange={(a, v) => updatePose(['HEAD'], a, v)} />
                        <VectorControl label="TORSO (WAIST)" vector={pose.TORSO} onChange={(a, v) => updatePose(['TORSO'], a, v)} />
                        <VectorControl label="CHEST (UPPER)" vector={pose.CHEST} onChange={(a, v) => updatePose(['CHEST'], a, v)} />
                    </section>
                    
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Right Arm (右臂)</h3>
                        <VectorControl label="SHOULDER" vector={pose.RIGHT_ARM.SHOULDER} onChange={(a, v) => updatePose(['RIGHT_ARM', 'SHOULDER'], a, v)} />
                        <VectorControl label="ELBOW" vector={pose.RIGHT_ARM.ELBOW} onChange={(a, v) => updatePose(['RIGHT_ARM', 'ELBOW'], a, v)} />
                        <VectorControl label="FOREARM (TWIST)" vector={pose.RIGHT_ARM.FOREARM} onChange={(a, v) => updatePose(['RIGHT_ARM', 'FOREARM'], a, v)} />
                        <VectorControl label="WRIST (HAND)" vector={pose.RIGHT_ARM.WRIST} onChange={(a, v) => updatePose(['RIGHT_ARM', 'WRIST'], a, v)} />
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Left Arm (左臂)</h3>
                        <VectorControl label="SHOULDER" vector={pose.LEFT_ARM.SHOULDER} onChange={(a, v) => updatePose(['LEFT_ARM', 'SHOULDER'], a, v)} />
                        <VectorControl label="ELBOW" vector={pose.LEFT_ARM.ELBOW} onChange={(a, v) => updatePose(['LEFT_ARM', 'ELBOW'], a, v)} />
                        <VectorControl label="FOREARM (TWIST)" vector={pose.LEFT_ARM.FOREARM} onChange={(a, v) => updatePose(['LEFT_ARM', 'FOREARM'], a, v)} />
                        <VectorControl label="WRIST (HAND)" vector={pose.LEFT_ARM.WRIST} onChange={(a, v) => updatePose(['LEFT_ARM', 'WRIST'], a, v)} />
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Right Leg (右腿)</h3>
                        <VectorControl label="THIGH" vector={pose.RIGHT_LEG.THIGH} onChange={(a, v) => updatePose(['RIGHT_LEG', 'THIGH'], a, v)} />
                        <div className="mb-3 border-b border-gray-800 pb-2">
                            <div className="text-xs font-bold text-gray-300 mb-1">KNEE</div>
                            <RangeControl label="X" value={pose.RIGHT_LEG.KNEE} onChange={(v) => updateKnee('RIGHT_LEG', v)} min={0} max={2.5} />
                        </div>
                        <VectorControl label="ANKLE" vector={pose.RIGHT_LEG.ANKLE} onChange={(a, v) => updatePose(['RIGHT_LEG', 'ANKLE'], a, v)} />
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Left Leg (左腿)</h3>
                        <VectorControl label="THIGH" vector={pose.LEFT_LEG.THIGH} onChange={(a, v) => updatePose(['LEFT_LEG', 'THIGH'], a, v)} />
                        <div className="mb-3 border-b border-gray-800 pb-2">
                            <div className="text-xs font-bold text-gray-300 mb-1">KNEE</div>
                            <RangeControl label="X" value={pose.LEFT_LEG.KNEE} onChange={(v) => updateKnee('LEFT_LEG', v)} min={0} max={2.5} />
                        </div>
                        <VectorControl label="ANKLE" vector={pose.LEFT_LEG.ANKLE} onChange={(a, v) => updatePose(['LEFT_LEG', 'ANKLE'], a, v)} />
                    </section>
                </div>
                
                <div className="h-10"></div> {/* Spacer */}
            </div>
        </div>
    );
};