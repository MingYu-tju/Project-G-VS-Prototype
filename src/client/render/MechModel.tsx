import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, BoxGeometry, Color, ShaderMaterial, Quaternion, Vector3, AdditiveBlending } from 'three';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGLTF, Outlines } from '@react-three/drei';
import { useSettings } from '../state/settings';
import type { MechPose, RotationVector } from './types';
import type { MeleePhase, Team } from '../../shared/game/types';
import { ProceduralSlashEffect, BoostBurst, ThrusterPlume, MuzzleFlash, GhostEmitter } from './VFX';
const MECH_VERTEX_SHADER = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const MECH_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform vec3 uRimColor;
    uniform float uRimPower;
    uniform float uRimIntensity;
    uniform vec3 uLightDir;
    uniform vec3 uAmbientColor;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // 1. Simple Toon Shading (Cel-shading style)
        float NdotL = dot(normal, uLightDir);
        float lightIntensity = smoothstep(-0.2, 0.2, NdotL); // Soft edge toon ramp
        
        // Mix Base Color with Ambient based on light intensity
        vec3 baseColor = mix(uColor * 0.4, uColor, lightIntensity); 

        // 2. Fresnel Rim Light Calculation
        float NdotV = dot(normal, viewDir);
        float rim = 1.0 - max(NdotV, 0.0);
        rim = pow(rim, uRimPower);
        
        // 3. Combine
        vec3 finalColor = baseColor + (uRimColor * rim * uRimIntensity);
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const MechMaterial: React.FC<{ color: string, rimColor?: string, rimPower?: number, rimIntensity?: number }> = ({ 
    color, 
    rimColor = "#44aaff", 
    rimPower = 2.5,       
    rimIntensity = 0.8    
}) => {
    const materialRef = useRef<ShaderMaterial>(null);
    const isRimLightOn = useSettings(state => state.isRimLightOn);

    const uniforms = useMemo(() => ({
        uColor: { value: new Color(color) },
        uRimColor: { value: new Color(rimColor) },
        uRimPower: { value: rimPower },
        uRimIntensity: { value: isRimLightOn ? rimIntensity : 0.0 },
        uLightDir: { value: new Vector3(0.5, 0.8, 0.8).normalize() },
        uAmbientColor: { value: new Color('#1a1d26') }
    }), []); 

    useEffect(() => {
        if (materialRef.current) {
            materialRef.current.uniforms.uColor.value.set(color);
            materialRef.current.uniforms.uRimColor.value.set(rimColor);
            materialRef.current.uniforms.uRimPower.value = rimPower;
            materialRef.current.uniforms.uRimIntensity.value = isRimLightOn ? rimIntensity : 0.0;
            materialRef.current.uniformsNeedUpdate = true;
        }
    }, [color, rimColor, rimPower, rimIntensity, isRimLightOn]);

    return (
        <shaderMaterial 
            ref={materialRef}
            uniforms={uniforms} 
            vertexShader={MECH_VERTEX_SHADER} 
            fragmentShader={MECH_FRAGMENT_SHADER} 
        />
    );
};

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

// Consolidated Chest Visuals to reduce draw calls
const ChestVisuals = React.memo(({ chestColor }: { chestColor: string }) => {
    const isOutlineOn = useSettings(state => state.isOutlineOn);
    
    const { chestGeo, yellowGeo, darkGeo } = useMemo(() => {
        const buckets: Record<string, THREE.BufferGeometry[]> = {
            chest: [], yellow: [], dark: []
        };

        const add = (
            geo: THREE.BufferGeometry, 
            bucketKey: string, 
            local: { p: number[], r: number[], s: number[] },
            parent?: { p: number[], r: number[], s: number[] }
        ) => {
            if (local.s) geo.scale(local.s[0], local.s[1], local.s[2]);
            if (local.r) { 
                geo.rotateZ(local.r[2]); 
                geo.rotateY(local.r[1]); 
                geo.rotateX(local.r[0]); 
            }
            if (local.p) geo.translate(local.p[0], local.p[1], local.p[2]);

            if (parent) {
                if (parent.s) geo.scale(parent.s[0], parent.s[1], parent.s[2]);
                if (parent.r) { 
                     const parentRot = new THREE.Matrix4().makeRotationFromEuler(
                        new THREE.Euler(parent.r[0], parent.r[1], parent.r[2], 'XYZ')
                     );
                     geo.applyMatrix4(parentRot);
                }
                if (parent.p) geo.translate(parent.p[0], parent.p[1], parent.p[2]);
            }
            buckets[bucketKey].push(geo);
        };

        // 1. Chest Armor Plate (Trapezoid)
        add(GeoFactory.trapz([0.5, 0.5, 0.25, 1, 5.85]), 'chest', 
            { p: [0, -0.264, 0.284], r: [0.3, 0, 0], s: [0.4, 1.6, 0.3] }
        );

        // 2. Left Vent Group
        const ventL = { p: [0.226, -0.088, 0.431], r: [0.315, 0, 0], s: [0.7, 0.8, 1.1] };
        // Main Box
        add(GeoFactory.box(0.35, 0.25, 0.05), 'yellow', { p: [0, 0, 0], r: [0,0,0], s: [1,1,1] }, ventL);
        // Dark Slats
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, -0.091, 0.03], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventL);
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, -0.034, 0.032], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventL);
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, 0.022, 0.033], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventL);
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, 0.079, 0.029], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventL);

        // 3. Right Vent Group
        const ventR = { p: [-0.225, -0.091, 0.43], r: [0.315, 0, 0], s: [0.7, 0.8, 1.1] };
        // Main Box
        add(GeoFactory.box(0.35, 0.25, 0.05), 'yellow', { p: [0, 0, 0], r: [0,0,0], s: [1,1,1] }, ventR);
        // Dark Slats
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, -0.091, 0.03], r: [0,0,0], s: [0.9, 0.1, 0.1] }, ventR);
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, -0.034, 0.03], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventR);
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, 0.022, 0.03], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventR);
        add(GeoFactory.box(0.3, 0.2, 0.05), 'dark', { p: [0, 0.079, 0.03], r: [0,0,0], s: [0.9, 0.1, 0.2] }, ventR);

        // 4. CHEST_1 (Main Block)
        add(GeoFactory.box(0.5, 0.5, 0.5), 'chest', 
            { p: [0, 0.013, -0.043], r: [0,0,0], s: [1.5, 1.2, 0.8] }
        );

        // 5. CHEST_2 (Top Detail)
        add(GeoFactory.box(0.5, 0.5, 0.5), 'yellow', 
            { p: [0, 0.321, -0.016], r: [0,0,0], s: [0.8, 0.1, 0.7] }
        );

        // 6. CHEST_3 (Upper Chest Plate)
        add(GeoFactory.trapz([0.5, 0.35, 0.35, 1, 0.45]), 'chest',
            { p: [0, -0.025, 0.236], r: [1.9, 0, 0], s: [1.5, 1, 1.5] }
        );

        // 7. CHEST_4 (Collar/Neck Guard)
        add(GeoFactory.trapz([0.1, 0.2, 0.4, 1, 0.4]), 'yellow',
            { p: [0, 0.254, 0.215], r: [2.21, -1.572, 0], s: [0.8, 1, 1] }
        );

        const merge = (arr: THREE.BufferGeometry[]) => arr.length > 0 ? BufferGeometryUtils.mergeGeometries(arr) : null;

        return {
            chestGeo: merge(buckets.chest),
            yellowGeo: merge(buckets.yellow),
            darkGeo: merge(buckets.dark)
        };
    }, []);

    // Clean up
    useEffect(() => {
        return () => {
            if (chestGeo) chestGeo.dispose();
            if (yellowGeo) yellowGeo.dispose();
            if (darkGeo) darkGeo.dispose();
        };
    }, [chestGeo, yellowGeo, darkGeo]);

    return (
        <group name="ChestMerged">
            {chestGeo && <mesh geometry={chestGeo}><MechMaterial color={chestColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
            {yellowGeo && <mesh geometry={yellowGeo}><MechMaterial color="#FFD966" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
            {darkGeo && <mesh geometry={darkGeo}><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
        </group>
    );
});

const HipVisuals = React.memo(({ armorColor, feetColor, waistColor }: { armorColor: string, feetColor: string, waistColor: string }) => {
    const isOutlineOn = useSettings(state => state.isOutlineOn);
    const { whiteGeo, darkGeo, redGeo, yellowGeo } = useMemo(() => {
        const buckets: Record<string, THREE.BufferGeometry[]> = {
            white: [], dark: [], red: [], yellow: []
        };
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
        
        // ... (Geometry definitions same as previous) ...
        add(GeoFactory.box(0.5, 0.5, 0.5), 'dark', { p:[0, -0.296, 0], r:[0,0,0], s:[0.4, 1, 1] });
        add(GeoFactory.trapz([0.1, 0.3, 0.15, 4.45, 1]), 'white', { p:[0, -0.318, 0.365], r:[-1.571, -1.571, 0], s:[1, 0.8, 1.3] });
        add(GeoFactory.trapz([0.2, 0.2, 0.25, 1, 0.45]), 'white', { p:[0, -0.125, 0.257], r:[0,0,0], s:[1, 0.8, 1.1] });
        add(GeoFactory.box(0.2, 0.05, 0.15), 'red', { p:[0, -0.125, 0.356], r:[1.13, 0, 0], s:[0.9, 0.5, 1] });
        add(GeoFactory.box(0.2, 0.05, 0.2), 'red', { p:[0, -0.207, 0.408], r:[0.6, 0, 0], s:[0.9, 0.4, 0.8] });
        const p6 = { p: [0.037, 0, 0.077], r: [0, -0.1, -0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[-0.303, -0.266, 0.253], r:[0, 0, -1.6], s:[1,1,1] }, p6);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[-0.299, -0.096, 0.253], r:[0,0,0], s:[1,1,1] }, p6);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[-0.298, -0.215, 0.32], r:[1.571, 0, 0], s:[1,1,1] }, p6);
        const p7 = { p: [-0.037, 0, 0.077], r: [0, 0.1, 0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[0.303, -0.266, 0.253], r:[0, 0, 1.6], s:[1,1,1] }, p7);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[0.299, -0.096, 0.253], r:[0,0,0], s:[1,1,1] }, p7);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[0.298, -0.215, 0.32], r:[1.571, 0, 0], s:[1,1,1] }, p7);
        const p8 = { p: [-0.037, 0, 0.121], r: [0, -0.1, 0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[0.303, -0.266, -0.418], r:[0, 0, 1.6], s:[1,1,1] }, p8);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[0.299, -0.096, -0.418], r:[0,0,0], s:[1,1,1] }, p8);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[0.298, -0.215, -0.475], r:[-1.571, 0, 0], s:[1,1,1] }, p8);
        const p9 = { p: [0.037, 0, 0.121], r: [0, 0.1, -0.1], s: [0.9, 1, 1] };
        add(GeoFactory.trapz([0.3, 0.35, 0.1, 1.5, 1]), 'white', { p:[-0.303, -0.266, -0.418], r:[0, 0, -1.6], s:[1,1,1] }, p9);
        add(GeoFactory.box(0.35, 0.1, 0.1), 'white', { p:[-0.299, -0.096, -0.418], r:[0,0,0], s:[1,1,1] }, p9);
        add(GeoFactory.prism([0.15, 0.2, 0.1]), 'yellow', { p:[-0.298, -0.215, -0.475], r:[-1.571, 0, 0], s:[1,1,1] }, p9);
        const p10 = { p: [0, 0, -1.522], r: [0,0,0], s: [1,1,1] };
        add(GeoFactory.box(0.2, 0.35, 0.2), 'white', { p:[0, -0.211, 1.2], r:[0,0,0], s:[1,1,1] }, p10);
        add(GeoFactory.trapz([0.2, 0.2, 0.4, 1, 0.25]), 'white', { p:[0, -0.369, 1.2], r:[-1.571, 0, 0], s:[1,1,1] }, p10);
        const p11 = { p: [0,0,0], r: [0,0,0], s: [0.9, 1, 1] };
        add(GeoFactory.box(0.1, 0.4, 0.4), 'white', { p:[0.48, -0.178, 0], r:[0, 0, 0.3], s:[1,1,1] }, p11);
        add(GeoFactory.box(0.1, 0.3, 0.25), 'white', { p:[0.506, -0.088, 0], r:[0, 0, 0.3], s:[1,1,1] }, p11);
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

    useEffect(() => {
        return () => {
            if (whiteGeo) whiteGeo.dispose();
            if (darkGeo) darkGeo.dispose();
            if (redGeo) redGeo.dispose();
            if (yellowGeo) yellowGeo.dispose();
        };
    }, [whiteGeo, darkGeo, redGeo, yellowGeo]);

    return (
        <group name="HipMerged">
            {darkGeo && <mesh geometry={darkGeo}><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
            {whiteGeo && <mesh geometry={whiteGeo}><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
            {redGeo && <mesh geometry={redGeo}><MechMaterial color={waistColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
            {yellowGeo && <mesh geometry={yellowGeo}><MechMaterial color="#FFD966" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
        </group>
    );
});

export const Trapezoid: React.FC<{ args: number[], color: string }> = ({ args, color }) => {
    const [width, height, depth, topScaleX, topScaleZ] = args;
    const isOutlineOn = useSettings(state => state.isOutlineOn);
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
    useEffect(() => { return () => { geometry.dispose(); }; }, [geometry]);
    return (
        <mesh geometry={geometry}>
            <MechMaterial color={color} rimColor="#00ffff" rimPower={5} rimIntensity={3}/>
            {isOutlineOn && <Outlines thickness={4} color="#111" />}
        </mesh>
    );
};

const MODEL_PATH = '/models/head.glb';//Do not delete
useGLTF.preload(MODEL_PATH);//Do not delete

const MechaHead: React.FC<{ mainColor: string }> = ({ mainColor }) => {
    const { nodes } = useGLTF(MODEL_PATH) as any;
    const meshProps = {};
    const isOutlineOn = useSettings(state => state.isOutlineOn);
    return (
        <group position={[-0.08, 0.4, 0.1]} >
            <group dispose={null}>
                <group position={[-0, -0.28, -0]} scale={0.02}>
                    <group rotation={[Math.PI / 2, 0, 0]}>
                      <mesh geometry={nodes.Polygon_35.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps} > <MechMaterial color={mainColor} />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_55.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#00ff00" />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_56.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#00ff00" />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_57.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#D94850" />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_58.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}><MechMaterial color={mainColor} />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_59.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color={mainColor} />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_60.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#000000" />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                      <mesh geometry={nodes.Polygon_61.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <MechMaterial color="#D94850" />{isOutlineOn && <Outlines thickness={3} color="#111" />}</mesh>
                    </group>
                </group>
            </group>
        </group>
    );
};


interface Props { pose: MechPose; weapon: 'GUN' | 'SABER'; team?: Team; isDualWielding?: boolean; melee?: MeleePhase; thrust?: boolean; ascending?: boolean; trail?: boolean; rainbow?: boolean; muzzle?: boolean; burst?: number; hitStop?: number; hipOffset?: number; motion?: { hipOffset: number } }
export function MechModel({ pose, weapon: activeWeapon, team = 'BLUE', isDualWielding = false, melee = 'NONE', thrust: isThrusting = false, ascending: isAscending = false, trail: isTrailActive = false, rainbow = false, muzzle: showMuzzleFlash = false, burst: dashTriggerTime = 0, hitStop = 0, hipOffset = 0, motion }: Props) {
    const meshRef = useRef<Group>(null);
    const headRef = useRef<Group>(null);
    const torsoRef = useRef<Group>(null); 
    const upperBodyRef = useRef<Group>(null); 
    const legsRef = useRef<Group>(null);
    const rightLegRef = useRef<Group>(null);
    const leftLegRef = useRef<Group>(null);
    const rightLowerLegRef = useRef<Group>(null);
    const leftLowerLegRef = useRef<Group>(null);
    const rightFootRef = useRef<Group>(null);
    const leftFootRef = useRef<Group>(null);
    const gunArmRef = useRef<Group>(null); 
    const rightArmRef = useRef<Group>(null); 
    const leftForeArmRef = useRef<Group>(null); 
    const rightForeArmRef = useRef<Group>(null); 
    const leftForearmTwistRef = useRef<Group>(null);
    const rightForearmTwistRef = useRef<Group>(null);
    const leftWristRef = useRef<Group>(null);
    const rightWristRef = useRef<Group>(null);
    const gunMeshRef = useRef<Group>(null); 
    const shieldRef = useRef<Group>(null); 
    const muzzleRef = useRef<Group>(null);
    
    // New Refs for Dual Wield & Shield Mount
    const rightSaberRef = useRef<Group>(null);
    const armShieldMountRef = useRef<Group>(null);
    const backShieldMountRef = useRef<Group>(null);
    

 const isOutlineOn = useSettings(s => s.isOutlineOn);
 const meleeState = useRef<MeleePhase>(melee);
 const trailRainbow = useRef(rainbow);
 meleeState.current = melee; trailRainbow.current = rainbow;
 const armorColor = '#E9EAEB';
 const chestColor = team === 'BLUE' ? '#727CDB' : '#cf5363';
 const feetColor = '#D94850';
 const waistColor = '#D94850';
    const applyPoseToModel = (pose: MechPose, hipOffset: number, legContainerRot: {x:number, y:number, z:number}) => {
         const setRot = (ref: React.MutableRefObject<Group | null>, rot: RotationVector) => {
             if (ref.current) {
                 ref.current.rotation.set(rot.x, rot.y, rot.z);
             }
         };

         setRot(torsoRef, pose.TORSO);
         setRot(upperBodyRef, pose.CHEST);
         setRot(gunArmRef, pose.LEFT_ARM.SHOULDER); 
         setRot(leftForeArmRef, pose.LEFT_ARM.ELBOW);
         setRot(leftForearmTwistRef, pose.LEFT_ARM.FOREARM);
         setRot(leftWristRef, pose.LEFT_ARM.WRIST);
         setRot(rightArmRef, pose.RIGHT_ARM.SHOULDER);
         setRot(rightForeArmRef, pose.RIGHT_ARM.ELBOW);
         setRot(rightForearmTwistRef, pose.RIGHT_ARM.FOREARM);
         setRot(rightWristRef, pose.RIGHT_ARM.WRIST);

         if (legsRef.current) {
             legsRef.current.rotation.set(legContainerRot.x, legContainerRot.y, legContainerRot.z);
         }
         
         if (torsoRef.current && torsoRef.current.parent) {
             torsoRef.current.position.y = hipOffset;
             if (legsRef.current) legsRef.current.position.y = hipOffset;
         }

         setRot(rightLegRef, pose.RIGHT_LEG.THIGH);
         if (rightLowerLegRef.current) rightLowerLegRef.current.rotation.x = pose.RIGHT_LEG.KNEE;
         setRot(rightFootRef, pose.RIGHT_LEG.ANKLE);

         setRot(leftLegRef, pose.LEFT_LEG.THIGH);
         if (leftLowerLegRef.current) leftLowerLegRef.current.rotation.x = pose.LEFT_LEG.KNEE;
         setRot(leftFootRef, pose.LEFT_LEG.ANKLE);
         
         // SHIELD MOUNT UPDATE (Local Animation)
         if (armShieldMountRef.current && pose.SHIELD) {
             armShieldMountRef.current.position.set(pose.SHIELD.POSITION.x, pose.SHIELD.POSITION.y, pose.SHIELD.POSITION.z);
             armShieldMountRef.current.rotation.set(pose.SHIELD.ROTATION.x, pose.SHIELD.ROTATION.y, pose.SHIELD.ROTATION.z);
         }
    };


 useFrame(() => {
  applyPoseToModel(pose, motion?.hipOffset ?? hipOffset, {x:0,y:0,z:0});
  if (headRef.current) headRef.current.rotation.set(pose.HEAD.x,pose.HEAD.y,pose.HEAD.z);
  if (rightSaberRef.current) rightSaberRef.current.visible = isDualWielding;
  if (shieldRef.current && armShieldMountRef.current && backShieldMountRef.current && meshRef.current) {
   const mount = isDualWielding ? backShieldMountRef.current : armShieldMountRef.current;
   mount.updateWorldMatrix(true,false);
   const p = mount.getWorldPosition(new Vector3());
   const q = mount.getWorldQuaternion(new Quaternion());
   meshRef.current.worldToLocal(p);
   q.premultiply(meshRef.current.getWorldQuaternion(new Quaternion()).invert());
   shieldRef.current.position.copy(p); shieldRef.current.quaternion.copy(q);
  }
 }, 0);
    return (
        <group>
            <group ref={meshRef}>
                {/* ROOT-LEVEL SLASH VFX - Moves with player, but logic handles local offset/rotation */}
                <ProceduralSlashEffect meleeState={meleeState} parentRef={meshRef} frozen={hitStop > 0} />
                
                {/* INDEPENDENT FLOATING SHIELD */}
                <group ref={shieldRef}>
                    <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[0.1, 1.7, 0.7]} />
                            <MechMaterial color={armorColor} />
                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                        </mesh>
                        <mesh position={[0.06, 0, 0]}>
                            <boxGeometry args={[0.1, 1.55, 0.5]} />
                            <MechMaterial color={waistColor} />
                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                        </mesh>
                    </group>
                </group>

                <group position={[0, 2.0, 0]}>
                    <group ref={torsoRef}>
                        {/* Waist Parts */}
                        <group position={[0, 0.26, -0.043]} rotation={[0, 0, 0]} scale={[0.8, 0.7, 0.9]}>
                            <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                        </group>
                        <group position={[0, 0.021, -0.044]} rotation={[-3.143, 0, 0]} scale={[0.8, 0.9, 0.9]}>
                            <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                        </group>
                        <HipVisuals armorColor={armorColor} feetColor={feetColor} waistColor={waistColor} />

                        {/* Hidden Logic Box */}
                        <mesh position={[0, 0, 0]} visible={false}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color="red" /></mesh>

                        {/* CHEST GROUP - OPTIMIZED */}
                        <group ref={upperBodyRef} position={[0, 0.65, 0]}>
                            <ChestVisuals chestColor={chestColor} />

                            {/* HEAD */}
                            <group ref={headRef}>
                                <MechaHead mainColor={armorColor} />
                                <mesh  position= {[-0.026,0.419,0.386]} rotation={[0.2,-0.52,0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh  position= {[-0.026,0.404,0.381]} rotation={[0.2,-0.52,0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>                        
                                <mesh  position= { [-0.003,0.42,0.386]} rotation={[0.2,0.52,-0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>                        
                                <mesh  position= {[-0.003,0.405,0.381]} rotation={[0.2,0.52,-0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>   
                            </group>

                            {/* RIGHT ARM */}
                            <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                                <group position={[0.034, 0, 0.011]}>
                                     <group position={[0.013, 0.032, -0.143]} scale={[1, 0.7, 0.8]}>
                                        <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                     </group>
                                </group>
                                <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                                
                                <group position={[0, -0.1, -0.1]} ref={rightForeArmRef}>
                                    <mesh position={[0, -0.116, 0.002]}><boxGeometry args={[0.24, 0.5, 0.28]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    <mesh position={[0, -0.4, 0.014]}><boxGeometry args={[0.15, 0.3, 0.4]} /><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    
                                    <group position={[0, -0.2, 0]}>
                                        <group position={[0, -0.081, 0]} ref={rightForearmTwistRef}>
                                            <group position={[0, -0.41, 0.005]}>
                                                <mesh position={[0.002, -0.028, -0.0004]}><boxGeometry args={[0.28, 0.5, 0.35]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                
                                                <group ref={rightWristRef} position={[0, -0.35, 0]}>
                                                    <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                    
                                                    {/* RIGHT SABER MODEL (DUAL WIELD) */}
                                                    <group ref={rightSaberRef} visible={false} position={[0, 0, 0.1]} rotation={[1.74, 0, 0]}>
                                                        <mesh position={[0, -0.25, 0]}>
                                                            <cylinderGeometry args={[0.035, 0.04, 0.7, 8]} />
                                                            <MechMaterial color="#ffffff" />
                                                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                                        </mesh>
                                                        <mesh position={[0, 1.4, 0]}>
                                                            <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
                                                            <meshBasicMaterial color="#ffffff" />
                                                        </mesh>
                                                        <mesh position={[0, 1.4, 0]}>
                                                            <cylinderGeometry args={[0.12, 0.12, 2.6, 8]} />
                                                            <meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
                                                        </mesh>
                                                    </group>
                                                </group>
                                            </group>
                                            {/* SHIELD MOUNT POINT (ARM) */}
                                            <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={armShieldMountRef} />
                                        </group>
                                    </group>
                                </group>
                            </group>

                            {/* LEFT ARM */}
                            <group position={[-0.65, 0.1, 0]} ref={gunArmRef} >
                                 <group position={[-0.024, 0, 0.011]}>
                                     <group position={[-0.013, 0.032, -0.143]} scale={[1, 0.7, 0.8]}>
                                         <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                     </group>
                                 </group>
                                <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                                <group position={[0, -0.1, -0.1]} ref={leftForeArmRef}>
                                    <mesh position={[0, -0.116, 0]}><boxGeometry args={[0.24, 0.5, 0.28]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    <mesh position={[0, -0.4, 0.014]}><boxGeometry args={[0.15, 0.3, 0.4]} /><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    <group position={[0, -0.2, 0]}>
                                        <group position={[0, -0.081, 0]} ref={leftForearmTwistRef}>
                                            <group position={[0, -0.41, 0]}>
                                                <mesh position={[-0.002, -0.028, 0]}><boxGeometry args={[0.28, 0.5, 0.35]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                <group ref={leftWristRef} position={[0, -0.35, 0]}>
                                                    <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                    <group visible={activeWeapon === 'SABER'} position={[0, 0, 0.1]} rotation={[1.74, 0, 0]}>
                                                        <mesh position={[0, -0.25, 0]}><cylinderGeometry args={[0.035, 0.04, 0.7, 8]} /><MechMaterial color="#ffffff" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.05, 0.05, 2.4, 8]} /><meshBasicMaterial color="#ffffff" /></mesh>
                                                        <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.12, 0.12, 2.6, 8]} /><meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} /></mesh>
                                                    </group>
                                                </group>
                                            </group>
                                            {/* GUN GROUP */}
                                            <group visible={activeWeapon === 'GUN'} ref={gunMeshRef} position={[0, -0.6, 0.3]} rotation={[1.5, 0, 3.14]}>
                                                    <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.1, 0.2, 0.15]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                    <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                    <mesh position={[0, 0.2, 1.0]} rotation={[1.57, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6, 8]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                    <mesh position={[0.05, 0.35, 0.2]} rotation={[1.57, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.3, 8]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                    <group position={[0, 0.2, 1.35]} ref={muzzleRef}>
                                                        <MuzzleFlash active={showMuzzleFlash} />
                                                    </group>
                                            </group>
                                        </group>
                                    </group>
                                </group>
                            </group>

                            {/* BACKPACK */}
                            <group position={[0, -0.056, -0.365]}>
                                <mesh><boxGeometry args={[0.7, 0.8, 0.3]} /><MechMaterial color="#666" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0.324, 0.5, 0]} rotation={[0.2, 0, -0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><MechMaterial color="white" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[-0.324, 0.5, 0]} rotation={[0.2, 0, 0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><MechMaterial color="white" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#666" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} isFoot={false}/></group>
                                <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#666" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} isFoot={false}/></group>
                                <BoostBurst triggerTime={dashTriggerTime} />
                                
                                {/* SHIELD MOUNT POINT (BACK) */}
                                <group position={[0, -0.8, -0.2]} rotation={[0, 1.57, 0]} ref={backShieldMountRef} />
                            </group>
                        </group>
                    </group>
                    
                    {/* LEGS GROUP */}
                    <group ref={legsRef}>
                        {/* Right Leg */}
                        <group ref={rightLegRef} position={[0.25, -0.3, 0]} rotation={[0, 0, 0.05]}>
                            {/* R Thigh */}
                            <group position={[0, -0.4, 0]}>
                                <mesh>
                                    <boxGeometry args={[0.35, 0.7, 0.4]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                                {/* R Thigh_1 */}
                                <mesh position={[0, -0.4, -0.04]}>
                                    <boxGeometry args={[0.2, 0.4, 0.45]} />
                                    <MechMaterial color="#444444" />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                            </group>

                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />
                            
                            {/* R Shin Group */}
                            <group ref={rightLowerLegRef} position={[0, -0.75, 0]}> 
                                {/* R Shin */}
                                <mesh position={[0, -0.45, 0]}>
                                    <boxGeometry args={[0.35, 0.75, 0.45]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                                {/* R Knee Pad */}
                                <mesh position={[0, -0.1, 0.25]} rotation={[0.4, 0, 0]}>
                                    <boxGeometry args={[0.25, 0.55, 0.15]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                                {/* R Shin_1 */}
                                <mesh position={[0, -0.071, -0.04]}>
                                    <boxGeometry args={[0.2, 0.4, 0.45]} />
                                    <MechMaterial color="#444444" />
                                </mesh>
                                {/* R Shin_2 */}
                                <mesh position={[0, -0.863, 0]}>
                                    <boxGeometry args={[0.2, 0.2, 0.5]} />
                                    <MechMaterial color="#444444" />
                                </mesh>

                                {/* R Foot Group */}
                                <group ref={rightFootRef} position={[0, -0.7, -0.15]}>
                                    {/* R Foot (Trapezoid) */}
                                    <group position={[0, -0.254, 0.24]}>
                                        <Trapezoid args={[0.35, 0.1, 0.7, 0.9, 0.8]} color={feetColor} />
                                        {/* R Foot_1 (Child of R Foot) */}
                                        <group position={[0, 0.133, -0.016]} scale={[1, 1.2, 1]}>
                                            <Trapezoid args={[0.3, 0.2, 0.55, 0.6, 0.65]} color={armorColor} />
                                        </group>
                                    </group>
                                    <GhostEmitter active={isTrailActive} size={[0.35, 0.2, 0.7]} offset={[0, -0.2, 0.2]} rainbow={trailRainbow.current} />
                                    <ThrusterPlume active={isThrusting} offset={[0,0.65,-0.1]} angle={[Math.PI-0.8,0,0]}isAscending={isAscending} isFoot/>
                                </group>
                            </group>
                        </group>
                        
                        {/* Left Leg */}
                        <group ref={leftLegRef} position={[-0.25, -0.3, 0]} rotation={[0, 0, -0.05]}>
                            {/* L Thigh */}
                            <group position={[0, -0.4, 0]}>
                                <mesh>
                                    <boxGeometry args={[0.35, 0.7, 0.4]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                                {/* L Thigh_1 */}
                                <mesh position={[0, -0.4, -0.04]}>
                                    <boxGeometry args={[0.2, 0.4, 0.45]} />
                                    <MechMaterial color="#444444" />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                            </group>

                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />
                            
                            {/* L Shin Group */}
                            <group ref={leftLowerLegRef} position={[0, -0.75, 0]}> 
                                {/* L Shin */}
                                <mesh position={[0, -0.45, 0]}>
                                    <boxGeometry args={[0.35, 0.75, 0.45]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                                {/* L Knee Pad */}
                                <mesh position={[0, -0.1, 0.25]} rotation={[0.4, 0, 0]}>
                                    <boxGeometry args={[0.25, 0.6, 0.15]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                                {/* L Shin_1 */}
                                <mesh position={[0, -0.071, -0.04]}>
                                    <boxGeometry args={[0.2, 0.4, 0.45]} />
                                    <MechMaterial color="#444444" />
                                </mesh>
                                {/* L Shin_2 */}
                                <mesh position={[0, -0.863, 0]}>
                                    <boxGeometry args={[0.2, 0.2, 0.5]} />
                                    <MechMaterial color="#444444" />
                                </mesh>

                                {/* L Foot Group */}
                                <group ref={leftFootRef} position={[0, -0.7, -0.15]}>
                                    {/* L Foot (Trapezoid) */}
                                    <group position={[0, -0.254, 0.24]}>
                                        <Trapezoid args={[0.35, 0.1, 0.7, 0.9, 0.8]} color={feetColor} />
                                        {/* L Foot_1 (Child of L Foot) */}
                                        <group position={[0, 0.133, -0.016]} scale={[1, 1.2, 1]}>
                                            <Trapezoid args={[0.3, 0.2, 0.55, 0.6, 0.65]} color={armorColor} />

                                        </group>
                                    </group>
                                    <GhostEmitter active={isTrailActive} size={[0.35, 0.2, 0.7]} rainbow={trailRainbow.current} />
                                    <ThrusterPlume active={isThrusting} offset={[0,0.5,-0.2]} angle={[Math.PI,0,0]}isAscending={isAscending} isFoot isLeft/>
                                </group>
                            </group>
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
}
