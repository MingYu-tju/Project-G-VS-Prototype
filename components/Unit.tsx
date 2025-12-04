
import React, { useRef, useState, useEffect, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, MathUtils, Quaternion, Euler, Color, BoxGeometry, ShaderMaterial, AdditiveBlending, Matrix4 } from 'three';
import { Html, useGLTF, Outlines } from '@react-three/drei';
import { Team, GLOBAL_CONFIG, RED_LOCK_DISTANCE, MechPose, DEFAULT_MECH_POSE, RotationVector } from '../types';
import { useGameStore } from '../store';
import { ANIMATION_CLIPS } from '../animations'; 
import { AnimationController } from './AnimationSystem';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { playBoostSound, playStepSound, playHitSound, playFootSound, playShootSound } from './AudioController';
import { ProceduralSlashEffect, BoostBurst, ThrusterPlume, MuzzleFlash, GhostEmitter } from './VFX';

import { 
    AIContext, 
    parseBehaviorTree 
} from './AIEngine';

// ... [SHADERS & MATERIALS UNCHANGED] ...
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
        
        float NdotL = dot(normal, uLightDir);
        float lightIntensity = smoothstep(-0.2, 0.2, NdotL); 
        
        vec3 baseColor = mix(uColor * 0.4, uColor, lightIntensity); 

        float NdotV = dot(normal, viewDir);
        float rim = 1.0 - max(NdotV, 0.0);
        rim = pow(rim, uRimPower);
        
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
                {isOutlineOn && <Outlines thickness={4} color="#111"  />}
            </mesh>
    );
};

const HipVisuals = memo(({ armorColor, feetColor, waistColor }: { armorColor: string, feetColor: string, waistColor: string }) => {
    const isOutlineOn = useGameStore(state => state.isOutlineOn);
    const { whiteGeo, darkGeo, redGeo, yellowGeo } = useMemo(() => {
        const buckets: Record<string, THREE.BufferGeometry[]> = { white: [], dark: [], red: [], yellow: [] };
        const add = (geo: THREE.BufferGeometry, bucketKey: string, local: any, parent?: any) => {
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
        add(GeoFactory.box(0.5, 0.5, 0.5), 'dark', { p:[0, -0.296, 0], r:[0,0,0], s:[0.4, 1, 1] });
        add(GeoFactory.trapz([0.1, 0.3, 0.15, 4.45, 1]), 'white', { p:[0, -0.318, 0.365], r:[-1.571, -1.571, 0], s:[1, 0.8, 1.3] });
        add(GeoFactory.trapz([0.2, 0.2, 0.25, 1, 0.45]), 'white', { p:[0, -0.125, 0.257], r:[0,0,0], s:[1, 0.8, 1.1] });
        add(GeoFactory.box(0.2, 0.05, 0.15), 'red', { p:[0, -0.125, 0.356], r:[1.13, 0, 0], s:[0.9, 0.5, 1] });
        add(GeoFactory.box(0.2, 0.05, 0.2), 'red', { p:[0, -0.207, 0.408], r:[0.6, 0, 0], s:[0.9, 0.4, 0.8] });
        const merge = (arr: THREE.BufferGeometry[]) => arr.length > 0 ? BufferGeometryUtils.mergeGeometries(arr) : null;
        return { whiteGeo: merge(buckets.white), darkGeo: merge(buckets.dark), redGeo: merge(buckets.red), yellowGeo: merge(buckets.yellow) };
    }, []);
    useEffect(() => {
        return () => { if(whiteGeo) whiteGeo.dispose(); if(darkGeo) darkGeo.dispose(); if(redGeo) redGeo.dispose(); if(yellowGeo) yellowGeo.dispose(); };
    }, [whiteGeo, darkGeo, redGeo, yellowGeo]);
    return (
        <group name="HipMerged">
            {darkGeo && <mesh geometry={darkGeo}><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111"  />}</mesh>}
            {whiteGeo && <mesh geometry={whiteGeo}><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111"  />}</mesh>}
            {redGeo && <mesh geometry={redGeo}><MechMaterial color="#ff0000" />{isOutlineOn && <Outlines thickness={4} color="#111"  />}</mesh>}
        </group>
    );
});

const ChestVisuals = memo(({ chestColor }: { chestColor: string }) => {
    const isOutlineOn = useGameStore(state => state.isOutlineOn);
    const { chestGeo, yellowGeo, darkGeo } = useMemo(() => {
        const buckets: Record<string, THREE.BufferGeometry[]> = { chest: [], yellow: [], dark: [] };
        const add = (geo: THREE.BufferGeometry, bucketKey: string, local: any, parent?: any) => {
            if (local.s) geo.scale(local.s[0], local.s[1], local.s[2]);
            if (local.r) { geo.rotateZ(local.r[2]); geo.rotateY(local.r[1]); geo.rotateX(local.r[0]); }
            if (local.p) geo.translate(local.p[0], local.p[1], local.p[2]);
            buckets[bucketKey].push(geo);
        };
        add(GeoFactory.trapz([0.5, 0.5, 0.25, 1, 5.85]), 'chest', { p: [0, -0.264, 0.284], r: [0.3, 0, 0], s: [0.4, 1.6, 0.3] });
        add(GeoFactory.box(0.5, 0.5, 0.5), 'chest', { p: [0, 0.013, -0.043], r: [0,0,0], s: [1.5, 1.2, 0.8] });
        add(GeoFactory.trapz([0.5, 0.35, 0.35, 1, 0.45]), 'chest', { p: [0, -0.025, 0.236], r: [1.9, 0, 0], s: [1.5, 1, 1.5] });
        const merge = (arr: THREE.BufferGeometry[]) => arr.length > 0 ? BufferGeometryUtils.mergeGeometries(arr) : null;
        return { chestGeo: merge(buckets.chest), yellowGeo: merge(buckets.yellow), darkGeo: merge(buckets.dark) };
    }, []);
    useEffect(() => {
        return () => { if(chestGeo) chestGeo.dispose(); if(yellowGeo) yellowGeo.dispose(); if(darkGeo) darkGeo.dispose(); };
    }, [chestGeo, yellowGeo, darkGeo]);
    return (
        <group name="ChestMerged">
            {chestGeo && <mesh geometry={chestGeo}><MechMaterial color={chestColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>}
        </group>
    );
});

const MODEL_PATH = '/models/head.glb';
useGLTF.preload(MODEL_PATH);
const MechaHead = memo(({ mainColor }: { mainColor: string }) => {
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
});

type MeleePhase = 
    'NONE' | 'STARTUP' | 'LUNGE' | 'SLASH_1' | 'SLASH_2' | 'SLASH_3' | 'RECOVERY' |
    'SIDE_STARTUP' | 'SIDE_LUNGE' | 'SIDE_SLASH_1' | 'SIDE_SLASH_2' | 'SIDE_SLASH_3' | 'SIDE_RECOVERY';

interface UnitProps {
  id: string;
  position: Vector3;
  team: Team;
  name: string;
  isTargeted: boolean;
  lastHitTime: number;
  lastHitDuration: number; 
  knockbackDir?: Vector3;
  knockbackPower?: number;
  isKnockedDown?: boolean;
  hitStop: number; 
}

export const Unit: React.FC<UnitProps> = ({ id, position: initialPos, team, name, isTargeted, lastHitTime, lastHitDuration = GLOBAL_CONFIG.KNOCKBACK_DURATION, knockbackDir, knockbackPower = 1.0, isKnockedDown = false, hitStop }) => {
  const groupRef = useRef<Group>(null);
  const rotateGroupRef = useRef<Group>(null); 
  
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
  
  const rightForeArmRef = useRef<Group>(null);
  const leftForeArmRef = useRef<Group>(null);
  const leftForearmTwistRef = useRef<Group>(null);
  const rightForearmTwistRef = useRef<Group>(null);
  const leftWristRef = useRef<Group>(null);
  const rightWristRef = useRef<Group>(null);
  
  const gunMeshRef = useRef<Group>(null);
  const shieldRef = useRef<Group>(null);
  const muzzleRef = useRef<Group>(null);
  
  const rightSaberRef = useRef<Group>(null);
  const armShieldMountRef = useRef<Group>(null);
  const backShieldMountRef = useRef<Group>(null);
  const shieldTargetPos = useRef(new Vector3());
  const shieldTargetRot = useRef(new Quaternion());
  const isShieldDetached = useRef(false);
  const wasDualWielding = useRef(false);

  const position = useRef(initialPos.clone());
  const velocity = useRef(new Vector3(0, 0, 0));
  const isGrounded = useRef(true);
  const landingFrames = useRef(0);
  const boost = useRef(100);
  
  const ammo = useRef(GLOBAL_CONFIG.MAX_AMMO); 
  const ammoRegenTimer = useRef(0);
  const stateDuration = useRef(0); // NEW: Track time in current state

  const visualLandingFrames = useRef(0);
  const wasFallingRef = useRef(false);
  const currentFallTime = useRef(0);
  const totalPredictedFallFrames = useRef(0);
  const currentHipOffset = useRef(0);
  const currentLegInertiaRot = useRef({ x: 0, y: 0, z: 0 });
  const [dashTriggerTime, setDashTriggerTime] = useState(0); 
  
  const trailRainbow = useRef(false);
  const trailTimer = useRef(0); 
  
  const isOutlineOn = useGameStore(state => state.isOutlineOn);

  const walkCycle = useRef(0);
  const lastWalkCycle = useRef(0);
  const currentWalkWeight = useRef(0);

  // AI State Machine
  const aiState = useRef<'IDLE' | 'DASHING' | 'ASCENDING' | 'FALLING' | 'SHOOTING' | 'MELEE' | 'EVADE' | 'KNOCKED_DOWN' | 'WAKE_UP'>('IDLE');
  // Track prev state to reset duration
  const prevAiState = useRef(aiState.current);
  
  const aiTimer = useRef(0);
  const aiDecisionTimer = useRef(0);
  
  const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
  const shootTimer = useRef(0);
  const hasFired = useRef(false); // EXPOSED TO AI CONTEXT

  const targetSwitchTimer = useRef(0);
  const localTargetId = useRef<string | null>(null);
  const shootCooldown = useRef(0);
  
  const wakeUpTimer = useRef(0);
  const wasKnockedDownRef = useRef(false);
  const knockdownTriggerTimeRef = useRef(0); 

  const dashDirection = useRef(new Vector3(0, 0, 1));
  const currentDashSpeed = useRef(0);
  const moveInput = useRef(new Vector3(0, 0, 0));
  
  // Melee Logic Vars
  const meleeState = useRef<MeleePhase>('NONE');
  const meleeTimer = useRef(0);
  const meleeStartupTimer = useRef(0);
  const hasMeleeHitRef = useRef(false);
  const meleeHitConfirmed = useRef(false);
  const activeMeleeTargetId = useRef<string | null>(null);
  const meleeSideDirection = useRef<number>(0);
  const meleeStartTimeRef = useRef(0); 

  // Evade Logic Vars
  const evadeDirection = useRef(new Vector3(0,0,0));
  const isRainbowStep = useRef(false); 

  const [isThrusting, setIsThrusting] = useState(false);
  const [isAscendingState, setIsAscendingState] = useState(false); 
  const [isStunned, setIsStunned] = useState(false);
  const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
  const [isTrailActive, setIsTrailActive] = useState(false);
  
  const isAscending = isAscendingState;
  
  const animator = useMemo(() => new AnimationController(), []);
  const headLookQuat = useRef(new Quaternion());
  
  const spawnProjectile = useGameStore(state => state.spawnProjectile);
  const applyHit = useGameStore(state => state.applyHit);
  const areNPCsPaused = useGameStore(state => state.areNPCsPaused); 
  const cutTracking = useGameStore(state => state.cutTracking); 
  const triggerMeleeCut = useGameStore(state => state.triggerMeleeCut); 
  const updateUnitMeleeTarget = useGameStore(state => state.updateUnitMeleeTarget); 
  const clockRef = useRef(0);

  const aiTreeData = useGameStore(state => state.aiTreeData);
  const behaviorTree = useMemo(() => {
      return parseBehaviorTree(aiTreeData);
  }, [aiTreeData]);

  useEffect(() => {
      updateUnitMeleeTarget(id, activeMeleeTargetId.current);
  }, [activeMeleeTargetId.current]);

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
       if (legsRef.current) legsRef.current.rotation.set(legContainerRot.x, legContainerRot.y, legContainerRot.z);
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
       if (armShieldMountRef.current && pose.SHIELD) {
           armShieldMountRef.current.position.set(pose.SHIELD.POSITION.x, pose.SHIELD.POSITION.y, pose.SHIELD.POSITION.z);
           armShieldMountRef.current.rotation.set(pose.SHIELD.ROTATION.x, pose.SHIELD.ROTATION.y, pose.SHIELD.ROTATION.z);
       }
  };

  useFrame((state, delta) => {
    if (!groupRef.current || !rotateGroupRef.current) return;

    const now = Date.now();
    const timeScale = delta * 60;
    
    // --- STATE DURATION TRACKING ---
    if (prevAiState.current !== aiState.current) {
        stateDuration.current = 0;
        prevAiState.current = aiState.current;
    } else {
        stateDuration.current += delta;
    }

    if (trailTimer.current > 0) {
        trailTimer.current -= 1 * timeScale;
    }
    const shouldTrail = trailTimer.current > 0;
    if (shouldTrail !== isTrailActive) {
        setIsTrailActive(shouldTrail);
    }
    
    // Ammo Regen
    ammoRegenTimer.current += delta;
    if (ammoRegenTimer.current > GLOBAL_CONFIG.AMMO_REGEN_TIME) {
        ammo.current = Math.min(ammo.current + 1, GLOBAL_CONFIG.MAX_AMMO);
        ammoRegenTimer.current = 0;
    }

    if (hitStop > 0) {
         const shakeIntensity = 0.1; 
         const rx = (Math.random() - 0.5) * shakeIntensity;
         const ry = (Math.random() - 0.5) * shakeIntensity;
         const rz = (Math.random() - 0.5) * shakeIntensity;
         
         const currentPos = position.current.clone();
         groupRef.current.position.set(currentPos.x + rx, currentPos.y + ry, currentPos.z + rz);
         return;
    }
    
    clockRef.current += delta;
    let nextVisualState: 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' | 'MELEE' = 'IDLE';
    
    const freshState = useGameStore.getState();
    const npcConfig = freshState.npcConfig;
    const freshTargets = freshState.targets;
    const freshPlayerPos = freshState.playerPos;
    
    // --- DEFINE CURRENT TARGET ---
    // Resolve active target: Sticky melee target OR current logic target
    const effectiveTargetId = (aiState.current === 'MELEE' && activeMeleeTargetId.current) 
            ? activeMeleeTargetId.current 
            : localTargetId.current;
    
    const currentTarget = effectiveTargetId === 'player' 
        ? { id: 'player', position: freshPlayerPos.clone() } 
        : (freshTargets.find(t => t.id === effectiveTargetId) || null);

    const getTargetPos = (): Vector3 | null => {
         return currentTarget ? currentTarget.position.clone() : null;
    };
    
    const getVolume = (base: number) => {
        const soundDist = position.current.distanceTo(freshPlayerPos);
        const maxDist = 100;
        if (soundDist > maxDist) return 0;
        const factor = 1 - (soundDist / maxDist);
        return factor * factor * base;
    };

    // --- HELPER: AI CONTEXT FOR BEHAVIOR TREE ---
    const aiContext: AIContext = {
        id: id,
        config: npcConfig,
        distToTarget: ((): number => {
             const tPos = getTargetPos();
             return tPos ? position.current.distanceTo(tPos) : 9999;
        })(),
        isTargetVisible: true,
        boost: boost.current,
        hasThreat: ((): boolean => {
             const projectiles = freshState.projectiles;
             if (!projectiles) return false;
             const myPos = position.current;
             for (const p of projectiles) {
                 if (p.team !== team) { 
                     const dist = p.position.distanceTo(myPos);
                     if (dist < npcConfig.DODGE_CHECK_RADIUS) { 
                          const toMe = myPos.clone().sub(p.position).normalize();
                          const pVel = p.velocity.clone().normalize();
                          if (pVel.dot(toMe) > 0.8) return true;
                     }
                 }
             }
             return false;
        })(),
        isMeleeTargeted: freshState.playerMeleeTargetId === id,
        canAct: aiState.current === 'IDLE' || aiState.current === 'DASHING' || aiState.current === 'ASCENDING',
        canDefend: (aiState.current === 'IDLE' || aiState.current === 'DASHING' || aiState.current === 'ASCENDING' || aiState.current === 'SHOOTING') && landingFrames.current <= 0,
        shootCooldown: shootCooldown.current,
        
        // NEW STATE FIELDS
        aiState: aiState.current,
        meleePhase: meleeState.current,
        isMeleeHit: meleeHitConfirmed.current,
        meleeTimer: meleeTimer.current,
        ammo: ammo.current,
        stateDuration: stateDuration.current,
        hasFired: hasFired.current,
        
        actions: {
            evade: (isRainbow: boolean) => {
                aiState.current = 'EVADE';
                stateDuration.current = 0; // Reset
                isRainbowStep.current = isRainbow;
                trailRainbow.current = isRainbow;
                trailTimer.current = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_TRAIL_DURATION : GLOBAL_CONFIG.EVADE_TRAIL_DURATION;
                meleeState.current = 'NONE';
                if (activeMeleeTargetId.current) cutTracking(id);
                triggerMeleeCut(id);
                const fwd = new Vector3(0,0,1).applyQuaternion(rotateGroupRef.current.quaternion);
                const right = new Vector3(0,1,0).cross(fwd).normalize();
                evadeDirection.current.copy(right).multiplyScalar(Math.random() > 0.5 ? 1 : -1);
                const duration = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_DURATION : GLOBAL_CONFIG.EVADE_DURATION;
                aiTimer.current = duration / 60 * 1000;
                const boostCost = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_BOOST_COST : GLOBAL_CONFIG.EVADE_BOOST_COST;
                boost.current -= boostCost;
                playStepSound(getVolume(0.8));
            },
            melee: (type: 'LUNGE' | 'SIDE') => {
                 aiState.current = 'MELEE';
                 stateDuration.current = 0; // Reset
                 activeMeleeTargetId.current = localTargetId.current;
                 meleeStartTimeRef.current = Date.now(); 
                 if (type === 'SIDE') {
                     meleeState.current = 'SIDE_LUNGE';
                     meleeSideDirection.current = Math.random() > 0.5 ? 1 : -1;
                     meleeStartupTimer.current = GLOBAL_CONFIG.SIDE_MELEE_STARTUP_FRAMES;
                 } else {
                     meleeState.current = 'LUNGE';
                     meleeSideDirection.current = 0;
                     meleeStartupTimer.current = GLOBAL_CONFIG.MELEE_STARTUP_FRAMES;
                 }
                 meleeTimer.current = GLOBAL_CONFIG.MELEE_MAX_LUNGE_TIME; 
                 const tPos = getTargetPos();
                 if(tPos) rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
            },
            shoot: () => {
                 ammo.current = Math.max(0, ammo.current - 1);
                 ammoRegenTimer.current = 0;
                 
                 const tPos = getTargetPos();
                 let isFrontal = true;
                 if (tPos && rotateGroupRef.current) {
                      const fwd = new Vector3();
                      rotateGroupRef.current.getWorldDirection(fwd);
                      fwd.y = 0; fwd.normalize();
                      const toTarget = tPos.clone().sub(position.current);
                      toTarget.y = 0; toTarget.normalize();
                      if (fwd.dot(toTarget) < 0) isFrontal = false;
                 }
                 shootMode.current = isFrontal ? 'MOVE' : 'STOP';
                 aiState.current = 'SHOOTING';
                 stateDuration.current = 0; // Reset
                 shootTimer.current = 0;
                 hasFired.current = false;
                 const currentRecovery = shootMode.current === 'STOP' ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                 const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;
                 aiTimer.current = (totalFrames / 60) * 1000; 
                 shootCooldown.current = MathUtils.randFloat(npcConfig.SHOOT_COOLDOWN_MIN, npcConfig.SHOOT_COOLDOWN_MAX); 
            },
            dash: () => {
                aiState.current = 'DASHING';
                stateDuration.current = 0; // Reset
                setDashTriggerTime(Date.now()); 
                const biasCenter = new Vector3(0,0,0).sub(position.current).normalize().multiplyScalar(0.5);
                const randDir = new Vector3((Math.random()-0.5), 0, (Math.random()-0.5)).normalize();
                const dir = randDir.add(biasCenter).normalize();
                dashDirection.current.copy(dir);
                currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
                moveInput.current = dir;
                velocity.current.x = dir.x * GLOBAL_CONFIG.DASH_BURST_SPEED;
                velocity.current.z = dir.z * GLOBAL_CONFIG.DASH_BURST_SPEED;
                if (isGrounded.current || position.current.y < 1.5) {
                    velocity.current.y = GLOBAL_CONFIG.DASH_GROUND_HOP_VELOCITY;
                    isGrounded.current = false;
                } else { velocity.current.y = 0; }
                boost.current -= 15;
                aiTimer.current = MathUtils.randInt(300, 600); 
                playBoostSound(getVolume(0.6));
            },
            ascend: () => {
                // INERTIA JUMP LOGIC:
                // If already dashing, keep existing horizontal velocity
                if (aiState.current !== 'DASHING') {
                    moveInput.current.set(0, 0, 0); 
                }
                
                aiState.current = 'ASCENDING';
                stateDuration.current = 0; // Reset
                aiTimer.current = MathUtils.randInt(400, 800);
            },
            idle: () => {
                aiState.current = 'IDLE';
                stateDuration.current = 0; // Reset
            }
        }
    };

    const currentlyAscending = aiState.current === 'ASCENDING';
    if (currentlyAscending !== isAscendingState) setIsAscendingState(currentlyAscending);
    
    const stunned = now - lastHitTime < lastHitDuration;
    setIsStunned(stunned);

    // DUAL WIELD LOGIC
    const inDualSlashAnimation = meleeState.current === 'SIDE_SLASH_2' || meleeState.current === 'SIDE_SLASH_3';
    if (inDualSlashAnimation) wasDualWielding.current = true;
    else if (meleeState.current === 'NONE') wasDualWielding.current = false;
    const isDualMode = inDualSlashAnimation || (wasDualWielding.current && meleeState.current !== 'NONE');
    if (rightSaberRef.current) rightSaberRef.current.visible = isDualMode;

    // SHIELD INTERPOLATION
    if (shieldRef.current && armShieldMountRef.current && backShieldMountRef.current) {
        const targetMount = isDualMode ? backShieldMountRef.current : armShieldMountRef.current;
        targetMount.updateMatrixWorld();
        targetMount.getWorldPosition(shieldTargetPos.current);
        targetMount.getWorldQuaternion(shieldTargetRot.current);

        const currentWorldPos = new Vector3();
        const currentWorldRot = new Quaternion();
        shieldRef.current.getWorldPosition(currentWorldPos);
        shieldRef.current.getWorldQuaternion(currentWorldRot);

        let lerpFactor = 0.25 * timeScale;
        if (isDualMode) {
            isShieldDetached.current = true;
            lerpFactor = 0.15 * timeScale; 
        } else {
            if (isShieldDetached.current) {
                const dist = currentWorldPos.distanceTo(shieldTargetPos.current);
                if (dist < 0.25) { isShieldDetached.current = false; lerpFactor = 1.0; } 
                else lerpFactor = 0.25 * timeScale;
            } else lerpFactor = 1.0;
        }

        if (lerpFactor >= 1.0) {
            currentWorldPos.copy(shieldTargetPos.current);
            currentWorldRot.copy(shieldTargetRot.current);
        } else {
            currentWorldPos.lerp(shieldTargetPos.current, lerpFactor);
            currentWorldRot.slerp(shieldTargetRot.current, lerpFactor);
        }

        const playerInvMatrix = rotateGroupRef.current.matrixWorld.clone().invert(); 
        const parentWorldQuat = new Quaternion();
        rotateGroupRef.current.getWorldQuaternion(parentWorldQuat);
        const localQuat = parentWorldQuat.clone().invert().multiply(currentWorldRot);
        const localPos = currentWorldPos.clone().applyMatrix4(playerInvMatrix);
        shieldRef.current.position.copy(localPos);
        shieldRef.current.quaternion.copy(localQuat);
    }

    // KNOCKDOWN STATE
    if (isKnockedDown && !wasKnockedDownRef.current) {
        aiState.current = 'KNOCKED_DOWN';
        velocity.current.y = GLOBAL_CONFIG.KNOCKDOWN.INIT_Y_VELOCITY;
        knockdownTriggerTimeRef.current = lastHitTime; 
        if (knockbackDir) {
            const horiz = knockbackDir.clone();
            horiz.y = 0; if(horiz.lengthSq() > 0) horiz.normalize();
            velocity.current.x = horiz.x * GLOBAL_CONFIG.KNOCKDOWN.INIT_Y_VELOCITY * 0.5;
            velocity.current.z = horiz.z * GLOBAL_CONFIG.KNOCKDOWN.INIT_Y_VELOCITY * 0.5;
        }
        animator.play(ANIMATION_CLIPS.KNOCKDOWN, 0.1);
        setIsThrusting(false);
        meleeState.current = 'NONE';
        activeMeleeTargetId.current = null;
    }
    wasKnockedDownRef.current = isKnockedDown;

    if (aiState.current === 'KNOCKED_DOWN') {
        const isJuggled = stunned && (lastHitTime > knockdownTriggerTimeRef.current);
        if (isJuggled) {
            velocity.current.set(0, 0, 0); 
            if (knockbackDir) {
                 const force = GLOBAL_CONFIG.KNOCKBACK_SPEED * knockbackPower * 0.5; 
                 const horizontalDir = knockbackDir.clone();
                 horizontalDir.y = 0; 
                 if (horizontalDir.lengthSq() > 0) horizontalDir.normalize();
                 position.current.add(horizontalDir.multiplyScalar(force * timeScale));
            }
            animator.play(ANIMATION_CLIPS.IDLE, 0.1);
        } else {
            velocity.current.y -= GLOBAL_CONFIG.KNOCKDOWN.GRAVITY * timeScale;
            velocity.current.x *= GLOBAL_CONFIG.KNOCKDOWN.AIR_DRAG;
            velocity.current.z *= GLOBAL_CONFIG.KNOCKDOWN.AIR_DRAG;
            position.current.add(velocity.current.clone().multiplyScalar(timeScale));
            if (position.current.y <= 0) {
                position.current.y = 0;
                velocity.current.set(0,0,0);
                aiState.current = 'WAKE_UP';
                wakeUpTimer.current = GLOBAL_CONFIG.KNOCKDOWN.WAKEUP_DELAY;
            }
            animator.play(ANIMATION_CLIPS.KNOCKDOWN, 0.1);
        }
    }
    else if (aiState.current === 'WAKE_UP') {
        wakeUpTimer.current -= delta * 1000;
        if (wakeUpTimer.current < 500) animator.play(ANIMATION_CLIPS.WAKEUP, 0.5);
        else animator.play(ANIMATION_CLIPS.KNOCKDOWN, 0.1); 
        if (wakeUpTimer.current <= 0) {
            aiState.current = 'IDLE';
            animator.play(ANIMATION_CLIPS.IDLE, 0.5);
        }
    }
    else if (stunned) {
        setIsThrusting(false);
        meleeState.current = 'NONE'; 
        activeMeleeTargetId.current = null;
        aiState.current = 'IDLE'; 
        velocity.current.set(0, 0, 0);
        if (knockbackDir) {
             const force = GLOBAL_CONFIG.KNOCKBACK_SPEED * knockbackPower;
             const horizontalDir = knockbackDir.clone();
             horizontalDir.y = 0; 
             if (horizontalDir.lengthSq() > 0) horizontalDir.normalize();
             position.current.add(horizontalDir.multiplyScalar(force * timeScale));
        }
        if (position.current.y <= 0) position.current.y = 0;
        animator.play(ANIMATION_CLIPS.IDLE, 0.1);
    }
    else {
        // TARGET SELECTION
        targetSwitchTimer.current -= delta; 
        if (targetSwitchTimer.current <= 0) {
            targetSwitchTimer.current = MathUtils.randFloat(npcConfig.TARGET_SWITCH_MIN, npcConfig.TARGET_SWITCH_MAX); 
            const potentialTargets = [];
            if (team === Team.RED) {
                potentialTargets.push('player');
                freshTargets.forEach(t => { if (t.team === Team.BLUE) potentialTargets.push(t.id); });
            } else {
                freshTargets.forEach(t => { if (t.team === Team.RED) potentialTargets.push(t.id); });
            }
            if (potentialTargets.length > 0) {
                const newTarget = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                localTargetId.current = newTarget;
                useGameStore.getState().updateUnitTarget(id, localTargetId.current);
            }
        }

        if (areNPCsPaused) {
            if (aiState.current !== 'IDLE') {
                 aiState.current = 'IDLE';
                 setIsThrusting(false);
                 moveInput.current.set(0,0,0);
                 dashDirection.current.set(0,0,0);
                 meleeState.current = 'NONE';
                 activeMeleeTargetId.current = null;
            }
        } else {
            shootCooldown.current -= delta;
            
            // --- AI DECISION TICK (REPLACED BY BEHAVIOR TREE) ---
            aiDecisionTimer.current -= delta;
            if (aiDecisionTimer.current <= 0) {
                // Run Behavior Tree Logic
                behaviorTree.tick(aiContext);
                
                // Reset timer with small randomness
                aiDecisionTimer.current = 0.1 + Math.random() * 0.05; 
            }

            // 5. CONTINUOUS MOVEMENT CHECK (State Maintenance)
            aiTimer.current -= delta * 1000; 
            
            // Evade Finish
            if (aiState.current === 'EVADE' && aiTimer.current <= 0) {
                aiState.current = 'IDLE';
                isRainbowStep.current = false;
                trailRainbow.current = false;
                aiTimer.current = 200;
            }

            // Dash/Ascend Finish
            if (aiTimer.current <= 0 && landingFrames.current <= 0 && aiState.current !== 'SHOOTING' && aiState.current !== 'MELEE' && aiState.current !== 'EVADE') {
              if (aiState.current === 'DASHING') {
                  moveInput.current.set(0, 0, 0); 
                  if (Math.random() > 0.3) {
                      aiState.current = 'ASCENDING';
                      aiTimer.current = MathUtils.randInt(400, 800); 
                  } else {
                      aiState.current = 'FALLING';
                      aiTimer.current = MathUtils.randInt(500, 1000);
                  }
              } else if (aiState.current === 'ASCENDING') {
                  moveInput.current.set(0, 0, 0); 
                  aiState.current = 'FALLING';
                  aiTimer.current = MathUtils.randInt(1000, 2000);
              } else {
                  // Idle timeout -> Just reset to allow Behavior Tree to decide next move
                  aiState.current = 'IDLE'; 
                  aiTimer.current = 500;
              }
            }
        }

        if (isGrounded.current && landingFrames.current <= 0) {
            boost.current = Math.min(100, boost.current + 1 * timeScale);
        }

        if (visualLandingFrames.current > 0) {
            visualLandingFrames.current -= 1 * timeScale;
            if (visualLandingFrames.current < 0) visualLandingFrames.current = 0;
        }

        if (landingFrames.current > 0) {
            velocity.current.set(0,0,0);
            landingFrames.current -= 1 * timeScale; 
            setIsThrusting(false);
        } else {
            const performMeleeSnap = (target: any) => {
                if (!target) return;
                const tPos = target.position || target; 
                position.current.y = MathUtils.lerp(position.current.y, tPos.y, 0.8);
                velocity.current.y = 0; 
                if (rotateGroupRef.current) {
                    const fwd = new Vector3();
                    const worldFwd = new Vector3(0, 0, 1).applyQuaternion(rotateGroupRef.current.quaternion);
                    worldFwd.y = 0; 
                    if (worldFwd.lengthSq() > 0.001) {
                        worldFwd.normalize();
                        const lookTarget = position.current.clone().add(worldFwd);
                        rotateGroupRef.current.lookAt(lookTarget);
                    }
                    rotateGroupRef.current.updateMatrixWorld();
                }
            };

            if (aiState.current === 'SHOOTING') {
                setIsThrusting(false);
                if (shootMode.current === 'STOP') velocity.current.set(0,0,0);
                else {
                     const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                     const frictionFactor = Math.pow(friction, timeScale);
                     velocity.current.x *= frictionFactor;
                     velocity.current.z *= frictionFactor;
                     velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
                }
                const currentRecovery = shootMode.current === 'STOP' ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;
                
                shootTimer.current += 1 * timeScale;

                if (shootTimer.current >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && !hasFired.current) {
                    hasFired.current = true;
                    setShowMuzzleFlash(true);
                    setTimeout(() => setShowMuzzleFlash(false), 100);
                    const spawnPos = new Vector3();
                    if (muzzleRef.current) muzzleRef.current.getWorldPosition(spawnPos);
                    else spawnPos.copy(position.current).add(new Vector3(0, 2, 0));
                    
                    const tPos = getTargetPos();
                    let direction: Vector3;
                    if (tPos) direction = tPos.clone().sub(spawnPos).normalize();
                    else {
                        if (muzzleRef.current) {
                             const fwd = new Vector3();
                             muzzleRef.current.getWorldDirection(fwd);
                             direction = fwd.normalize();
                        } else { direction = new Vector3(0,0,1).applyQuaternion(rotateGroupRef.current.quaternion); }
                    }
                    const dist = tPos ? position.current.distanceTo(tPos) : 999;
                    const isRedLock = dist < RED_LOCK_DISTANCE;
                    const forwardDir = direction.clone();
                    playShootSound(getVolume(0.4));
                    spawnProjectile({
                        id: `proj-${id}-${Date.now()}`,
                        ownerId: id,
                        targetId: localTargetId.current,
                        position: spawnPos,
                        velocity: direction.multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED),
                        forwardDirection: forwardDir,
                        isHoming: isRedLock,
                        team: team,
                        ttl: 300
                    });
                }
                
                if (shootTimer.current >= totalFrames) {
                    aiState.current = 'IDLE';
                    shootTimer.current = 0;
                    if (isGrounded.current && shootMode.current === 'STOP') landingFrames.current = Math.floor(GLOBAL_CONFIG.LANDING_LAG_MIN);
                }
            }
            else if (aiState.current === 'EVADE') {
                 setIsThrusting(true);
                 const spd = isRainbowStep.current ? GLOBAL_CONFIG.RAINBOW_STEP_SPEED : GLOBAL_CONFIG.EVADE_SPEED;
                 velocity.current.x = evadeDirection.current.x * spd;
                 velocity.current.z = evadeDirection.current.z * spd;
                 velocity.current.y = 0;
                 trailRainbow.current = isRainbowStep.current;
            }
            else if (aiState.current === 'MELEE') {
                 if (meleeState.current === 'NONE') {
                     aiState.current = 'IDLE';
                     activeMeleeTargetId.current = null;
                     return;
                 }

                 setIsThrusting(true);
                 const tPos = getTargetPos();
                 const targetIdToHit = activeMeleeTargetId.current || localTargetId.current;
                 
                 if (meleeState.current === 'LUNGE' || meleeState.current === 'SIDE_LUNGE') {
                     const isSide = meleeState.current === 'SIDE_LUNGE';
                     // GUIDANCE CUT
                     let isTracking = true;
                     if (targetIdToHit && freshState.lastMeleeCutTime[targetIdToHit] > meleeStartTimeRef.current) {
                         isTracking = false;
                         activeMeleeTargetId.current = null; 
                         meleeTimer.current = Math.min(meleeTimer.current, 0); 
                     }

                     if (tPos && isTracking) {
                         const dirToTarget = tPos.clone().sub(position.current).normalize();
                         let speed = (isSide ? GLOBAL_CONFIG.SIDE_MELEE_LUNGE_SPEED : GLOBAL_CONFIG.MELEE_LUNGE_SPEED) * GLOBAL_CONFIG.MELEE_LUNGE_SPEED_MULT;
                         const moveVec = dirToTarget.clone();
                         if (isSide) {
                             const up = new Vector3(0, 1, 0);
                             const leftVec = new Vector3().crossVectors(up, dirToTarget).normalize();
                             const curveStrength = GLOBAL_CONFIG.SIDE_MELEE_ARC_STRENGTH;
                             const sideOffset = leftVec.multiplyScalar(meleeSideDirection.current * curveStrength);
                             moveVec.add(sideOffset).normalize();
                         }
                         velocity.current.x = moveVec.x * speed;
                         velocity.current.z = moveVec.z * speed;
                         velocity.current.y = dirToTarget.y * speed;
                         rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
                     } else {
                         const fwd = new Vector3(0,0,1).applyQuaternion(rotateGroupRef.current.quaternion);
                         let speed = isSide ? GLOBAL_CONFIG.SIDE_MELEE_LUNGE_SPEED : GLOBAL_CONFIG.MELEE_LUNGE_SPEED;
                         velocity.current.x = fwd.x * speed;
                         velocity.current.z = fwd.z * speed;
                         velocity.current.y = fwd.y * speed;
                     }
                     
                     meleeTimer.current -= timeScale;
                     meleeStartupTimer.current -= timeScale;
                     const dist = tPos ? position.current.distanceTo(tPos) : 999;
                     const isStartupComplete = meleeStartupTimer.current <= 0;
                     
                     // NPC ATTACK CANCEL (RAINBOW STEP)
                     // Handled by Behavior Tree now, but physics keep running

                     if (isStartupComplete && dist < GLOBAL_CONFIG.MELEE_RANGE && isTracking) {
                         meleeState.current = isSide ? 'SIDE_SLASH_1' : 'SLASH_1';
                         const comboData = isSide ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1;
                         meleeTimer.current = comboData.DURATION_FRAMES;
                         velocity.current.set(0,0,0);
                         hasMeleeHitRef.current = false;
                         meleeHitConfirmed.current = true;
                         performMeleeSnap({position: tPos});
                     } else if (meleeTimer.current <= 0) {
                         meleeState.current = isSide ? 'SIDE_SLASH_1' : 'SLASH_1';
                         const comboData = isSide ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1;
                         meleeTimer.current = comboData.DURATION_FRAMES;
                         hasMeleeHitRef.current = false;
                         meleeHitConfirmed.current = false;
                         velocity.current.set(0,0,0);
                     }
                 } 
                 else if (meleeState.current.includes('SLASH')) {
                     const isSide = meleeState.current.includes('SIDE');
                     const stage = meleeState.current.endsWith('1') ? 1 : (meleeState.current.endsWith('2') ? 2 : 3);
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

                     const passed = comboData.DURATION_FRAMES - meleeTimer.current;
                     const isDamageFrame = passed >= comboData.DAMAGE_DELAY;

                     if (meleeHitConfirmed.current && tPos && !hasMeleeHitRef.current) {
                         const spacing = (comboData as any).ATTACK_SPACING ?? GLOBAL_CONFIG.MELEE_ATTACK_SPACING;
                         const dirToTarget = new Vector3().subVectors(tPos, position.current).normalize();
                         const idealPos = tPos.clone().sub(dirToTarget.multiplyScalar(spacing));
                         const snapSpeed = GLOBAL_CONFIG.MELEE_MAGNET_SPEED * timeScale;
                         position.current.lerp(idealPos, snapSpeed);
                         rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
                     }

                     if (!meleeHitConfirmed.current) {
                          const fwd = new Vector3(0, 0, 1).applyQuaternion(rotateGroupRef.current.quaternion).normalize();
                          fwd.y = 0;
                          velocity.current.x = fwd.x * comboData.FORWARD_STEP_SPEED;
                          velocity.current.z = fwd.z * comboData.FORWARD_STEP_SPEED;
                     } else {
                         velocity.current.set(0,0,0);
                     }

                     if (!hasMeleeHitRef.current && isDamageFrame && meleeHitConfirmed.current && tPos && targetIdToHit) {
                         const dist = position.current.distanceTo(tPos);
                         if (dist < GLOBAL_CONFIG.MELEE_RANGE * 1.5) {
                             const knockback = new Vector3().subVectors(tPos, position.current).normalize();
                             const isKnockdown = (stage === 3) ? true : false;
                             useGameStore.getState().applyHit(targetIdToHit, id, knockback, comboData.KNOCKBACK_POWER, comboData.STUN_DURATION, comboData.HIT_STOP_FRAMES, isKnockdown);
                             const chaseDir = new Vector3().subVectors(tPos, position.current).normalize();
                             chaseDir.y = 0;
                             velocity.current.add(chaseDir.multiplyScalar(comboData.CHASE_VELOCITY));
                             playHitSound(position.current.distanceTo(useGameStore.getState().playerPos));
                             hasMeleeHitRef.current = true;
                             performMeleeSnap({position: tPos});
                         }
                     }

                     meleeTimer.current -= timeScale;
                     if (meleeTimer.current <= 0) {
                         if (!nextState.includes('RECOVERY') && meleeHitConfirmed.current) {
                              meleeState.current = nextState as MeleePhase;
                              const nextStage = stage + 1;
                              const nextConfig = isSide 
                                ? (nextStage === 2 ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_2 : GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_3)
                                : (nextStage === 2 ? GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3);
                              meleeTimer.current = nextConfig.DURATION_FRAMES;
                              hasMeleeHitRef.current = false;
                              if (tPos) performMeleeSnap({position: tPos});
                         } else {
                              meleeState.current = isSide ? 'SIDE_RECOVERY' : 'RECOVERY';
                              meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                         }
                     }
                 }
                 else if (meleeState.current === 'RECOVERY' || meleeState.current === 'SIDE_RECOVERY') {
                     meleeTimer.current -= timeScale;
                     velocity.current.y -= GLOBAL_CONFIG.GRAVITY * 0.5 * timeScale; 
                     if (meleeTimer.current <= 0) {
                         aiState.current = 'IDLE';
                         meleeState.current = 'NONE';
                         activeMeleeTargetId.current = null;
                         aiTimer.current = 500;
                     }
                 }
            }
            else if (aiState.current === 'DASHING') {
                setIsThrusting(true);
                boost.current -= 0.1 * timeScale;
                currentDashSpeed.current = MathUtils.lerp(currentDashSpeed.current, GLOBAL_CONFIG.DASH_SUSTAIN_SPEED, GLOBAL_CONFIG.DASH_DECAY_FACTOR * timeScale);
                velocity.current.x = dashDirection.current.x * currentDashSpeed.current;
                velocity.current.z = dashDirection.current.z * currentDashSpeed.current;
                velocity.current.y *= 0.85; 
            } else if (aiState.current === 'ASCENDING') {
                setIsThrusting(true);
                boost.current -= 0.3 * timeScale;
                velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                velocity.current.x += moveInput.current.x * 0.005 * timeScale;
                velocity.current.z += moveInput.current.z * 0.005 * timeScale;
            } else {
                setIsThrusting(false);
                if (!isGrounded.current) {
                     velocity.current.x += moveInput.current.x * 0.001 * timeScale;
                     velocity.current.z += moveInput.current.z * 0.001 * timeScale;
                }
            }

            if (aiState.current !== 'SHOOTING' && aiState.current !== 'MELEE' && aiState.current !== 'EVADE') {
                 const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                 const frictionFactor = Math.pow(friction, timeScale);
                 velocity.current.x *= frictionFactor;
                 velocity.current.z *= frictionFactor;
                 if (aiState.current !== 'DASHING') velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
            }

            position.current.add(velocity.current.clone().multiplyScalar(timeScale));
            
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
                    landingFrames.current = Math.floor(GLOBAL_CONFIG.LANDING_LAG_MIN + (1 - boost.current/100) * (GLOBAL_CONFIG.LANDING_LAG_MAX - GLOBAL_CONFIG.LANDING_LAG_MIN));
                    visualLandingFrames.current = GLOBAL_CONFIG.LANDING_VISUAL_DURATION; 
                    aiState.current = 'IDLE';
                }
                if (velocity.current.y < 0) velocity.current.y = 0;
            } else {
                isGrounded.current = false;
            }
        }
    }

    if (aiState.current === 'DASHING') nextVisualState = 'DASH';
    else if (aiState.current === 'ASCENDING') nextVisualState = 'ASCEND';
    else if (aiState.current === 'MELEE') nextVisualState = 'MELEE';
    else if (aiState.current === 'EVADE') nextVisualState = 'EVADE';
    else if (aiState.current === 'SHOOTING') nextVisualState = 'SHOOT';
    else if (isGrounded.current && velocity.current.lengthSq() > 0.01) nextVisualState = 'WALK';

    useGameStore.getState().updateTargetPosition(id, position.current.clone());
    groupRef.current.position.copy(position.current);

    if (aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        const isWalking = isGrounded.current && velocity.current.lengthSq() > 0.01 && aiState.current !== 'DASHING' && aiState.current !== 'SHOOTING';

        if (aiState.current === 'SHOOTING' || aiState.current === 'MELEE' || (aiState.current === 'EVADE' && !isRainbowStep.current)) {
            const tPos = getTargetPos();
            if (tPos) {
                 rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
            }
        } else if (aiState.current === 'DASHING' || (aiState.current === 'EVADE' && isRainbowStep.current)) {
            const lookPos = position.current.clone().add(aiState.current === 'EVADE' ? velocity.current : dashDirection.current);
            rotateGroupRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
        } else if (aiState.current === 'ASCENDING') {
             const horizVel = new Vector3(velocity.current.x, 0, velocity.current.z);
             if (horizVel.lengthSq() > 0.01) {
                const lookPos = position.current.clone().add(horizVel);
                rotateGroupRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
             }
        } else if (isWalking) {
            const horizVel = new Vector3(velocity.current.x, 0, velocity.current.z);
            if (horizVel.lengthSq() > 0.001) {
                const lookPos = position.current.clone().add(horizVel);
                rotateGroupRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
            }
        } else {
            const tPos = getTargetPos();
            if (tPos) {
                rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
            } else {
                 rotateGroupRef.current.lookAt(0, position.current.y, 0);
            }
        }
        rotateGroupRef.current.updateMatrixWorld(true);
    }

    if (aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        const isIdle = isGrounded.current && aiState.current === 'IDLE' && landingFrames.current <= 0;
        let activeClip = isIdle ? ANIMATION_CLIPS.IDLE : ANIMATION_CLIPS.NEUTRAL;
        if (aiState.current === 'DASHING') activeClip = ANIMATION_CLIPS.DASH_GUN;
        if (aiState.current === 'EVADE') activeClip = ANIMATION_CLIPS.DASH_SABER; 
        if (aiState.current === 'ASCENDING') activeClip = ANIMATION_CLIPS.ASCEND;
        if (aiState.current === 'MELEE') {
             if (meleeState.current === 'LUNGE') activeClip = ANIMATION_CLIPS.MELEE_STARTUP;
             else if (meleeState.current === 'SIDE_LUNGE') activeClip = ANIMATION_CLIPS.MELEE_SIDE_LUNGE;
             else if (meleeState.current === 'SLASH_1') activeClip = ANIMATION_CLIPS.MELEE_SLASH_1;
             else if (meleeState.current === 'SLASH_2') activeClip = ANIMATION_CLIPS.MELEE_SLASH_2;
             else if (meleeState.current === 'SLASH_3') activeClip = ANIMATION_CLIPS.MELEE_SLASH_3;
             else if (meleeState.current === 'SIDE_SLASH_1') activeClip = ANIMATION_CLIPS.SIDE_SLASH_1;
             else if (meleeState.current === 'SIDE_SLASH_2') activeClip = ANIMATION_CLIPS.SIDE_SLASH_2;
             else if (meleeState.current === 'SIDE_SLASH_3') activeClip = ANIMATION_CLIPS.SIDE_SLASH_3;
             else if (meleeState.current.includes('RECOVERY')) activeClip = ANIMATION_CLIPS.MELEE_RECOVERY;
        }
        let speed = 1.0;
        let blend = 0.2;
        if (aiState.current === 'MELEE' && meleeState.current.includes('SLASH')) {
             const isSide = meleeState.current.includes('SIDE');
             const stage = meleeState.current.endsWith('1') ? 1 : (meleeState.current.endsWith('2') ? 2 : 3);
             let comboData;
             if (isSide) {
                  comboData = stage === 1 ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_1 : (stage === 2 ? GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_2 : GLOBAL_CONFIG.SIDE_MELEE_COMBO_DATA.SLASH_3);
             } else {
                  comboData = stage === 1 ? GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1 : (stage === 2 ? GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2 : GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3);
             }
             speed = 60 / comboData.DURATION_FRAMES;
             blend = 0.05;
        }
        animator.play(activeClip, blend, speed);
    }
    
    animator.update(delta);
    const animatedPose = animator.getCurrentPose();

    const lerpSpeedFall = 0.25 * timeScale;
    const smoothRot = (currentVal: number, targetVal: number) => MathUtils.lerp(currentVal, targetVal, lerpSpeedFall);

    if (!isKnockedDown && !stunned && aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        const isFalling = !isGrounded.current && aiState.current !== 'DASHING' && aiState.current !== 'ASCENDING' && aiState.current !== 'MELEE' && aiState.current !== 'EVADE';
        if (isFalling && !wasFallingRef.current) {
             const vy = velocity.current.y; 
             const h = position.current.y;
             const g = GLOBAL_CONFIG.GRAVITY;
             const discriminant = vy * vy + 2 * g * h;
             if (discriminant >= 0 && g > 0) totalPredictedFallFrames.current = (vy + Math.sqrt(discriminant)) / g;
             else totalPredictedFallFrames.current = 60; 
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

        if (visualLandingFrames.current > 0) {
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
                    if (currStep !== prevStep) playFootSound(getVolume(0.2));
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
            animatedPose.TORSO.y = MathUtils.lerp(animatedPose.TORSO.y, -cos * 0.05, w);
            animatedPose.CHEST.y = MathUtils.lerp(animatedPose.CHEST.y, sin * 0.22, w);
            animatedPose.CHEST.z = MathUtils.lerp(animatedPose.CHEST.z, cos * 0.1, w);
            animatedPose.HEAD.y = MathUtils.lerp(animatedPose.HEAD.y, -sin * 0.22, w);
            animatedPose.RIGHT_LEG.THIGH.z = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.z, 0, w);
            animatedPose.LEFT_LEG.THIGH.z = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.z, 0, w);
            animatedPose.RIGHT_LEG.THIGH.y = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.y, 0, w);
            animatedPose.LEFT_LEG.THIGH.y = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.y, 0, w);
        }

        if (aiState.current === 'SHOOTING' && gunArmRef.current && currentTarget) {
             const tPos = getTargetPos();
             if (tPos) {
                 const shoulderPos = new Vector3();
                 gunArmRef.current.getWorldPosition(shoulderPos);
                 const dirToTarget = tPos.clone().sub(shoulderPos).normalize();
                 const bodyInverseQuat = rotateGroupRef.current.quaternion.clone().invert();
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
                     } else aimWeight = 1.0;
                 } else {
                     const t = (shootTimer.current - startup) / recovery;
                     aimWeight = 1.0 - t;
                 }
                 animatedPose.LEFT_ARM.SHOULDER.x = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.x, aimEuler.x, aimWeight);
                 animatedPose.LEFT_ARM.SHOULDER.y = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.y, aimEuler.y, aimWeight);
                 animatedPose.LEFT_ARM.SHOULDER.z = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.z, aimEuler.z, aimWeight);
             }
        }
    }
    
    let hitPitch = 0;
    let hitRoll = 0;

    if (stunned && knockbackPower > 0.1 && knockbackDir) {
         const timeSinceHit = now - lastHitTime;
         const HIT_REACTION_DURATION = 400; 
         if (timeSinceHit < HIT_REACTION_DURATION) {
             const progress = timeSinceHit / HIT_REACTION_DURATION;
             const intensity = Math.sin(progress * Math.PI) * (1 - progress);
             if (rotateGroupRef.current) {
                 const invQuat = rotateGroupRef.current.quaternion.clone().invert();
                 const localImpact = knockbackDir.clone().applyQuaternion(invQuat).normalize();
                 const PITCH_MAX = 1.5;
                 const ROLL_MAX = 1.3;
                 hitPitch = localImpact.z * PITCH_MAX * intensity;
                 hitRoll = -localImpact.x * ROLL_MAX * intensity;
             }
         }
    }

    let targetInertiaX = 0;
    let targetInertiaZ = 0;
    if (!stunned && aiState.current !== 'KNOCKED_DOWN') {
        const allowInertia = aiState.current === 'EVADE'; 
        if (allowInertia) { 
             const invRot = rotateGroupRef.current.quaternion.clone().invert();
             const localVel = velocity.current.clone().applyQuaternion(invRot);
             targetInertiaX = localVel.z * 1.5; 
             targetInertiaZ = -localVel.x * 1.5;
        }
    }
    const swaySpeed = 0.2 * timeScale;
    currentLegInertiaRot.current.x = MathUtils.lerp(currentLegInertiaRot.current.x, targetInertiaX, swaySpeed);
    currentLegInertiaRot.current.z = MathUtils.lerp(currentLegInertiaRot.current.z, targetInertiaZ, swaySpeed);

    let targetHipOffset = 0;
    if (visualLandingFrames.current > 0) {
        const current = visualLandingFrames.current; 
        const total = GLOBAL_CONFIG.LANDING_VISUAL_DURATION;
        const progress = 1 - (current / total); 
        const r = GLOBAL_CONFIG.LANDING_ANIM_RATIO;
        let w = 0;
        if (progress < r) w = progress / r; else w = 1 - ((progress - r) / (1 - r));
        targetHipOffset = -(GLOBAL_CONFIG.LANDING_HIP_DIP * w);
    }
    if (visualLandingFrames.current > 0) currentHipOffset.current = targetHipOffset;
    else currentHipOffset.current = MathUtils.lerp(currentHipOffset.current, 0, 0.2 * timeScale);

    applyPoseToModel(animatedPose, currentHipOffset.current, currentLegInertiaRot.current);
    
    if (torsoRef.current && (hitPitch !== 0 || hitRoll !== 0)) {
        torsoRef.current.rotation.x += hitPitch;
        torsoRef.current.rotation.z += hitRoll;
    }

    if (headRef.current && !stunned && aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        const neutralLocalQuat = new Quaternion().setFromEuler(new Euler(animatedPose.HEAD.x, animatedPose.HEAD.y, animatedPose.HEAD.z));
        let targetLocalQuat = neutralLocalQuat.clone();
        let trackingWeight = 0.0;
        const tPos = getTargetPos();
        if (tPos) {
            rotateGroupRef.current.updateMatrixWorld();
            const headWorldPos = new Vector3();
            headRef.current.getWorldPosition(headWorldPos);
            const targetLookPos = tPos.clone().add(new Vector3(0, 1.0, 0));
            const dirToTarget = targetLookPos.clone().sub(headWorldPos).normalize();
            const bodyFwd = new Vector3(0,0,1).applyQuaternion(rotateGroupRef.current.quaternion).normalize();
            if (bodyFwd.dot(dirToTarget) > 0.2) {
                trackingWeight = 1.0;
                const parentWorldQuat = new Quaternion();
                if (headRef.current.parent) headRef.current.parent.getWorldQuaternion(parentWorldQuat);
                const m = new Matrix4();
                m.lookAt(headWorldPos, targetLookPos, new Vector3(0, 1, 0));
                const worldLookQuat = new Quaternion().setFromRotationMatrix(m);
                targetLocalQuat = parentWorldQuat.clone().invert().multiply(worldLookQuat);
                const correction = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
                targetLocalQuat.multiply(correction);
            }
        }
        const slerpSpeed = (trackingWeight > 0.5 ? 0.2 : 0.1) * timeScale;
        headLookQuat.current.slerp(targetLocalQuat, slerpSpeed);
        headRef.current.quaternion.copy(headLookQuat.current);
    }
  });

  const armorColor = team === Team.RED ? '#ff8888' : '#E9EAEB';
  const chestColor = team === Team.RED ? '#880000' : '#727CDB';
  const feetColor = team === Team.RED ? '#333333' : '#D94850';
  const activeWeapon = aiState.current === 'MELEE' || aiState.current === 'EVADE' ? 'SABER' : 'GUN'; 
  const waistColor = '#D94850';

  return (
    <group ref={groupRef}>
      <group ref={rotateGroupRef}>
         <ProceduralSlashEffect meleeState={meleeState} parentRef={groupRef} />
         
         <group ref={shieldRef}>
             <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                 <mesh position={[0, 0, 0]}><boxGeometry args={[0.1, 1.7, 0.7]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                 <mesh position={[0.06, 0, 0]}><boxGeometry args={[0.1, 1.55, 0.5]} /><MechMaterial color={waistColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
             </group>
         </group>
         
         <group position={[0, 2.0, 0]}>
            <group ref={torsoRef}>
                <group position={[0, 0.26, -0.043]} rotation={[0, 0, 0]} scale={[0.8, 0.7, 0.9]}>
                    <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                </group>
                <group position={[0, 0.021, -0.044]} rotation={[-3.143, 0, 0]} scale={[0.8, 0.9, 0.9]}>
                    <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                </group>
                <HipVisuals armorColor={armorColor} feetColor={feetColor} waistColor={waistColor} />
                <mesh position={[0, 0, 0]} visible={false}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color="red" /></mesh>
                <group ref={upperBodyRef} position={[0, 0.65, 0]}>
                    <ChestVisuals chestColor={chestColor} />
                    <group ref={headRef}>
                        <MechaHead mainColor={armorColor} />
                        <mesh  position= {[-0.026,0.419,0.386]} rotation={[0.2,-0.52,0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                        <mesh  position= {[-0.026,0.404,0.381]} rotation={[0.2,-0.52,0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>                        
                        <mesh  position= { [-0.003,0.42,0.386]} rotation={[0.2,0.52,-0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>                        
                        <mesh  position= {[-0.003,0.405,0.381]} rotation={[0.2,0.52,-0.4]} scale={[0.6,0.1,1]}><boxGeometry args={[0.05, 0.05, 0]} /><meshBasicMaterial color="#000000" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>   
                    </group>
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
                                            <group ref={rightSaberRef} visible={false} position={[0, 0, 0.1]} rotation={[1.74, 0, 0]}>
                                                <mesh position={[0, -0.25, 0]}><cylinderGeometry args={[0.035, 0.04, 0.7, 8]} /><MechMaterial color="#ffffff" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                                <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.05, 0.05, 2.4, 8]} /><meshBasicMaterial color="#ffffff" /></mesh>
                                                <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.12, 0.12, 2.6, 8]} /><meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} /></mesh>
                                            </group>
                                        </group>
                                    </group>
                                    <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={armShieldMountRef} />
                                </group>
                            </group>
                        </group>
                    </group>
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
                                    <group visible={activeWeapon === 'GUN'} ref={gunMeshRef} position={[0, -0.6, 0.3]} rotation={[1.5, 0, 3.14]}>
                                            <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.1, 0.2, 0.15]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <mesh position={[0, 0.2, 1.0]} rotation={[1.57, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6, 8]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <mesh position={[0.05, 0.35, 0.2]} rotation={[1.57, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.3, 8]} /><MechMaterial color="#222222" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                            <group position={[0, 0.2, 1.35]} ref={muzzleRef}><MuzzleFlash active={showMuzzleFlash} /></group>
                                    </group>
                                </group>
                            </group>
                        </group>
                    </group>
                    <group position={[0, -0.056, -0.365]}>
                        <mesh><boxGeometry args={[0.7, 0.8, 0.3]} /><MechMaterial color="#333" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                        <mesh position={[0.324, 0.5, 0]} rotation={[0.2, 0, -0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><MechMaterial color="white" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                        <mesh position={[-0.324, 0.5, 0]} rotation={[0.2, 0, 0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><MechMaterial color="white" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                        <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#666" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                        <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><MechMaterial color="#666" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                        <BoostBurst triggerTime={dashTriggerTime} />
                        <group position={[0, -0.8, -0.2]} rotation={[0, 1.57, 0]} ref={backShieldMountRef} />
                    </group>
                </group>
            </group>
            
                    <group ref={legsRef}>
                        <group ref={rightLegRef} position={[0.25, -0.3, 0]} rotation={[0, 0, 0.05]}>
                            <group position={[0, -0.4, 0]}>
                                <mesh><boxGeometry args={[0.35, 0.7, 0.4]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.4, -0.04]}><boxGeometry args={[0.2, 0.4, 0.45]} /><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                            </group>
                            <GhostEmitter active={isTrailActive} size={[0.35, 0.2, 0.7]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />
                            <group ref={rightLowerLegRef} position={[0, -0.75, 0]}> 
                                <mesh position={[0, -0.45, 0]}><boxGeometry args={[0.35, 0.75, 0.45]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.1, 0.25]} rotation={[0.4, 0, 0]}><boxGeometry args={[0.25, 0.55, 0.15]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.071, -0.04]}><boxGeometry args={[0.2, 0.4, 0.45]} /><MechMaterial color="#444444" /></mesh>
                                <mesh position={[0, -0.863, 0]}><boxGeometry args={[0.2, 0.2, 0.5]} /><MechMaterial color="#444444" /></mesh>
                                <group ref={rightFootRef} position={[0, -0.7, -0.15]}>
                                    <group position={[0, -0.254, 0.24]}>
                                        <Trapezoid args={[0.35, 0.1, 0.7, 0.9, 0.8]} color={feetColor} />
                                        <group position={[0, 0.133, -0.016]} scale={[1, 1.2, 1]}>
                                            <Trapezoid args={[0.3, 0.2, 0.55, 0.6, 0.65]} color={armorColor} />
                                        </group>
                                    </group>
                                    <GhostEmitter active={isTrailActive} size={[0.35, 0.2, 0.7]} offset={[0, -0.2, 0.2]} rainbow={trailRainbow.current} />
                                    <ThrusterPlume active={isThrusting} offset={[0,0.65,-0.1]} angle={[Math.PI-0.8,0,0]}isAscending={isAscending} isFoot/>
                                </group>
                            </group>
                        </group>
                        <group ref={leftLegRef} position={[-0.25, -0.3, 0]} rotation={[0, 0, -0.05]}>
                            <group position={[0, -0.4, 0]}>
                                <mesh><boxGeometry args={[0.35, 0.7, 0.4]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.4, -0.04]}><boxGeometry args={[0.2, 0.4, 0.45]} /><MechMaterial color="#444444" />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                            </group>
                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />
                            <group ref={leftLowerLegRef} position={[0, -0.75, 0]}> 
                                <mesh position={[0, -0.45, 0]}><boxGeometry args={[0.35, 0.75, 0.45]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.1, 0.25]} rotation={[0.4, 0, 0]}><boxGeometry args={[0.25, 0.6, 0.15]} /><MechMaterial color={armorColor} />{isOutlineOn && <Outlines thickness={4} color="#111" />}</mesh>
                                <mesh position={[0, -0.071, -0.04]}><boxGeometry args={[0.2, 0.4, 0.45]} /><MechMaterial color="#444444" /></mesh>
                                <mesh position={[0, -0.863, 0]}><boxGeometry args={[0.2, 0.2, 0.5]} /><MechMaterial color="#444444" /></mesh>
                                <group ref={leftFootRef} position={[0, -0.7, -0.15]}>
                                    <group position={[0, -0.254, 0.24]}>
                                        <Trapezoid args={[0.35, 0.1, 0.7, 0.9, 0.8]} color={feetColor} />
                                        <group position={[0, 0.133, -0.016]} scale={[1, 1.2, 1]}>
                                            <Trapezoid args={[0.3, 0.2, 0.55, 0.6, 0.65]} color={armorColor} />
                                        </group>
                                    </group>
                                    <GhostEmitter active={isTrailActive} size={[0.35, 0.2, 0.7]} offset={[0, -0.2, 0.2]} rainbow={trailRainbow.current} />
                                    <ThrusterPlume active={isThrusting} offset={[0,0.5,-0.2]} angle={[Math.PI,0,0]}isAscending={isAscending} isFoot isLeft/>
                                </group>
                            </group>
                        </group>
                    </group>
         </group>
      </group>
      <Html 
        position={[0, 5.5, 0]} 
        center 
        distanceFactor={25} 
        zIndexRange={[100, 0]}
      >
        <div className={`relative flex flex-col items-center justify-center pointer-events-none select-none transition-opacity duration-200 ${isTargeted ? 'opacity-100' : 'opacity-40'}`}>
             <div className={`text-xs font-mono font-bold mb-1 whitespace-nowrap drop-shadow-md ${team === Team.RED ? 'text-red-400' : 'text-blue-300'}`}>
                {name}
             </div>
             <div className="w-16 h-1 bg-gray-900 border border-gray-600 rounded overflow-hidden">
                <div className={`h-full ${team === Team.RED ? 'bg-red-600' : 'bg-blue-500'}`} style={{ width: '100%' }}></div>
             </div>
             {isTargeted && (
                 <div className="mt-1 text-[8px] font-mono text-yellow-400 animate-pulse">
                     TARGET LOCKED
                 </div>
             )}
        </div>
      </Html>
    </group>
  );
};
