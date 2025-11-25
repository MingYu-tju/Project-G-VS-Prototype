import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import { MechPose, DEFAULT_MECH_POSE } from '../types';
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

export const PoseEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [pose, setPose] = useState<MechPose>(JSON.parse(JSON.stringify(DEFAULT_MECH_POSE)));
    const [weapon, setWeapon] = useState<'GUN' | 'SABER'>('SABER');

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

    const copyData = () => {
        const json = JSON.stringify(pose, null, 4);
        navigator.clipboard.writeText(json);
        alert("Pose JSON copied to clipboard!");
    };

    return (
        <div className="absolute inset-0 z-[100] bg-[#111] flex flex-col md:flex-row text-gray-200 font-sans">
            {/* 3D VIEWPORT */}
            <div className="flex-1 relative h-[50vh] md:h-auto bg-gradient-to-b from-gray-900 to-gray-800">
                <Canvas shadows>
                    <PerspectiveCamera makeDefault position={[2.5, 2, 4.5]} fov={45} />
                    <color attach="background" args={['#1a1d26']} />
                    
                    <OrbitControls makeDefault target={[0, 1, 0]} />

                    {/* --- MANUAL LIGHTING SETUP (Fixes Darkness) --- */}
                    <ambientLight intensity={0.6} />
                    
                    {/* Main Key Light */}
                    <directionalLight 
                        position={[5, 10, 5]} 
                        intensity={1.8} 
                        castShadow 
                        shadow-bias={-0.0005} 
                    />
                    
                    {/* Rim Lights for Style */}
                    <pointLight position={[-5, 5, -5]} intensity={5} color="#00aaff" distance={15} />
                    <pointLight position={[5, 2, 5]} intensity={3} color="#ff0066" distance={15} />

                    {/* Scene Content */}
                    <group position={[0, 0, 0]}>
                        <PosableUnit pose={pose} weapon={weapon} />
                        <ContactShadows resolution={1024} scale={20} blur={1.5} opacity={0.5} far={2} color="#000000" />
                    </group>

                    {/* Static Grid (Fixes Jitter) */}
                    <Grid 
                        position={[0, -0.01, 0]} 
                        args={[20, 20]} 
                        cellSize={0.5} 
                        cellThickness={0.6} 
                        cellColor="#444" 
                        sectionSize={2.5} 
                        sectionThickness={1} 
                        sectionColor="#666" 
                        fadeDistance={20} 
                        infiniteGrid 
                    />
                </Canvas>
                
                {/* Top Overlay */}
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
                        TOGGLE WEAPON: <span className="text-cyan-400">{weapon}</span>
                    </button>
                    <button 
                        onClick={copyData}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded text-xs font-bold shadow-lg border border-cyan-400"
                    >
                        COPY JSON TO CLIPBOARD
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
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Core</h3>
                        <VectorControl label="HEAD" vector={pose.HEAD} onChange={(a, v) => updatePose(['HEAD'], a, v)} />
                        <VectorControl label="TORSO (WAIST)" vector={pose.TORSO} onChange={(a, v) => updatePose(['TORSO'], a, v)} />
                        <VectorControl label="CHEST (UPPER)" vector={pose.CHEST} onChange={(a, v) => updatePose(['CHEST'], a, v)} />
                    </section>
                    
                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Right Arm</h3>
                        <VectorControl label="SHOULDER" vector={pose.RIGHT_ARM.SHOULDER} onChange={(a, v) => updatePose(['RIGHT_ARM', 'SHOULDER'], a, v)} />
                        <VectorControl label="ELBOW" vector={pose.RIGHT_ARM.ELBOW} onChange={(a, v) => updatePose(['RIGHT_ARM', 'ELBOW'], a, v)} />
                        <VectorControl label="FOREARM (TWIST)" vector={pose.RIGHT_ARM.FOREARM} onChange={(a, v) => updatePose(['RIGHT_ARM', 'FOREARM'], a, v)} />
                        <VectorControl label="WRIST (HAND)" vector={pose.RIGHT_ARM.WRIST} onChange={(a, v) => updatePose(['RIGHT_ARM', 'WRIST'], a, v)} />
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Left Arm</h3>
                        <VectorControl label="SHOULDER" vector={pose.LEFT_ARM.SHOULDER} onChange={(a, v) => updatePose(['LEFT_ARM', 'SHOULDER'], a, v)} />
                        <VectorControl label="ELBOW" vector={pose.LEFT_ARM.ELBOW} onChange={(a, v) => updatePose(['LEFT_ARM', 'ELBOW'], a, v)} />
                        <VectorControl label="FOREARM (TWIST)" vector={pose.LEFT_ARM.FOREARM} onChange={(a, v) => updatePose(['LEFT_ARM', 'FOREARM'], a, v)} />
                        <VectorControl label="WRIST (HAND)" vector={pose.LEFT_ARM.WRIST} onChange={(a, v) => updatePose(['LEFT_ARM', 'WRIST'], a, v)} />
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Right Leg</h3>
                        <VectorControl label="THIGH" vector={pose.RIGHT_LEG.THIGH} onChange={(a, v) => updatePose(['RIGHT_LEG', 'THIGH'], a, v)} />
                        <div className="mb-3 border-b border-gray-800 pb-2">
                            <div className="text-xs font-bold text-gray-300 mb-1">KNEE</div>
                            <RangeControl label="X" value={pose.RIGHT_LEG.KNEE} onChange={(v) => updateKnee('RIGHT_LEG', v)} min={0} max={2.5} />
                        </div>
                        <VectorControl label="ANKLE" vector={pose.RIGHT_LEG.ANKLE} onChange={(a, v) => updatePose(['RIGHT_LEG', 'ANKLE'], a, v)} />
                    </section>

                    <section>
                        <h3 className="text-[10px] font-bold text-cyan-600 mb-2 uppercase">Left Leg</h3>
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