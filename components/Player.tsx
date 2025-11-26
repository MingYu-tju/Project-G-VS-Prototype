import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { Vector3, Mesh, MathUtils, Group, DoubleSide, AdditiveBlending, Quaternion, Matrix4, Shape, Euler, MeshToonMaterial, Color, Object3D, InstancedMesh, DynamicDrawUsage } from 'three';
import { Edges, useGLTF } from '@react-three/drei';
import { useGameStore } from '../store';
import { Team, LockState, GLOBAL_CONFIG, RED_LOCK_DISTANCE, MechPose, DEFAULT_MECH_POSE } from '../types';
import { IDLE_POSE, DASH_POSE_GUN, DASH_POSE_SABER, MELEE_STARTUP_POSE, MELEE_SLASH_POSE, MELEE_SLASH_2_POSE } from '../animations';
import { 
    DASH_SFX_BASE64, 
    SHOOT_SFX_BASE64,
    SWITCH_SFX_BASE64,
    STEP_SFX_BASE64,
    HIT_SFX_BASE64,
    DROP_SFX_BASE64,
    FOOT_SFX_BASE64
} from '../assets';

const FRAME_DURATION = 1 / 60;

// --- MELEE CONFIGURATION ---
type MeleePhase = 'NONE' | 'STARTUP' | 'LUNGE' | 'SLASH_1' | 'SLASH_2' | 'RECOVERY';
const MELEE_EMPTY_BOOST_PENALTY = 0.5; // 50% speed and duration if out of boost

// ... Audio Manager code omitted for brevity (same as before) ...
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
        console.warn("Failed to load sound asset", e);
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
                console.log("AudioContext resumed successfully.");
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
    console.log("Loading audio assets...");
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
        console.log("Audio assets loaded.");
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

// --- VISUAL EFFECTS (Unchanged) ---
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
            <meshBasicMaterial color="#ffaa00" transparent opacity={0.8} />
        </mesh>
    );
};

// --- GHOST EMITTER (Updated for Rainbow & Per-Instance Color) ---
interface GhostEmitterProps {
    active: boolean;
    size?: [number, number, number];
    offset?: [number, number, number];
    rainbow?: boolean; // New Prop for Rainbow Step
}

const GhostEmitter: React.FC<GhostEmitterProps> = ({ active, size=[0.4, 0.6, 0.4], offset=[0,0,0], rainbow=false }) => {
    const { scene } = useThree();
    const meshRef = useRef<InstancedMesh>(null);
    const trackerRef = useRef<Group>(null);
    
    const MAX_GHOSTS = 60; // Increased for rainbow smoothness
    const SPAWN_INTERVAL = rainbow?2:5; 
    const LIFETIME = 20; // Slightly longer lifetime
    
    const frameCount = useRef(0);
    // Add 'color' to ghost data
    const ghosts = useRef<{ pos: Vector3, rot: Quaternion, scale: Vector3, age: number, color: Color }[]>([]);
    const tempObj = useMemo(() => new Object3D(), []);
    const worldPos = useMemo(() => new Vector3(), []);
    const worldQuat = useMemo(() => new Quaternion(), []);
    const worldScale = useMemo(() => new Vector3(), []);
    const tempColor = useMemo(() => new Color(), []);

    useFrame(() => {
        if (!trackerRef.current || !meshRef.current) return;
        
        frameCount.current++;

        // 1. Spawn
        if (active && frameCount.current % SPAWN_INTERVAL === 0) {
            trackerRef.current.getWorldPosition(worldPos);
            trackerRef.current.getWorldQuaternion(worldQuat);
            trackerRef.current.getWorldScale(worldScale);

            // Determine Color
            const spawnColor = new Color();
            if (rainbow) {
                // Cycle hue based on frame count
                const hue = (frameCount.current * 0.05) % 1.0; // Rainbow cycle
                spawnColor.setHSL(hue, 1.0, 0.6);
            } else {
                spawnColor.set('#aaaaaa'); // Default Cyan
            }

            ghosts.current.push({
                pos: worldPos.clone(),
                rot: worldQuat.clone(),
                scale: worldScale.clone(),
                age: 0,
                color: spawnColor
            });
        }

        // 2. Render
        let aliveCount = 0;
        for (let i = ghosts.current.length - 1; i >= 0; i--) {
            const g = ghosts.current[i];
            g.age++;
            
            if (g.age > LIFETIME) {
                ghosts.current.splice(i, 1);
                continue;
            }

            const lifeRatio = 1 - (g.age / LIFETIME);
            
            tempObj.position.copy(g.pos);
            tempObj.quaternion.copy(g.rot);
            const s = lifeRatio * 0.9 + 0.1; 
            tempObj.scale.set(g.scale.x, g.scale.y, g.scale.z).multiplyScalar(s);
            
            tempObj.updateMatrix();
            meshRef.current.setMatrixAt(aliveCount, tempObj.matrix);
            
            // Set Instance Color
            meshRef.current.setColorAt(aliveCount, g.color);
            
            aliveCount++;
        }

        meshRef.current.count = aliveCount;
        meshRef.current.instanceMatrix.needsUpdate = true;
        
        // Important: Signal that colors need update
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
                    {/* Material is White, color comes from instanceColor attribute */}
                    <meshBasicMaterial 
                        color="#aaaaaa"  
                        transparent 
                        opacity={rainbow?0.9:0.5} 
                        blending={AdditiveBlending} 
                        depthWrite={false} 
                    />
                </instancedMesh>,
                scene
            )}
        </>
    );
};

// --- SABER SLASH EFFECT ---
// Custom particle system for the beam saber trail
// Spawns multiple particles along the blade length to create a gradient trail
const SaberSlashEffect: React.FC<{ active: boolean, meleeState: React.MutableRefObject<MeleePhase>,parentRef: React.RefObject<Group> }> = ({ active, meleeState, parentRef }) => {
    const { scene } = useThree();
    const meshRef = useRef<InstancedMesh>(null);
    const SPAWN_INTERVAL = 1;
    const MAX_PARTICLES = 400;
    const SAMPLES = 20; // Number of points to sample along the blade
    const LIFETIME = 60;
    
    const particles = useRef<{ pos: Vector3, rot: Quaternion, scale: Vector3, age: number, brightness: number }[]>([]);
    const frameCount = useRef(0);
    const tempObj = useMemo(() => new Object3D(), []);
    const worldPos = useMemo(() => new Vector3(), []);
    const worldQuat = useMemo(() => new Quaternion(), []);
    const bladeTip = useMemo(() => new Vector3(0, 3.1, 0), []);
    const bladeMid = useMemo(() => new Vector3(0, 1.6, 0), []);
    
    useFrame(() => {
        frameCount.current++;
        if (!meshRef.current || !parentRef.current) return;

        // 1. Spawn Particles
        if (active && (meleeState.current === 'SLASH_1' || meleeState.current === 'SLASH_2') && frameCount.current % SPAWN_INTERVAL === 0) {
            // Interpolate along the blade from Tip to Middle
            for (let i = 0; i < SAMPLES; i++) {
                const t = i / (SAMPLES - 1); // 0.0 (Tip) to 1.0 (Middle)
                
                // Interpolate local position
                const localPos = new Vector3().lerpVectors(bladeTip, bladeMid, t);
                
                // Convert to World
                localPos.applyMatrix4(parentRef.current.matrixWorld);
                
                // Get World Rotation
                const rot = new Quaternion().setFromRotationMatrix(parentRef.current.matrixWorld);
                
                // Gradient Logic: Brightest at tip (t=0), fade to transparent at mid (t=1)
                const brightness = 1.0 - t;
                
                if (brightness > 0.05) {
                    particles.current.push({
                        pos: localPos,
                        rot: rot,
                        scale: new Vector3(0.15, 0.15, 0.15), // Small cubes
                        age: 0,
                        brightness: brightness
                    });
                }
            }
        }

        // 2. Update & Render
        let aliveCount = 0;
        for (let i = particles.current.length - 1; i >= 0; i--) {
            const p = particles.current[i];
            p.age++;
            
            if (p.age > LIFETIME) {
                particles.current.splice(i, 1);
                continue;
            }

            const lifeRatio = 1 - (p.age / LIFETIME);
            
            // Fade out logic: Scale down slightly, but mostly control color brightness
            const currentBrightness = p.brightness * lifeRatio;
            
            tempObj.position.copy(p.pos);
            tempObj.quaternion.copy(p.rot);
            tempObj.scale.copy(p.scale); // Keep scale mostly constant or shrink slightly
            
            tempObj.updateMatrix();
            meshRef.current.setMatrixAt(aliveCount, tempObj.matrix);
            
            // Set Color with Brightness (Darker = More Transparent in Additive)
            // Hot Pink #ff0088
            const col = new Color(0xff0088).multiplyScalar(currentBrightness);
            meshRef.current.setColorAt(aliveCount, col);
            
            aliveCount++;
        }

        meshRef.current.count = aliveCount;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }
    });

    return createPortal(
        <instancedMesh 
            ref={meshRef} 
            args={[undefined, undefined, MAX_PARTICLES]} 
            frustumCulled={false}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial 
                color="white" // Base color, tinted by instanceColor
                transparent 
                blending={AdditiveBlending} 
                depthWrite={false} 
            />
        </instancedMesh>,
        scene
    );
};

// --- BEAM SABER COMPONENT ---
const BeamSaber: React.FC<{ active: boolean, meleeState: React.MutableRefObject<MeleePhase> }> = ({ active, meleeState }) => {
    const groupRef = useRef<Group>(null);
    const bladeGroupRef = useRef<Group>(null); // Inner group for blade logic
    
    useFrame(() => {
        if (groupRef.current) {
            // Smooth scale for equipping
            const targetScale = active ? 1 : 0;
            groupRef.current.scale.y = MathUtils.lerp(groupRef.current.scale.y, targetScale, 0.3);
            groupRef.current.visible = groupRef.current.scale.y > 0.01;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Handle - White, Protruding from Fist */}
            <mesh position={[0, -0.25, 0]}>
                <cylinderGeometry args={[0.035, 0.04, 0.6, 8]} />
                <meshToonMaterial color="white" />
                <Edges threshold={15} color="#999" />
            </mesh>
            
            {/* Blade Group - Used for slash trail reference */}
            <group ref={bladeGroupRef}>
                {/* Blade Core */}
                <mesh position={[0, 1.6, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 2.8, 8]} />
                    <meshBasicMaterial color="white" />
                </mesh>
                
                {/* Blade Glow - Standard Cylinder */}
                <mesh position={[0, 1.6, 0]}>
                    <cylinderGeometry args={[0.12, 0.12, 3.0, 8]} />
                    <meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
                </mesh>
            </group>

            {/* SLASH EFFECT - Custom Particle System */}
            <SaberSlashEffect active={active } meleeState={meleeState} parentRef={bladeGroupRef} />
        </group>
    );
};

// --- MECHA HEAD COMPONENT ---
const MODEL_PATH = '/models/head.glb';
useGLTF.preload(MODEL_PATH);

const MechaHead: React.FC<{ mainColor: string }> = ({ mainColor }) => {
    const { nodes } = useGLTF(MODEL_PATH) as any;
    const meshProps = {}; // Removed castShadow and receiveShadow for performance
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

export const Player: React.FC = () => {
    const meshRef = useRef<Mesh>(null);
    const headRef = useRef<Group>(null);
    const torsoRef = useRef<Group>(null); 
    const upperBodyRef = useRef<Group>(null); // Chest
    const legsRef = useRef<Group>(null);
    const rightLegRef = useRef<Group>(null);
    const leftLegRef = useRef<Group>(null);
    const rightLowerLegRef = useRef<Group>(null);
    const leftLowerLegRef = useRef<Group>(null);
    const rightFootRef = useRef<Group>(null);
    const leftFootRef = useRef<Group>(null);

    const gunArmRef = useRef<Group>(null); // Left Shoulder
    const rightArmRef = useRef<Group>(null); // Right Shoulder
    const leftForeArmRef = useRef<Group>(null); // Left Elbow Container
    const rightForeArmRef = useRef<Group>(null); // Right Elbow Container
    
    // NEW REFS for expanded articulation
    const leftForearmTwistRef = useRef<Group>(null);
    const rightForearmTwistRef = useRef<Group>(null);
    const leftWristRef = useRef<Group>(null);
    const rightWristRef = useRef<Group>(null);

    const gunMeshRef = useRef<Group>(null); 
    const shieldRef = useRef<Group>(null); 
    const muzzleRef = useRef<Group>(null);
    const { camera } = useThree();

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
        isGameStarted
    } = useGameStore();

    // ... Physics/Input State (same as before) ...
    const velocity = useRef(new Vector3(0, 0, 0));
    const position = useRef(new Vector3(0, 0, 0));
    const isGrounded = useRef(true);
    const landingFrames = useRef(0);
    const visualLandingFrames = useRef(0);
    const wasStunnedRef = useRef(false);
    
    // REMOVED: isMeleeGroundedStart ref and related logic

    // Input State
    const keys = useRef<{ [key: string]: boolean }>({});
    const lastKeyPressTime = useRef(0);
    const lastKeyPressed = useRef<string>("");
    const lPressStartTime = useRef(0);
    const lastLReleaseTime = useRef(0);
    const lConsumedByAction = useRef(false); 
    const lConsumedByDash = useRef(false);
    const preserveDoubleTapOnRelease = useRef(false);

    // Action State
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

    // Animation Variables
    const currentUpperBodyTilt = useRef(0); 
    const wasFallingRef = useRef(false); 
    const currentFallTime = useRef(0); 
    const totalPredictedFallFrames = useRef(0); 
    const walkCycle = useRef(0);
    const lastWalkCycle = useRef(0); 

    // Evade State
    const isEvading = useRef(false);
    const evadeTimer = useRef(0);
    const evadeRecoveryTimer = useRef(0); // Recovery timer for Evade (Freeze)
    const evadeDirection = useRef(new Vector3(0, 0, 0));
    const isRainbowStep = useRef(false); // Track Rainbow Step Status
    
    // Trail State
    const trailTimer = useRef(0);      // NEW: Independent timer for trails
    const trailRainbow = useRef(false); // NEW: Tracks if current trail should be rainbow

    // Combat State
    const isShooting = useRef(false);
    const shootTimer = useRef(0);
    const hasFired = useRef(false);
    const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
    const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
    const [dashTriggerTime, setDashTriggerTime] = useState(0);

    // MELEE STATE
    const meleeState = useRef<MeleePhase>('NONE');
    const meleeTimer = useRef(0);
    const meleeStartupTimer = useRef(0); // NEW: Strict timer for windup animation
    const meleeLungeTargetPos = useRef<Vector3 | null>(null); 
    const hasMeleeHitRef = useRef(false);
    const isMeleePenaltyActive = useRef(false); // Track if we are in penalty mode
    const meleeComboBuffer = useRef(false); // NEW: Buffer input for second slash

    // Visual State
    const [visualState, setVisualState] = useState<'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' | 'MELEE'>('IDLE');
    const [isStunned, setIsStunned] = useState(false);
    const ammoRegenTimer = useRef(0);
    const [activeWeapon, setActiveWeapon] = useState<'GUN' | 'SABER'>('GUN');

    useEffect(() => {
        loadAllSounds();
    }, []);

    // ... Input Handling Methods (getDirectionFromKey, etc. same as before) ...
    const getDirectionFromKey = (key: string) => {
        const input = new Vector3(0,0,0);
        if (key === 'w') input.z -= 1;
        if (key === 's') input.z += 1;
        if (key === 'a') input.x -= 1;
        if (key === 'd') input.x += 1;
        const camDir = new Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        const camRight = new Vector3();
        camRight.crossVectors(camDir, new Vector3(0, 1, 0)).normalize();
        const moveDir = new Vector3();
        moveDir.addScaledVector(camDir, -input.z);
        moveDir.addScaledVector(camRight, input.x);
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
        const camDir = new Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        const camRight = new Vector3();
        camRight.crossVectors(camDir, new Vector3(0, 1, 0)).normalize();
        const moveDir = new Vector3();
        moveDir.addScaledVector(camDir, -input.z); 
        moveDir.addScaledVector(camRight, input.x);
        return moveDir.normalize();
    };

    const startDashAction = () => {
        const now = Date.now();
        const state = useGameStore.getState();
        if (!state.isOverheated && state.boost > 0 && !isStunned) {
            if (meleeState.current !== 'NONE') {
                meleeState.current = 'NONE';
                
                // FIX: Snap to horizon when interrupting melee with dash
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
            // CANCEL EVADE RECOVERY
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

    // ... useEffect for keyboard listeners (same as before) ...
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!useGameStore.getState().isGameStarted) return;
            const key = e.key.toLowerCase();
            const now = Date.now();
            if (!keys.current[key]) {
                if (['w', 'a', 's', 'd'].includes(key)) {
                    if (key === lastKeyPressed.current && (now - lastKeyPressTime.current < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW)) {
                        if (!isOverheated && boost > 0 && !isStunned && landingFrames.current <= 0) {
                            
                            // --- RAINBOW STEP LOGIC ---
                            let isRainbow = false;
                            if (meleeState.current !== 'NONE') {
                                meleeState.current = 'NONE';
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
                                const dir = getDirectionFromKey(key);
                                evadeDirection.current.copy(dir);
                                
                                const spd = isRainbow ? GLOBAL_CONFIG.RAINBOW_STEP_SPEED : GLOBAL_CONFIG.EVADE_SPEED;
                                velocity.current.x = dir.x * spd;
                                velocity.current.z = dir.z * spd;
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
                    if (meleeState.current === 'SLASH_1') {
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

                        let inRedLock = false;
                        let dist = 9999;
                        
                        if (target) {
                            dist = position.current.distanceTo(target.position);
                            if (dist < RED_LOCK_DISTANCE) inRedLock = true;
                        }

                        const hasBoost = !state.isOverheated && state.boost > 0;
                        isMeleePenaltyActive.current = !hasBoost;

                        if (inRedLock) {
                            meleeState.current = 'LUNGE';
                            
                            let maxLungeTime = GLOBAL_CONFIG.MELEE_MAX_LUNGE_TIME;
                            if (isMeleePenaltyActive.current) {
                                maxLungeTime *= MELEE_EMPTY_BOOST_PENALTY;
                            }
                            meleeTimer.current = maxLungeTime;
                            
                            meleeStartupTimer.current = GLOBAL_CONFIG.MELEE_STARTUP_FRAMES; 

                            if (target && meshRef.current) {
                                const tPos = target.position.clone();
                                meshRef.current.lookAt(tPos);
                                meleeLungeTargetPos.current = target.position.clone();
                            }
                        } else {
                            meleeState.current = 'STARTUP';
                            meleeTimer.current = GLOBAL_CONFIG.MELEE_STARTUP_FRAMES;
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

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        // --- HIT STOP LOGIC ---
        // If the global hitStop counter is active, we pause movement/physics logic completely.
        // The camera will still update (since it's outside this if-check logic or handled via interpolation elsewhere),
        // creating the desired "impact freeze" while the world shakes.
        if (hitStop > 0) {
            // We skip position/velocity updates.
            // But we might want to keep the camera looking at the target.
            // For now, simple return effectively freezes the player model.
            return;
        }

        const timeScale = delta * 60;
        const now = Date.now();
        const currentTarget = targets[currentTargetIndex];
        const moveDir = getCameraRelativeInput();
        
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
            jumpBuffer.current = false; 
            forcedAscentFrames.current = 0;
            shootTimer.current = 0;
            landingFrames.current = 0;
            visualLandingFrames.current = 0; 
            evadeRecoveryTimer.current = 0; 

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
            if (meleeState.current !== 'NONE') {
                nextVisualState = 'MELEE';
                if (isDashing.current || isEvading.current) {
                    meleeState.current = 'NONE';
                }

                velocity.current.y *= 0.9; 
                
                if (meleeState.current === 'STARTUP') {
                    velocity.current.x = 0;
                    velocity.current.z = 0;
                    
                    meleeTimer.current -= timeScale;
                    
                    if (meleeTimer.current <= 0) {
                        meleeState.current = 'SLASH_1';
                        meleeTimer.current = GLOBAL_CONFIG.MELEE_ATTACK_FRAMES;
                        hasMeleeHitRef.current = false; // Reset hit flag
                    }
                } 
                else if (meleeState.current === 'LUNGE') {
                    const paid = consumeBoost(GLOBAL_CONFIG.MELEE_BOOST_CONSUMPTION * timeScale);
                    
                    let dist = 999;
                    if (currentTarget) {
                        dist = position.current.distanceTo(currentTarget.position);
                        const targetPos = currentTarget.position.clone();
                        const dir = targetPos.sub(position.current).normalize();
                        
                        let speed = GLOBAL_CONFIG.MELEE_LUNGE_SPEED;
                        if (isMeleePenaltyActive.current) {
                            speed *= MELEE_EMPTY_BOOST_PENALTY;
                        }

                        velocity.current.x = dir.x * speed;
                        velocity.current.z = dir.z * speed;
                        
                        velocity.current.y = dir.y * speed;
                        meshRef.current.lookAt(currentTarget.position);

                    } else {
                        const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                        let speed = GLOBAL_CONFIG.MELEE_LUNGE_SPEED;
                         if (isMeleePenaltyActive.current) {
                            speed *= MELEE_EMPTY_BOOST_PENALTY;
                        }

                        velocity.current.x = fwd.x * speed;
                        velocity.current.z = fwd.z * speed;
                        
                        velocity.current.y = fwd.y * speed;
                    }

                    meleeTimer.current -= timeScale;
                    meleeStartupTimer.current -= timeScale;

                    const isStartupComplete = meleeStartupTimer.current <= 0;
                    
                    if (isStartupComplete) {
                         if (dist < GLOBAL_CONFIG.MELEE_RANGE || meleeTimer.current <= 0) {
                             meleeState.current = 'SLASH_1';
                             meleeTimer.current = GLOBAL_CONFIG.MELEE_ATTACK_FRAMES;
                             hasMeleeHitRef.current = false; 
                             
                             velocity.current.set(0,0,0); 
                         }
                    }
                }
                else if (meleeState.current === 'SLASH_1') {
                    if (!hasMeleeHitRef.current) {
                        if (currentTarget) {
                            const dist = position.current.distanceTo(currentTarget.position);
                            if (dist < GLOBAL_CONFIG.MELEE_RANGE) {
                                const knockback = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                applyHit(
                                    currentTarget.id, 
                                    knockback, 
                                    GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.KNOCKBACK_POWER,
                                    GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.STUN_DURATION,
                                    GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.HIT_STOP_FRAMES // HIT STOP
                                ); 
                                playHitSound(0);
                                hasMeleeHitRef.current = true; 
                            }
                        }
                    }
                    
                    meleeTimer.current -= timeScale;
                    if (meleeTimer.current <= 0) {
                        if (meleeComboBuffer.current) {
                            meleeState.current = 'SLASH_2';
                            meleeTimer.current = GLOBAL_CONFIG.MELEE_ATTACK_FRAMES;
                            hasMeleeHitRef.current = false; 
                            meleeComboBuffer.current = false; 
                            
                            if (currentTarget  && lockState === LockState.RED) {
                                const tPos = currentTarget.position.clone();
                                const pPos = position.current.clone();
                                const dir = tPos.sub(pPos).normalize();
                                
                                const stepSpeed = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.STEP_VELOCITY;
                                velocity.current.copy(dir.multiplyScalar(stepSpeed));
                                
                                meshRef.current.lookAt(currentTarget.position);
                            } else {
                                const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                                const stepSpeed = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.STEP_VELOCITY;
                                velocity.current.copy(fwd.multiplyScalar(stepSpeed));
                            }
                        } else {
                            meleeState.current = 'RECOVERY';
                            meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                        }
                    }
                }
                else if (meleeState.current === 'SLASH_2') {
                    velocity.current.multiplyScalar(0.85); 
                    
                    if (!hasMeleeHitRef.current) {
                        if (currentTarget) {
                            const dist = position.current.distanceTo(currentTarget.position);
                            if (dist < GLOBAL_CONFIG.MELEE_RANGE + 0.5) { 
                                const knockback = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                applyHit(
                                    currentTarget.id, 
                                    knockback, 
                                    GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.KNOCKBACK_POWER,
                                    GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.STUN_DURATION,
                                    GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.HIT_STOP_FRAMES // HIT STOP
                                ); 
                                playHitSound(0);
                                hasMeleeHitRef.current = true;
                            }
                        }
                    }
                    
                    meleeTimer.current -= timeScale;
                    if (meleeTimer.current <= 0) {
                        meleeState.current = 'RECOVERY';
                        meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                    }
                }
                else if (meleeState.current === 'RECOVERY') {
                    meleeTimer.current -= timeScale;
                    if (meleeTimer.current <= 0) {
                        meleeState.current = 'NONE';
                        
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

                velocity.current.x = evadeDirection.current.x * currentSpeed;
                velocity.current.z = evadeDirection.current.z * currentSpeed;
                velocity.current.y = 0; 

                if (isAscentInput) {
                    if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                        isEvading.current = false; 
                        evadeRecoveryTimer.current = 0;

                        nextVisualState = 'ASCEND';
                        velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                        lConsumedByAction.current = true;
                        preserveDoubleTapOnRelease.current = true;

                        const inertiaRatio = isRainbowStep.current 
                            ? GLOBAL_CONFIG.RAINBOW_STEP_ASCENT_INERTIA_RATIO 
                            : GLOBAL_CONFIG.EVADE_ASCENT_INERTIA_RATIO;
                        
                        velocity.current.x *= inertiaRatio;
                        velocity.current.z *= inertiaRatio;
                    }
                }

                if (evadeTimer.current <= 0) {
                    isEvading.current = false;
                    velocity.current.set(0, 0, 0);
                    
                    evadeRecoveryTimer.current = isRainbowStep.current 
                        ? GLOBAL_CONFIG.RAINBOW_STEP_RECOVERY_FRAMES 
                        : GLOBAL_CONFIG.EVADE_RECOVERY_FRAMES;
                }
            }
            else if (isShooting.current && shootMode.current === 'STOP') {
                nextVisualState = 'SHOOT';
                velocity.current.set(0, 0, 0);
            }
            else if (landingFrames.current > 0) {
                velocity.current.set(0, 0, 0);
                landingFrames.current -= 1 * timeScale; 
                if (landingFrames.current <= 0) { 
                    landingFrames.current = 0;
                    refillBoost();
                    if (dashBuffer.current) {
                        if (dashCooldownTimer.current <= 0) {
                            startDashAction();
                            dashBuffer.current = false;
                        }
                    }
                }
            } 
            else {
                if (evadeRecoveryTimer.current > 0) {
                    velocity.current.set(0,0,0); 
                    evadeRecoveryTimer.current -= timeScale;
                }
                else {
                    if (isDashing.current) {
                        if ((isOverheated || boost <= 0) && dashReleaseTime.current === null) {
                            dashReleaseTime.current = now;
                        }
                        if (dashReleaseTime.current === null && !isLHeld && !moveDir) {
                            dashReleaseTime.current = now;
                        }
                        if (dashReleaseTime.current !== null) {
                            if (now - dashReleaseTime.current > GLOBAL_CONFIG.DASH_COAST_DURATION) {
                                isDashing.current = false;
                            }
                        }
                    }

                    const effectiveAscent = isAscentInput && !isVisualLock; 
                    const isDashBursting = dashBurstTimer.current > 0;

                    if (isDashing.current) {
                        const isCoasting = dashReleaseTime.current !== null;
                            let canSustain = isCoasting;
                            if (!isCoasting) {
                                const paid = consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_HOLD * timeScale);
                                if (paid) {
                                    canSustain = true;
                                } else {
                                    const checkState = useGameStore.getState();
                                    if (checkState.isOverheated || checkState.boost <= 0) {
                                        dashReleaseTime.current = now;
                                        canSustain = true; 
                                    } else {
                                        canSustain = false; 
                                    }
                                }
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
                        } else {
                            isDashing.current = false;
                        }
                    }
                    else if (effectiveAscent && !isOverheated && !isDashBursting) {
                        let canAscend = true;
                        if (isAscentInput) {
                            canAscend = consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale);
                            if (canAscend) {
                                lConsumedByAction.current = true;
                                if (visualState !== 'ASCEND') {
                                    playBoostSound();
                                }
                            }
                        }

                        if (canAscend) {
                            nextVisualState = 'ASCEND';
                            velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                            velocity.current.x *= Math.pow(0.995, timeScale);
                            velocity.current.z *= Math.pow(0.995, timeScale);
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
                                } else {
                                    currentVel.copy(effectiveDir);
                                }
                                
                                currentVel.normalize().multiplyScalar(GLOBAL_CONFIG.WALK_SPEED);
                                velocity.current.x = currentVel.x;
                                velocity.current.z = currentVel.z;
                            } else {
                                velocity.current.x = 0;
                                velocity.current.z = 0;
                            }
                        } else {
                            if (moveDir) {
                                velocity.current.addScaledVector(moveDir, 0.002 * timeScale);
                            }
                        }
                    }

                    const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                    const frictionFactor = Math.pow(friction, timeScale);
                    
                    if (forcedAscentFrames.current > 0 && nextVisualState !== 'DASH') {
                        nextVisualState = 'ASCEND';
                    }
                    
                    if (nextVisualState !== 'ASCEND') {
                        velocity.current.x *= frictionFactor;
                        velocity.current.z *= frictionFactor;
                    }
                    
                    if (!isDashing.current) {
                        velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
                    }
                }
            }
            
            position.current.add(velocity.current.clone().multiplyScalar(timeScale));
        }

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
        } else {
            isGrounded.current = false;
        }

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

        if (isGrounded.current && nextVisualState === 'WALK') {
            const speed = new Vector3(velocity.current.x, 0, velocity.current.z).length();
            if (speed > 0.05) {
                lastWalkCycle.current = walkCycle.current;
                walkCycle.current += delta * 9.5; 
                const prevStep = Math.floor(lastWalkCycle.current / Math.PI);
                const currStep = Math.floor(walkCycle.current / Math.PI);
                if (currStep !== prevStep) {
                    playFootSound();
                }
            }
        }

        // ... Rotations and Animation ...
        const isIdlePose = isGrounded.current && nextVisualState === 'IDLE' && !isShooting.current && !isStunned && landingFrames.current <= 0;

        if (!stunned) {
            if (meleeState.current === 'LUNGE') {
                if (velocity.current.lengthSq() > 0.01) {
                    const lookPos = position.current.clone().add(velocity.current);
                    meshRef.current.lookAt(lookPos);
                }
            } else if (meleeState.current === 'STARTUP' || meleeState.current === 'SLASH_1' || meleeState.current === 'SLASH_2' || meleeState.current === 'RECOVERY') {
                // Lock rotation
            }
            else if (isShooting.current && currentTarget && shootMode.current === 'STOP') {
                const dirToTarget = currentTarget.position.clone().sub(meshRef.current.position);
                dirToTarget.y = 0; 
                dirToTarget.normalize();
                if (dirToTarget.lengthSq() > 0.001) {
                    const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), dirToTarget);
                    meshRef.current.quaternion.slerp(targetQuat, 0.1 * timeScale);
                }
            }
            else if (isDashing.current) {
                const lookPos = position.current.clone().add(dashDirection.current);
                meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
            }
            else if (nextVisualState === 'ASCEND') {
                if (moveDir) {
                    const targetLookAt = position.current.clone().sub(moveDir);
                    const m = new Matrix4();
                    m.lookAt(position.current, targetLookAt, new Vector3(0,1,0));
                    const targetQuat = new Quaternion();
                    targetQuat.setFromRotationMatrix(m);
                    meshRef.current.quaternion.slerp(targetQuat, GLOBAL_CONFIG.ASCENT_TURN_SPEED * timeScale);
                }
            }
            else if (nextVisualState === 'WALK'){
                const horizVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                if (horizVel.lengthSq() > 0.001) { 
                    const lookPos = position.current.clone().add(horizVel);
                    meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
                }
            }
            
            const shouldRealignHorizon = meleeState.current === 'RECOVERY' || (visualState === 'IDLE' && !isShooting.current);
            if (shouldRealignHorizon) {
                 const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                 fwd.y = 0;
                 fwd.normalize();
                 if (fwd.lengthSq() > 0.1) {
                     const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), fwd);
                     meshRef.current.quaternion.slerp(targetQuat, 0.15 * timeScale);
                 }
            }
            
            meshRef.current.updateMatrixWorld(true);

            // --- ANIMATION MIXER (Truncated for brevity, same logic applies) ---
            // Left Arm (Gun)
            if (gunArmRef.current) {
                let targetArmEuler = new Euler(0.35, -0.3, 0); 
                const useIdleArmPose = isGrounded.current && (
                    nextVisualState === 'IDLE' || 
                    (nextVisualState === 'SHOOT' && shootMode.current === 'STOP') ||
                    (nextVisualState === 'WALK' && velocity.current.lengthSq() < 0.01)
                );

                if (useIdleArmPose) {
                    targetArmEuler.set(
                        IDLE_POSE.LEFT_ARM.SHOULDER.x,
                        IDLE_POSE.LEFT_ARM.SHOULDER.y,
                        IDLE_POSE.LEFT_ARM.SHOULDER.z
                    );
                }
                
                const targetArmQuat = new Quaternion().setFromEuler(targetArmEuler);

                if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE.LEFT_ARM.SHOULDER;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.LEFT_ARM.SHOULDER;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.LEFT_ARM.SHOULDER;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.LEFT_ARM.SHOULDER;
                    
                    const q = new Quaternion().setFromEuler(new Euler(pose.x, pose.y, pose.z));
                    const lerpSpeed = meleeState.current.includes('SLASH') ? 0.4 : 0.2;
                    gunArmRef.current.quaternion.slerp(q, lerpSpeed * timeScale);
                }
                else if (isShooting.current && currentTarget) {
                    const shoulderPos = new Vector3();
                    gunArmRef.current.getWorldPosition(shoulderPos);
                    const targetPos = currentTarget.position.clone();
                    const dirToTarget = targetPos.sub(shoulderPos).normalize();
                    const bodyInverseQuat = meshRef.current.quaternion.clone().invert();
                    const localDir = dirToTarget.applyQuaternion(bodyInverseQuat);
                    const defaultForward = new Vector3(0, -1, 0.2).normalize();
                    const targetQuat = new Quaternion().setFromUnitVectors(defaultForward, localDir);
                    
                    const startup = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES;
                    const aiming = GLOBAL_CONFIG.SHOT_AIM_DURATION;
                    const recovery = shootMode.current === 'STOP' 
                        ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                        : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                    
                    const identity = new Quaternion();

                    if (shootTimer.current < startup) {
                        if (shootTimer.current < aiming) {
                            const t = shootTimer.current / aiming;
                            const smoothT = 1 - Math.pow(1 - t, 3);
                            gunArmRef.current.quaternion.slerpQuaternions(identity, targetQuat, smoothT);
                        } else {
                            gunArmRef.current.quaternion.copy(targetQuat);
                        }
                    } else {
                        const t = (shootTimer.current - startup) / recovery;
                        gunArmRef.current.quaternion.slerpQuaternions(targetQuat, targetArmQuat, t);
                    }
                } else {
                    const lerpSpeed = 0.1 * timeScale;
                    gunArmRef.current.rotation.x = MathUtils.lerp(gunArmRef.current.rotation.x, targetArmEuler.x, lerpSpeed);
                    gunArmRef.current.rotation.y = MathUtils.lerp(gunArmRef.current.rotation.y, targetArmEuler.y, lerpSpeed);
                    gunArmRef.current.rotation.z = MathUtils.lerp(gunArmRef.current.rotation.z, targetArmEuler.z, lerpSpeed);
                }
            }
            
            // ... (Rest of limb animations remain identical, just ensuring useFrame returns early for hitStop)
            // Left Elbow
            if (leftForeArmRef.current) {
                let targetX = -0.65;
                let targetY = 0.3;
                let targetZ = 0;

                if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE.LEFT_ARM.ELBOW;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.LEFT_ARM.ELBOW;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.LEFT_ARM.ELBOW;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.LEFT_ARM.ELBOW;
                    targetX = pose.x; targetY = pose.y; targetZ = pose.z;
                } else if (isIdlePose) {
                    targetX = IDLE_POSE.LEFT_ARM.ELBOW.x;
                    targetY = IDLE_POSE.LEFT_ARM.ELBOW.y;
                    targetZ = IDLE_POSE.LEFT_ARM.ELBOW.z;
                }

                const lerpSpeed = (meleeState.current.includes('SLASH') ? 0.4 : 0.1) * timeScale;
                leftForeArmRef.current.rotation.x = MathUtils.lerp(leftForeArmRef.current.rotation.x, targetX, lerpSpeed);
                leftForeArmRef.current.rotation.y = MathUtils.lerp(leftForeArmRef.current.rotation.y, targetY, lerpSpeed);
                leftForeArmRef.current.rotation.z = MathUtils.lerp(leftForeArmRef.current.rotation.z, targetZ, lerpSpeed);
            }

            // Right Shoulder
            if (rightArmRef.current) {
                let targetX = 0.35;
                let targetY = 0.3;
                let targetZ = 0;

                if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE.RIGHT_ARM.SHOULDER;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.RIGHT_ARM.SHOULDER;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.RIGHT_ARM.SHOULDER;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.RIGHT_ARM.SHOULDER;
                    targetX = pose.x; targetY = pose.y; targetZ = pose.z;
                } else if (isDashing.current) {
                    const pose = activeWeapon === 'SABER' ? DASH_POSE_SABER : DASH_POSE_GUN;
                    targetX = pose.RIGHT_ARM.SHOULDER.x;
                    targetY = pose.RIGHT_ARM.SHOULDER.y;
                    targetZ = pose.RIGHT_ARM.SHOULDER.z;
                } 
                else if (isIdlePose) {
                    targetX = IDLE_POSE.RIGHT_ARM.SHOULDER.x;
                    targetY = IDLE_POSE.RIGHT_ARM.SHOULDER.y;
                    targetZ = IDLE_POSE.RIGHT_ARM.SHOULDER.z;
                }

                const lerpSpeed = (isDashing.current || meleeState.current !== 'NONE' ? 0.2 : 0.1) * timeScale;
                rightArmRef.current.rotation.x = MathUtils.lerp(rightArmRef.current.rotation.x, targetX, lerpSpeed);
                rightArmRef.current.rotation.y = MathUtils.lerp(rightArmRef.current.rotation.y, targetY, lerpSpeed);
                rightArmRef.current.rotation.z = MathUtils.lerp(rightArmRef.current.rotation.z, targetZ, lerpSpeed);
            }

            // Right Elbow
            if (rightForeArmRef.current) {
                let targetX = -0.65;
                let targetY = -0.3;
                let targetZ = 0;
                
                if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE.RIGHT_ARM.ELBOW;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.RIGHT_ARM.ELBOW;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.RIGHT_ARM.ELBOW;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.RIGHT_ARM.ELBOW;
                    targetX = pose.x; targetY = pose.y; targetZ = pose.z;
                } else if (isDashing.current) {
                    const pose = activeWeapon === 'SABER' ? DASH_POSE_SABER : DASH_POSE_GUN;
                    targetX = pose.RIGHT_ARM.ELBOW.x;
                    targetY = pose.RIGHT_ARM.ELBOW.y;
                    targetZ = pose.RIGHT_ARM.ELBOW.z;
                }
                else if (isIdlePose) {
                    targetX = IDLE_POSE.RIGHT_ARM.ELBOW.x;
                    targetY = IDLE_POSE.RIGHT_ARM.ELBOW.y;
                    targetZ = IDLE_POSE.RIGHT_ARM.ELBOW.z;
                }

                const lerpSpeed = (isDashing.current || meleeState.current !== 'NONE' ? 0.2 : 0.1) * timeScale;
                rightForeArmRef.current.rotation.x = MathUtils.lerp(rightForeArmRef.current.rotation.x, targetX, lerpSpeed);
                rightForeArmRef.current.rotation.y = MathUtils.lerp(rightForeArmRef.current.rotation.y, targetY, lerpSpeed);
                rightForeArmRef.current.rotation.z = MathUtils.lerp(rightForeArmRef.current.rotation.z, targetZ, lerpSpeed);
            }

            // Left Forearm Twist & Wrist
            if (leftForearmTwistRef.current && leftWristRef.current) {
                let twist = { x: 0, y: 0, z: 0 };
                let wrist = { x: 0, y: 0, z: 0 };
                if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE.LEFT_ARM;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.LEFT_ARM;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.LEFT_ARM;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.LEFT_ARM;
                    twist = pose.FOREARM;
                    wrist = pose.WRIST;
                }
                const speed = 0.2 * timeScale;
                leftForearmTwistRef.current.rotation.x = MathUtils.lerp(leftForearmTwistRef.current.rotation.x, twist.x, speed);
                leftForearmTwistRef.current.rotation.y = MathUtils.lerp(leftForearmTwistRef.current.rotation.y, twist.y, speed);
                leftForearmTwistRef.current.rotation.z = MathUtils.lerp(leftForearmTwistRef.current.rotation.z, twist.z, speed);
                
                leftWristRef.current.rotation.x = MathUtils.lerp(leftWristRef.current.rotation.x, wrist.x, speed);
                leftWristRef.current.rotation.y = MathUtils.lerp(leftWristRef.current.rotation.y, wrist.y, speed);
                leftWristRef.current.rotation.z = MathUtils.lerp(leftWristRef.current.rotation.z, wrist.z, speed);
            }

            // Right Forearm Twist & Wrist
            if (rightForearmTwistRef.current && rightWristRef.current) {
                let twist = { x: 0, y: 0, z: 0 };
                let wrist = { x: 0, y: 0, z: 0 };
                if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE.RIGHT_ARM;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.RIGHT_ARM;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.RIGHT_ARM;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.RIGHT_ARM;
                    twist = pose.FOREARM;
                    wrist = pose.WRIST;
                }
                const speed = 0.2 * timeScale;
                rightForearmTwistRef.current.rotation.x = MathUtils.lerp(rightForearmTwistRef.current.rotation.x, twist.x, speed);
                rightForearmTwistRef.current.rotation.y = MathUtils.lerp(rightForearmTwistRef.current.rotation.y, twist.y, speed);
                rightForearmTwistRef.current.rotation.z = MathUtils.lerp(rightForearmTwistRef.current.rotation.z, twist.z, speed);
                
                rightWristRef.current.rotation.x = MathUtils.lerp(rightWristRef.current.rotation.x, wrist.x, speed);
                rightWristRef.current.rotation.y = MathUtils.lerp(rightWristRef.current.rotation.y, wrist.y, speed);
                rightWristRef.current.rotation.z = MathUtils.lerp(rightWristRef.current.rotation.z, wrist.z, speed);
            }

            // Shield
            if (shieldRef.current) {
                let targetPos = { x: 0, y: -0.5, z: 0.1 };
                let targetRot = { x: -0.2, y: 0, z: 0 };

                if (isDashing.current) {
                    const pose = activeWeapon === 'SABER' ? DASH_POSE_SABER : DASH_POSE_GUN;
                    if (pose.SHIELD) {
                        targetPos = pose.SHIELD.POSITION;
                        targetRot = pose.SHIELD.ROTATION;
                    }
                }

                const lerpSpeed = (isDashing.current || meleeState.current !== 'NONE' ? 0.15 : 0.1) * timeScale;
                shieldRef.current.position.x = MathUtils.lerp(shieldRef.current.position.x, targetPos.x, lerpSpeed);
                shieldRef.current.position.y = MathUtils.lerp(shieldRef.current.position.y, targetPos.y, lerpSpeed);
                shieldRef.current.position.z = MathUtils.lerp(shieldRef.current.position.z, targetPos.z, lerpSpeed);
                shieldRef.current.rotation.x = MathUtils.lerp(shieldRef.current.rotation.x, targetRot.x, lerpSpeed);
                shieldRef.current.rotation.y = MathUtils.lerp(shieldRef.current.rotation.y, targetRot.y, lerpSpeed);
                shieldRef.current.rotation.z = MathUtils.lerp(shieldRef.current.rotation.z, targetRot.z, lerpSpeed);
            }
            
            // Head
            if (headRef.current) {
                const t = targets[currentTargetIndex];
                let shouldLook = false;
                
                if (t && meleeState.current === 'NONE') { 
                    const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                    const dirToT = t.position.clone().sub(position.current).normalize();
                    if (fwd.dot(dirToT) > 0) { 
                        shouldLook = true;
                        const startQuat = headRef.current.quaternion.clone();
                        const lookAtTarget = t.position.clone().add(new Vector3(0, 1.7, 0));
                        headRef.current.lookAt(lookAtTarget);
                        const targetQuat = headRef.current.quaternion.clone();
                        headRef.current.quaternion.copy(startQuat);
                        headRef.current.quaternion.slerp(targetQuat, 0.1);
                    }
                }
                
                if (!shouldLook) {
                    let targetX = 0;
                    let targetY = 0;
                    let targetZ = 0;
                    
                    if (meleeState.current !== 'NONE') {
                        let pose = MELEE_STARTUP_POSE.HEAD;
                        if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE.HEAD;
                        if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE.HEAD;
                        if (meleeState.current === 'RECOVERY') pose = IDLE_POSE.HEAD;
                        targetX = pose.x; targetY = pose.y; targetZ = pose.z;
                    } else if (isIdlePose) {
                        targetX = IDLE_POSE.HEAD.x;
                        targetY = IDLE_POSE.HEAD.y;
                        targetZ = IDLE_POSE.HEAD.z;
                    }
                    
                    if (nextVisualState === 'WALK') {
                        const t = walkCycle.current;
                        targetY =  -Math.sin(t + 0.25) * 0.32; 
                    }
                    
                    const q = new Quaternion().setFromEuler(new Euler(targetX, targetY, targetZ));
                    headRef.current.quaternion.slerp(q, 0.05 * timeScale);
                }
            }

            // Legs & Body
            if (legsRef.current) {
                // ... Falling Physics Calculation ...
                const isFalling = !isGrounded.current && !isDashing.current && nextVisualState !== 'ASCEND' && nextVisualState !== 'EVADE' && nextVisualState !== 'MELEE';
                
                if (isFalling && !wasFallingRef.current) {
                    const vy = velocity.current.y; 
                    const h = position.current.y;
                    const g = GLOBAL_CONFIG.GRAVITY;
                    const discriminant = vy * vy + 2 * g * h;
                    if (discriminant >= 0 && g > 0) {
                        totalPredictedFallFrames.current = (vy + Math.sqrt(discriminant)) / g;
                    } else {
                        totalPredictedFallFrames.current = 60; 
                    }
                    currentFallTime.current = 0;
                }
                wasFallingRef.current = isFalling;

                let animWeight = 0;
                if (isFalling) {
                    currentFallTime.current += timeScale;
                    const total = Math.max(totalPredictedFallFrames.current, 1);
                    const progress = Math.min(currentFallTime.current / total, 1.0);
                    const ratio = GLOBAL_CONFIG.FALL_ANIM_RATIO;
                    if (progress < ratio) {
                        animWeight = progress / ratio;
                    } else {
                        animWeight = 1 - ((progress - ratio) / (1 - ratio));
                    }
                } else {
                    animWeight = 0;
                    currentFallTime.current = 0;
                }

                const invRot = meshRef.current.quaternion.clone().invert();
                const localVel = velocity.current.clone().applyQuaternion(invRot);
                const enableInertiaSway = nextVisualState === 'EVADE';
                const targetPitch = (enableInertiaSway && !isFalling) ? localVel.z * 1.5 : 0; 
                const targetRoll = (enableInertiaSway && !isFalling) ? -localVel.x * 1.5 : 0;
                
                legsRef.current.rotation.x = MathUtils.lerp(legsRef.current.rotation.x, targetPitch, 0.1);
                legsRef.current.rotation.z = MathUtils.lerp(legsRef.current.rotation.z, targetRoll, 0.1);

                let targetRightThigh = { x: 0, y: 0, z: 0 };
                let targetLeftThigh = { x: 0, y: 0, z: 0 };
                let targetRightKneeX = 0.2; 
                let targetLeftKneeX = 0.2;  
                let targetRightAnkle = { x: -0.2, y: 0, z: 0 };
                let targetLeftAnkle = { x: -0.2, y: 0, z: 0 };
                let targetBodyTilt = 0;
                let targetBodyTwist = 0; 
                let targetBodyRoll = 0; 
                let targetChest = { x: 0, y: 0, z: 0 }; 
                let lerpSpeed = 0.2 * timeScale; 

                // ... Standard pose logic remains same ...
                if (nextVisualState === 'WALK') {
                    const t = walkCycle.current;
                    const sin = Math.sin(t);
                    const cos = Math.cos(t);
                    targetRightThigh.x = -sin * 0.9; 
                    targetLeftThigh.x = sin * 0.9;
                    targetRightKneeX = Math.max(0, cos) * 1.8 + 0.7;
                    targetLeftKneeX = Math.max(0, -cos) * 1.8 + 0.7;
                    targetRightAnkle.x = (targetRightKneeX * 0.1) - (sin * 0.6);
                    targetLeftAnkle.x = (targetLeftKneeX * 0.1) + (sin * 0.6);
                    targetBodyTilt = 0.5; 
                    if (upperBodyRef.current) {
                        upperBodyRef.current.position.y = 0.55 + Math.abs(cos) * 0.08; 
                        targetChest.y = sin * 0.22;
                        targetChest.z = cos * 0.1;
                    }
                    lerpSpeed = 0.25 * timeScale; 
                }
                else if (isDashing.current) {
                    targetRightThigh.x = -1; 
                    targetRightKneeX = 2.6; 
                    targetLeftKneeX = 0.3; 
                    targetLeftThigh.x = 1.1; 
                    targetLeftThigh.y = -0.5; 
                    targetLeftThigh.z = -0.2; 
                    targetLeftAnkle.x = 0.25; 
                    targetRightAnkle.x = 0.8; 
                    targetBodyTilt = 0.65; 
                    lerpSpeed = 0.15 * timeScale;
                } 
                else if (meleeState.current !== 'NONE') {
                    let pose = MELEE_STARTUP_POSE;
                    if (meleeState.current === 'SLASH_1') pose = MELEE_SLASH_POSE;
                    if (meleeState.current === 'SLASH_2') pose = MELEE_SLASH_2_POSE;
                    if (meleeState.current === 'RECOVERY') pose = IDLE_POSE;

                    targetRightThigh = pose.RIGHT_LEG.THIGH;
                    targetLeftThigh = pose.LEFT_LEG.THIGH;
                    targetRightKneeX = pose.RIGHT_LEG.KNEE;
                    targetLeftKneeX = pose.LEFT_LEG.KNEE;
                    targetRightAnkle = pose.RIGHT_LEG.ANKLE;
                    targetLeftAnkle = pose.LEFT_LEG.ANKLE;
                    targetBodyTilt = pose.TORSO.x;
                    targetBodyTwist = pose.TORSO.y;
                    targetBodyRoll = pose.TORSO.z;
                    targetChest = pose.CHEST; 
                    lerpSpeed = 0.4 * timeScale;

                } else if (isFalling) {
                    targetRightThigh.x = GLOBAL_CONFIG.FALL_LEG_PITCH_RIGHT * animWeight;
                    targetLeftThigh.x = GLOBAL_CONFIG.FALL_LEG_PITCH_LEFT * animWeight;
                    targetRightKneeX = 0.2 + (GLOBAL_CONFIG.FALL_KNEE_BEND_RIGHT - 0.2) * animWeight;
                    targetLeftKneeX = 0.2 + (GLOBAL_CONFIG.FALL_KNEE_BEND_LEFT - 0.2) * animWeight;
                    targetRightThigh.z = 0.05 + GLOBAL_CONFIG.FALL_LEG_SPREAD * animWeight;
                    targetLeftThigh.z = -0.05 - GLOBAL_CONFIG.FALL_LEG_SPREAD * animWeight;
                    targetBodyTilt = GLOBAL_CONFIG.FALL_BODY_TILT * animWeight; 
                    lerpSpeed = 0.25 * timeScale;
                } else if (visualState === 'LANDING') {
                    const total = GLOBAL_CONFIG.LANDING_VISUAL_DURATION;
                    const current = visualLandingFrames.current; 
                    const progress = 1 - (current / total); 
                    let w = 0;
                    const r = GLOBAL_CONFIG.LANDING_ANIM_RATIO;
                    if (progress < r) {
                        w = progress / r;
                    } else {
                        w = 1 - ((progress - r) / (1 - r));
                    }
                    targetRightThigh.x = GLOBAL_CONFIG.LANDING_LEG_PITCH_RIGHT * w;
                    targetLeftThigh.x = GLOBAL_CONFIG.LANDING_LEG_PITCH_LEFT * w;
                    targetRightKneeX = 0.2 + (GLOBAL_CONFIG.LANDING_KNEE_BEND_RIGHT - 0.2) * w;
                    targetLeftKneeX = 0.2 + (GLOBAL_CONFIG.LANDING_KNEE_BEND_LEFT - 0.2) * w;
                    targetRightAnkle.x = -0.2 + (GLOBAL_CONFIG.LANDING_ANKLE_PITCH_RIGHT - -0.2) * w;
                    targetLeftAnkle.x = -0.2 + (GLOBAL_CONFIG.LANDING_ANKLE_PITCH_LEFT - -0.2) * w;
                    targetRightThigh.z = 0.05 + GLOBAL_CONFIG.LANDING_LEG_SPLAY * w;
                    targetLeftThigh.z = -0.05 - GLOBAL_CONFIG.LANDING_LEG_SPLAY * w;
                    targetBodyTilt = GLOBAL_CONFIG.LANDING_BODY_TILT * w;
                    meshRef.current.position.y -= (GLOBAL_CONFIG.LANDING_HIP_DIP * w);
                    lerpSpeed = 0.25 * timeScale;
                } else {
                    lerpSpeed = GLOBAL_CONFIG.FALL_ANIM_EXIT_SPEED * timeScale;
                    if (isIdlePose) {
                        targetRightThigh.x = IDLE_POSE.RIGHT_LEG.THIGH.x;
                        targetRightThigh.y = IDLE_POSE.RIGHT_LEG.THIGH.y;
                        targetRightThigh.z = IDLE_POSE.RIGHT_LEG.THIGH.z;
                        targetLeftThigh.x = IDLE_POSE.LEFT_LEG.THIGH.x;
                        targetLeftThigh.y = IDLE_POSE.LEFT_LEG.THIGH.y;
                        targetLeftThigh.z = IDLE_POSE.LEFT_LEG.THIGH.z;
                        targetRightKneeX = IDLE_POSE.RIGHT_LEG.KNEE;
                        targetLeftKneeX = IDLE_POSE.LEFT_LEG.KNEE;
                        targetRightAnkle.x = IDLE_POSE.RIGHT_LEG.ANKLE.x;
                        targetRightAnkle.y = IDLE_POSE.RIGHT_LEG.ANKLE.y;
                        targetRightAnkle.z = IDLE_POSE.RIGHT_LEG.ANKLE.z;
                        targetLeftAnkle.x = IDLE_POSE.LEFT_LEG.ANKLE.x;
                        targetLeftAnkle.y = IDLE_POSE.LEFT_LEG.ANKLE.y;
                        targetLeftAnkle.z = IDLE_POSE.LEFT_LEG.ANKLE.z;
                        targetBodyTilt = IDLE_POSE.TORSO.x;
                        targetBodyTwist = IDLE_POSE.TORSO.y;
                        targetBodyRoll = IDLE_POSE.TORSO.z;
                        targetChest = IDLE_POSE.CHEST;
                    } else {
                        targetRightThigh.z = 0.05;
                        targetLeftThigh.z = -0.05;
                    }

                    if (upperBodyRef.current) {
                        upperBodyRef.current.position.y = MathUtils.lerp(upperBodyRef.current.position.y, 0.65, 0.1);
                    }
                }
                
                if (rightLegRef.current) {
                    rightLegRef.current.rotation.x = MathUtils.lerp(rightLegRef.current.rotation.x, targetRightThigh.x, lerpSpeed);
                    rightLegRef.current.rotation.y = MathUtils.lerp(rightLegRef.current.rotation.y, targetRightThigh.y, lerpSpeed);
                    rightLegRef.current.rotation.z = MathUtils.lerp(rightLegRef.current.rotation.z, targetRightThigh.z, lerpSpeed);
                }
                if (leftLegRef.current) {
                    leftLegRef.current.rotation.x = MathUtils.lerp(leftLegRef.current.rotation.x, targetLeftThigh.x, lerpSpeed);
                    leftLegRef.current.rotation.y = MathUtils.lerp(leftLegRef.current.rotation.y, targetLeftThigh.y, lerpSpeed);
                    leftLegRef.current.rotation.z = MathUtils.lerp(leftLegRef.current.rotation.z, targetLeftThigh.z, lerpSpeed);
                }
                if (rightLowerLegRef.current) {
                    rightLowerLegRef.current.rotation.x = MathUtils.lerp(rightLowerLegRef.current.rotation.x, targetRightKneeX, lerpSpeed);
                }
                if (leftLowerLegRef.current) {
                    leftLowerLegRef.current.rotation.x = MathUtils.lerp(leftLowerLegRef.current.rotation.x, targetLeftKneeX, lerpSpeed);
                }
                if (rightFootRef.current) {
                    rightFootRef.current.rotation.x = MathUtils.lerp(rightFootRef.current.rotation.x, targetRightAnkle.x, lerpSpeed);
                    rightFootRef.current.rotation.y = MathUtils.lerp(rightFootRef.current.rotation.y, targetRightAnkle.y, lerpSpeed);
                    rightFootRef.current.rotation.z = MathUtils.lerp(rightFootRef.current.rotation.z, targetRightAnkle.z, lerpSpeed);
                }
                if (leftFootRef.current) {
                    leftFootRef.current.rotation.x = MathUtils.lerp(leftFootRef.current.rotation.x, targetLeftAnkle.x, lerpSpeed);
                    leftFootRef.current.rotation.y = MathUtils.lerp(leftFootRef.current.rotation.y, targetLeftAnkle.y, lerpSpeed);
                    leftFootRef.current.rotation.z = MathUtils.lerp(leftFootRef.current.rotation.z, targetLeftAnkle.z, lerpSpeed);
                }

                currentUpperBodyTilt.current = MathUtils.lerp(currentUpperBodyTilt.current, targetBodyTilt, lerpSpeed);
                if (torsoRef.current) {
                    torsoRef.current.rotation.x = currentUpperBodyTilt.current;
                    torsoRef.current.rotation.y = MathUtils.lerp(torsoRef.current.rotation.y, targetBodyTwist, lerpSpeed);
                    torsoRef.current.rotation.z = MathUtils.lerp(torsoRef.current.rotation.z, targetBodyRoll, lerpSpeed);
                }
                if (upperBodyRef.current) {
                    upperBodyRef.current.rotation.x = MathUtils.lerp(upperBodyRef.current.rotation.x, targetChest.x, lerpSpeed);
                    upperBodyRef.current.rotation.y = MathUtils.lerp(upperBodyRef.current.rotation.y, targetChest.y, lerpSpeed);
                    upperBodyRef.current.rotation.z = MathUtils.lerp(upperBodyRef.current.rotation.z, targetChest.z, lerpSpeed);
                }
            }
        }
        
        if (!stunned && isShooting.current) {
            shootTimer.current += 1 * timeScale; 
            
            const currentRecovery = shootMode.current === 'STOP' 
                ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
            const totalShotFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;
            
            if (shootTimer.current >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && !hasFired.current) {
                hasFired.current = true;
                playShootSound();
                setShowMuzzleFlash(true);
                setTimeout(() => setShowMuzzleFlash(false), 100);

                const spawnPos = new Vector3();
                if (muzzleRef.current) {
                    muzzleRef.current.getWorldPosition(spawnPos);
                } else {
                    spawnPos.copy(position.current).add(new Vector3(0, 2, 0));
                }

                const targetEntity = targets[currentTargetIndex];
                let direction: Vector3;

                if (targetEntity) {
                    direction = targetEntity.position.clone().sub(spawnPos).normalize();
                } else {
                    if (muzzleRef.current) {
                        const fwd = new Vector3(0,0,1);
                        muzzleRef.current.getWorldDirection(fwd); 
                        direction = fwd.normalize();
                    } else {
                        direction = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                    }
                }
                
                const forwardDir = direction.clone();
                
                spawnProjectile({
                    id: `proj-${Date.now()}`,
                    ownerId: 'player',
                    targetId: targetEntity ? targetEntity.id : null,
                    position: spawnPos,
                    velocity: direction.multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED),
                    forwardDirection: forwardDir,
                    isHoming: lockState === LockState.RED,
                    team: Team.BLUE,
                    ttl: 300
                });
            }

            if (shootTimer.current >= totalShotFrames) {
                isShooting.current = false;
                shootTimer.current = 0;
                if (isGrounded.current && shootMode.current === 'STOP') {
                    landingFrames.current = getLandingLag();
                }
            }
        }

        // ... Camera logic omitted (same) ...
        let targetCamPos = position.current.clone().add(new Vector3(0, 7, 14)); 
        let targetLookAt = position.current.clone().add(new Vector3(0, 2, 0)); 

        if (currentTarget) {
            const pToT = new Vector3().subVectors(currentTarget.position, position.current);
            const dir = pToT.normalize();
            const camOffsetDist = 10;
            targetCamPos = position.current.clone().add(dir.multiplyScalar(-camOffsetDist)).add(new Vector3(0, 6, 0));
            targetLookAt = position.current.clone().lerp(currentTarget.position, 0.3);
            targetLookAt.y += 2.0; 
        } else {
            targetCamPos = position.current.clone().add(new Vector3(0, 6, 10));
            targetLookAt = position.current.clone().add(new Vector3(0, 2, 0));
        }

        if (stunned) {
            const shakeAmount = 0.1;
            targetCamPos.x += (Math.random() - 0.5) * shakeAmount;
            targetCamPos.y += (Math.random() - 0.5) * shakeAmount;
            targetCamPos.z += (Math.random() - 0.5) * shakeAmount;
        }

        camera.position.lerp(targetCamPos, 0.1 * timeScale);
        camera.lookAt(targetLookAt);
    });

    const isDashingOrAscending = visualState === 'DASH' || visualState === 'ASCEND' || visualState === 'MELEE';
    const isTrailActive = trailTimer.current > 0; 
    
    const isAscending = visualState === 'ASCEND';
    const isThrusting = isDashingOrAscending;

    // --- PLAYER COLORS ---
    const armorColor = '#eeeeee';
    const chestColor = '#2244aa';
    const feetColor = '#aa2222';
   
    return (
        <group>
            <mesh ref={meshRef}>
                <group position={[0, 2.0, 0]}>
                    
                    {/* GHOST EMITTER FOR CENTER MASS */}
                    {/* WAIST/TORSO */}
                    <group ref={torsoRef}>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[0.6, 0.5, 0.5]} />
                            <meshToonMaterial color="#ff0000" />
                            <Edges threshold={15} color="black" />
                        </mesh>
                        <GhostEmitter active={isTrailActive} size={[0.6, 0.5, 0.5]} rainbow={trailRainbow.current} />
                        
                        {/* CHEST/UPPER BODY */}
                        <group ref={upperBodyRef} position={[0, 0.65, 0]}>
                            <mesh>
                                <boxGeometry args={[0.9, 0.7, 0.7]} />
                                <meshToonMaterial color={chestColor} /> 
                                <Edges threshold={15} color="black" />
                            </mesh>
                            <GhostEmitter active={isTrailActive} size={[0.9, 0.7, 0.7]} rainbow={trailRainbow.current} />

                            <group position={[0.28, 0.1, 0.36]}>
                                <mesh><boxGeometry args={[0.35, 0.25, 0.05]} /><meshToonMaterial color="#ffaa00" /><Edges threshold={15} color="black" /></mesh>
                                {[...Array(5)].map((_, index) => ( <mesh key={index} position={[0, 0.12 - index * 0.05, 0.03]}><boxGeometry args={[0.33, 0.02, 0.02]} /><meshStandardMaterial color="#111" metalness={0.4} roughness={0.3} /></mesh> ))}
                            </group>
                            <group position={[-0.28, 0.1, 0.36]}>
                                <mesh><boxGeometry args={[0.35, 0.25, 0.05]} /><meshToonMaterial color="#ffaa00" /><Edges threshold={15} color="black" /></mesh>
                                {[...Array(5)].map((_, index) => ( <mesh key={index} position={[0, 0.12 - index * 0.05, 0.03]}><boxGeometry args={[0.33, 0.02, 0.02]} /><meshStandardMaterial color="#111" metalness={0.4} roughness={0.3} /></mesh> ))}
                            </group>

                            <group ref={headRef}>
                                <MechaHead mainColor={armorColor} />
                            </group>

                            {/* RIGHT ARM CHAIN */}
                            <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                                <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />

                                {/* Forearm Group (Elbow) */}
                                <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]} ref={rightForeArmRef}>
                                    <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                    
                                    {/* Twist Group */}
                                    <group ref={rightForearmTwistRef}>
                                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                            <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                            
                                            {/* Wrist/Fist */}
                                            <group ref={rightWristRef} position={[0, -0.35, 0]}>
                                                <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                            </group>
                                        </group>

                                        {/* Shield */}
                                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={shieldRef}>
                                                <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                                    <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.1, 1.7, 0.7]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                                    <mesh position={[0.06, 0.2, 0]}><boxGeometry args={[0.05, 1.5, 0.5]} /><meshToonMaterial color="#ff0000" /></mesh>
                                                </group>
                                        </group>
                                    </group>
                                </group>
                            </group>

                            {/* LEFT ARM CHAIN */}
                            <group position={[-0.65, 0.1, 0]} ref={gunArmRef} >
                                <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />

                                {/* Forearm Group (Elbow) */}
                                <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]} ref={leftForeArmRef}>
                                    <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                    
                                    {/* Twist Group */}
                                    <group ref={leftForearmTwistRef}>
                                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                            <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                            
                                            {/* Wrist/Fist */}
                                            <group ref={leftWristRef} position={[0, -0.35, 0]}>
                                                <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                                
                                                {/* Beam Saber - In Hand */}
                                                <group visible={activeWeapon === 'SABER'} position={[0, 0, 0.1]} rotation={[Math.PI/1.8, 0, 0]}>
                                                    <BeamSaber active={activeWeapon === 'SABER'} meleeState={meleeState} />
                                                </group>
                                            </group>

                                            {/* Gun - Bound to Forearm */}
                                            <group visible={activeWeapon === 'GUN'} ref={gunMeshRef} position={[0, -0.2, 0.3]} rotation={[1.5, 0, Math.PI]}>
                                                    <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.1, 0.2, 0.15]} /><meshToonMaterial color="#222" /></mesh>
                                                    <mesh position={[0, 0.2, 0.4]}><boxGeometry args={[0.15, 0.25, 1.0]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                                    <mesh position={[0, 0.2, 1.0]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.6]} /><meshToonMaterial color="#222" /></mesh>
                                                    <mesh position={[0.05, 0.35, 0.2]}><cylinderGeometry args={[0.08, 0.08, 0.3, 8]} rotation={[Math.PI/2, 0, 0]}/><meshToonMaterial color="#222" />
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
                            <group position={[0, 0.2, -0.4]}>
                                <mesh><boxGeometry args={[0.7, 0.8, 0.4]} /><meshToonMaterial color="#333" /><Edges threshold={15} color="black" /></mesh>
                                <mesh position={[0.3, 0.5, 0]} rotation={[0.2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5]} /><meshToonMaterial color="white" /><Edges threshold={15} color="black" /></mesh>
                                <mesh position={[-0.3, 0.5, 0]} rotation={[0.2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.5]} /><meshToonMaterial color="white" /><Edges threshold={15} color="black" /></mesh>
                                <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                                <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                                <BoostBurst triggerTime={dashTriggerTime} />
                            </group>
                        </group>
                    </group>

                    <group ref={legsRef}>
                        {/* RIGHT LEG */}
                        <group ref={rightLegRef} position={[0.25, -0.3, 0]} rotation={[-0.1, 0, 0.05]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />

                            <group ref={rightLowerLegRef} position={[0, -0.75, 0]} rotation={[0.3, 0, 0]}>
                                <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <group ref={rightFootRef} position={[0, -0.8, 0.05]} rotation={[-0.2, 0, 0]}>
                                    <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><meshToonMaterial color={feetColor} /><Edges threshold={15} color="black" /></mesh>
                                    <GhostEmitter active={isTrailActive} size={[0.32, 0.2, 0.7]} offset={[0, -0.1, 0.1]} rainbow={trailRainbow.current} />
                                </group>
                            </group>
                        </group>

                        {/* LEFT LEG */}
                        <group ref={leftLegRef} position={[-0.25, -0.3, 0]} rotation={[-0.1, 0, -0.05]}>
                            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.7, 0.4]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                            <GhostEmitter active={isTrailActive} size={[0.35, 0.7, 0.4]} offset={[0, -0.4, 0]} rainbow={trailRainbow.current} />

                            <group ref={leftLowerLegRef} position={[0, -0.75, 0]} rotation={[0.2, 0, 0]}>
                                <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 0.8, 0.45]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.25, 0.3, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <group ref={leftFootRef} position={[0, -0.8, 0.05]} rotation={[-0.1, 0, 0]}>
                                    <mesh position={[0, -0.1, 0.1]}><boxGeometry args={[0.32, 0.2, 0.7]} /><meshToonMaterial color={feetColor} /><Edges threshold={15} color="black" /></mesh>
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