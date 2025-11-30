
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, Color, Vector3, Group, AdditiveBlending, MathUtils } from 'three';
import { useGLTF } from '@react-three/drei';
import { MechPose, RotationVector } from '../types';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- CUSTOM FRESNEL TOON SHADER ---
const MechMaterial: React.FC<{ color: string, rimColor?: string, rimPower?: number, rimIntensity?: number }> = ({ 
    color, 
    rimColor = "#44aaff", 
    rimPower = 2.5,       
    rimIntensity = 0.8    
}) => {
    const uniforms = useMemo(() => ({
        uColor: { value: new Color(color) },
        uRimColor: { value: new Color(rimColor) },
        uRimPower: { value: rimPower },
        uRimIntensity: { value: rimIntensity },
        uLightDir: { value: new Vector3(0.5, 0.8, 0.8).normalize() },
    }), [color, rimColor, rimPower, rimIntensity]);

    const vertexShader = `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const fragmentShader = `
        uniform vec3 uColor;
        uniform vec3 uRimColor;
        uniform float uRimPower;
        uniform float uRimIntensity;
        uniform vec3 uLightDir;
        
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            
            // Toon Shading
            float NdotL = dot(normal, uLightDir);
            float lightIntensity = smoothstep(-0.2, 0.2, NdotL);
            vec3 baseColor = mix(uColor * 0.4, uColor, lightIntensity); 

            // Fresnel Rim
            float NdotV = dot(normal, viewDir);
            float rim = 1.0 - max(NdotV, 0.0);
            rim = pow(rim, uRimPower);
            
            vec3 finalColor = baseColor + (uRimColor * rim * uRimIntensity);
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;

    return <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />;
};

// --- GEOMETRY FACTORY ---
const GeoFactory = {
    box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
    trapz: (args: number[]) => {
        const [w, h, d, tx, tz] = args;
        const g = new THREE.BoxGeometry(w, h, d);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) > 0) {
                pos.setX(i, pos.getX(i) * tx);
                pos.setZ(i, pos.getZ(i) * tz);
            }
        }
        g.computeVertexNormals();
        return g;
    },
    prism: (args: number[]) => {
        const g = new THREE.CylinderGeometry(args[0], args[1], args[2], 4);
        g.rotateY(Math.PI / 4);
        return g;
    }
};

// --- HIP VISUALS ---
const HipVisuals = React.memo(({ armorColor, feetColor, waistColor }: { armorColor: string, feetColor: string, waistColor: string }) => {
    const { whiteGeo, darkGeo, redGeo, yellowGeo } = useMemo(() => {
        const buckets: Record<string, THREE.BufferGeometry[]> = { white: [], dark: [], red: [], yellow: [] };
        const add = (geo: THREE.BufferGeometry, bucketKey: string, local: { p: number[], r: number[], s: number[] }, parent?: { p: number[], r: number[], s: number[] }) => {
            if (local.s) geo.scale(local.s[0], local.s[1], local.s[2]);
            if (local.r) { geo.rotateZ(local.r[2]); geo.rotateY(local.r[1]); geo.rotateX(local.r[0]); }
            if (local.p) geo.translate(local.p[0], local.p[1], local.p[2]);
            if (parent) {
                if (parent.s) geo.scale(parent.s[0], parent.s[1], parent.s[2]);
                if (parent.r) { 
                     const parentRot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(parent.r[0], parent.r[1], parent.r[2], 'XYZ'));
                     geo.applyMatrix4(parentRot);
                }
                if (parent.p) geo.translate(parent.p[0], parent.p[1], parent.p[2]);
            }
            buckets[bucketKey].push(geo);
        };

        // HIP_1 (Dark)
        add(GeoFactory.box(0.5, 0.5, 0.5), 'dark', { p:[0, -0.296, 0], r:[0,0,0], s:[0.4, 1, 1] });

        // HIP_2 (White) - Front Crotch
        add(GeoFactory.trapz([0.1, 0.3, 0.15, 4.45, 1]), 'white', { p:[0, -0.318, 0.365], r:[-1.571, -1.571, 0], s:[1, 0.8, 1.3] });

        // HIP_3 (White)
        add(GeoFactory.trapz([0.2, 0.2, 0.25, 1, 0.45]), 'white', { p:[0, -0.125, 0.257], r:[0,0,0], s:[1, 0.8, 1.1] });

        // HIP_4 (Red)
        add(GeoFactory.box(0.2, 0.05, 0.15), 'red', { p:[0, -0.125, 0.356], r:[1.13, 0, 0], s:[0.9, 0.5, 1] });

        // HIP_5 (Red)
        add(GeoFactory.box(0.2, 0.05, 0.2), 'red', { p:[0, -0.207, 0.408], r:[0.6, 0, 0], s:[0.9, 0.4, 0.8] });

        // HIP_6 (Front Left)
        const p6 = { p: [0.037, 0, 0.077], r: [0, -0.1, -0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[-0.303, -0.266, 0.253], r:[0, 0, -1.6], s:[1,1,1] }, p6);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[-0.299, -0.096, 0.253], r:[0,0,0], s:[1,1,1] }, p6);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[-0.298, -0.215, 0.32], r:[1.571, 0, 0], s:[1,1,1] }, p6);

        // HIP_7 (Front Right)
        const p7 = { p: [-0.037, 0, 0.077], r: [0, 0.1, 0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[0.303, -0.266, 0.253], r:[0, 0, 1.6], s:[1,1,1] }, p7);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[0.299, -0.096, 0.253], r:[0,0,0], s:[1,1,1] }, p7);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[0.298, -0.215, 0.32], r:[1.571, 0, 0], s:[1,1,1] }, p7);

        // HIP_8 (Rear Left)
        const p8 = { p: [-0.037, 0, 0.121], r: [0, -0.1, 0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[0.303, -0.266, -0.418], r:[0, 0, 1.6], s:[1,1,1] }, p8);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[0.299, -0.096, -0.418], r:[0,0,0], s:[1,1,1] }, p8);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[0.298, -0.215, -0.475], r:[-1.571, 0, 0], s:[1,1,1] }, p8);

        // HIP_9 (Rear Right)
        const p9 = { p: [0.037, 0, 0.121], r: [0, 0.1, -0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[-0.303, -0.266, -0.418], r:[0, 0, -1.6], s:[1,1,1] }, p9);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[-0.299, -0.096, -0.418], r:[0,0,0], s:[1,1,1] }, p9);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[-0.298, -0.215, -0.475], r:[-1.571, 0, 0], s:[1,1,1] }, p9);

        // HIP_10 (Back Butt Plate)
        const p10 = { p: [0, 0, -1.522], r: [0,0,0], s: [1,1,1] };
        add(GeoFactory.box(0.2, 0.35, 0.2), 'white', { p:[0, -0.211, 1.2], r:[0,0,0], s:[1,1,1] }, p10);
        add(GeoFactory.trapz([0.2, 0.2, 0.4, 1, 0.25]), 'white', { p:[0, -0.369, 1.2], r:[-1.571, 0, 0], s:[1,1,1] }, p10);

        // HIP_11 (Side Skirt Left)
        const p11 = { p: [0,0,0], r: [0,0,0], s: [0.9, 1, 1] };
        add(GeoFactory.box(0.1, 0.4, 0.4), 'white', { p:[0.48, -0.178, 0], r:[0, 0, 0.3], s:[1,1,1] }, p11);
        add(GeoFactory.box(0.1, 0.3, 0.25), 'white', { p:[0.506, -0.088, 0], r:[0, 0, 0.3], s:[1,1,1] }, p11);

        // HIP_12 (Side Skirt Right)
        const p12 = { p: [0,0,0], r: [0,0,0], s: [0.9, 1, 1] };
        add(GeoFactory.box(0.1, 0.4, 0.4), 'white', { p:[-0.48, -0.178, 0], r:[0, 0, -0.3], s:[1,1,1] }, p12);
        add(GeoFactory.box(0.1, 0.3, 0.25), 'white', { p:[-0.506, -0.088, 0], r:[0, 0, -0.3], s:[1,1,1] }, p12);

        const merge = (arr: THREE.BufferGeometry[]) => arr.length > 0 ? BufferGeometryUtils.mergeGeometries(arr) : null;

        return {
            whiteGeo: merge(buckets.white),
            darkGeo: merge(buckets.dark),
            redGeo: merge(buckets.red),
            yellowGeo: merge(buckets.yellow)
        };
    }, []);

    return (
        <group name="HipMerged">
            {darkGeo && <mesh geometry={darkGeo}><MechMaterial color="#444444" /></mesh>}
            {whiteGeo && <mesh geometry={whiteGeo}><MechMaterial color={armorColor} /></mesh>}
            {redGeo && <mesh geometry={redGeo}><MechMaterial color="#ff0000" /></mesh>}
            {yellowGeo && <mesh geometry={yellowGeo}><MechMaterial color="#ffaa00" /></mesh>}
        </group>
    );
});

const MODEL_PATH = '/models/head.glb';
useGLTF.preload(MODEL_PATH);

const MechaHead: React.FC<{ mainColor: string }> = ({ mainColor }) => {
    const { nodes } = useGLTF(MODEL_PATH) as any;
    const meshProps = {};

    return (
        <group position={[-0.08, 0.4, 0.1]} >
            <group dispose={null}>
                <group position={[-0, -0.28, -0]} scale={0.02}>
                    <group rotation={[Math.PI / 2, 0, 0]}>
                      <mesh geometry={nodes.Polygon_35.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps} > <MechMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_55.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#00ff00" /></mesh>
                      <mesh geometry={nodes.Polygon_56.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#00ff00" /></mesh>
                      <mesh geometry={nodes.Polygon_57.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#ff0000" /></mesh>
                      <mesh geometry={nodes.Polygon_58.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}><MechMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_59.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#ffff00" /></mesh>
                      <mesh geometry={nodes.Polygon_60.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#000000" /></mesh>
                      <mesh geometry={nodes.Polygon_61.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#ff0000" /></mesh>
                    </group>
                </group>
            </group>
        </group>
    );
};

// --- TRAPEZOID COMPONENT ---
const Trapezoid: React.FC<{ args: number[], color: string }> = ({ args, color }) => {
    const [width, height, depth, topScaleX, topScaleZ] = args;
    
    // Use useMemo for geometry to ensure stable reference for Edges
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
            <MechMaterial color={color} />
        </mesh>
    );
};


export const PosableUnit: React.FC<{ pose: MechPose, weapon: 'GUN' | 'SABER' }> = ({ pose, weapon }) => {
    // Refs
    const torsoRef = useRef<Group>(null);
    const upperBodyRef = useRef<Group>(null);
    const headRef = useRef<Group>(null);
    const gunArmRef = useRef<Group>(null);
    const leftForeArmRef = useRef<Group>(null);
    const leftForearmTwistRef = useRef<Group>(null);
    const leftWristRef = useRef<Group>(null);
    const rightArmRef = useRef<Group>(null);
    const rightForeArmRef = useRef<Group>(null);
    const rightForearmTwistRef = useRef<Group>(null);
    const rightWristRef = useRef<Group>(null);
    const legsRef = useRef<Group>(null);
    const rightLegRef = useRef<Group>(null);
    const rightLowerLegRef = useRef<Group>(null);
    const rightFootRef = useRef<Group>(null);
    const leftLegRef = useRef<Group>(null);
    const leftLowerLegRef = useRef<Group>(null);
    const leftFootRef = useRef<Group>(null);
    const shieldRef = useRef<Group>(null);

    // Apply Pose
    useFrame(() => {
        if (!torsoRef.current) return;
        
        const applyRot = (ref: React.MutableRefObject<Group | null>, rot: RotationVector) => {
            if (ref.current) ref.current.rotation.set(rot.x, rot.y, rot.z);
        };

        applyRot(torsoRef, pose.TORSO);
        applyRot(upperBodyRef, pose.CHEST);
        applyRot(headRef, pose.HEAD);

        applyRot(gunArmRef, pose.LEFT_ARM.SHOULDER);
        applyRot(leftForeArmRef, pose.LEFT_ARM.ELBOW);
        applyRot(leftForearmTwistRef, pose.LEFT_ARM.FOREARM);
        applyRot(leftWristRef, pose.LEFT_ARM.WRIST);

        applyRot(rightArmRef, pose.RIGHT_ARM.SHOULDER);
        applyRot(rightForeArmRef, pose.RIGHT_ARM.ELBOW);
        applyRot(rightForearmTwistRef, pose.RIGHT_ARM.FOREARM);
        applyRot(rightWristRef, pose.RIGHT_ARM.WRIST);

        applyRot(leftLegRef, pose.LEFT_LEG.THIGH);
        if (leftLowerLegRef.current) leftLowerLegRef.current.rotation.x = pose.LEFT_LEG.KNEE;
        applyRot(leftFootRef, pose.LEFT_LEG.ANKLE);

        applyRot(rightLegRef, pose.RIGHT_LEG.THIGH);
        if (rightLowerLegRef.current) rightLowerLegRef.current.rotation.x = pose.RIGHT_LEG.KNEE;
        applyRot(rightFootRef, pose.RIGHT_LEG.ANKLE);
        
        if (shieldRef.current && pose.SHIELD) {
            shieldRef.current.position.set(pose.SHIELD.POSITION.x, pose.SHIELD.POSITION.y, pose.SHIELD.POSITION.z);
            shieldRef.current.rotation.set(pose.SHIELD.ROTATION.x, pose.SHIELD.ROTATION.y, pose.SHIELD.ROTATION.z);
        }
    });

    const armorColor = '#eeeeee';
    const feetColor = '#aa2222';
    const waistColor = '#ff0000';
    const chestColor = '#2244aa';

    return (
    <group position={[0, 2.0, 0]}>
        {/* TORSO GROUP */}
        <group ref={torsoRef}>
            <group position={[0, 0.26, -0.043]} rotation={[0, 0, 0]} scale={[0.8, 0.7, 0.9]}>
                <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
            </group>
            <group position={[0, 0.021, -0.044]} rotation={[-3.143, 0, 0]} scale={[0.8, 0.9, 0.9]}>
                <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
            </group>
            <HipVisuals armorColor={armorColor} feetColor={feetColor} waistColor={waistColor} />

            {/* CHEST */}
            <group ref={upperBodyRef} position={[0, 0.65, 0]}>
                 {/* CHEST VISUALS GROUP */}
                 <group name="ChestVisuals">
                        <group position={[0, 0.013, -0.043]} rotation={[0, 0, 0]} scale={[1.5, 1.2, 0.8]}>
                             <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><MechMaterial color={chestColor} /></mesh>
                        </group>
                        <group position={[0, 0.321, -0.016]} rotation={[0, 0, 0]} scale={[0.8, 0.1, 0.7]}>
                             <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><MechMaterial color="#ffaa00" /></mesh>
                        </group>
                        <group position={[0, -0.025, 0.236]} rotation={[1.9, 0, 0]} scale={[1.5, 1, 1.5]}>
                            <Trapezoid args={[0.5, 0.35, 0.35, 1, 0.45]} color={chestColor} />
                        </group>
                        <group position={[0, 0.254, 0.215]} rotation={[2.21, -1.572, 0]} scale={[0.8, 1, 1]}>
                            <Trapezoid args={[0.1, 0.2, 0.4, 1, 0.4]} color="#ffaa00" />
                        </group>
                        <group position={[0, -0.264, 0.29]} rotation={[0.3, 0, 0]} scale={[0.4, 1.6, 0.3]}>
                            <Trapezoid args={[0.5, 0.5, 0.25, 1, 5.85]} color={chestColor} />
                        </group>
                        <group position={[0.226, -0.088, 0.431]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                             <mesh><boxGeometry args={[0.35, 0.25, 0.05]} /><MechMaterial color="#ffaa00" /></mesh>
                        </group>
                        <group position={[-0.225, -0.091, 0.43]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                             <mesh><boxGeometry args={[0.35, 0.25, 0.05]} /><MechMaterial color="#ffaa00" /></mesh>
                        </group>
                 </group>

                {/* HEAD */}
                <group ref={headRef}>
                    <MechaHead mainColor={armorColor} />
                </group>

                {/* RIGHT ARM */}
                <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                    <group position={[0.034, 0, 0.011]}>
                        <group position={[0.013, 0.032, -0.143]} scale={[1, 0.7, 0.8]}>
                            <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><MechMaterial color={armorColor} /></mesh>
                        </group>
                    </group>
                    <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]} ref={rightForeArmRef}>
                        <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><MechMaterial color="#444" /></mesh>
                        <group ref={rightForearmTwistRef}>
                            <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><MechMaterial color={armorColor} /></mesh>
                                <group ref={rightWristRef} position={[0, -0.35, 0]}>
                                    <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><MechMaterial color="#222" /></mesh>
                                </group>
                            </group>
                            <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={shieldRef}>
                                <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                    <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.1, 1.7, 0.7]} /><MechMaterial color={armorColor} /></mesh>
                                    <mesh position={[0.06, 0, 0]}><boxGeometry args={[0.1, 1.55, 0.5]} /><MechMaterial color={waistColor} /></mesh>
                                </group>
                            </group>
                        </group>
                    </group>
                </group>

                {/* LEFT ARM */}
                <group position={[-0.65, 0.1, 0]} ref={gunArmRef} >
                    <group position={[-0.039, 0.047, -0.127]} scale={[1, 0.7, 0.8]}>
                        <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><MechMaterial color={armorColor} /></mesh>
                    </group>
                    <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]} ref={leftForeArmRef}>
                        <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><MechMaterial color="#444" /></mesh>
                        <group ref={leftForearmTwistRef}>
                            <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><MechMaterial color={armorColor} /></mesh>
                                <group ref={leftWristRef} position={[0, -0.35, 0]}>
                                    <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><MechMaterial color="#222" /></mesh>
                                    {/* SABER MODEL */}
                                    <group visible={weapon === 'SABER'} position={[0, 0, 0.1]} rotation={[Math.PI/1.8, 0, 0]}>
                                        <mesh position={[0, -0.25, 0]}><cylinderGeometry args={[0.035, 0.04, 0.7, 8]} /><MechMaterial color="white" /></mesh>
                                        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.05, 0.05, 2.4, 8]} /><meshBasicMaterial color="white" /></mesh>
                                        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.12, 0.12, 2.6, 8]} /><meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} /></mesh>
                                    </group>
                                </group>
                                <group visible={weapon === 'GUN'} position={[0, -0.2, 0.3]} rotation={[1.5, 0, Math.PI]}>
                                    <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.1, 0.2, 0.15]} /><MechMaterial color="#222" /></mesh>
                                    <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><MechMaterial color="#444" /></mesh>
                                    <mesh position={[0, 0.2, 1.0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6]} /><MechMaterial color="#222" /></mesh>
                                    <mesh position={[0.05, 0.35, 0.2]}><cylinderGeometry args={[0.08, 0.08, 0.3, 8]} rotation={[Math.PI/2, 0, 0]}/><MechMaterial color="#222" />
                                        <mesh position={[0, 0.15, 0]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.06]} /><meshBasicMaterial color="#00ff00" /></mesh>
                                    </mesh>
                                </group>
                            </group>
                        </group>
                    </group>
                </group>

                {/* BACKPACK */}
                <group position={[0, -0.056, -0.365]}>
                    <mesh><boxGeometry args={[0.7, 0.8, 0.3]} /><MechMaterial color="#333" /></mesh>
                    <mesh position={[0.324, 0.5, 0]} rotation={[0.2, 0, -0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><MechMaterial color="white" /></mesh>
                    <mesh position={[-0.324, 0.5, 0]} rotation={[0.2, 0, 0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><MechMaterial color="white" /></mesh>
                    <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#222" /></group>
                    <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#222" /></group>
                </group>
            </group>
        </group>
        
        {/* LEGS GROUP */}
        <group ref={legsRef}>
            <group ref={rightLegRef} position={[0.25, -0.3, 0]} rotation={[-0.1, 0, 0.05]}>
                    <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><MechMaterial color={armorColor} /></mesh>
                    <group ref={rightLowerLegRef} position={[0, -0.75, 0]} rotation={[0.3, 0, 0]}>
                        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><MechMaterial color={armorColor} /></mesh>
                        <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><MechMaterial color={armorColor} /></mesh>
                        <group ref={rightFootRef} position={[0, -0.8, 0.05]} rotation={[-0.2, 0, 0]}>
                            <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><MechMaterial color={feetColor} /></mesh>
                        </group>
                    </group>
            </group>

            <group ref={leftLegRef} position={[-0.25, -0.3, 0]} rotation={[-0.1, 0, -0.05]}>
                    <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><MechMaterial color={armorColor} /></mesh>
                    <group ref={leftLowerLegRef} position={[0, -0.75, 0]} rotation={[0.2, 0, 0]}>
                        <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><MechMaterial color={armorColor} /></mesh>
                        <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><MechMaterial color={armorColor} /></mesh>
                        <group ref={leftFootRef} position={[0, -0.8, 0.05]} rotation={[-0.1, 0, 0]}>
                            <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><MechMaterial color={feetColor} /></mesh>
                        </group>
                    </group>
            </group>
        </group>
    </group>
    );
};
