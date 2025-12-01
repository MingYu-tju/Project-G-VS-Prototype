
import React, { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { useFrame, useThree, createPortal, extend } from '@react-three/fiber';
import { Vector3, Mesh, MathUtils, Group, DoubleSide, AdditiveBlending, Quaternion, Matrix4, Euler, MeshToonMaterial, Color, Object3D, InstancedMesh, DynamicDrawUsage, PerspectiveCamera, ShaderMaterial, BoxGeometry } from 'three';
import { useGLTF, Outlines } from '@react-three/drei';
import { useGameStore } from '../store';
import { Team, LockState, GLOBAL_CONFIG, RED_LOCK_DISTANCE, MechPose, DEFAULT_MECH_POSE, RotationVector, SlashSpecsGroup } from '../types';
import { ANIMATION_CLIPS } from '../animations';
import { AnimationController } from './AnimationSystem';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { 
    DASH_SFX_BASE64, 
    SHOOT_SFX_BASE64,
    SWITCH_SFX_BASE64,
    STEP_SFX_BASE64,
    HIT_SFX_BASE64,
    DROP_SFX_BASE64,
    FOOT_SFX_BASE64
} from '../assets';

// ... [All shader definitions and MechMaterial remain exactly the same] ...
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
    const isRimLightOn = useGameStore(state => state.isRimLightOn);

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

const HipVisuals = React.memo(({ armorColor, feetColor, waistColor }: { armorColor: string, feetColor: string, waistColor: string }) => {
    const isOutlineOn = useGameStore(state => state.isOutlineOn);
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

const FRAME_DURATION = 1 / 60;

// --- MELEE CONFIGURATION ---
type MeleePhase = 
    'NONE' | 'STARTUP' | 'LUNGE' | 'SLASH_1' | 'SLASH_2' | 'SLASH_3' | 'RECOVERY' |
    'SIDE_STARTUP' | 'SIDE_LUNGE' | 'SIDE_SLASH_1' | 'SIDE_SLASH_2' | 'SIDE_SLASH_3' | 'SIDE_RECOVERY';

const MELEE_EMPTY_BOOST_PENALTY = 0.5; 

// [DEFAULT_SLASH_SPECS, getAudioContext, loadSoundAsset, generateProceduralDash, generateProceduralShoot, resumeAudioContext, loadAllSounds, playSoundBuffer, playShootSound, playBeamRifleSynth, playBoostSound, playSwitchSound, playStepSound, playDropSound, playFootSound, playHitSound - ALL SAME AS BEFORE]
export const DEFAULT_SLASH_SPECS: SlashSpecsGroup ={
    SIZE: 4.4, WIDTH: 2.5, ARC: 2.9,
    SLASH_1: { color: '#ff00aa', pos: [0.06,1.21,-0.34], rot: [-1.64,1.31,-0.39], startAngle: 2.208, speed: 1, delay: 0 },
    SLASH_2: { color: '#ff00aa', pos: [-0.54,1.86,0], rot: [1.371,1.86,0.86], startAngle: 0.708, speed: -1, delay: 0.1 },
    SLASH_3: { color: '#ff00aa', pos: [0.06,1.31,-0.04], rot: [-1.34,1.21,1.21], startAngle: 1.708, speed: 1, delay: 0.3 },
    SIDE_SLASH_1: { color: '#ff00aa', pos: [-0.19,1.66,-0.19], rot: [1.21,0.51,0.31], startAngle: 0.108, speed: 0.4, delay: 0.08 },
    SIDE_SLASH_2: { color: '#ff00aa', pos: [-0.54,1.86,0], rot: [1.371,1.86,0.86], startAngle: 0.708, speed: -1, delay: 0.1 },
    SIDE_SLASH_3: { color: '#ff00aa', pos: [0.06,1.31,-0.04], rot: [-1.34,1.21,1.21], startAngle: 1.708, speed: 1, delay: 0.3 }
};

let globalAudioCtx: AudioContext | null = null;
let boostAudioBuffer: AudioBuffer | null = null;
let shootAudioBuffer: AudioBuffer | null = null;
let switchAudioBuffer: AudioBuffer | null = null;
let stepAudioBuffer: AudioBuffer | null = null;
let hitAudioBuffer: AudioBuffer | null = null;
let dropAudioBuffer: AudioBuffer | null = null;
let footAudioBuffer: AudioBuffer | null = null;
let areSoundsLoading = false;

const getAudioContext = () => {
    if (!globalAudioCtx) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            globalAudioCtx = new AudioContext();
        }
    }
    return globalAudioCtx;
};

const loadSoundAsset = async (ctx: AudioContext, base64: string): Promise<AudioBuffer | null> => {
    if (!base64 || base64.length < 50) return null;
    try {
        const response = await fetch(base64);
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) return null;
        return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        return null;
    }
};

const generateProceduralDash = (ctx: AudioContext): AudioBuffer => {
    const duration = 0.6;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        const noise = Math.random() * 2 - 1;
        const t = i / frameCount;
        let envelope = 0;
        if (t < 0.1) envelope = t / 0.1;
        else envelope = 1 - ((t - 0.1) / 0.9);
        envelope = Math.pow(envelope, 2);
        data[i] = noise * envelope * 0.5;
    }
    return buffer;
};

const generateProceduralShoot = (ctx: AudioContext): AudioBuffer => {
    const duration = 0.3;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const progress = i / frameCount;
        const frequency = 1200 - (1000 * Math.pow(progress, 0.5));
        const val = Math.sign(Math.sin(2 * Math.PI * frequency * t));
        const envelope = 1 - progress;
        data[i] = val * envelope * 0.3;
    }
    return buffer;
};

export const resumeAudioContext = async () => {
    const ctx = getAudioContext();
    if (ctx) {
        try {
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            if (!areSoundsLoading) loadAllSounds();
        } catch (e) {
            console.error("Failed to resume audio context:", e);
        }
    }
};

const loadAllSounds = async () => {
    if (areSoundsLoading) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    areSoundsLoading = true;
    try {
        boostAudioBuffer = await loadSoundAsset(ctx, DASH_SFX_BASE64);
        if (!boostAudioBuffer) boostAudioBuffer = generateProceduralDash(ctx);
        shootAudioBuffer = await loadSoundAsset(ctx, SHOOT_SFX_BASE64);
        if (!shootAudioBuffer) shootAudioBuffer = generateProceduralShoot(ctx);
        if (!switchAudioBuffer) switchAudioBuffer = await loadSoundAsset(ctx, SWITCH_SFX_BASE64);
        if (!stepAudioBuffer) stepAudioBuffer = await loadSoundAsset(ctx, STEP_SFX_BASE64);
        if (!hitAudioBuffer) hitAudioBuffer = await loadSoundAsset(ctx, HIT_SFX_BASE64);
        if (!dropAudioBuffer) dropAudioBuffer = await loadSoundAsset(ctx, DROP_SFX_BASE64);
        if (!footAudioBuffer) footAudioBuffer = await loadSoundAsset(ctx, FOOT_SFX_BASE64);
    } catch (e) {
        console.warn("Error loading audio assets:", e);
    } finally {
        areSoundsLoading = false;
    }
};

const playSoundBuffer = (buffer: AudioBuffer | null, volume: number = 1.0, pitchVar: number = 0.0) => {
    const ctx = getAudioContext();
    if (!ctx || !buffer) return;
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    if (pitchVar > 0) {
        source.playbackRate.value = 1.0 + (Math.random() - 0.5) * pitchVar;
    }
    source.start(0);
};

const playShootSound = () => {
    if (shootAudioBuffer) {
        playSoundBuffer(shootAudioBuffer, 0.4, 0.2);
    } else {
        const ctx = getAudioContext();
        if(ctx) playBeamRifleSynth(ctx);
    }
};

const playBeamRifleSynth = (ctx: AudioContext) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
};

const playBoostSound = () => playSoundBuffer(boostAudioBuffer, 0.6);
const playSwitchSound = () => playSoundBuffer(switchAudioBuffer, 0.6, 0.1);
const playStepSound = () => playSoundBuffer(stepAudioBuffer, 0.8, 0.1);
const playDropSound = () => playSoundBuffer(dropAudioBuffer, 0.8, 0.2);
const playFootSound = () => playSoundBuffer(footAudioBuffer, 0.55, 0.15);

export const playHitSound = (distance: number) => {
    const maxDist = 100;
    const vol = Math.max(0.05, 1 - (distance / maxDist));
    playSoundBuffer(hitAudioBuffer, vol * 0.4, 0.2);
};

// [BoostBurst, ThrusterPlume, MuzzleFlash, GhostEmitter, SlashMaterial, ProceduralSlashEffect, Trapezoid, MechaHead - SAME AS BEFORE]
const BoostBurst: React.FC<{ triggerTime: number }> = ({ triggerTime }) => {
    const groupRef = useRef<Group>(null);
    const DURATION = 0.4; 
    const CONE_LENGTH = 1.6;
    const CONE_WIDTH = 0.08;
    const TILT_ANGLE = -35;
    const BURST_COLOR = "#00ffff"; 

    useFrame(() => {
        if (!groupRef.current) return;
        const now = Date.now();
        const elapsed = (now - triggerTime) / 1000;
        if (elapsed > DURATION) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;
        const scaleProgress = elapsed / DURATION;
        const scale = MathUtils.lerp(0.5, 2.5, Math.pow(scaleProgress, 0.3));
        groupRef.current.scale.setScalar(scale);
        let opacity = 0;
        if (elapsed < 0.1) {
            opacity = elapsed / 0.1;
        } else {
            const fadeOutProgress = (elapsed - 0.1) / (DURATION - 0.1);
            opacity = 1 - fadeOutProgress;
        }
        groupRef.current.children.forEach((angleGroup: any) => {
            if (angleGroup.children && angleGroup.children[0] && angleGroup.children[0].children[0]) {
                const mesh = angleGroup.children[0].children[0];
                if (mesh.material) mesh.material.opacity = opacity;
            }
        });
    });

    return (
        <group ref={groupRef} visible={false} position={[0, -0.2, -0.3]} rotation={[0, 0, 0]}>
            {[45, 135, 225, 315].map((angle, i) => (
                <group key={i} rotation={[0, 0, MathUtils.degToRad(angle)]}>
                    <group rotation={[MathUtils.degToRad(TILT_ANGLE), 0, 0]}>
                        <mesh position={[0, CONE_LENGTH / 2, 0]}> 
                            <cylinderGeometry args={[0, CONE_WIDTH, CONE_LENGTH, 8, 1]} /> 
                            <meshBasicMaterial color={BURST_COLOR} transparent depthWrite={false} blending={AdditiveBlending} />
                        </mesh>
                    </group>
                </group>
            ))}
        </group>
    );
};

const ThrusterPlume: React.FC<{ active: boolean, offset: [number, number, number], isAscending?: boolean }> = ({ active, offset, isAscending }) => {
    const groupRef = useRef<Group>(null);
    useFrame((state) => {
        if (!groupRef.current) return;
        const flicker = MathUtils.randFloat(0.8, 1.2);
        const targetScale = active ? 1 : 0;
        const lerpSpeed = 0.1;
        groupRef.current.scale.z = MathUtils.lerp(groupRef.current.scale.z, targetScale * flicker, lerpSpeed);
        groupRef.current.scale.x = MathUtils.lerp(groupRef.current.scale.x, targetScale, lerpSpeed);
        groupRef.current.scale.y = MathUtils.lerp(groupRef.current.scale.y, targetScale, lerpSpeed);
        groupRef.current.visible = groupRef.current.scale.z > 0.05;
    });
    return (
        <group ref={groupRef} position={[0,-0.1,isAscending?0.3:0]}>
            <group rotation={[isAscending ? Math.PI + Math.PI/5 : -Math.PI/5 - Math.PI/2, 0, 0]}>
                <mesh position={[0, -0.3, 0.8]}>
                    <cylinderGeometry args={[0.02, 0.1, 1.5, 8]} rotation={[Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthWrite={false} />
                </mesh>
                <mesh position={[0, -0.3, 0.5]}>
                    <cylinderGeometry args={[0.05, 0.15, 0.8, 8]} rotation={[Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} />
                </mesh>
            </group>
        </group>
    );
};

const MuzzleFlash: React.FC<{ active: boolean }> = ({ active }) => {
    const ref = useRef<Mesh>(null);
    const [scale, setScale] = useState(0);
    useEffect(() => {
        if (active) setScale(1.5);
    }, [active]);
    useFrame(() => {
        if (!ref.current) return;
        if (scale > 0) {
            setScale(s => Math.max(0, s - 0.2));
            ref.current.scale.setScalar(scale);
            ref.current.visible = true;
        } else {
            ref.current.visible = false;
        }
    });
    return (
        <mesh ref={ref} visible={false}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#FFD966" transparent opacity={0.8} />
        </mesh>
    );
};

interface GhostEmitterProps {
    active: boolean;
    size?: [number, number, number];
    offset?: [number, number, number];
    rainbow?: boolean;
}

const MAX_GHOSTS = 60;
const GHOST_LIFETIME = 20;
const SPAWN_INTERVAL = 5;

const GhostEmitter: React.FC<GhostEmitterProps> = ({ active, size=[0.4, 0.6, 0.4], offset=[0,0,0], rainbow=false }) => {
    const { scene } = useThree();
    const meshRef = useRef<InstancedMesh>(null);
    const trackerRef = useRef<Group>(null);
    const frameCount = useRef(0);
    const head = useRef(0);
    const ghostData = useRef(new Float32Array(MAX_GHOSTS * 16)); 
    const ghostAges = useRef(new Int16Array(MAX_GHOSTS).fill(-1));
    const ghostColors = useRef(new Float32Array(MAX_GHOSTS * 3)); 
    const tempObj = useMemo(() => new Object3D(), []);
    const tempMat = useMemo(() => new Matrix4(), []);
    const tempPos = useMemo(() => new Vector3(), []);
    const tempQuat = useMemo(() => new Quaternion(), []);
    const tempScale = useMemo(() => new Vector3(), []);
    const tempColor = useMemo(() => new Color(), []);

    useFrame(() => {
        if (!trackerRef.current || !meshRef.current) return;
        frameCount.current++;
        const currentInterval = rainbow ? 2 : SPAWN_INTERVAL;
        if (active && frameCount.current % currentInterval === 0) {
            trackerRef.current.updateMatrixWorld();
            const matrix = trackerRef.current.matrixWorld;
            const idx = head.current;
            for(let i=0; i<16; i++) {
                ghostData.current[idx * 16 + i] = matrix.elements[i];
            }
            ghostAges.current[idx] = 0;
            if (rainbow) {
                const hue = (frameCount.current * 0.04) % 1.0;
                tempColor.setHSL(hue, 1.0, 0.5);
            } else {
                tempColor.set('#aaaaaa');
            }
            ghostColors.current[idx*3] = tempColor.r;
            ghostColors.current[idx*3+1] = tempColor.g;
            ghostColors.current[idx*3+2] = tempColor.b;
            head.current = (head.current + 1) % MAX_GHOSTS;
        }
        let activeCount = 0;
        for (let i = 0; i < MAX_GHOSTS; i++) {
            const age = ghostAges.current[i];
            if (age >= 0 && age < GHOST_LIFETIME) {
                ghostAges.current[i]++;
                tempMat.fromArray(ghostData.current, i * 16);
                tempMat.decompose(tempPos, tempQuat, tempScale);
                const lifeRatio = 1 - (age / GHOST_LIFETIME);
                const s = lifeRatio * 0.9 + 0.1;
                tempScale.multiplyScalar(s);
                tempObj.position.copy(tempPos);
                tempObj.quaternion.copy(tempQuat);
                tempObj.scale.copy(tempScale);
                tempObj.updateMatrix();
                meshRef.current.setMatrixAt(i, tempObj.matrix);
                tempColor.setRGB(ghostColors.current[i*3], ghostColors.current[i*3+1], ghostColors.current[i*3+2]);
                meshRef.current.setColorAt(i, tempColor);
                activeCount++;
            } else {
                tempMat.identity().scale(new Vector3(0,0,0));
                meshRef.current.setMatrixAt(i, tempMat);
            }
        }
        meshRef.current.count = MAX_GHOSTS;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }
    });

    return (
        <>
            <group ref={trackerRef} position={offset} />
            {createPortal(
                <instancedMesh 
                    ref={meshRef} 
                    args={[undefined, undefined, MAX_GHOSTS]} 
                    frustumCulled={false}
                >
                    <boxGeometry args={size} />
                    <meshBasicMaterial transparent opacity={rainbow?0.8:0.4} blending={AdditiveBlending} depthWrite={false} />
                </instancedMesh>,
                scene
            )}
        </>
    );
};

export class SlashMaterial extends ShaderMaterial {
    constructor() {
        super({
            uniforms: {
                uColor: { value: new Color('#00ffff') },
                uOpacity: { value: 0 },
                uInnerRadius: { value: 0.6 }, 
                uArc: { value: Math.PI }      
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uInnerRadius;
                uniform float uArc;

                void main() {
                    vec2 centered = vUv - 0.5;
                    float dist = length(centered) * 2.0; 

                    float radialAlpha = smoothstep(uInnerRadius, 1.0, dist);
                    radialAlpha *= step(dist, 1.0);

                    float angle = atan(centered.y, centered.x);
                    if (angle < 0.0) angle += 6.2831853;

                    float fadeWidth = 0.3; 
                    float startFade = smoothstep(0.0, fadeWidth, angle);
                    float endFade = 1.0 - smoothstep(uArc - fadeWidth, uArc, angle);
                    
                    float angularAlpha = startFade * endFade;
                    float finalAlpha = radialAlpha * angularAlpha * uOpacity;
                    
                    if (finalAlpha < 0.01) discard;

                    gl_FragColor = vec4(uColor, finalAlpha);
                }
            `,
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
            blending: AdditiveBlending
        });
    }
}
extend({ SlashMaterial });

interface SlashEffectProps {
    meleeState?: React.MutableRefObject<MeleePhase>;
    parentRef?: React.RefObject<Group>;
    overrideSpecs?: SlashSpecsGroup;
    manualProgress?: number | null;
    manualMode?: string | null;
}

export const ProceduralSlashEffect: React.FC<SlashEffectProps> = ({ 
    meleeState, 
    parentRef,
    overrideSpecs,
    manualProgress = null,
    manualMode = null
}) => {
    const meshRef = useRef<Mesh>(null);
    const materialRef = useRef<any>(null);
    const SPECS = overrideSpecs || DEFAULT_SLASH_SPECS;
    const rawInner = 1.0 - (SPECS.WIDTH / SPECS.SIZE);
    const innerR = Math.max(0.01, Math.min(0.99, rawInner));
    const animState = useRef({
        active: false,
        progress: 0,
        age: 0, 
        currentSlash: 'NONE' as string,
        spec: SPECS.SLASH_1 
    });

    useFrame((state, delta) => {
        if (!meshRef.current || !materialRef.current) return;

        materialRef.current.uniforms.uInnerRadius.value = innerR;
        materialRef.current.uniforms.uArc.value = SPECS.ARC;

        if (manualProgress !== null && manualMode) {
            let spec = SPECS.SLASH_1;
            if (manualMode === 'SLASH_2') spec = SPECS.SLASH_2;
            else if (manualMode === 'SLASH_3') spec = SPECS.SLASH_3;
            else if (manualMode === 'SIDE_SLASH_1') spec = SPECS.SIDE_SLASH_1;
            else if (manualMode === 'SIDE_SLASH_2') spec = SPECS.SIDE_SLASH_2;
            else if (manualMode === 'SIDE_SLASH_3') spec = SPECS.SIDE_SLASH_3;

            meshRef.current.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
            meshRef.current.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
            meshRef.current.scale.setScalar(SPECS.SIZE);
            materialRef.current.uniforms.uColor.value.set(spec.color);
            materialRef.current.uniforms.uArc.value = SPECS.ARC;
            let opacity = 0;
            const p = manualProgress;
            if (p < 0.2) opacity = p / 0.2;
            else opacity = 1 - (p - 0.2) / 0.8;
            opacity = Math.max(0, opacity);
            materialRef.current.uniforms.uOpacity.value = opacity * 0.8;
            const currentRotation = spec.startAngle + (p * spec.speed);
            meshRef.current.rotation.z = currentRotation;
            return; 
        }

        if (!meleeState) return;
        const currentPhase = meleeState.current;
        const s = animState.current;
        const timeScale = delta * 60; 

        if (currentPhase.includes('SLASH') && currentPhase !== s.currentSlash) {
            s.active = true;
            s.currentSlash = currentPhase;
            s.progress = 0;
            s.age = 0;
            if (currentPhase === 'SLASH_1') s.spec = SPECS.SLASH_1;
            else if (currentPhase === 'SLASH_2') s.spec = SPECS.SLASH_2;
            else if (currentPhase === 'SLASH_3') s.spec = SPECS.SLASH_3;
            else if (currentPhase === 'SIDE_SLASH_1') s.spec = SPECS.SIDE_SLASH_1;
            else if (currentPhase === 'SIDE_SLASH_2') s.spec = SPECS.SIDE_SLASH_2;
            else if (currentPhase === 'SIDE_SLASH_3') s.spec = SPECS.SIDE_SLASH_3;
            else s.active = false; 

            if (s.active) {
                meshRef.current.position.set(s.spec.pos[0], s.spec.pos[1], s.spec.pos[2]);
                meshRef.current.rotation.set(s.spec.rot[0], s.spec.rot[1], s.spec.rot[2]);
                meshRef.current.scale.setScalar(SPECS.SIZE);
                materialRef.current.uniforms.uColor.value.set(s.spec.color);
                materialRef.current.uniforms.uArc.value = SPECS.ARC;
                materialRef.current.uniforms.uOpacity.value = 0; 
            }
        }
        else if (!currentPhase.includes('SLASH')) {
            s.active = false;
            s.currentSlash = 'NONE';
        }

        if (s.active) {
            s.age += delta;
            if (s.age < s.spec.delay) {
                materialRef.current.uniforms.uOpacity.value = 0;
                return;
            }
            s.progress += 0.02 * Math.abs(s.spec.speed) * timeScale; 
            let opacity = 0;
            if (s.progress < 0.2) opacity = s.progress / 0.2;
            else opacity = 1 - (s.progress - 0.2) / 0.8;
            opacity = Math.max(0, opacity);
            materialRef.current.uniforms.uOpacity.value = opacity * 0.8; 
            const currentRotation = s.spec.startAngle + (s.progress * s.spec.speed);
            meshRef.current.rotation.z = currentRotation;
            if (s.progress >= 1.0) {
                s.active = false;
                materialRef.current.uniforms.uOpacity.value = 0;
            }
        } else {
            materialRef.current.uniforms.uOpacity.value = 0;
        }
    });

    return (
        <mesh ref={meshRef}>
            <ringGeometry args={[innerR, 1.0, 32, 1, 0, SPECS.ARC]} />
            <slashMaterial 
                ref={materialRef} 
                uInnerRadius={innerR}
                uArc={SPECS.ARC}
            />
        </mesh>
    );
};

const Trapezoid: React.FC<{ args: number[], color: string }> = ({ args, color }) => {
    const [width, height, depth, topScaleX, topScaleZ] = args;
    const isOutlineOn = useGameStore(state => state.isOutlineOn);
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
    const isOutlineOn = useGameStore(state => state.isOutlineOn);
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

export const Player: React.FC = () => {
    // ... (refs, animator, camera setup)
    const meshRef = useRef<Mesh>(null);
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
    const { camera } = useThree();
    
    const isOutlineOn = useGameStore(state => state.isOutlineOn);
    const animator = useMemo(() => new AnimationController(), []);
    const headLookQuat = useRef(new Quaternion());
    const cinematicTimer = useRef(0);
    const stableCamQuat = useRef(new Quaternion());

    const {
        targets,
        currentTargetIndex,
        setPlayerPos,
        consumeBoost,
        refillBoost,
        boost,
        maxBoost,
        isOverheated,
        lockState,
        consumeAmmo,
        spawnProjectile,
        recoverAmmo,
        playerLastHitTime,
        playerKnockbackDir,
        playerKnockbackPower,
        cutTracking,
        applyHit,
        hitStop,
        isGameStarted,
        setCinematicCamera
    } = useGameStore();

    const velocity = useRef(new Vector3(0, 0, 0));
    const position = useRef(new Vector3(0, 0, 0));
    const isGrounded = useRef(true);
    const landingFrames = useRef(0);
    const visualLandingFrames = useRef(0);
    const wasStunnedRef = useRef(false);
    
    const keys = useRef<{ [key: string]: boolean }>({});
    const lastKeyPressTime = useRef(0);
    const lastKeyPressed = useRef<string>("");
    const lastDirectionKeyReleaseTimes = useRef<Record<string, number>>({});

    const lPressStartTime = useRef(0);
    const lastLReleaseTime = useRef(0);
    const lConsumedByAction = useRef(false); 
    const lConsumedByDash = useRef(false);
    const preserveDoubleTapOnRelease = useRef(false);

    const isDashing = useRef(false);
    const dashStartTime = useRef(0);
    const dashReleaseTime = useRef<number | null>(null);
    const currentDashSpeed = useRef(0);
    const dashDirection = useRef(new Vector3(0, 0, -1));
    const dashBuffer = useRef(false);
    const dashCooldownTimer = useRef(0);
    const dashBurstTimer = useRef(0); 
    const jumpBuffer = useRef(false); 
    const forcedAscentFrames = useRef(0); 

    const currentUpperBodyTilt = useRef(0); 
    const wasFallingRef = useRef(false); 
    const currentFallTime = useRef(0); 
    const totalPredictedFallFrames = useRef(0); 
    const walkCycle = useRef(0);
    const lastWalkCycle = useRef(0); 
    const currentLegInertiaRot = useRef({ x: 0, y: 0, z: 0 });
    const currentHipOffset = useRef(0); 
    const currentWalkWeight = useRef(0); 

    const isEvading = useRef(false);
    const evadeTimer = useRef(0);
    const evadeRecoveryTimer = useRef(0);
    const evadeDirection = useRef(new Vector3(0, 0, 0));
    const isRainbowStep = useRef(false);
    // CIRCULAR EVADE
    const evadeCircularDir = useRef<number>(0); // 0: Linear, 1: Left(CCW), -1: Right(CW)
    
    const trailTimer = useRef(0);
    const trailRainbow = useRef(false);

    const isShooting = useRef(false);
    const shootTimer = useRef(0);
    const hasFired = useRef(false);
    const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
    const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
    const [dashTriggerTime, setDashTriggerTime] = useState(0);

    const meleeState = useRef<MeleePhase>('NONE');
    const meleeTimer = useRef(0);
    const meleeStartupTimer = useRef(0);
    const meleeLungeTargetPos = useRef<Vector3 | null>(null); 
    const hasMeleeHitRef = useRef(false);
    const isMeleePenaltyActive = useRef(false); 
    const meleeComboBuffer = useRef(false); 
    const isMeleeTrackingActive = useRef(false);
    const meleeSideDirection = useRef<number>(0); 
    // HIT CONFIRMATION LOGIC
    const meleeHitConfirmed = useRef(false);
    // STICKY TARGET LOGIC
    const activeMeleeTargetId = useRef<string | null>(null);

    const [visualState, setVisualState] = useState<'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' | 'MELEE'>('IDLE');
    const [isStunned, setIsStunned] = useState(false);
    const ammoRegenTimer = useRef(0);
    const [activeWeapon, setActiveWeapon] = useState<'GUN' | 'SABER'>('GUN');

    useEffect(() => { loadAllSounds(); }, []);

    // ... [Key and input handlers omitted for brevity, identical to previous] ...
 const getDirectionFromKey = (key: string) => {
        const input = new Vector3(0,0,0);
        if (key === 'w') input.z -= 1;
        if (key === 's') input.z += 1;
        if (key === 'a') input.x -= 1;
        if (key === 'd') input.x += 1;
        
        const state = useGameStore.getState();
        const isCinematic = state.isCinematicCameraActive;

        // Determine Reference Frame
        let forward = new Vector3();
        let right = new Vector3();

        if (isCinematic && activeMeleeTargetId.current) {
            // --- CINEMATIC CONTROL FIX (TARGET CENTRIC) ---
            // If in cinematic mode, Forward IS direction to the sticky target.
            // Camera rotation is ignored entirely.
            const target = state.targets.find(t => t.id === activeMeleeTargetId.current);
            if (target) {
                const pToT = new Vector3().subVectors(target.position, position.current);
                pToT.y = 0;
                if (pToT.lengthSq() > 0.001) {
                    pToT.normalize();
                    forward = pToT;
                    // Right is Up x Forward? No. Forward x Up (0,1,0) = Right?
                    // Z- x Y+ = X+. Yes.
                    right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
                } else {
                    // Fallback if on top of target
                    forward.set(0,0,-1).applyQuaternion(camera.quaternion);
                    forward.y = 0; forward.normalize();
                    right.set(1,0,0).applyQuaternion(camera.quaternion);
                    right.y = 0; right.normalize();
                }
            }
        } else {
            // Standard Camera Reference
            forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            right.set(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0; right.normalize();
        }
        
        const moveDir = new Vector3();
        moveDir.addScaledVector(forward, -input.z);
        moveDir.addScaledVector(right, input.x);
        return moveDir.normalize();
    }

    const getCameraRelativeInput = () => {
        const input = new Vector3(0, 0, 0);
        if (keys.current['w']) input.z -= 1;
        if (keys.current['s']) input.z += 1;
        if (keys.current['a']) input.x -= 1;
        if (keys.current['d']) input.x += 1;
        if (input.lengthSq() === 0) return null;
        input.normalize();
        
        const state = useGameStore.getState();
        const isCinematic = state.isCinematicCameraActive;
        
        let forward = new Vector3();
        let right = new Vector3();

        if (isCinematic && activeMeleeTargetId.current) {
            // --- CINEMATIC CONTROL FIX ---
            const target = state.targets.find(t => t.id === activeMeleeTargetId.current);
            if (target) {
                const pToT = new Vector3().subVectors(target.position, position.current);
                pToT.y = 0;
                if (pToT.lengthSq() > 0.001) {
                    pToT.normalize();
                    forward = pToT;
                    right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
                } else {
                   forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
                   forward.y = 0; forward.normalize();
                   right.set(1, 0, 0).applyQuaternion(camera.quaternion);
                   right.y = 0; right.normalize();
                }
            }
        } else {
             forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
             forward.y = 0; forward.normalize();
             right.set(1, 0, 0).applyQuaternion(camera.quaternion);
             right.y = 0; right.normalize();
        }
        
        const moveDir = new Vector3();
        moveDir.addScaledVector(forward, -input.z); 
        moveDir.addScaledVector(right, input.x);
        return moveDir.normalize();
    };


    const startDashAction = () => {
        const now = Date.now();
        const state = useGameStore.getState();
        if (!state.isOverheated && state.boost > 0 && !isStunned) {
            if (state.isCinematicCameraActive) {
                setCinematicCamera(false);
            }
            if (meleeState.current !== 'NONE') {
                meleeState.current = 'NONE';
                meleeHitConfirmed.current = false;
                activeMeleeTargetId.current = null; // Clear sticky target
                if (meshRef.current) {
                    const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                    fwd.y = 0;
                    if (fwd.lengthSq() > 0.001) {
                        fwd.normalize();
                        const target = position.current.clone().add(fwd);
                        meshRef.current.lookAt(target);
                    }
                }
            }
            if (isEvading.current) {
                isEvading.current = false;
                evadeTimer.current = 0;
            }
            evadeRecoveryTimer.current = 0;
            if (isShooting.current) {
                isShooting.current = false;
                shootTimer.current = 0;
            }
            isDashing.current = true;
            visualLandingFrames.current = 0;
            dashStartTime.current = now;
            dashReleaseTime.current = null; 
            currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
            dashCooldownTimer.current = GLOBAL_CONFIG.DASH_COOLDOWN_FRAMES; 
            dashBurstTimer.current = GLOBAL_CONFIG.DASH_BURST_DURATION; 
            jumpBuffer.current = false; 
            consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT);
            setDashTriggerTime(now);
            playBoostSound();

            if (isGrounded.current || position.current.y < 1.5) {
                velocity.current.y = GLOBAL_CONFIG.DASH_GROUND_HOP_VELOCITY;
                isGrounded.current = false;
            }
            
            const inputDir = getCameraRelativeInput();
            if (inputDir) {
                dashDirection.current.copy(inputDir);
            } else {
                if (meshRef.current) {
                    const currentDir = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                    currentDir.y = 0;
                    if (currentDir.lengthSq() > 0) {
                        dashDirection.current.copy(currentDir.normalize());
                    }
                }
            }
            
            velocity.current.x = dashDirection.current.x * GLOBAL_CONFIG.DASH_BURST_SPEED;
            velocity.current.z = dashDirection.current.z * GLOBAL_CONFIG.DASH_BURST_SPEED;
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!useGameStore.getState().isGameStarted) return;
            const key = e.key.toLowerCase();
            const now = Date.now();
            if (!keys.current[key]) {
                if (['w', 'a', 's', 'd'].includes(key)) {
                    // Check against RELEASE time instead of PRESS time to allow "Release -> Press" triggering
                    const lastRelease = lastDirectionKeyReleaseTimes.current[key] || 0;
                    
                    if (now - lastRelease < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW) {
                        if (!isOverheated && boost > 0 && !isStunned && landingFrames.current <= 0) {
                            if (useGameStore.getState().isCinematicCameraActive) {
                                setCinematicCamera(false);
                            }
                            let isRainbow = false;
                            if (meleeState.current !== 'NONE') {
                                meleeState.current = 'NONE';
                                meleeHitConfirmed.current = false;
                                activeMeleeTargetId.current = null; // Clear sticky target
                                isRainbow = true;
                                if (meshRef.current) {
                                    const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                                    fwd.y = 0;
                                    if (fwd.lengthSq() > 0.001) {
                                        fwd.normalize();
                                        const target = position.current.clone().add(fwd);
                                        meshRef.current.lookAt(target);
                                    }
                                }
                            }
                            isRainbowStep.current = isRainbow;
                            const boostCost = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_BOOST_COST : GLOBAL_CONFIG.EVADE_BOOST_COST;
                            if (consumeBoost(boostCost)) {
                                isEvading.current = true;
                                evadeRecoveryTimer.current = 0;
                                evadeTimer.current = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_DURATION : GLOBAL_CONFIG.EVADE_DURATION;
                                trailTimer.current = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_TRAIL_DURATION : GLOBAL_CONFIG.EVADE_TRAIL_DURATION;
                                trailRainbow.current = isRainbow;
                                cutTracking('player');
                                
                                // CIRCULAR EVADE LOGIC
                                const state = useGameStore.getState();
                                // Use sticky target if melee was just active/cancelled, otherwise current target
                                const targetId = activeMeleeTargetId.current || (state.targets[state.currentTargetIndex] ? state.targets[state.currentTargetIndex].id : null);
                                const target = targetId ? state.targets.find(t => t.id === targetId) : null;
                                
                                // Default to Linear
                                let circDir = 0;
                                
                                // If targeting AND input is A (Left) or D (Right), enable circular
                                if (target && (key === 'a' || key === 'd')) {
                                    // Left (A) -> Move Left relative to cam -> Orbit CCW (Positive angle) -> Tangent direction is +1
                                    // Right (D) -> Move Right relative to cam -> Orbit CW (Negative angle) -> Tangent direction is -1
                                    circDir = (key === 'a') ? 1 : -1;
                                }
                                evadeCircularDir.current = circDir;

                                const dir = getDirectionFromKey(key);
                                evadeDirection.current.copy(dir);
                                const spd = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_SPEED : GLOBAL_CONFIG.EVADE_SPEED;
                                
                                // Apply initial velocity for inertia.
                                // For circular, we calculate tangent velocity.
                                if (circDir !== 0 && target) {
                                     const toTarget = new Vector3().subVectors(target.position, position.current).normalize();
                                     // Tangent = Up x Forward (Right Tangent)
                                     // If circDir is 1 (Left), we want Left Tangent, which is -Right Tangent.
                                     const rightTangent = new Vector3().crossVectors(new Vector3(0, 1, 0), toTarget).normalize();
                                     
                                     // A (Left) -> 1. We want Left (-RightTangent). So * -1.
                                     // D (Right) -> -1. We want Right (+RightTangent). So * -1.
                                     velocity.current.copy(rightTangent).multiplyScalar(spd * -circDir);
                                } else {
                                    velocity.current.x = dir.x * spd;
                                    velocity.current.z = dir.z * spd;
                                }
                                
                                velocity.current.y = 0;
                                isDashing.current = false;
                                isShooting.current = false;
                                shootTimer.current = 0;
                                visualLandingFrames.current = 0;
                                playStepSound(); 
                            }
                        }
                    }
                    lastKeyPressed.current = key;
                    lastKeyPressTime.current = now;
                }
                keys.current[key] = true;
                
                if (key === 'j') {
                    if (!isShooting.current && !isEvading.current && landingFrames.current <= 0 && !isStunned && meleeState.current === 'NONE') {
                        const hasAmmo = consumeAmmo();
                        if (hasAmmo) {
                            isShooting.current = true;
                            evadeRecoveryTimer.current = 0;
                            setActiveWeapon('GUN');
                            visualLandingFrames.current = 0;
                            shootTimer.current = 0;
                            hasFired.current = false;
                            const target = targets[currentTargetIndex];
                            let isFrontal = true; 
                            if (target && meshRef.current) {
                                const playerDir = new Vector3();
                                meshRef.current.getWorldDirection(playerDir);
                                playerDir.y = 0;
                                playerDir.normalize();
                                const toTarget = new Vector3().subVectors(target.position, position.current);
                                toTarget.y = 0;
                                toTarget.normalize();
                                const dot = playerDir.dot(toTarget);
                                isFrontal = dot >= -0.28;
                            }
                            shootMode.current = isFrontal ? 'MOVE' : 'STOP';
                            if (shootMode.current === 'STOP' && isDashing.current) {
                                isDashing.current = false;
                            }
                        }
                    }
                }

                if (key === 'k') {
                    // Combo Buffering
                    if (meleeState.current.includes('SLASH')) {
                        meleeComboBuffer.current = true;
                        return;
                    }
                    
                    if (!isStunned && landingFrames.current <= 0 && meleeState.current === 'NONE' && !isShooting.current) {
                        const state = useGameStore.getState();
                        const target = state.targets[state.currentTargetIndex];
                        setActiveWeapon('SABER');
                        isDashing.current = false;
                        isEvading.current = false;
                        evadeRecoveryTimer.current = 0;
                        meleeComboBuffer.current = false;
                        visualLandingFrames.current = 0;
                        meleeHitConfirmed.current = false; // Reset hit confirmation
                        
                        // STICKY TARGET INIT
                        // When starting a melee, lock the target immediately if one exists
                        activeMeleeTargetId.current = target ? target.id : null;
                        
                        let inRedLock = false;
                        let dist = 9999;
                        if (target) {
                            dist = position.current.distanceTo(target.position);
                            if (dist < RED_LOCK_DISTANCE) inRedLock = true;
                        }
                        
                        const hasBoost = !state.isOverheated && state.boost > 0;
                        isMeleePenaltyActive.current = !hasBoost;

                        // Check for Side Inputs (A or D)
                        const isLeft = keys.current['a'];
                        const isRight = keys.current['d'];
                        const isSideMelee = (isLeft || isRight) && !(isLeft && isRight); // Xor-ish

                        if (inRedLock) {
                            // RED LOCK: Initiate LUNGE (Movement) immediately
                            if (isSideMelee) {
                                meleeState.current = 'SIDE_LUNGE';
                                // Direction: 1 = Left, -1 = Right based on Up x Forward vector logic
                                meleeSideDirection.current = isLeft ? 1 : -1;
                                // Animation Timing
                                meleeStartupTimer.current = GLOBAL_CONFIG.SIDE_MELEE_STARTUP_FRAMES;
                            } else {
                                meleeState.current = 'LUNGE';
                                meleeSideDirection.current = 0;
                                // Animation Timing
                                meleeStartupTimer.current = GLOBAL_CONFIG.MELEE_STARTUP_FRAMES; 
                            }
                            
                            isMeleeTrackingActive.current = true;
                            // Max chase time
                            let maxLungeTime = GLOBAL_CONFIG.MELEE_MAX_LUNGE_TIME;
                            if (isMeleePenaltyActive.current) maxLungeTime *= MELEE_EMPTY_BOOST_PENALTY;
                            meleeTimer.current = maxLungeTime;
                            
                            if (target && meshRef.current) {
                                // Look at target initially
                                meshRef.current.lookAt(target.position);
                                meleeLungeTargetPos.current = target.position.clone();
                            }
                        } else {
                            // GREEN LOCK: Stationary Startup -> Whiff
                            meleeState.current = isSideMelee ? 'SIDE_STARTUP' : 'STARTUP';
                            meleeSideDirection.current = 0;
                            isMeleeTrackingActive.current = false;
                            meleeTimer.current = isSideMelee ? GLOBAL_CONFIG.SIDE_MELEE_STARTUP_FRAMES : GLOBAL_CONFIG.MELEE_STARTUP_FRAMES;
                        }
                    }
                }

                if (key === 'l') {
                    const timeSinceLastRelease = now - lastLReleaseTime.current;
                    if (timeSinceLastRelease < GLOBAL_CONFIG.INPUT_DASH_WINDOW) {
                        lConsumedByDash.current = true;
                        lConsumedByAction.current = true;
                        if (landingFrames.current > 0) {
                            if (landingFrames.current <= GLOBAL_CONFIG.LANDING_LAG_BUFFER_WINDOW) {
                                dashBuffer.current = true;
                            }
                            return;
                        }
                        if (dashCooldownTimer.current > 0) {
                            dashBuffer.current = true;
                            return;
                        }
                        startDashAction();
                    } else {
                        lPressStartTime.current = now;
                        lConsumedByAction.current = false; 
                        lConsumedByDash.current = false;   
                    }
                }
                if (key === ' ') {
                    useGameStore.getState().cycleTarget();
                    playSwitchSound(); 
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            keys.current[key] = false;
            
            if (['w', 'a', 's', 'd'].includes(key)) {
                // Track when this specific direction was released
                lastDirectionKeyReleaseTimes.current[key] = Date.now();
            }

            if (key === 'l') {
                if (lConsumedByAction.current && !preserveDoubleTapOnRelease.current) {
                    lastLReleaseTime.current = 0;
                } else {
                    lastLReleaseTime.current = Date.now();
                }
                preserveDoubleTapOnRelease.current = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [boost, isOverheated, consumeBoost, camera, consumeAmmo, isStunned, targets, currentTargetIndex, cutTracking]);
    
    // ... [applyPoseToModel and getLandingLag same as before] ...
    const getLandingLag = () => {
        if (isOverheated) {
            return GLOBAL_CONFIG.LANDING_LAG_OVERHEAT;
        } else {
            const boostRatio = boost / maxBoost;
            const penaltyFactor = 1.0 - boostRatio;
            return Math.floor(
                GLOBAL_CONFIG.LANDING_LAG_MIN + (penaltyFactor * (GLOBAL_CONFIG.LANDING_LAG_MAX - GLOBAL_CONFIG.LANDING_LAG_MIN))
            );
        }
    };

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

         if (shieldRef.current && pose.SHIELD) {
             shieldRef.current.position.set(pose.SHIELD.POSITION.x, pose.SHIELD.POSITION.y, pose.SHIELD.POSITION.z);
             shieldRef.current.rotation.set(pose.SHIELD.ROTATION.x, pose.SHIELD.ROTATION.y, pose.SHIELD.ROTATION.z);
         }
    };

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const timeScale = delta * 60;

        if (!useGameStore.getState().isCinematicCameraActive) {
             camera.getWorldQuaternion(stableCamQuat.current);
        }

        if (hitStop <= 0) {
            const now = Date.now();
            
            // Resolve active target: Sticky target OR current lock
            const currentTarget = activeMeleeTargetId.current 
                ? targets.find(t => t.id === activeMeleeTargetId.current) || targets[currentTargetIndex] 
                : targets[currentTargetIndex];
                
            const moveDir = getCameraRelativeInput();
            
            if (useGameStore.getState().isCinematicCameraActive) {
                cinematicTimer.current -= delta * 1000;
                if (cinematicTimer.current <= 0) {
                    setCinematicCamera(false);
                }
            }

            const stunned = now - playerLastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;

            if (wasStunnedRef.current && !stunned) {
                if (isGrounded.current) {
                    landingFrames.current = getLandingLag();
                    visualLandingFrames.current = GLOBAL_CONFIG.LANDING_VISUAL_DURATION; 
                    velocity.current.set(0, 0, 0);
                }
            }
            wasStunnedRef.current = stunned;
            setIsStunned(stunned);

            if (dashCooldownTimer.current > 0) {
                dashCooldownTimer.current -= 1 * timeScale;
                if (dashCooldownTimer.current <= 0) {
                    dashCooldownTimer.current = 0;
                    if (dashBuffer.current && landingFrames.current <= 0 && !stunned) {
                        startDashAction();
                        dashBuffer.current = false;
                    }
                }
            }

            if (dashBurstTimer.current > 0) {
                dashBurstTimer.current -= 1 * timeScale;
                if (dashBurstTimer.current <= 0) {
                    dashBurstTimer.current = 0;
                    if (jumpBuffer.current) {
                        isDashing.current = false;
                        jumpBuffer.current = false;
                        if (!keys.current['l']) {
                            forcedAscentFrames.current = GLOBAL_CONFIG.JUMP_SHORT_HOP_FRAMES;
                        }
                    }
                }
            }

            if (forcedAscentFrames.current > 0) {
                forcedAscentFrames.current -= 1 * timeScale;
            }

            ammoRegenTimer.current += delta;
            if (ammoRegenTimer.current > GLOBAL_CONFIG.AMMO_REGEN_TIME) {
                recoverAmmo();
                ammoRegenTimer.current = 0;
            }

            if (trailTimer.current > 0) {
                trailTimer.current -= 1 * timeScale;
            }

            let nextVisualState: 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' | 'MELEE' = 'IDLE';
            // ... [Ascent Input checks same as before] ...
            const isLHeld = keys.current['l'];
            const lHeldDuration = isLHeld ? (now - lPressStartTime.current) : 0;
            const isEvadeCancelInput = isEvading.current && isLHeld && !lConsumedByDash.current;
            const isNormalAscentInput = isLHeld && !lConsumedByDash.current && (lHeldDuration > GLOBAL_CONFIG.INPUT_ASCENT_HOLD_THRESHOLD);
            const isAscentInput = isEvadeCancelInput || isNormalAscentInput;
            const isVisualLock = visualLandingFrames.current > 0;

            if (!isLHeld && lastLReleaseTime.current > 0 && !lConsumedByAction.current) {
                if (now - lastLReleaseTime.current > GLOBAL_CONFIG.INPUT_DASH_WINDOW) {
                    if (isDashing.current) {
                        lConsumedByAction.current = true;
                        lastLReleaseTime.current = 0;
                    } else {
                        if (!isStunned && !isOverheated && landingFrames.current <= 0 && !isVisualLock && boost > GLOBAL_CONFIG.BOOST_CONSUMPTION_SHORT_HOP && meleeState.current === 'NONE') {
                            if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_SHORT_HOP)) {
                                velocity.current.y = GLOBAL_CONFIG.JUMP_SHORT_HOP_SPEED;
                                isGrounded.current = false;
                                lConsumedByAction.current = true;
                                lastLReleaseTime.current = 0;
                                forcedAscentFrames.current = 10;
                            }
                        } else {
                            lConsumedByAction.current = true;
                            lastLReleaseTime.current = 0;
                        }
                    }
                }
            }

            if (isDashing.current && isAscentInput) {
                if (dashBurstTimer.current > 0) {
                    jumpBuffer.current = true; 
                } else {
                    if (now - dashStartTime.current > GLOBAL_CONFIG.DASH_GRACE_PERIOD) {
                        isDashing.current = false; 
                    }
                }
            }

            if (stunned) {
                isDashing.current = false;
                isShooting.current = false;
                isEvading.current = false; 
                dashBuffer.current = false; 
                meleeState.current = 'NONE';
                meleeHitConfirmed.current = false;
                activeMeleeTargetId.current = null; // Reset sticky target on stun
                jumpBuffer.current = false; 
                forcedAscentFrames.current = 0;
                shootTimer.current = 0;
                landingFrames.current = 0;
                visualLandingFrames.current = 0; 
                evadeRecoveryTimer.current = 0; 
                
                setCinematicCamera(false);

                velocity.current.set(0, 0, 0); 
                const horizontalKnockback = playerKnockbackDir.clone();
                horizontalKnockback.y = 0;
                if (horizontalKnockback.lengthSq() > 0) horizontalKnockback.normalize();
                const force = GLOBAL_CONFIG.KNOCKBACK_SPEED * playerKnockbackPower;
                position.current.add(horizontalKnockback.multiplyScalar(force * timeScale));
                if (position.current.y <= 0) {
                    position.current.y = 0;
                }

            } else {
                const performMeleeSnap = (target: any) => {
                    if (!target) return;
                    position.current.y = MathUtils.lerp(position.current.y, target.position.y, 0.8);
                    velocity.current.y = 0; 
                    
                    if (meshRef.current) {
                        const fwd = new Vector3();
                        const worldFwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                        worldFwd.y = 0; 
                        if (worldFwd.lengthSq() > 0.001) {
                            worldFwd.normalize();
                            // Look at target
                            const lookTarget = position.current.clone().add(worldFwd);
                            meshRef.current.lookAt(lookTarget);
                        }
                        meshRef.current.updateMatrixWorld();
                    }
                };

                // --- MELEE LOGIC ---
                if (meleeState.current !== 'NONE') {
                    nextVisualState = 'MELEE';
                    
                    if (isDashing.current || isEvading.current) {
                        meleeState.current = 'NONE';
                        meleeHitConfirmed.current = false;
                        activeMeleeTargetId.current = null; // Reset on cancel
                        setCinematicCamera(false);
                    }
                    
                    if (!meleeState.current.includes('LUNGE')) {
                         // In slash phase, zero out velocity unless we are snapping
                         velocity.current.set(0, 0, 0);
                    }
                    
                    // --- 1. STARTUP (Stationary Green Lock) ---
                    if (meleeState.current === 'STARTUP' || meleeState.current === 'SIDE_STARTUP') {
                        velocity.current.set(0, 0, 0);
                        meleeTimer.current -= timeScale;
                        if (meleeTimer.current <= 0) {
                            // Transition to Slash 1 (Whiff)
                            meleeState.current = (meleeState.current === 'SIDE_STARTUP') ? 'SIDE_SLASH_1' : 'SLASH_1';
                            const comboData = (meleeState.current === 'SIDE_SLASH_1') ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1;
                            meleeTimer.current = comboData.DURATION_FRAMES;
                            hasMeleeHitRef.current = false; 
                            meleeHitConfirmed.current = false; // STARTUP timeout = miss
                        }
                    }
                    
                    // --- 2. LUNGE (Movement Red Lock) ---
                    else if (meleeState.current === 'LUNGE' || meleeState.current === 'SIDE_LUNGE') {
                        const paid = consumeBoost(GLOBAL_CONFIG.MELEE_BOOST_CONSUMPTION * timeScale);
                        let dist = 999;
                        const isSide = meleeState.current === 'SIDE_LUNGE';
                        
                        if (currentTarget) {
                            dist = position.current.distanceTo(currentTarget.position);
                            const targetPos = currentTarget.position.clone();
                            const dirToTarget = targetPos.clone().sub(position.current).normalize();
                            
                            // Use LUNGE_SPEED_MULT to chase faster
                            let speed = (isSide ? GLOBAL_CONFIG.SIDE_MELEE_LUNGE_SPEED : GLOBAL_CONFIG.MELEE_LUNGE_SPEED) * GLOBAL_CONFIG.MELEE_LUNGE_SPEED_MULT;
                            if (isMeleePenaltyActive.current) speed *= MELEE_EMPTY_BOOST_PENALTY;
                            
                            // VECTOR MATH FOR MOVEMENT
                            const moveVec = dirToTarget.clone();
                            
                            // If Side Melee, add perpendicular component for curve
                            if (isSide) {
                                // Calculate Left Vector relative to target direction (Up x Forward)
                                const up = new Vector3(0, 1, 0);
                                const leftVec = new Vector3().crossVectors(up, dirToTarget).normalize();
                                const curveStrength = GLOBAL_CONFIG.SIDE_MELEE_ARC_STRENGTH;
                                const sideOffset = leftVec.multiplyScalar(meleeSideDirection.current * curveStrength);
                                moveVec.add(sideOffset).normalize();
                            }
                            
                            velocity.current.x = moveVec.x * speed;
                            velocity.current.z = moveVec.z * speed;
                            velocity.current.y = dirToTarget.y * speed; 
                            
                            // Look at target always (even when strafing)
                            meshRef.current.lookAt(currentTarget.position);
                            
                        } else {
                            // No target fallback
                            const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                            let speed = isSide ? GLOBAL_CONFIG.SIDE_MELEE_LUNGE_SPEED : GLOBAL_CONFIG.MELEE_LUNGE_SPEED;
                            velocity.current.x = fwd.x * speed;
                            velocity.current.z = fwd.z * speed;
                            velocity.current.y = fwd.y * speed;
                        }
                        
                        // Decrement Timers
                        meleeTimer.current -= timeScale; // Max chase duration
                        meleeStartupTimer.current -= timeScale; // Animation windup duration
                        
                        const isStartupComplete = meleeStartupTimer.current <= 0;
                        
                        // --- CONFIRMATION LOGIC ---
                        // If we are within range, trigger the slash immediately (Confirm Hit)
                        if (isStartupComplete && dist < GLOBAL_CONFIG.MELEE_RANGE) {
                            // Hit Connect (CONFIRMED)
                            meleeState.current = isSide ? 'SIDE_SLASH_1' : 'SLASH_1';
                            const comboData = isSide ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1;
                            meleeTimer.current = comboData.DURATION_FRAMES;
                            
                            hasMeleeHitRef.current = false; 
                            meleeHitConfirmed.current = true; // HIT CONFIRMED!
                            
                            // --- STICKY TARGET SET ---
                            // Ensure we stick to this target for the combo
                            if (currentTarget) activeMeleeTargetId.current = currentTarget.id;

                            velocity.current.set(0,0,0);
                            performMeleeSnap(currentTarget);
                        } 
                        else if (meleeTimer.current <= 0) {
                            // Timeout (Whiff) - Force transition but unconfirmed
                            meleeState.current = isSide ? 'SIDE_SLASH_1' : 'SLASH_1';
                            const comboData = isSide ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1;
                            meleeTimer.current = comboData.DURATION_FRAMES;
                            hasMeleeHitRef.current = false; 
                            meleeHitConfirmed.current = false; // NOT CONFIRMED (Whiff)
                            
                            velocity.current.set(0,0,0); 
                            isMeleeTrackingActive.current = false;
                        }
                    }
                    
                    // --- 3. SLASH PHASES (Generalized) ---
                    else if (meleeState.current.includes('SLASH')) {
                        const isSide = meleeState.current.includes('SIDE');
                        const stage = meleeState.current.endsWith('1') ? 1 : (meleeState.current.endsWith('2') ? 2 : 3);
                        
                        // Get correct config
                        let comboData;
                        let nextState: MeleePhase | 'RECOVERY' | 'SIDE_RECOVERY';
                        
                        if (isSide) {
                            if (stage === 1) { comboData = GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1; nextState = 'SIDE_SLASH_2'; }
                            else if (stage === 2) { comboData = GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_2; nextState = 'SIDE_SLASH_3'; }
                            else { comboData = GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_3; nextState = 'SIDE_RECOVERY'; }
                        } else {
                            if (stage === 1) { comboData = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1; nextState = 'SLASH_2'; }
                            else if (stage === 2) { comboData = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2; nextState = 'SLASH_3'; }
                            else { comboData = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3; nextState = 'RECOVERY'; }
                        }

                        // ** CAMERA TRIGGER LOGIC **
                        if (stage === 3 && Math.abs(meleeTimer.current - comboData.DURATION_FRAMES) < 0.1) {
                             // ONLY TRIGGER CINEMATIC IF STILL LOCKED ON THE SAME TARGET
                             const currentLockId = targets[currentTargetIndex]?.id;
                             if (activeMeleeTargetId.current === currentLockId) {
                                 camera.getWorldQuaternion(stableCamQuat.current);
                                 setCinematicCamera(true);
                                 cinematicTimer.current = GLOBAL_CONFIG.CINEMATIC_CAMERA.DURATION;
                             }
                        }

                        const passed = comboData.DURATION_FRAMES - meleeTimer.current;
                        const activeTracking = isMeleeTrackingActive.current;

                        // --- MAGNET SNAP LOGIC (If Confirmed) ---
                        // If the hit is confirmed, we force the player to slide to the ideal blade spacing
                        // Use currentTarget (which is now stickied via resolve at top of loop)
                        if (meleeHitConfirmed.current && currentTarget && !hasMeleeHitRef.current) {
                             // Use per-move spacing if available, otherwise fallback to global default
                             const spacing = (comboData as any).ATTACK_SPACING ?? GLOBAL_CONFIG.MELEE_ATTACK_SPACING;
                             
                             // Calculate Ideal Position: Target Position - (DirectionToTarget * Spacing)
                             const dirToTarget = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                             const idealPos = currentTarget.position.clone().sub(dirToTarget.multiplyScalar(spacing));
                             
                             // Lerp towards ideal pos for smooth "magnet" effect
                             const snapSpeed = GLOBAL_CONFIG.MELEE_MAGNET_SPEED * timeScale;
                             position.current.lerp(idealPos, snapSpeed);
                             
                             // Look at target
                             meshRef.current.lookAt(currentTarget.position);
                        }
                        
                        // Step Forward Logic (Whiff or confirmed slide)
                        if (activeTracking && !meleeHitConfirmed.current) {
                             // Whiff drift
                             const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion).normalize();
                             fwd.y = 0;
                             velocity.current.x = fwd.x * comboData.FORWARD_STEP_SPEED;
                             velocity.current.z = fwd.z * comboData.FORWARD_STEP_SPEED;
                        }

                        // --- DAMAGE APPLICATION (Deterministic Frame Check) ---
                        // Instead of collision, we check if we passed the Damage Frame AND if Hit is Confirmed
                        const isDamageFrame = passed >= comboData.DAMAGE_DELAY;
                        
                        if (!hasMeleeHitRef.current && isDamageFrame && meleeHitConfirmed.current && currentTarget) {
                             // HIT EXECUTION
                             const dist = position.current.distanceTo(currentTarget.position);
                             
                             if (dist < GLOBAL_CONFIG.MELEE_RANGE * 1.5) {
                                 const knockback = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                 const isKnockdown = (stage === 3) ? true : false;
                                 
                                 applyHit(currentTarget.id, knockback, comboData.KNOCKBACK_POWER, comboData.STUN_DURATION, comboData.HIT_STOP_FRAMES, isKnockdown); 
                                 
                                 // Visual Impact Stop
                                 velocity.current.set(0, 0, 0);
                                 
                                 // Post-hit slide (Chase Velocity)
                                 const chaseDir = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                 chaseDir.y = 0;
                                 velocity.current.add(chaseDir.multiplyScalar(comboData.CHASE_VELOCITY));

                                 performMeleeSnap(currentTarget); 
                                 playHitSound(0);
                                 hasMeleeHitRef.current = true; 
                             }
                        }
                        
                        // Re-confirm chance
                        if (!hasMeleeHitRef.current && !meleeHitConfirmed.current && isDamageFrame && currentTarget) {
                             const dist = position.current.distanceTo(currentTarget.position);
                             if (dist < GLOBAL_CONFIG.MELEE_RANGE) {
                                 // Late confirm!
                                 meleeHitConfirmed.current = true;
                                 // Sticky target if re-confirmed
                                 activeMeleeTargetId.current = currentTarget.id;
                             }
                        }
                        
                        meleeTimer.current -= timeScale;
                        
                        // End of Move
                        if (meleeTimer.current <= 0) {
                            if (meleeComboBuffer.current && !nextState.includes('RECOVERY')) {
                                // Advance Combo
                                meleeState.current = nextState as MeleePhase;
                                // Lookup duration for next state
                                const nextStage = stage + 1;
                                const nextConfig = isSide 
                                    ? (nextStage===2 ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_2 : GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_3)
                                    : (nextStage===2 ? GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3);
                                    
                                meleeTimer.current = nextConfig.DURATION_FRAMES;
                                hasMeleeHitRef.current = false; 
                                meleeComboBuffer.current = false; 
                                velocity.current.set(0,0,0);
                                
                                // --- COMBO CHAIN CONFIRMATION CHECK ---
                                if (currentTarget && activeTracking) {
                                    const dist = position.current.distanceTo(currentTarget.position);
                                    // More generous range for combos since enemy might be knocked back
                                    if (dist < GLOBAL_CONFIG.MELEE_RANGE * 1.5) {
                                        meleeHitConfirmed.current = true;
                                        performMeleeSnap(currentTarget);
                                    } else {
                                        meleeHitConfirmed.current = false; // Lost track
                                    }
                                } else {
                                    meleeHitConfirmed.current = false;
                                }

                            } else {
                                // End Combo
                                meleeState.current = isSide ? 'SIDE_RECOVERY' : 'RECOVERY';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                                meleeHitConfirmed.current = false;
                                activeMeleeTargetId.current = null; // Release sticky
                            }
                        }
                    }
                    
                    // --- 4. RECOVERY ---
                    else if (meleeState.current === 'RECOVERY' || meleeState.current === 'SIDE_RECOVERY') {
                        meleeTimer.current -= timeScale;
                        velocity.current.y -= GLOBAL_CONFIG.GRAVITY * 0.5 * timeScale; 
                        
                        if (meleeTimer.current <= 0) {
                            meleeState.current = 'NONE';
                            activeMeleeTargetId.current = null; // Ensure cleared
                            if (position.current.y < 1.5) {
                                velocity.current.y = 0.02; 
                                isGrounded.current = false; 
                            }
                        }
                    }
                }
                else if (isEvading.current) {
                    nextVisualState = 'EVADE';
                    evadeTimer.current -= 1 * timeScale;
                    
                    const currentSpeed = isRainbowStep.current ? GLOBAL_CONFIG.RAINBOW_STEP_SPEED : GLOBAL_CONFIG.EVADE_SPEED;

                    // --- CIRCULAR EVADE LOGIC (TANGENT VELOCITY FIX) ---
                    // If we have a target and initiated a side dodge, we use tangent velocity for smooth orbit.
                    if (currentTarget && evadeCircularDir.current !== 0) {
                         // 1. Vector from Target to Player (Radius)
                         const toTarget = new Vector3().subVectors(currentTarget.position, position.current);
                         toTarget.y = 0; 
                         
                         // 2. Calculate Tangent Direction
                         // Cross Product: Up (Y) x Radius (Player-Target) gives a vector pointing RIGHT (CW).
                         // But we need Radius to be Player->Target? Yes.
                         // Up x (Target - Player) -> Points Left relative to look direction? 
                         // Let's verify: 
                         // Player at (0,0,10), Target at (0,0,0). ToTarget = (0,0,-1). Up = (0,1,0).
                         // Up x ToTarget = (0,1,0) x (0,0,-1) = (-1, 0, 0) = Left.
                         // So 'tangent' vector points LEFT.
                         
                         const radiusVec = toTarget.normalize();
                         const tangent = new Vector3().crossVectors(new Vector3(0, 1, 0), radiusVec).normalize();
                         
                         // 3. Direction
                         // Input A (Left) -> evadeCircularDir = 1.
                         // We want to move Left. Tangent is Left. So Velocity = Tangent * Speed.
                         // Input D (Right) -> evadeCircularDir = -1.
                         // We want to move Right. Tangent is Left. So Velocity = Tangent * Speed * -1.
                         // So formula is: Velocity = Tangent * Speed * evadeCircularDir.
                         
                         velocity.current.copy(tangent).multiplyScalar(currentSpeed * evadeCircularDir.current);
                         
                         // NO POSITION OVERRIDE. NO LOOKAT OVERRIDE.
                         // Just velocity. Physics handles the rest.
                         
                    } else {
                        // Standard Linear Dodge (No target or Forward/Back)
                        velocity.current.x = evadeDirection.current.x * currentSpeed;
                        velocity.current.z = evadeDirection.current.z * currentSpeed;
                        velocity.current.y = 0; 
                    }

                    if (isAscentInput && consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                        isEvading.current = false; evadeRecoveryTimer.current = 0;
                        nextVisualState = 'ASCEND';
                        velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                        lConsumedByAction.current = true; preserveDoubleTapOnRelease.current = true;
                        const inertiaRatio = isRainbowStep.current ? GLOBAL_CONFIG.RAINBOW_STEP_ASCENT_INERTIA_RATIO : GLOBAL_CONFIG.EVADE_ASCENT_INERTIA_RATIO;
                        velocity.current.x *= inertiaRatio; velocity.current.z *= inertiaRatio;
                    }
                    if (evadeTimer.current <= 0) {
                        isEvading.current = false; 
                        // Friction handles stop
                        if (isRainbowStep.current && position.current.y < 1.5) {
                             velocity.current.y = 0.02; 
                             isGrounded.current = false; 
                        }
                        evadeRecoveryTimer.current = isRainbowStep.current ? GLOBAL_CONFIG.RAINBOW_STEP_RECOVERY_FRAMES : GLOBAL_CONFIG.EVADE_RECOVERY_FRAMES;
                    }
                }
                // ... [Rest of movement logic same as before] ...
                else if (isShooting.current && shootMode.current === 'STOP') {
                    nextVisualState = 'SHOOT';
                    velocity.current.set(0, 0, 0);
                }
                else if (landingFrames.current > 0) {
                    velocity.current.set(0, 0, 0);
                    landingFrames.current -= 1 * timeScale; 
                    if (landingFrames.current <= 0) { 
                        landingFrames.current = 0; refillBoost();
                        if (dashBuffer.current && dashCooldownTimer.current <= 0) {
                            startDashAction(); dashBuffer.current = false;
                        }
                    }
                } 
                else {
                    if (evadeRecoveryTimer.current > 0) {
                        velocity.current.set(0,0,0); evadeRecoveryTimer.current -= timeScale;
                    }
                    else {
                        if (isDashing.current) {
                            if ((isOverheated || boost <= 0) && dashReleaseTime.current === null) dashReleaseTime.current = now;
                            if (dashReleaseTime.current === null && !isLHeld && !moveDir) dashReleaseTime.current = now;
                            if (dashReleaseTime.current !== null && now - dashReleaseTime.current > GLOBAL_CONFIG.DASH_COAST_DURATION) isDashing.current = false;
                        }
                        const effectiveAscent = isAscentInput && !isVisualLock; 
                        const isDashBursting = dashBurstTimer.current > 0;

                        if (isDashing.current) {
                            const isCoasting = dashReleaseTime.current !== null;
                            let canSustain = isCoasting;
                            if (!isCoasting) {
                                const paid = consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_HOLD * timeScale);
                                canSustain = paid || isOverheated || boost <= 0;
                                if (!paid) dashReleaseTime.current = now;
                            }
                            if (canSustain) {
                                nextVisualState = 'DASH';
                                currentDashSpeed.current = MathUtils.lerp(currentDashSpeed.current, GLOBAL_CONFIG.DASH_SUSTAIN_SPEED, GLOBAL_CONFIG.DASH_DECAY_FACTOR * timeScale);
                                if (moveDir && dashReleaseTime.current === null) {
                                    const angle = moveDir.angleTo(dashDirection.current);
                                    const axis = new Vector3().crossVectors(dashDirection.current, moveDir).normalize();
                                    const rotateAmount = Math.min(angle, GLOBAL_CONFIG.DASH_TURN_SPEED * timeScale);
                                    dashDirection.current.applyAxisAngle(axis, rotateAmount);
                                    dashDirection.current.normalize();
                                }
                                velocity.current.x = dashDirection.current.x * currentDashSpeed.current;
                                velocity.current.z = dashDirection.current.z * currentDashSpeed.current;
                                velocity.current.y *= 0.85; 
                            } else { isDashing.current = false; }
                        }
                        else if (effectiveAscent && !isOverheated && !isDashBursting) {
                            if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                                nextVisualState = 'ASCEND'; lConsumedByAction.current = true;
                                if (visualState !== 'ASCEND') playBoostSound();
                                velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                                velocity.current.x *= Math.pow(0.995, timeScale); velocity.current.z *= Math.pow(0.995, timeScale);
                                if (moveDir) {
                                    const currentHVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                                    const projectedSpeed = currentHVel.dot(moveDir);
                                    if (projectedSpeed < GLOBAL_CONFIG.ASCENT_MAX_HORIZONTAL_SPEED) {
                                        velocity.current.x += moveDir.x * GLOBAL_CONFIG.ASCENT_HORIZONTAL_ACCEL * timeScale;
                                        velocity.current.z += moveDir.z * GLOBAL_CONFIG.ASCENT_HORIZONTAL_ACCEL * timeScale;
                                    }
                                }
                            }
                        }
                        else {
                            if (isGrounded.current) {
                                if (moveDir && !isVisualLock) {
                                    nextVisualState = 'WALK';
                                    const currentVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                                    const speed = currentVel.length();
                                    let effectiveDir = currentVel.clone();
                                    if (speed < 0.01) {
                                        effectiveDir = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                                        effectiveDir.y = 0;
                                    }
                                    effectiveDir.normalize();
                                    const angle = moveDir.angleTo(effectiveDir);
                                    if (angle > 0.001) {
                                        let axis = new Vector3().crossVectors(effectiveDir, moveDir).normalize();
                                        if (axis.lengthSq() < 0.01) axis = new Vector3(0, 1, 0);
                                        const turnRate = GLOBAL_CONFIG.GROUND_TURN_SPEED * timeScale;
                                        const rotateAmount = Math.min(angle, turnRate);
                                        effectiveDir.applyAxisAngle(axis, rotateAmount);
                                        currentVel.copy(effectiveDir);
                                    } else { currentVel.copy(effectiveDir); }
                                    currentVel.normalize().multiplyScalar(GLOBAL_CONFIG.WALK_SPEED);
                                    velocity.current.x = currentVel.x; velocity.current.z = currentVel.z;
                                } else { velocity.current.x = 0; velocity.current.z = 0; }
                            } else if (moveDir) {
                                velocity.current.addScaledVector(moveDir, 0.002 * timeScale);
                            }
                        }
                        const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                        const frictionFactor = Math.pow(friction, timeScale);
                        if (forcedAscentFrames.current > 0 && nextVisualState !== 'DASH') nextVisualState = 'ASCEND';
                        if (nextVisualState !== 'ASCEND') { velocity.current.x *= frictionFactor; velocity.current.z *= frictionFactor; }
                        
                        if (!isDashing.current) velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
                    }
                }
                
                const colRadius = GLOBAL_CONFIG.MECH_COLLISION_RADIUS;
                const colHeight = GLOBAL_CONFIG.MECH_COLLISION_HEIGHT;
                
                targets.forEach(target => {
                    if (Math.abs(position.current.y - target.position.y) < colHeight) {
                        const dx = position.current.x - target.position.x;
                        const dz = position.current.z - target.position.z;
                        const distSq = dx*dx + dz*dz;
                        const minDist = colRadius * 2; 
                        
                        if (distSq < minDist * minDist && distSq > 0.0001) {
                            const dist = Math.sqrt(distSq);
                            const overlap = minDist - dist;
                            const nx = dx / dist;
                            const nz = dz / dist;
                            position.current.x += nx * overlap;
                            position.current.z += nz * overlap;
                        }
                    }
                });

                position.current.add(velocity.current.clone().multiplyScalar(timeScale));
            }

            // ... [Bounds check and landing logic same as before] ...
            const maxRadius = GLOBAL_CONFIG.BOUNDARY_LIMIT - 1.0;
            const currentRadiusSq = position.current.x * position.current.x + position.current.z * position.current.z;
            if (currentRadiusSq > maxRadius * maxRadius) {
                const angle = Math.atan2(position.current.z, position.current.x);
                position.current.x = Math.cos(angle) * maxRadius;
                position.current.z = Math.sin(angle) * maxRadius;
            }
            if (position.current.y <= 0) {
                position.current.y = 0;
                if (!isGrounded.current) {
                    isGrounded.current = true;
                    if (!stunned && !isDashing.current && nextVisualState !== 'EVADE' && nextVisualState !== 'MELEE') {
                        landingFrames.current = getLandingLag(); 
                        visualLandingFrames.current = GLOBAL_CONFIG.LANDING_VISUAL_DURATION; 
                        playDropSound(); 
                    }
                    if (isDashing.current) isDashing.current = false; 
                    if (isEvading.current) isEvading.current = false;
                }
                if (velocity.current.y < 0) velocity.current.y = 0;
            } else { isGrounded.current = false; }

            if (visualLandingFrames.current > 0) {
                visualLandingFrames.current -= 1 * timeScale;
                if (nextVisualState !== 'DASH' && nextVisualState !== 'EVADE' && nextVisualState !== 'ASCEND' && nextVisualState !== 'MELEE') {
                    nextVisualState = 'LANDING';
                }
                if (visualLandingFrames.current <= 0) visualLandingFrames.current = 0;
            }

            setVisualState(nextVisualState);
            setPlayerPos(position.current.clone());
            meshRef.current.position.copy(position.current);

            // ... [Rotation logic same as before] ...
            if (!stunned) {
                const isSideLunge = meleeState.current === 'SIDE_LUNGE' || meleeState.current === 'SIDE_STARTUP';
                if (isSideLunge) {
                    // If stickied, look at sticky target, otherwise current
                    const target = activeMeleeTargetId.current 
                        ? targets.find(t => t.id === activeMeleeTargetId.current) 
                        : targets[currentTargetIndex];
                    if (target) {
                        meshRef.current.lookAt(target.position);
                    }
                }
                else if (meleeState.current === 'LUNGE') {
                    if (velocity.current.lengthSq() > 0.01) {
                        const lookPos = position.current.clone().add(velocity.current);
                        meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
                    }
                }
                else if (meleeState.current.includes('STARTUP') || meleeState.current.includes('SLASH') || meleeState.current.includes('RECOVERY')) {
                }
                else if (isShooting.current && currentTarget && shootMode.current === 'STOP') {
                    const dirToTarget = currentTarget.position.clone().sub(meshRef.current.position);
                    dirToTarget.y = 0; dirToTarget.normalize();
                    if (dirToTarget.lengthSq() > 0.001) {
                        const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), dirToTarget);
                        meshRef.current.quaternion.slerp(targetQuat, 0.1 * timeScale);
                    }
                }
                else if (isDashing.current) {
                    const lookPos = position.current.clone().add(dashDirection.current);
                    meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
                }
                else if (nextVisualState === 'ASCEND' && moveDir) {
                    const targetLookAt = position.current.clone().sub(moveDir);
                    const m = new Matrix4(); m.lookAt(position.current, targetLookAt, new Vector3(0,1,0));
                    const targetQuat = new Quaternion().setFromRotationMatrix(m);
                    meshRef.current.quaternion.slerp(targetQuat, GLOBAL_CONFIG.ASCENT_TURN_SPEED * timeScale);
                }
                else if (nextVisualState === 'WALK'){
                    const horizVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                    if (horizVel.lengthSq() > 0.001) { 
                        const lookPos = position.current.clone().add(horizVel);
                        meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
                    }
                }
                
                // Allow manual rotation during EVADE only if it's LINEAR, otherwise Orbit handles lookAt
                if (nextVisualState === 'EVADE' && evadeCircularDir.current !== 0 && currentTarget) {
                     // Already handled inside circular logic
                } else {
                    const shouldRealignHorizon = meleeState.current.includes('RECOVERY') || (visualState === 'IDLE' && !isShooting.current) || visualState === 'EVADE';
                    if (shouldRealignHorizon) {
                        const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                        fwd.y = 0; fwd.normalize();
                        if (fwd.lengthSq() > 0.1) {
                            const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), fwd);
                            meshRef.current.quaternion.slerp(targetQuat, 0.15 * timeScale);
                        }
                    }
                }
                
                meshRef.current.updateMatrixWorld(true);
            }

            // ... [Rest of animation logic same as before] ...
            let activeClip = (isGrounded.current && nextVisualState !== 'LANDING') ? ANIMATION_CLIPS.IDLE : ANIMATION_CLIPS.NEUTRAL;
            let speed = 1.0;
            let blend = 0.2; 

            if (stunned) {
                activeClip = ANIMATION_CLIPS.IDLE; 
            } 
            else if (meleeState.current === 'SIDE_STARTUP') {
                activeClip = ANIMATION_CLIPS.MELEE_SIDE_LUNGE;
                speed = 0.5; 
                blend = 0.2;
            }
            else if (meleeState.current === 'SIDE_LUNGE') {
                activeClip = ANIMATION_CLIPS.MELEE_SIDE_LUNGE;
                speed = 0.3; 
                blend = 0.1;
            }
            else if (meleeState.current === 'LUNGE' || meleeState.current === 'STARTUP') {
                activeClip = ANIMATION_CLIPS.MELEE_STARTUP;
                blend = 0.2;
                if(meleeState.current === 'STARTUP') {
                    speed = 1.0;
                    blend = 0.1;
                }
            }
            else if (meleeState.current === 'SLASH_1' || meleeState.current === 'SIDE_SLASH_1') {
                activeClip = (meleeState.current === 'SIDE_SLASH_1') ? ANIMATION_CLIPS.SIDE_SLASH_1 : ANIMATION_CLIPS.MELEE_SLASH_1;
                const dur = meleeState.current === 'SIDE_SLASH_1' 
                    ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1.DURATION_FRAMES 
                    : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.DURATION_FRAMES;
                speed = 60 / dur;
                blend = 0.05; 
            }
            else if (meleeState.current === 'SLASH_2' || meleeState.current === 'SIDE_SLASH_2') {
                activeClip = (meleeState.current === 'SIDE_SLASH_2') ? ANIMATION_CLIPS.SIDE_SLASH_2 : ANIMATION_CLIPS.MELEE_SLASH_2;
                const dur = meleeState.current === 'SIDE_SLASH_2' 
                    ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_2.DURATION_FRAMES 
                    : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.DURATION_FRAMES;
                speed = 60 / dur;
                blend = 0.05;
            }
            else if (meleeState.current === 'SLASH_3' || meleeState.current === 'SIDE_SLASH_3') {
                activeClip = (meleeState.current === 'SIDE_SLASH_3') ? ANIMATION_CLIPS.SIDE_SLASH_3 : ANIMATION_CLIPS.MELEE_SLASH_3;
                const dur = meleeState.current === 'SIDE_SLASH_3' 
                    ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_3.DURATION_FRAMES 
                    : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3.DURATION_FRAMES;
                speed = 60 / dur; 
                blend = 0.05;
            }
            else if (meleeState.current.includes('RECOVERY')) {
                activeClip = ANIMATION_CLIPS.MELEE_RECOVERY;
                speed = 60 / GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                blend = 0.1;
            }
            else if (isDashing.current) {
                activeClip = activeWeapon === 'SABER' ? ANIMATION_CLIPS.DASH_SABER : ANIMATION_CLIPS.DASH_GUN;
                blend = 0.2;
            }
            else if (nextVisualState === 'ASCEND') {
                activeClip = ANIMATION_CLIPS.ASCEND;
                blend = 0.3; 
            }
            
            const resetTime = true; 
            animator.play(activeClip, blend, speed, resetTime); 
            animator.update(delta);
            const animatedPose = animator.getCurrentPose();
            
            const lerpSpeedFall = 0.25 * timeScale;
            const smoothRot = (currentVal: number, targetVal: number) => MathUtils.lerp(currentVal, targetVal, lerpSpeedFall);

            const isFalling = !isGrounded.current && !isDashing.current && nextVisualState !== 'ASCEND' && nextVisualState !== 'EVADE' && nextVisualState !== 'MELEE';
            if (isFalling && !wasFallingRef.current) {
                const vy = velocity.current.y; 
                const h = position.current.y;
                const g = GLOBAL_CONFIG.GRAVITY;
                const discriminant = vy * vy + 2 * g * h;
                totalPredictedFallFrames.current = (discriminant >= 0 && g > 0) ? (vy + Math.sqrt(discriminant)) / g : 60;
                currentFallTime.current = 0;
            }
            wasFallingRef.current = isFalling;

            if (isFalling) {
                currentFallTime.current += timeScale;
                const total = Math.max(totalPredictedFallFrames.current, 1);
                const progress = Math.min(currentFallTime.current / total, 1.0);
                const ratio = GLOBAL_CONFIG.FALL_ANIM_RATIO;
                let animWeight = 0;
                if (progress < ratio) animWeight = progress / ratio;
                else animWeight = 1 - ((progress - ratio) / (1 - ratio));
                
                const targetRightThighX = MathUtils.lerp(DEFAULT_MECH_POSE.RIGHT_LEG.THIGH.x, GLOBAL_CONFIG.FALL_LEG_PITCH_RIGHT, animWeight);
                const targetLeftThighX = MathUtils.lerp(DEFAULT_MECH_POSE.LEFT_LEG.THIGH.x, GLOBAL_CONFIG.FALL_LEG_PITCH_LEFT, animWeight);
                const targetRightKnee = MathUtils.lerp(DEFAULT_MECH_POSE.RIGHT_LEG.KNEE, GLOBAL_CONFIG.FALL_KNEE_BEND_RIGHT, animWeight);
                const targetLeftKnee = MathUtils.lerp(DEFAULT_MECH_POSE.LEFT_LEG.KNEE, GLOBAL_CONFIG.FALL_KNEE_BEND_LEFT, animWeight);
                const targetRightThighZ = MathUtils.lerp(DEFAULT_MECH_POSE.RIGHT_LEG.THIGH.z, GLOBAL_CONFIG.FALL_LEG_SPREAD, animWeight);
                const targetLeftThighZ = MathUtils.lerp(DEFAULT_MECH_POSE.LEFT_LEG.THIGH.z, -GLOBAL_CONFIG.FALL_LEG_SPREAD, animWeight);
                const targetBodyTilt = MathUtils.lerp(DEFAULT_MECH_POSE.TORSO.x, GLOBAL_CONFIG.FALL_BODY_TILT, animWeight);

                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.x = smoothRot(rightLegRef.current.rotation.x, targetRightThighX);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.x = smoothRot(leftLegRef.current.rotation.x, targetLeftThighX);
                if (rightLowerLegRef.current) animatedPose.RIGHT_LEG.KNEE = smoothRot(rightLowerLegRef.current.rotation.x, targetRightKnee);
                if (leftLowerLegRef.current) animatedPose.LEFT_LEG.KNEE = smoothRot(leftLowerLegRef.current.rotation.x, targetLeftKnee);
                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.z = smoothRot(rightLegRef.current.rotation.z, targetRightThighZ);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.z = smoothRot(leftLegRef.current.rotation.z, targetLeftThighZ);
                if (torsoRef.current) animatedPose.TORSO.x = smoothRot(torsoRef.current.rotation.x, targetBodyTilt);
            }

            if (visualState === 'LANDING') {
                const total = GLOBAL_CONFIG.LANDING_VISUAL_DURATION;
                const current = visualLandingFrames.current; 
                const progress = 1 - (current / total); 
                let w = 0;
                const r = GLOBAL_CONFIG.LANDING_ANIM_RATIO;
                if (progress < r) w = progress / r; else w = 1 - ((progress - r) / (1 - r));

                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.x = smoothRot(rightLegRef.current.rotation.x, GLOBAL_CONFIG.LANDING_LEG_PITCH_RIGHT * w);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.x = smoothRot(leftLegRef.current.rotation.x, GLOBAL_CONFIG.LANDING_LEG_PITCH_LEFT * w);
                if (rightLowerLegRef.current) animatedPose.RIGHT_LEG.KNEE = smoothRot(rightLowerLegRef.current.rotation.x, 0.2 + (GLOBAL_CONFIG.LANDING_KNEE_BEND_RIGHT - 0.2) * w);
                if (leftLowerLegRef.current) animatedPose.LEFT_LEG.KNEE = smoothRot(leftLowerLegRef.current.rotation.x, 0.2 + (GLOBAL_CONFIG.LANDING_KNEE_BEND_LEFT - 0.2) * w);
                if (rightFootRef.current) animatedPose.RIGHT_LEG.ANKLE.x = smoothRot(rightFootRef.current.rotation.x, -0.2 + (GLOBAL_CONFIG.LANDING_ANKLE_PITCH_RIGHT - -0.2) * w);
                if (leftFootRef.current) animatedPose.LEFT_LEG.ANKLE.x = smoothRot(leftFootRef.current.rotation.x, -0.2 + (GLOBAL_CONFIG.LANDING_ANKLE_PITCH_LEFT - -0.2) * w);
                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.z = smoothRot(rightLegRef.current.rotation.z, 0.05 + GLOBAL_CONFIG.LANDING_LEG_SPLAY * w);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.z = smoothRot(leftLegRef.current.rotation.z, -0.05 - GLOBAL_CONFIG.LANDING_LEG_SPLAY * w);
                if (torsoRef.current) animatedPose.TORSO.x = smoothRot(torsoRef.current.rotation.x, GLOBAL_CONFIG.LANDING_BODY_TILT * w);
            }

            const isWalking = nextVisualState === 'WALK' && isGrounded.current;
            const targetWalkWeight = isWalking ? 1.0 : 0.0;
            currentWalkWeight.current = MathUtils.lerp(currentWalkWeight.current, targetWalkWeight, 0.15 * timeScale);

            if (currentWalkWeight.current > 0.01) {
                if (isWalking) {
                    const speedVal = new Vector3(velocity.current.x, 0, velocity.current.z).length();
                    if (speedVal > 0.05) {
                        lastWalkCycle.current = walkCycle.current;
                        walkCycle.current += delta * 9.5;
                        const prevStep = Math.floor(lastWalkCycle.current / Math.PI);
                        const currStep = Math.floor(walkCycle.current / Math.PI);
                        if (currStep !== prevStep) playFootSound();
                    }
                }
                const t = walkCycle.current;
                const sin = Math.sin(t);
                const cos = Math.cos(t);
                const w = currentWalkWeight.current;
                animatedPose.RIGHT_LEG.THIGH.x = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.x, -sin * 0.9, w);
                animatedPose.LEFT_LEG.THIGH.x = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.x, sin * 0.9, w);
                const rKneeTarget = Math.max(0, cos) * 1.8 + 0.7;
                const lKneeTarget = Math.max(0, -cos) * 1.8 + 0.7;
                animatedPose.RIGHT_LEG.KNEE = MathUtils.lerp(animatedPose.RIGHT_LEG.KNEE, rKneeTarget, w);
                animatedPose.LEFT_LEG.KNEE = MathUtils.lerp(animatedPose.LEFT_LEG.KNEE, lKneeTarget, w);
                const rAnkleTarget = (rKneeTarget * 0.1) - (sin * 0.6);
                const lAnkleTarget = (lKneeTarget * 0.1) + (sin * 0.6);
                animatedPose.RIGHT_LEG.ANKLE.x = MathUtils.lerp(animatedPose.RIGHT_LEG.ANKLE.x, rAnkleTarget, w);
                animatedPose.LEFT_LEG.ANKLE.x = MathUtils.lerp(animatedPose.LEFT_LEG.ANKLE.x, lAnkleTarget, w);
                animatedPose.TORSO.x = MathUtils.lerp(animatedPose.TORSO.x, 0.5, w); 
                animatedPose.CHEST.y = MathUtils.lerp(animatedPose.CHEST.y, sin * 0.22, w);
                animatedPose.CHEST.z = MathUtils.lerp(animatedPose.CHEST.z, cos * 0.1, w);
                animatedPose.HEAD.y = MathUtils.lerp(animatedPose.HEAD.y, -sin * 0.22, w);
                animatedPose.RIGHT_LEG.THIGH.z = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.z, 0, w);
                animatedPose.LEFT_LEG.THIGH.z = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.z, 0, w);
                animatedPose.RIGHT_LEG.THIGH.y = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.y, 0, w);
                animatedPose.LEFT_LEG.THIGH.y = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.y, 0, w);
            }

            if (isShooting.current && currentTarget && gunArmRef.current) {
                const shoulderPos = new Vector3();
                gunArmRef.current.getWorldPosition(shoulderPos);
                const targetPos = currentTarget.position.clone();
                const dirToTarget = targetPos.sub(shoulderPos).normalize();
                const bodyInverseQuat = meshRef.current.quaternion.clone().invert();
                const localDir = dirToTarget.applyQuaternion(bodyInverseQuat);
                const defaultForward = new Vector3(0, -1, 0.2).normalize();
                const aimQuat = new Quaternion().setFromUnitVectors(defaultForward, localDir);
                const aimEuler = new Euler().setFromQuaternion(aimQuat);
                const startup = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES;
                const aiming = GLOBAL_CONFIG.SHOT_AIM_DURATION;
                const recovery = shootMode.current === 'STOP' ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                let aimWeight = 0;
                if (shootTimer.current < startup) {
                    if (shootTimer.current < aiming) {
                        const t = shootTimer.current / aiming;
                        aimWeight = 1 - Math.pow(1 - t, 3);
                    } else {
                        aimWeight = 1.0;
                    }
                } else {
                    const t = (shootTimer.current - startup) / recovery;
                    aimWeight = 1.0 - t;
                }
                animatedPose.LEFT_ARM.SHOULDER.x = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.x, aimEuler.x, aimWeight);
                animatedPose.LEFT_ARM.SHOULDER.y = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.y, aimEuler.y, aimWeight);
                animatedPose.LEFT_ARM.SHOULDER.z = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.z, aimEuler.z, aimWeight);
            }
            
            let targetInertiaX = 0;
            let targetInertiaZ = 0;
            if (!stunned) {
                const enableInertiaSway = nextVisualState === 'EVADE';
                if (enableInertiaSway && !isFalling) {
                    const invRot = meshRef.current.quaternion.clone().invert();
                    const localVel = velocity.current.clone().applyQuaternion(invRot);
                    targetInertiaX = localVel.z * 1.5;
                    targetInertiaZ = -localVel.x * 1.5;
                }
            }
            const swaySpeed = 0.2 * timeScale;
            currentLegInertiaRot.current.x = MathUtils.lerp(currentLegInertiaRot.current.x, targetInertiaX, swaySpeed);
            currentLegInertiaRot.current.z = MathUtils.lerp(currentLegInertiaRot.current.z, targetInertiaZ, swaySpeed);

            let targetHipOffset = 0;
            if (visualState === 'LANDING') {
                const current = visualLandingFrames.current; 
                const total = GLOBAL_CONFIG.LANDING_VISUAL_DURATION;
                const progress = 1 - (current / total); 
                const r = GLOBAL_CONFIG.LANDING_ANIM_RATIO;
                let w = 0;
                if (progress < r) w = progress / r; else w = 1 - ((progress - r) / (1 - r));
                targetHipOffset = -(GLOBAL_CONFIG.LANDING_HIP_DIP * w);
            }

            if (visualState === 'LANDING') {
                currentHipOffset.current = targetHipOffset;
            } else {
                currentHipOffset.current = MathUtils.lerp(currentHipOffset.current, 0, 0.2 * timeScale);
            }

            applyPoseToModel(animatedPose, currentHipOffset.current, currentLegInertiaRot.current);

            if (headRef.current && !stunned) {
                const animHeadQuat = new Quaternion().setFromEuler(new Euler(animatedPose.HEAD.x, animatedPose.HEAD.y, animatedPose.HEAD.z));
                let targetQuat = animHeadQuat;
                let trackSpeed = 0.1 * timeScale;
                const isMelee = meleeState.current !== 'NONE';
                const isCinematic = useGameStore.getState().isCinematicCameraActive;
                if (!isMelee && !isCinematic) {
                    const currentTarget = targets[currentTargetIndex];
                    if (currentTarget) {
                        meshRef.current.updateMatrixWorld();
                        const headWorldPos = new Vector3();
                        headRef.current.getWorldPosition(headWorldPos);
                        const targetLookPos = currentTarget.position.clone().add(new Vector3(0, 1.0, 0));
                        const dirToTarget = targetLookPos.clone().sub(headWorldPos).normalize();
                        const bodyFwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion).normalize();
                        if (bodyFwd.dot(dirToTarget) > 0.2) {
                            const parentWorldQuat = new Quaternion();
                            if (headRef.current.parent) {
                                headRef.current.parent.getWorldQuaternion(parentWorldQuat);
                            }
                            const m = new Matrix4();
                            m.lookAt(headWorldPos, targetLookPos, new Vector3(0, 1, 0)); 
                            const worldLookQuat = new Quaternion().setFromRotationMatrix(m);
                            const localLookQuat = parentWorldQuat.clone().invert().multiply(worldLookQuat);
                            const correction = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
                            localLookQuat.multiply(correction);
                            targetQuat = localLookQuat;
                            trackSpeed = 0.2 * timeScale; 
                        }
                    }
                } else {
                    trackSpeed = 0.2 * timeScale;
                }
                headLookQuat.current.slerp(targetQuat, trackSpeed);
                headRef.current.quaternion.copy(headLookQuat.current);
            }

            if (isShooting.current) {
                // ... [Shooting Logic same as before] ...
                shootTimer.current += 1 * timeScale; 
                const currentRecovery = shootMode.current === 'STOP' ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                const totalShotFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;
                if (shootTimer.current >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && !hasFired.current) {
                    hasFired.current = true;
                    playShootSound();
                    setShowMuzzleFlash(true);
                    setTimeout(() => setShowMuzzleFlash(false), 100);
                    const spawnPos = new Vector3();
                    if (muzzleRef.current) muzzleRef.current.getWorldPosition(spawnPos);
                    else spawnPos.copy(position.current).add(new Vector3(0, 2, 0));
                    const targetEntity = targets[currentTargetIndex];
                    let direction: Vector3;
                    if (targetEntity) {
                        direction = targetEntity.position.clone().sub(spawnPos).normalize();
                    } else {
                        if (muzzleRef.current) {
                            const fwd = new Vector3(); muzzleRef.current.getWorldDirection(fwd); direction = fwd.normalize();
                        } else { direction = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion); }
                    }
                    spawnProjectile({
                        id: `proj-${Date.now()}`, ownerId: 'player', targetId: targetEntity ? targetEntity.id : null,
                        position: spawnPos, velocity: direction.multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED),
                        forwardDirection: direction.clone(), isHoming: lockState === LockState.RED, team: Team.BLUE, ttl: 300
                    });
                }
                if (shootTimer.current >= totalShotFrames) {
                    isShooting.current = false; shootTimer.current = 0;
                    if (isGrounded.current && shootMode.current === 'STOP') landingFrames.current = getLandingLag();
                }
            }
        }

        const { isCinematicCameraActive } = useGameStore.getState();
        const currentTarget = targets[currentTargetIndex];
        const camConfig = GLOBAL_CONFIG.CINEMATIC_CAMERA;
        
        let targetCamPos = position.current.clone().add(new Vector3(0, 7, 14)); 
        let targetLookAt = position.current.clone().add(new Vector3(0, 2, 0)); 
        let targetFov = 60; 
        let lerpFactor = 0.1 * timeScale;

        if (isCinematicCameraActive && meshRef.current) {
            const offset = camConfig.OFFSET; 
            const localOffset = new Vector3(offset.x, offset.y, offset.z);
            localOffset.applyQuaternion(meshRef.current.quaternion);
            targetCamPos = position.current.clone().add(localOffset);
            targetLookAt = position.current.clone().add(new Vector3(0, 1.5, 0)); 
            targetFov = camConfig.FOV;
            lerpFactor = camConfig.SMOOTHING * timeScale;
        } else {
            if (currentTarget) {
                const pToT = new Vector3().subVectors(currentTarget.position, position.current);
                const dir = pToT.normalize();
                targetCamPos = position.current.clone().add(dir.multiplyScalar(-10)).add(new Vector3(0, 6, 0));
                targetLookAt = position.current.clone().lerp(currentTarget.position, 0.3); targetLookAt.y += 2.0; 
            } else {
                targetCamPos = position.current.clone().add(new Vector3(0, 6, 10)); 
                targetLookAt = position.current.clone().add(new Vector3(0, 2, 0));
            }
        }
        
        if (hitStop > 0) {
            const shake = 0.3; 
            targetCamPos.add(new Vector3((Math.random()-0.5)*shake, (Math.random()-0.5)*shake, (Math.random()-0.5)*shake));
        } else if (wasStunnedRef.current) {
             const shake = 0.1;
             targetCamPos.add(new Vector3((Math.random()-0.5)*shake, (Math.random()-0.5)*shake, (Math.random()-0.5)*shake));
        }
        
        camera.position.lerp(targetCamPos, lerpFactor);
        camera.lookAt(targetLookAt);

        if (camera instanceof PerspectiveCamera) {
            if (Math.abs(camera.fov - targetFov) > 0.1) {
                camera.fov = MathUtils.lerp(camera.fov, targetFov, lerpFactor);
                camera.updateProjectionMatrix();
            }
        }
    });

    // ... [Rest of Player component (Return statement) same as before] ...
    const isDashingOrAscending = visualState === 'DASH' || visualState === 'ASCEND' || visualState === 'MELEE';
    const isTrailActive = trailTimer.current > 0; 
    const isAscending = visualState === 'ASCEND';
    const isThrusting = isDashingOrAscending;

    const armorColor = '#E9EAEB';
    const chestColor = '#727CDB';
    const feetColor = '#D94850';
    const waistColor = '#D94850'
    
    return (
        <group>
            <mesh ref={meshRef}>
                {/* ROOT-LEVEL SLASH VFX - Moves with player, but logic handles local offset/rotation */}
                <ProceduralSlashEffect meleeState={meleeState} parentRef={meshRef} />

                <group position={[0, 2.0, 0]}>
                    <group ref={torsoRef}>
                    {/* ... [Body parts rendering code same as before] ... */}
                {/* --- WAIST VISUALS (New Trapezoid Armor) --- */}
                {/* Waist_1 (Upper/Mid Waist) */}
                <group position={[0, 0.26, -0.043]} rotation={[0, 0, 0]} scale={[0.8, 0.7, 0.9]}>
                    <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                </group>
                
                {/* Waist_2 (Lower Waist) */}
                <group position={[0, 0.021, -0.044]} rotation={[-3.143, 0, 0]} scale={[0.8, 0.9, 0.9]}>
                    <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                </group>
                <HipVisuals armorColor={armorColor} feetColor={feetColor} waistColor={waistColor} />

                {/* Hidden Logic Box (Original Waist) */}
                <mesh position={[0, 0, 0]} visible={false}>
                    <boxGeometry args={[0.1, 0.1, 0.1]} />
                    <meshBasicMaterial color="red" />
                </mesh>

                {/* --- CHEST LOGIC GROUP --- */}
                <group ref={upperBodyRef} position={[0, 0.65, 0]}>
                    
                    {/* CHEST VISUALS GROUP */}
                    <group name="ChestVisuals">
                        {/* CHEST_1 */}
                        <group position={[0, 0.013, -0.043]} rotation={[0, 0, 0]} scale={[1.5, 1.2, 0.8]}>
                             <mesh>
                                <boxGeometry args={[0.5, 0.5, 0.5]} />
                                <MechMaterial color={chestColor} />
                                {isOutlineOn && <Outlines thickness={4} color="#111" />}
                             </mesh>
                        </group>

                        {/* CHEST_2 */}
                        <group position={[0, 0.321, -0.016]} rotation={[0, 0, 0]} scale={[0.8, 0.1, 0.7]}>
                             <mesh>
                                <boxGeometry args={[0.5, 0.5, 0.5]} />
                                <MechMaterial color="#FFD966" />
                                {isOutlineOn && <Outlines thickness={4} color="#111" />}
                             </mesh>
                        </group>

                        {/* CHEST_3 */}
                        <group position={[0, -0.025, 0.236]} rotation={[1.9, 0, 0]} scale={[1.5, 1, 1.5]}>
                            <Trapezoid args={[0.5, 0.35, 0.35, 1, 0.45]} color={chestColor} />
                        </group>

                        {/* CHEST_4 */}
                        <group position={[0, 0.254, 0.215]} rotation={[2.21, -1.572, 0]} scale={[0.8, 1, 1]}>
                            <Trapezoid args={[0.1, 0.2, 0.4, 1, 0.4]} color="#FFD966" />
                        </group>

                        {/* chest_plate */}
                        <group position={[0, -0.264, 0.29]} rotation={[0.3, 0, 0]} scale={[0.4, 1.6, 0.3]}>
                            <Trapezoid args={[0.5, 0.5, 0.25, 1, 5.85]} color={chestColor} />
                        </group>
                        
                        {/* vent_l */}
                        <group position={[0.226, -0.088, 0.431]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                             <mesh>
                                <boxGeometry args={[0.35, 0.25, 0.05]} />
                                <MechMaterial color="#FFD966" />
                                {isOutlineOn && <Outlines thickness={4} color="#111" />}
                             </mesh>
                        </group>

                        {/* vent_r */}
                        <group position={[-0.225, -0.091, 0.43]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                             <mesh>
                                <boxGeometry args={[0.35, 0.25, 0.05]} />
                                <MechMaterial color="#FFD966" />
                                {isOutlineOn && <Outlines thickness={4} color="#111" />}
                             </mesh>
                        </group>
                    </group>

                    {/* HEAD */}
                    <group ref={headRef}>
                        <MechaHead mainColor={armorColor} />
                        <mesh  position= {[-0.026173806758658973,0.4198127335434858,0.3864234815174432]} rotation={[0.2,-0.52,0.4]} scale={[0.6,0.1,1]}>
                            <boxGeometry args={[0.05, 0.05, 0]} />
                            <meshBasicMaterial color="#000000" />
                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                        </mesh>
                        <mesh  position= {[-0.026,0.40484563871317003,0.3815201267665433]} rotation={[0.2,-0.52,0.4]} scale={[0.6,0.1,1]}>
                            <boxGeometry args={[0.05, 0.05, 0]} />
                            <meshBasicMaterial color="#000000" />
                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                        </mesh>                        
                        <mesh  position= { [-0.003790769061516548,0.42,0.386]} rotation={[0.2,0.52,-0.4]} scale={[0.6,0.1,1]}>
                            <boxGeometry args={[0.05, 0.05, 0]} />
                            <meshBasicMaterial color="#000000" />
                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                        </mesh>                        
                        <mesh  position= {[-0.003852766592489121,0.405,0.381]} rotation={[0.2,0.52,-0.4]} scale={[0.6,0.1,1]}>
                            <boxGeometry args={[0.05, 0.05, 0]} />
                            <meshBasicMaterial color="#000000" />
                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                        </mesh>   
                    </group>

                    {/* RIGHT ARM */}
                    <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                        <group position={[0.034, 0, 0.011]}>
                            {/* R Shoulder_1 */}
                             <group position={[0.013, 0.032, -0.143]} scale={[1, 0.7, 0.8]}>
                                <mesh>
                                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                                    <MechMaterial color={armorColor} />
                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                </mesh>
                             </group>
                        </group>

                        <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                        <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]} ref={rightForeArmRef}>
                            <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><MechMaterial color="#444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                            <group ref={rightForearmTwistRef}>
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                    <mesh>
                                        <boxGeometry args={[0.28, 0.6, 0.35]} />
                                        <MechMaterial color={armorColor} />
                                        {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                    </mesh>
                                    <group ref={rightWristRef} position={[0, -0.35, 0]}>
                                        <mesh>
                                            <boxGeometry args={[0.25, 0.3, 0.25]} />
                                            <MechMaterial color="#666" />
                                            {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                        </mesh>
                                    </group>
                                </group>
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={shieldRef}>
                                        <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                            <mesh position={[0, 0.2, 0]}>
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
                            </group>
                        </group>
                    </group>

                    {/* LEFT ARM */}
                    <group position={[-0.65, 0.1, 0]} ref={gunArmRef} >
                         <group position={[-0.039, 0.047, -0.127]} scale={[1, 0.7, 0.8]}>
                            {/* L Shoulder_1 */}
                             <mesh>
                                <boxGeometry args={[0.5, 0.5, 0.5]} />
                                <MechMaterial color={armorColor} />
                                {isOutlineOn && <Outlines thickness={4} color="#111" />}
                             </mesh>
                         </group>

                        <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                        <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]} ref={leftForeArmRef}>
                            <mesh>
                                <boxGeometry args={[0.25, 0.6, 0.3]} />
                                <MechMaterial color="#666" />
                                {isOutlineOn && <Outlines thickness={4} color="#111" />}
                            </mesh>
                            <group ref={leftForearmTwistRef}>
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                    <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    <group ref={leftWristRef} position={[0, -0.35, 0]}>
                                        <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><MechMaterial color="#666" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                        
                                        {/* SABER MODEL */}
                                        <group visible={activeWeapon === 'SABER'} position={[0, 0, 0.1]} rotation={[Math.PI/1.8, 0, 0]}>
                                            <group visible={activeWeapon === 'SABER'}>
                                                <mesh position={[0, -0.25, 0]}>
                                                    <cylinderGeometry args={[0.035, 0.04, 0.7, 8]} />
                                                    <MechMaterial color="white" />
                                                    {isOutlineOn && <Outlines thickness={4} color="#111" />}
                                                </mesh>
                                                <mesh position={[0, 1.4, 0]}>
                                                    <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
                                                    <meshBasicMaterial color="white" />
                                                </mesh>
                                                <mesh position={[0, 1.4, 0]}>
                                                    <cylinderGeometry args={[0.12, 0.12, 2.6, 8]} />
                                                    <meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
                                                </mesh>
                                            </group>
                                        </group>
                                    </group>
                                    <group visible={activeWeapon === 'GUN'} ref={gunMeshRef} position={[0, -0.2, 0.3]} rotation={[1.5, 0, Math.PI]}>
                                            <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.1, 0.2, 0.15]} /><MechMaterial color="#666" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><MechMaterial color="#444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <mesh position={[0, 0.2, 1.0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6]} /><MechMaterial color="#666" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <mesh position={[0.05, 0.35, 0.2]}><cylinderGeometry args={[0.08, 0.08, 0.3, 8]} rotation={[Math.PI/2, 0, 0]}/><MechMaterial color="#666" />{isOutlineOn && <Outlines thickness={4} color="#111" />}
                                                <mesh position={[0, 0.15, 0]} rotation={[Math.PI/2, 0, 0]}><circleGeometry args={[0.06]} /><meshBasicMaterial color="#00ff00" /></mesh>
                                            </mesh>
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
                        <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#666" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                        <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#666" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                        <BoostBurst triggerTime={dashTriggerTime} />
                    </group>
                </group>
            </group>
                    
                    {/* LEGS GROUP */}
                    <group ref={legsRef}>
                        <group ref={rightLegRef} position={[0.25, -0.3, 0]} rotation={[-0.1, 0, 0.05]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />
                            <group ref={rightLowerLegRef} position={[0, -0.75, 0]} rotation={[0.3, 0, 0]}>
                                <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <group ref={rightFootRef} position={[0, -0.8, 0.05]} rotation={[-0.2, 0, 0]}>
                                    <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><MechMaterial color={feetColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    <GhostEmitter active={isTrailActive} size={[0.32, 0.2, 0.7]} offset={[0, -0.1, 0.1]} rainbow={trailRainbow.current} />
                                </group>
                            </group>
                        </group>
                        <group ref={leftLegRef} position={[-0.25, -0.3, 0]} rotation={[-0.1, 0, -0.05]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />
                            <group ref={leftLowerLegRef} position={[0, -0.75, 0]} rotation={[0.2, 0, 0]}>
                                <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <group ref={leftFootRef} position={[0, -0.8, 0.05]} rotation={[-0.1, 0, 0]}>
                                    <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><MechMaterial color={feetColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                    <GhostEmitter active={isTrailActive} size={[0.32, 0.2, 0.7]} offset={[0, -0.1, 0.1]} rainbow={trailRainbow.current} />
                                </group>
                            </group>
                        </group>
                    </group>
                </group>
            </mesh>
        </group>
    );
}

