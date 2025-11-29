import React, { useMemo } from 'react';
import { AdditiveBlending ,BoxGeometry} from 'three';
import { useGLTF } from '@react-three/drei';
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
                      <mesh geometry={nodes.Polygon_55.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#00ff00" /></mesh>
                      <mesh geometry={nodes.Polygon_56.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#00ff00" /></mesh>
                      <mesh geometry={nodes.Polygon_57.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ff0000" /></mesh>
                      <mesh geometry={nodes.Polygon_58.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}><meshToonMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_59.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ffff00" /></mesh>
                      <mesh geometry={nodes.Polygon_60.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#000000" /></mesh>
                      <mesh geometry={nodes.Polygon_61.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ff0000" /></mesh>
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

// --- TRAPEZOID COMPONENT ---
const Trapezoid: React.FC<{ args: number[], color: string }> = ({ args, color }) => {
    const [width, height, depth, topScaleX, topScaleZ] = args;
    
    const geometry = useMemo(() => {
        const geo = new BoxGeometry(width, height, depth);
        const posAttribute = geo.attributes.position;
        const positions = posAttribute.array;
        
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i+1];
            if (y > 0) {
                positions[i] *= topScaleX;
                positions[i+2] *= topScaleZ;
            }
        }
        geo.computeVertexNormals();
        return geo;
    }, [width, height, depth, topScaleX, topScaleZ]);

    return (
        <mesh geometry={geometry}>
            <meshToonMaterial color={color} />
        </mesh>
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
    const waistColor = '#ff0000';

    return (
        <group position={[0, -1, 0]}> {/* Center vertically */}
            <group position={[0, 2.0, 0]}>
                {/* TORSO GROUP (Waist Logic + Visuals) */}
                <group rotation={[pose.TORSO.x, pose.TORSO.y, pose.TORSO.z]}>
                    
                    {/* --- WAIST VISUALS (Trapezoid Armor) --- */}
                    <group position={[0, 0.26, -0.043]} rotation={[0, 0, 0]} scale={[0.8, 0.7, 0.9]}>
                        <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                    </group>
                    
                    <group position={[0, 0.021, -0.044]} rotation={[-3.143, 0, 0]} scale={[0.8, 0.9, 0.9]}>
                        <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                    </group>

                    {/* --- WAIST / HIP VISUALS (New Detailed Hip) --- */}
                    <group name="Hip">
                        {/* HIP_1 (Center Block) */}
                        <group position={[0, -0.296, 0]} scale={[0.4, 1, 1]}>
                            <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color="#444444" /></mesh>
                        </group>

                        {/* HIP_2 (Front Crotch Armor) */}
                        <group position={[0, -0.318, 0.365]} rotation={[-1.571, -1.571, 0]} scale={[1, 0.8, 1.3]}>
                            <Trapezoid args={[0.1, 0.3, 0.15, 4.45, 1]} color={armorColor} />
                        </group>

                        {/* HIP_3 (Upper Front) */}
                        <group position={[0, -0.125, 0.257]} scale={[1, 0.8, 1.1]}>
                            <Trapezoid args={[0.2, 0.2, 0.25, 1, 0.45]} color={armorColor} />
                        </group>

                        {/* HIP_4 (Red Trim Top) */}
                        <group position={[0, -0.125, 0.356]} rotation={[1.13, 0, 0]} scale={[0.9, 0.5, 1]}>
                            <mesh><boxGeometry args={[0.2, 0.05, 0.15]} /><meshToonMaterial color="#ff0000" /></mesh>
                        </group>

                        {/* HIP_5 (Red Trim Bottom) */}
                        <group position={[0, -0.207, 0.408]} rotation={[0.6, 0, 0]} scale={[0.9, 0.4, 0.8]}>
                            <mesh><boxGeometry args={[0.2, 0.05, 0.2]} /><meshToonMaterial color="#ff0000" /></mesh>
                        </group>

                        {/* HIP_6 (Front Skirt Left) */}
                        <group position={[0.037, 0, 0.077]} rotation={[0, -0.1, -0.1]} scale={[0.9, 1, 1]}>
                            <group position={[-0.303, -0.266, 0.253]} rotation={[0, 0, -1.6]}>
                                <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                            </group>
                            <group position={[-0.299, -0.096, 0.253]}>
                                <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[-0.298, -0.215, 0.32]} rotation={[1.571, 0, 0]}>
                                {/* Prism: Cylinder with 4 segments rotated 45 deg */}
                                <mesh rotation={[0, Math.PI/4, 0]}>
                                    <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                    <meshToonMaterial color="#ffaa00" />
                                </mesh>
                            </group>
                        </group>

                        {/* HIP_7 (Front Skirt Right) */}
                        <group position={[-0.037, 0, 0.077]} rotation={[0, 0.1, 0.1]} scale={[0.9, 1, 1]}>
                            <group position={[0.303, -0.266, 0.253]} rotation={[0, 0, 1.6]}>
                                <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                            </group>
                            <group position={[0.299, -0.096, 0.253]}>
                                <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[0.298, -0.215, 0.32]} rotation={[1.571, 0, 0]}>
                                <mesh rotation={[0, Math.PI/4, 0]}>
                                    <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                    <meshToonMaterial color="#ffaa00" />
                                </mesh>
                            </group>
                        </group>

                        {/* HIP_8 (Rear Skirt Left) */}
                        <group position={[-0.037, 0, 0.121]} rotation={[0, -0.1, 0.1]} scale={[0.9, 1, 1]}>
                            <group position={[0.303, -0.266, -0.418]} rotation={[0, 0, 1.6]}>
                                <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                            </group>
                            <group position={[0.299, -0.096, -0.418]}>
                                <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[0.298, -0.215, -0.475]} rotation={[-1.571, 0, 0]}>
                                <mesh rotation={[0, Math.PI/4, 0]}>
                                    <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                    <meshToonMaterial color="#ffaa00" />
                                </mesh>
                            </group>
                        </group>

                        {/* HIP_9 (Rear Skirt Right) */}
                        <group position={[0.037, 0, 0.121]} rotation={[0, 0.1, -0.1]} scale={[0.9, 1, 1]}>
                            <group position={[-0.303, -0.266, -0.418]} rotation={[0, 0, -1.6]}>
                                <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                            </group>
                            <group position={[-0.299, -0.096, -0.418]}>
                                <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[-0.298, -0.215, -0.475]} rotation={[-1.571, 0, 0]}>
                                <mesh rotation={[0, Math.PI/4, 0]}>
                                    <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                    <meshToonMaterial color="#ffaa00" />
                                </mesh>
                            </group>
                        </group>

                        {/* HIP_10 (Back Butt Plate) */}
                        <group position={[0, 0, -1.522]}>
                            <group position={[0, -0.211, 1.2]}>
                                <mesh><boxGeometry args={[0.2, 0.35, 0.2]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[0, -0.369, 1.2]} rotation={[-1.571, 0, 0]}>
                                <Trapezoid args={[0.2, 0.2, 0.4, 1, 0.25]} color={armorColor} />
                            </group>
                        </group>

                        {/* HIP_11 (Side Skirt Left) */}
                        <group scale={[0.9, 1, 1]}>
                            <group position={[0.48, -0.178, 0]} rotation={[0, 0, 0.3]}>
                                <mesh><boxGeometry args={[0.1, 0.4, 0.4]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[0.506, -0.088, 0]} rotation={[0, 0, 0.3]}>
                                <mesh><boxGeometry args={[0.1, 0.3, 0.25]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                        </group>

                        {/* HIP_12 (Side Skirt Right) */}
                        <group scale={[0.9, 1, 1]}>
                            <group position={[-0.48, -0.178, 0]} rotation={[0, 0, -0.3]}>
                                <mesh><boxGeometry args={[0.1, 0.4, 0.4]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                            <group position={[-0.506, -0.088, 0]} rotation={[0, 0, -0.3]}>
                                <mesh><boxGeometry args={[0.1, 0.3, 0.25]} /><meshToonMaterial color={armorColor} /></mesh>
                            </group>
                        </group>
                    </group>

                    {/* Hidden Logic Box */}
                    <mesh position={[0, 0, 0]} visible={false}>
                        <boxGeometry args={[0.1, 0.1, 0.1]} />
                        <meshBasicMaterial color="red" />
                    </mesh>
                    
                    {/* CHEST LOGIC GROUP (Rotation only) */}
                    <group position={[0, 0.65, 0]} rotation={[pose.CHEST.x, pose.CHEST.y, pose.CHEST.z]}>
                        
                        {/* CHEST VISUALS GROUP */}
                        <group name="ChestVisuals">
                            {/* CHEST_1 */}
                            <group position={[0, 0.013, -0.043]} rotation={[0, 0, 0]} scale={[1.5, 1.2, 0.8]}>
                                 <mesh>
                                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                                    <meshToonMaterial color={chestColor} />
                                 </mesh>
                            </group>

                            {/* CHEST_2 */}
                            <group position={[0, 0.321, -0.016]} rotation={[0, 0, 0]} scale={[0.8, 0.1, 0.7]}>
                                 <mesh>
                                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                                    <meshToonMaterial color="#ffaa00" />
                                 </mesh>
                            </group>

                            {/* CHEST_3 */}
                            <group position={[0, -0.025, 0.236]} rotation={[1.9, 0, 0]} scale={[1.5, 1, 1.5]}>
                                <Trapezoid args={[0.5, 0.35, 0.35, 1, 0.45]} color={chestColor} />
                            </group>

                            {/* CHEST_4 */}
                            <group position={[0, 0.254, 0.215]} rotation={[2.21, -1.572, 0]} scale={[0.8, 1, 1]}>
                                <Trapezoid args={[0.1, 0.2, 0.4, 1, 0.4]} color="#ffaa00" />
                            </group>

                            {/* chest_plate */}
                            <group position={[0, -0.264, 0.29]} rotation={[0.3, 0, 0]} scale={[0.4, 1.6, 0.3]}>
                                <Trapezoid args={[0.5, 0.55, 0.15, 1, 5.85]} color={chestColor} />
                            </group>
                            
                            {/* vent_l */}
                            <group position={[0.226, -0.088, 0.431]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                                 <mesh>
                                    <boxGeometry args={[0.35, 0.25, 0.05]} />
                                    <meshToonMaterial color="#ffaa00" />
                                 </mesh>
                            </group>

                            {/* vent_r */}
                            <group position={[-0.225, -0.091, 0.43]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                                 <mesh>
                                    <boxGeometry args={[0.35, 0.25, 0.05]} />
                                    <meshToonMaterial color="#ffaa00" />
                                 </mesh>
                            </group>
                        </group>

                        {/* HEAD (Child of Logic Group) */}
                        <group rotation={[pose.HEAD.x, pose.HEAD.y, pose.HEAD.z]}>
                            <MechaHead mainColor={armorColor} />
                        </group>

                        {/* RIGHT ARM CHAIN (Child of Logic Group) */}
                        <group position={[0.65, 0.1, 0]} rotation={[pose.RIGHT_ARM.SHOULDER.x, pose.RIGHT_ARM.SHOULDER.y, pose.RIGHT_ARM.SHOULDER.z]}>
                            {/* Shoulder */}
                            <group position={[0.034, 0, 0.011]}>
                                {/* R Shoulder_1 */}
                                 <group position={[0.013, 0.032, -0.143]} scale={[1, 0.7, 0.8]}>
                                    <mesh>
                                        <boxGeometry args={[0.5, 0.5, 0.5]} />
                                        <meshToonMaterial color={armorColor} />
                                    </mesh>
                                 </group>
                            </group>
                            <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /></mesh>
                            
                            {/* Elbow */}
                            <group position={[0, -0.4, 0]} rotation={[pose.RIGHT_ARM.ELBOW.x, pose.RIGHT_ARM.ELBOW.y, pose.RIGHT_ARM.ELBOW.z]}>
                                {/* Inner Skeleton */}
                                <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /></mesh>
                                
                                {/* Forearm Twist */}
                                <group rotation={[pose.RIGHT_ARM.FOREARM.x, pose.RIGHT_ARM.FOREARM.y, pose.RIGHT_ARM.FOREARM.z]}>
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                        <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /></mesh>
                                        
                                        {/* Wrist / Fist */}
                                        <group position={[0, -0.35, 0]} rotation={[pose.RIGHT_ARM.WRIST.x, pose.RIGHT_ARM.WRIST.y, pose.RIGHT_ARM.WRIST.z]}>
                                            <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                        </group>
                                    </group>

                                    {/* Shield (Bound to Forearm) */}
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                        <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                            <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.1, 1.7, 0.7]} /><meshToonMaterial color={armorColor} /></mesh>
                                            <mesh position={[0.06, 0.2, 0]}><boxGeometry args={[0.05, 1.5, 0.5]} /><meshToonMaterial color="#ff0000" /></mesh>
                                        </group>
                                    </group>
                                </group>
                            </group>
                        </group>

                        {/* LEFT ARM CHAIN (Child of Logic Group) */}
                        <group position={[-0.65, 0.1, 0]} rotation={[pose.LEFT_ARM.SHOULDER.x, pose.LEFT_ARM.SHOULDER.y, pose.LEFT_ARM.SHOULDER.z]}>
                            {/* Shoulder */}
                            <group position={[-0.039, 0.047, -0.127]} scale={[1, 0.7, 0.8]}>
                                {/* L Shoulder_1 */}
                                 <mesh>
                                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                                    <meshToonMaterial color={armorColor} />
                                 </mesh>
                             </group>
                            <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /></mesh>
                            
                            {/* Elbow */}
                            <group position={[0, -0.4, 0]} rotation={[pose.LEFT_ARM.ELBOW.x, pose.LEFT_ARM.ELBOW.y, pose.LEFT_ARM.ELBOW.z]}>
                                {/* Inner Skeleton */}
                                <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /></mesh>
                                
                                {/* Forearm Twist */}
                                <group rotation={[pose.LEFT_ARM.FOREARM.x, pose.LEFT_ARM.FOREARM.y, pose.LEFT_ARM.FOREARM.z]}>
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                        <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /></mesh>
                                        
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
                                                <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><meshToonMaterial color="#444" /></mesh>
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
                        <group position={[0, -0.056, -0.365]}>
                            <mesh><boxGeometry args={[0.7, 0.8, 0.3]} /><meshToonMaterial color="#333" /></mesh>
                            <mesh position={[0.324, 0.5, 0]} rotation={[0.2, 0, -0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><meshToonMaterial color="white" /></mesh>
                            <mesh position={[-0.324, 0.5, 0]} rotation={[0.2, 0, 0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><meshToonMaterial color="white" /></mesh>
                            <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /></group>
                            <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /></group>
                        </group>
                    </group>
                </group>

                {/* LEGS GROUP */}
                <group>
                    <group position={[0.25, -0.3, 0]} rotation={[pose.RIGHT_LEG.THIGH.x, pose.RIGHT_LEG.THIGH.y, pose.RIGHT_LEG.THIGH.z]}>
                        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><meshToonMaterial color={armorColor} /></mesh>
                        <group position={[0, -0.75, 0]} rotation={[pose.RIGHT_LEG.KNEE, 0, 0]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><meshToonMaterial color={armorColor} /></mesh>
                            {/* Knee Pad - Sibling now */}
                            <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><meshToonMaterial color={armorColor} /></mesh>
                            <group position={[0, -0.8, 0.05]} rotation={[pose.RIGHT_LEG.ANKLE.x, pose.RIGHT_LEG.ANKLE.y, pose.RIGHT_LEG.ANKLE.z]}>
                                <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><meshToonMaterial color={feetColor} /></mesh>
                            </group>
                        </group>
                    </group>

                    <group position={[-0.25, -0.3, 0]} rotation={[pose.LEFT_LEG.THIGH.x, pose.LEFT_LEG.THIGH.y, pose.LEFT_LEG.THIGH.z]}>
                        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><meshToonMaterial color={armorColor} /></mesh>
                        <group position={[0, -0.75, 0]} rotation={[pose.LEFT_LEG.KNEE, 0, 0]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><meshToonMaterial color={armorColor} /></mesh>
                            {/* Knee Pad - Sibling now */}
                            <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><meshToonMaterial color={armorColor} /></mesh>
                            <group position={[0, -0.8, 0.05]} rotation={[pose.LEFT_LEG.ANKLE.x, pose.LEFT_LEG.ANKLE.y, pose.LEFT_LEG.ANKLE.z]}>
                                <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><meshToonMaterial color={feetColor} /></mesh>
                            </group>
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
};