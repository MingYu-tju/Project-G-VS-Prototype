
import React, { useMemo } from 'react';
import { DoubleSide, AdditiveBlending, Color } from 'three';
import { Edges, useGLTF } from '@react-three/drei';
import { MechPose } from '../types';

// Reuse visual components to ensure exact match
const MODEL_PATH = '/models/head.glb';
useGLTF.preload(MODEL_PATH);

const MechaHead: React.FC<{ mainColor: string }> = ({ mainColor }) => {
    const { nodes } = useGLTF(MODEL_PATH) as any;
    const meshProps = {}; // Shadows removed
    return (
        <group position={[-0.08, 0.4, 0.1]} >
            <group dispose={null}>
                <group position={[-0, -0.28, -0]} scale={0.02}>
                    <group rotation={[Math.PI / 2, 0, 0]}>
                      <mesh geometry={nodes.Polygon_35.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps} > <meshToonMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_55.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#00ff00" /><Edges threshold={15} color="black" /></mesh>
                      <mesh geometry={nodes.Polygon_56.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#00ff00" /><Edges threshold={15} color="black" /></mesh>
                      <mesh geometry={nodes.Polygon_57.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ff0000" /><Edges threshold={15} color="black" /></mesh>
                      <mesh geometry={nodes.Polygon_58.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}><meshToonMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_59.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ffff00" /><Edges threshold={15} color="black" /></mesh>
                      <mesh geometry={nodes.Polygon_60.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#000000" /><Edges threshold={15} color="black" /></mesh>
                      <mesh geometry={nodes.Polygon_61.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ff0000" /><Edges threshold={15} color="black" /></mesh>
                    </group>
                </group>
            </group>
        </group>
    );
};

const BeamSaber: React.FC<{ active: boolean }> = ({ active }) => {
    if (!active) return null;

    return (
        <group visible={true}>
            {/* Handle - White, Protruding from Fist */}
            <mesh position={[0, -0.25, 0]}>
                <cylinderGeometry args={[0.035, 0.04, 0.6, 8]} />
                <meshToonMaterial color="white" />
                <Edges threshold={15} color="#999" />
            </mesh>
            
            {/* Blade Core */}
            <mesh position={[0, 1.6, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 2.8, 8]} />
                <meshBasicMaterial color="white" />
            </mesh>
            
            {/* Blade Glow */}
            <mesh position={[0, 1.6, 0]}>
                <cylinderGeometry args={[0.12, 0.12, 3.0, 8]} />
                <meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
        </group>
    );
};

interface PosableUnitProps {
    pose: MechPose;
    weapon: 'GUN' | 'SABER';
}

export const PosableUnit: React.FC<PosableUnitProps> = ({ pose, weapon }) => {
    const armorColor = '#eeeeee';
    const chestColor = '#2244aa';
    const feetColor = '#aa2222';

    return (
        <group position={[0, -1, 0]}> {/* Center vertically */}
            <group position={[0, 2.0, 0]}>
                {/* WAIST / TORSO BASE */}
                <group rotation={[pose.TORSO.x, pose.TORSO.y, pose.TORSO.z]}>
                    <mesh position={[0, 0, 0]}>
                        <boxGeometry args={[0.6, 0.5, 0.5]} />
                        <meshToonMaterial color="#ff0000" />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    
                    {/* CHEST / UPPER BODY */}
                    <group position={[0, 0.65, 0]} rotation={[pose.CHEST.x, pose.CHEST.y, pose.CHEST.z]}>
                        <mesh>
                            <boxGeometry args={[0.9, 0.7, 0.7]} />
                            <meshToonMaterial color={chestColor} /> 
                            <Edges threshold={15} color="black" />
                        </mesh>
                        {/* Vents */}
                        <group position={[0.28, 0.1, 0.36]}>
                            <mesh><boxGeometry args={[0.35, 0.25, 0.05]} /><meshToonMaterial color="#ffaa00" /><Edges threshold={15} color="black" /></mesh>
                            {[...Array(5)].map((_, index) => ( <mesh key={index} position={[0, 0.12 - index * 0.05, 0.03]}><boxGeometry args={[0.33, 0.02, 0.02]} /><meshStandardMaterial color="#111" metalness={0.4} roughness={0.3} /></mesh> ))}
                        </group>
                        <group position={[-0.28, 0.1, 0.36]}>
                            <mesh><boxGeometry args={[0.35, 0.25, 0.05]} /><meshToonMaterial color="#ffaa00" /><Edges threshold={15} color="black" /></mesh>
                            {[...Array(5)].map((_, index) => ( <mesh key={index} position={[0, 0.12 - index * 0.05, 0.03]}><boxGeometry args={[0.33, 0.02, 0.02]} /><meshStandardMaterial color="#111" metalness={0.4} roughness={0.3} /></mesh> ))}
                        </group>

                        {/* HEAD */}
                        <group rotation={[pose.HEAD.x, pose.HEAD.y, pose.HEAD.z]}>
                            <MechaHead mainColor={armorColor} />
                        </group>

                        {/* RIGHT ARM CHAIN */}
                        <group position={[0.65, 0.1, 0]} rotation={[pose.RIGHT_ARM.SHOULDER.x, pose.RIGHT_ARM.SHOULDER.y, pose.RIGHT_ARM.SHOULDER.z]}>
                            {/* Shoulder */}
                            <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            
                            {/* Elbow */}
                            <group position={[0, -0.4, 0]} rotation={[pose.RIGHT_ARM.ELBOW.x, pose.RIGHT_ARM.ELBOW.y, pose.RIGHT_ARM.ELBOW.z]}>
                                {/* Inner Skeleton */}
                                <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                
                                {/* Forearm Twist */}
                                <group rotation={[pose.RIGHT_ARM.FOREARM.x, pose.RIGHT_ARM.FOREARM.y, pose.RIGHT_ARM.FOREARM.z]}>
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                        <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                        
                                        {/* Wrist / Fist */}
                                        <group position={[0, -0.35, 0]} rotation={[pose.RIGHT_ARM.WRIST.x, pose.RIGHT_ARM.WRIST.y, pose.RIGHT_ARM.WRIST.z]}>
                                            <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                        </group>
                                    </group>

                                    {/* Shield (Bound to Forearm) */}
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                        <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                            <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.1, 1.7, 0.7]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                            <mesh position={[0.06, 0.2, 0]}><boxGeometry args={[0.05, 1.5, 0.5]} /><meshToonMaterial color="#ff0000" /></mesh>
                                        </group>
                                    </group>
                                </group>
                            </group>
                        </group>

                        {/* LEFT ARM CHAIN */}
                        <group position={[-0.65, 0.1, 0]} rotation={[pose.LEFT_ARM.SHOULDER.x, pose.LEFT_ARM.SHOULDER.y, pose.LEFT_ARM.SHOULDER.z]}>
                            {/* Shoulder */}
                            <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            
                            {/* Elbow */}
                            <group position={[0, -0.4, 0]} rotation={[pose.LEFT_ARM.ELBOW.x, pose.LEFT_ARM.ELBOW.y, pose.LEFT_ARM.ELBOW.z]}>
                                {/* Inner Skeleton */}
                                <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                
                                {/* Forearm Twist */}
                                <group rotation={[pose.LEFT_ARM.FOREARM.x, pose.LEFT_ARM.FOREARM.y, pose.LEFT_ARM.FOREARM.z]}>
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                        <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                        
                                        {/* Wrist / Fist */}
                                        <group position={[0, -0.35, 0]} rotation={[pose.LEFT_ARM.WRIST.x, pose.LEFT_ARM.WRIST.y, pose.LEFT_ARM.WRIST.z]}>
                                            <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                            {/* Beam Saber - Held in Fist */}
                                            {weapon === 'SABER' && (
                                                <group position={[0, 0, 0.1]} rotation={[Math.PI/1.8, 0, 0]}>
                                                    <BeamSaber active={true} />
                                                </group>
                                            )}
                                        </group>

                                        {/* Gun - Bound to Forearm */}
                                        {weapon === 'GUN' && (
                                            <group position={[0, -0.2, 0.3]} rotation={[1.5, 0, Math.PI]}>
                                                <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.1, 0.2, 0.15]} /><meshToonMaterial color="#222" /></mesh>
                                                <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                                <mesh position={[0, 0.2, 1.0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6]} /><meshToonMaterial color="#222" /></mesh>
                                                <mesh position={[0.05, 0.35, 0.2]}><cylinderGeometry args={[0.08, 0.08, 0.3, 8]} rotation={[Math.PI/2, 0, 0]}/><meshToonMaterial color="#222" />
                                                    <mesh position={[0, 0.15, 0]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.06]} /><meshBasicMaterial color="#00ff00" /></mesh>
                                                </mesh>
                                            </group>
                                        )}
                                    </group>
                                </group>
                            </group>
                        </group>

                        {/* BACKPACK */}
                        <group position={[0, 0.2, -0.4]}>
                            <mesh><boxGeometry args={[0.7, 0.8, 0.4]} /><meshToonMaterial color="#333" /><Edges threshold={15} color="black" /></mesh>
                            <mesh position={[0.3, 0.5, 0]} rotation={[0.2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5]} /><meshToonMaterial color="white" /><Edges threshold={15} color="black" /></mesh>
                            <mesh position={[-0.3, 0.5, 0]} rotation={[0.2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5]} /><meshToonMaterial color="white" /><Edges threshold={15} color="black" /></mesh>
                            <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /></group>
                            <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /></group>
                        </group>
                    </group>
                </group>

                {/* LEGS GROUP */}
                <group>
                    <group position={[0.25, -0.3, 0]} rotation={[pose.RIGHT_LEG.THIGH.x, pose.RIGHT_LEG.THIGH.y, pose.RIGHT_LEG.THIGH.z]}>
                        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        <group position={[0, -0.75, 0]} rotation={[pose.RIGHT_LEG.KNEE, 0, 0]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            {/* Knee Pad - Sibling now */}
                            <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            <group position={[0, -0.8, 0.05]} rotation={[pose.RIGHT_LEG.ANKLE.x, pose.RIGHT_LEG.ANKLE.y, pose.RIGHT_LEG.ANKLE.z]}>
                                <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><meshToonMaterial color={feetColor} /><Edges threshold={15} color="black" /></mesh>
                            </group>
                        </group>
                    </group>

                    <group position={[-0.25, -0.3, 0]} rotation={[pose.LEFT_LEG.THIGH.x, pose.LEFT_LEG.THIGH.y, pose.LEFT_LEG.THIGH.z]}>
                        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        <group position={[0, -0.75, 0]} rotation={[pose.LEFT_LEG.KNEE, 0, 0]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            {/* Knee Pad - Sibling now */}
                            <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            <group position={[0, -0.8, 0.05]} rotation={[pose.LEFT_LEG.ANKLE.x, pose.LEFT_LEG.ANKLE.y, pose.LEFT_LEG.ANKLE.z]}>
                                <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><meshToonMaterial color={feetColor} /><Edges threshold={15} color="black" /></mesh>
                            </group>
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
};
