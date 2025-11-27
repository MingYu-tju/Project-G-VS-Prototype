
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { Vector3, Mesh, MathUtils, Group, DoubleSide, AdditiveBlending, Quaternion, Matrix4, Shape, Euler, MeshToonMaterial, Color, Object3D, InstancedMesh, DynamicDrawUsage, PerspectiveCamera } from 'three';
import { Edges, useGLTF } from '@react-three/drei';
import { useGameStore } from '../store';
import { Team, LockState, GLOBAL_CONFIG, RED_LOCK_DISTANCE, MechPose, DEFAULT_MECH_POSE, RotationVector } from '../types';
import { ANIMATION_CLIPS } from '../animations';
import { AnimationController } from './AnimationSystem';
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
type MeleePhase = 'NONE' | 'STARTUP' | 'LUNGE' | 'SLASH_1' | 'SLASH_2' | 'SLASH_3' | 'RECOVERY';
const MELEE_EMPTY_BOOST_PENALTY = 0.5; 

// ... Audio Manager ...
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

// --- VISUAL EFFECTS ---
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

interface GhostEmitterProps {
    active: boolean;
    size?: [number, number, number];
    offset?: [number, number, number];
    rainbow?: boolean;
}

const GhostEmitter: React.FC<GhostEmitterProps> = ({ active, size=[0.4, 0.6, 0.4], offset=[0,0,0], rainbow=false }) => {
    const { scene } = useThree();
    const meshRef = useRef<InstancedMesh>(null);
    const trackerRef = useRef<Group>(null);
    
    const MAX_GHOSTS = 60;
    const SPAWN_INTERVAL = rainbow?2:5; 
    const LIFETIME = 20;
    
    const frameCount = useRef(0);
    const ghosts = useRef<{ pos: Vector3, rot: Quaternion, scale: Vector3, age: number, color: Color }[]>([]);
    const tempObj = useMemo(() => new Object3D(), []);
    const worldPos = useMemo(() => new Vector3(), []);
    const worldQuat = useMemo(() => new Quaternion(), []);
    const worldScale = useMemo(() => new Vector3(), []);

    useFrame(() => {
        if (!trackerRef.current || !meshRef.current) return;
        
        frameCount.current++;

        if (active && frameCount.current % SPAWN_INTERVAL === 0) {
            trackerRef.current.getWorldPosition(worldPos);
            trackerRef.current.getWorldQuaternion(worldQuat);
            trackerRef.current.getWorldScale(worldScale);

            const spawnColor = new Color();
            if (rainbow) {
                const hue = (frameCount.current * 0.05) % 1.0; 
                spawnColor.setHSL(hue, 1.0, 0.6);
            } else {
                spawnColor.set('#aaaaaa'); 
            }

            ghosts.current.push({
                pos: worldPos.clone(),
                rot: worldQuat.clone(),
                scale: worldScale.clone(),
                age: 0,
                color: spawnColor
            });
        }

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
            meshRef.current.setColorAt(aliveCount, g.color);
            aliveCount++;
        }
        meshRef.current.count = aliveCount;
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
                    <meshBasicMaterial color="#aaaaaa" transparent opacity={rainbow?0.9:0.5} blending={AdditiveBlending} depthWrite={false} />
                </instancedMesh>,
                scene
            )}
        </>
    );
};

const SaberSlashEffect: React.FC<{ active: boolean, meleeState: React.MutableRefObject<MeleePhase>, parentRef: React.RefObject<Group> }> = ({ active, meleeState, parentRef }) => {
    const { scene } = useThree();
    const meshRef = useRef<InstancedMesh>(null);
    const SPAWN_INTERVAL = 1;
    const MAX_PARTICLES = 400;
    const SAMPLES = 20; 
    const LIFETIME = 60;
    
    const particles = useRef<{ pos: Vector3, rot: Quaternion, scale: Vector3, age: number, brightness: number }[]>([]);
    const frameCount = useRef(0);
    const tempObj = useMemo(() => new Object3D(), []);
    const bladeTip = useMemo(() => new Vector3(0, 3.1, 0), []);
    const bladeMid = useMemo(() => new Vector3(0, 1.6, 0), []);
    
    useFrame(() => {
        frameCount.current++;
        if (!meshRef.current || !parentRef.current) return;

        if (active && (meleeState.current.includes('SLASH')) && frameCount.current % SPAWN_INTERVAL === 0) {
            for (let i = 0; i < SAMPLES; i++) {
                const t = i / (SAMPLES - 1); 
                const localPos = new Vector3().lerpVectors(bladeTip, bladeMid, t);
                localPos.applyMatrix4(parentRef.current.matrixWorld);
                const rot = new Quaternion().setFromRotationMatrix(parentRef.current.matrixWorld);
                const brightness = 1.0 - t;
                
                if (brightness > 0.05) {
                    particles.current.push({
                        pos: localPos,
                        rot: rot,
                        scale: new Vector3(0.15, 0.15, 0.15), 
                        age: 0,
                        brightness: brightness
                    });
                }
            }
        }

        let aliveCount = 0;
        for (let i = particles.current.length - 1; i >= 0; i--) {
            const p = particles.current[i];
            p.age++;
            if (p.age > LIFETIME) {
                particles.current.splice(i, 1);
                continue;
            }
            const lifeRatio = 1 - (p.age / LIFETIME);
            const currentBrightness = p.brightness * lifeRatio;
            tempObj.position.copy(p.pos);
            tempObj.quaternion.copy(p.rot);
            tempObj.scale.copy(p.scale);
            tempObj.updateMatrix();
            meshRef.current.setMatrixAt(aliveCount, tempObj.matrix);
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
            <meshBasicMaterial color="white" transparent blending={AdditiveBlending} depthWrite={false} />
        </instancedMesh>,
        scene
    );
};

const BeamSaber: React.FC<{ active: boolean, meleeState: React.MutableRefObject<MeleePhase> }> = ({ active, meleeState }) => {
    const groupRef = useRef<Group>(null);
    const bladeGroupRef = useRef<Group>(null); 
    useFrame(() => {
        if (groupRef.current) {
            const targetScale = active ? 1 : 0;
            groupRef.current.scale.y = MathUtils.lerp(groupRef.current.scale.y, targetScale, 0.3);
            groupRef.current.visible = groupRef.current.scale.y > 0.01;
        }
    });
    return (
        <group ref={groupRef} visible={false}>
            <mesh position={[0, -0.25, 0]}>
                <cylinderGeometry args={[0.035, 0.04, 0.6, 8]} />
                <meshToonMaterial color="white" />
                <Edges threshold={15} color="#999" />
            </mesh>
            <group ref={bladeGroupRef}>
                <mesh position={[0, 1.6, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 2.8, 8]} />
                    <meshBasicMaterial color="white" />
                </mesh>
                <mesh position={[0, 1.6, 0]}>
                    <cylinderGeometry args={[0.12, 0.12, 3.0, 8]} />
                    <meshBasicMaterial color="#ff0088" transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
                </mesh>
            </group>
            <SaberSlashEffect active={active } meleeState={meleeState} parentRef={bladeGroupRef} />
        </group>
    );
};

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

    const animator = useMemo(() => new AnimationController(), []);
    
    // STORED QUATERNION FOR SMOOTH HEAD TRACKING
    const headLookQuat = useRef(new Quaternion());
    
    // CINEMATIC CAMERA TIMER
    const cinematicTimer = useRef(0);

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
    const currentWalkWeight = useRef(0); // New: For smooth walking transition

    const isEvading = useRef(false);
    const evadeTimer = useRef(0);
    const evadeRecoveryTimer = useRef(0);
    const evadeDirection = useRef(new Vector3(0, 0, 0));
    const isRainbowStep = useRef(false);
    
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
    const isMeleeTrackingActive = useRef(false); // Track if current combo has magnetism

    const [visualState, setVisualState] = useState<'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' | 'MELEE'>('IDLE');
    const [isStunned, setIsStunned] = useState(false);
    const ammoRegenTimer = useRef(0);
    const [activeWeapon, setActiveWeapon] = useState<'GUN' | 'SABER'>('GUN');

    useEffect(() => {
        loadAllSounds();
    }, []);

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
            // INTERRUPT CINEMATIC CAMERA ON DASH
            if (state.isCinematicCameraActive) {
                setCinematicCamera(false);
            }

            if (meleeState.current !== 'NONE') {
                meleeState.current = 'NONE';
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
                    if (key === lastKeyPressed.current && (now - lastKeyPressTime.current < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW)) {
                        if (!isOverheated && boost > 0 && !isStunned && landingFrames.current <= 0) {
                            // INTERRUPT CINEMATIC CAMERA ON EVADE
                            if (useGameStore.getState().isCinematicCameraActive) {
                                setCinematicCamera(false);
                            }

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
                    if (meleeState.current === 'SLASH_1' || meleeState.current === 'SLASH_2') {
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
                            isMeleeTrackingActive.current = true; // Red Lock initiates tracking
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
                            isMeleeTrackingActive.current = false; // Green lock = no tracking ever
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

    // --- HELPER: Apply Pose to Refs ---
    const applyPoseToModel = (pose: MechPose, hipOffset: number, legContainerRot: {x:number, y:number, z:number}) => {
         const setRot = (ref: React.MutableRefObject<Group | null>, rot: RotationVector) => {
             if (ref.current) {
                 ref.current.rotation.set(rot.x, rot.y, rot.z);
             }
         };

         setRot(torsoRef, pose.TORSO);
         setRot(upperBodyRef, pose.CHEST);
         // Head is handled separately via manual LookAt override or smoothing below
         
         setRot(gunArmRef, pose.LEFT_ARM.SHOULDER); 
         setRot(leftForeArmRef, pose.LEFT_ARM.ELBOW);
         setRot(leftForearmTwistRef, pose.LEFT_ARM.FOREARM);
         setRot(leftWristRef, pose.LEFT_ARM.WRIST);

         setRot(rightArmRef, pose.RIGHT_ARM.SHOULDER);
         setRot(rightForeArmRef, pose.RIGHT_ARM.ELBOW);
         setRot(rightForearmTwistRef, pose.RIGHT_ARM.FOREARM);
         setRot(rightWristRef, pose.RIGHT_ARM.WRIST);

         // Apply Legs Container Rotation (Inertia)
         if (legsRef.current) {
             legsRef.current.rotation.set(legContainerRot.x, legContainerRot.y, legContainerRot.z);
         }
         
         // Apply Hip Offset (Landing Dip)
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

        // --- LOGIC BLOCK: Runs only if not hit-stopped ---
        if (hitStop <= 0) {
            const now = Date.now();
            const currentTarget = targets[currentTargetIndex];
            const moveDir = getCameraRelativeInput();
            
            // --- CINEMATIC CAMERA TIMER ---
            if (useGameStore.getState().isCinematicCameraActive) {
                cinematicTimer.current -= delta * 1000;
                if (cinematicTimer.current <= 0) {
                    setCinematicCamera(false);
                }
            }

            // ... (Physics logic) ...
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

            // ... Input State Logic ...
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
                
                // INTERRUPT CAMERA ON STUN
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
                // HELPER: 3D Melee Snapping
                // Aligns player height and orientation to target for consistent combo connections
                const performMeleeSnap = (target: any) => {
                    if (!target) return;
                    
                    // 1. Vertical Snap (Vacuum to target height)
                    // We blend firmly (0.8) to the target's Y level to ensure hitboxes stay aligned horizontally
                    position.current.y = MathUtils.lerp(position.current.y, target.position.y, 0.8);
                    velocity.current.y = 0; // Kill vertical momentum

                    // 2. Orientation Snap (Yaw Correction + Pitch Reset)
                    // Instead of setting rotation.x = 0 directly (which causes Gimbal Lock glitches),
                    // we calculate the current forward vector, flatten it, and look at it.
                    
                    if (meshRef.current) {
                        const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                        fwd.y = 0; // Flatten pitch
                        if (fwd.lengthSq() > 0.001) {
                            fwd.normalize();
                            const lookTarget = position.current.clone().add(fwd);
                            meshRef.current.lookAt(lookTarget);
                        }
                        // Force update to ensure downstream systems see the corrected pose
                        meshRef.current.updateMatrixWorld();
                    }
                };

                if (meleeState.current !== 'NONE') {
                    nextVisualState = 'MELEE';
                    if (isDashing.current || isEvading.current) {
                        meleeState.current = 'NONE';
                        setCinematicCamera(false);
                    }
                    
                    // ANTI-GRAVITY: Melee defies gravity
                    // We handle gravity application at end of loop, but here we can damp existing vertical velocity
                    if (meleeState.current !== 'LUNGE') {
                         velocity.current.y = 0; // Hard lock vertical movement during swings unless overridden
                    }
                    
                    if (meleeState.current === 'STARTUP') {
                        velocity.current.x = 0; velocity.current.z = 0;
                        meleeTimer.current -= timeScale;
                        if (meleeTimer.current <= 0) {
                            meleeState.current = 'SLASH_1';
                            meleeTimer.current = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.DURATION_FRAMES;
                            hasMeleeHitRef.current = false; 
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
                            if (isMeleePenaltyActive.current) speed *= MELEE_EMPTY_BOOST_PENALTY;
                            velocity.current.x = dir.x * speed;
                            velocity.current.z = dir.z * speed;
                            velocity.current.y = dir.y * speed;
                            meshRef.current.lookAt(currentTarget.position); // Look directly at target (including pitch) during lunge
                        } else {
                            const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                            let speed = GLOBAL_CONFIG.MELEE_LUNGE_SPEED;
                            if (isMeleePenaltyActive.current) speed *= MELEE_EMPTY_BOOST_PENALTY;
                            velocity.current.x = fwd.x * speed;
                            velocity.current.z = fwd.z * speed;
                            velocity.current.y = fwd.y * speed;
                        }
                        meleeTimer.current -= timeScale;
                        meleeStartupTimer.current -= timeScale;
                        const isStartupComplete = meleeStartupTimer.current <= 0;
                        if (isStartupComplete) {
                            if (dist < GLOBAL_CONFIG.MELEE_RANGE) {
                                // HIT CONFIRM: Close enough, tracking successful
                                meleeState.current = 'SLASH_1';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.DURATION_FRAMES;
                                hasMeleeHitRef.current = false; 
                                velocity.current.set(0,0,0);
                                
                                // PERFORM SNAP ON CONTACT
                                performMeleeSnap(currentTarget);
                            } 
                            else if (meleeTimer.current <= 0) {
                                // TIMEOUT: Lunge limit reached, tracking failed
                                meleeState.current = 'SLASH_1';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.DURATION_FRAMES;
                                hasMeleeHitRef.current = false; 
                                velocity.current.set(0,0,0); 
                                isMeleeTrackingActive.current = false; // Disable tracking for subsequent hits
                                
                                // Also snap orientation to horizon on miss, but don't snap pos
                                meshRef.current.rotation.x = 0;
                                meshRef.current.rotation.z = 0;
                            }
                        }
                    }
                    else if (meleeState.current === 'SLASH_1') {
                        const config = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1;
                        const passed = config.DURATION_FRAMES - meleeTimer.current;
                        const activeTracking = isMeleeTrackingActive.current;

                        if (passed < config.DAMAGE_DELAY) {
                            if (activeTracking && currentTarget) {
                                // Re-snap vertical continuously during startup to stick to target
                                position.current.y = MathUtils.lerp(position.current.y, currentTarget.position.y, 0.2);
                                
                                const dirToTarget = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                dirToTarget.y = 0; 
                                velocity.current.x = dirToTarget.x * config.APPROACH_SPEED;
                                velocity.current.z = dirToTarget.z * config.APPROACH_SPEED;
                            } else {
                                const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion).normalize();
                                fwd.y = 0;
                                velocity.current.x = fwd.x * config.FORWARD_STEP_SPEED;
                                velocity.current.z = fwd.z * config.FORWARD_STEP_SPEED;
                            }
                        }

                        if (!hasMeleeHitRef.current && passed > config.DAMAGE_DELAY && currentTarget) {
                            const dist = position.current.distanceTo(currentTarget.position);
                            const tolerance = activeTracking ? GLOBAL_CONFIG.MELEE_HIT_TOLERANCE : 0;
                            
                            if (dist < GLOBAL_CONFIG.MELEE_RANGE + tolerance) {
                                const knockback = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                applyHit(currentTarget.id, knockback, config.KNOCKBACK_POWER, config.STUN_DURATION, config.HIT_STOP_FRAMES); 
                                
                                velocity.current.set(0, 0, 0);
                                const chaseDir = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                chaseDir.y = 0;
                                velocity.current.add(chaseDir.multiplyScalar(config.CHASE_VELOCITY));

                                performMeleeSnap(currentTarget); // Ensure perfect alignment on hit
                                playHitSound(0);
                                hasMeleeHitRef.current = true; 
                            }
                        }
                        
                        meleeTimer.current -= timeScale;
                        if (meleeTimer.current <= 0) {
                            if (meleeComboBuffer.current) {
                                meleeState.current = 'SLASH_2';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.DURATION_FRAMES;
                                hasMeleeHitRef.current = false; 
                                meleeComboBuffer.current = false; 
                                velocity.current.set(0,0,0);
                                
                                if (currentTarget && activeTracking) {
                                    performMeleeSnap(currentTarget); // Snap for next hit
                                }
                            } else {
                                meleeState.current = 'RECOVERY';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                            }
                        }
                    }
                    else if (meleeState.current === 'SLASH_2') {
                        const config = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2;
                        const passed = config.DURATION_FRAMES - meleeTimer.current;
                        const activeTracking = isMeleeTrackingActive.current;

                        if (passed < config.DAMAGE_DELAY) {
                            if (activeTracking && currentTarget) {
                                position.current.y = MathUtils.lerp(position.current.y, currentTarget.position.y, 0.2);
                                const dirToTarget = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                dirToTarget.y = 0; 
                                velocity.current.x = dirToTarget.x * config.APPROACH_SPEED;
                                velocity.current.z = dirToTarget.z * config.APPROACH_SPEED;
                            } else {
                                const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion).normalize();
                                fwd.y = 0;
                                velocity.current.x = fwd.x * config.FORWARD_STEP_SPEED;
                                velocity.current.z = fwd.z * config.FORWARD_STEP_SPEED;
                            }
                        }

                        if (!hasMeleeHitRef.current && passed > config.DAMAGE_DELAY && currentTarget) {
                            const dist = position.current.distanceTo(currentTarget.position);
                            const tolerance = activeTracking ? GLOBAL_CONFIG.MELEE_HIT_TOLERANCE : 0;

                            if (dist < GLOBAL_CONFIG.MELEE_RANGE + tolerance) { 
                                const knockback = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                applyHit(currentTarget.id, knockback, config.KNOCKBACK_POWER, config.STUN_DURATION, config.HIT_STOP_FRAMES); 
                                
                                velocity.current.set(0, 0, 0);
                                const chaseDir = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                chaseDir.y = 0;
                                velocity.current.add(chaseDir.multiplyScalar(config.CHASE_VELOCITY));

                                performMeleeSnap(currentTarget);
                                playHitSound(0);
                                hasMeleeHitRef.current = true;
                            }
                        }
                        
                        // Check for input during hit window (if hit happened)
                        if (hasMeleeHitRef.current && meleeComboBuffer.current && !useGameStore.getState().isCinematicCameraActive) {
                             setCinematicCamera(true);
                             cinematicTimer.current = GLOBAL_CONFIG.CINEMATIC_CAMERA.DURATION;
                        }

                        meleeTimer.current -= timeScale;
                        if (meleeTimer.current <= 0) {
                            if (meleeComboBuffer.current) {
                                // NEW: Transition to SLASH_3
                                meleeState.current = 'SLASH_3';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3.DURATION_FRAMES;
                                hasMeleeHitRef.current = false;
                                meleeComboBuffer.current = false;
                                velocity.current.set(0,0,0);
                                
                                // TRIGGER CINEMATIC CAMERA (FIXED DURATION)
                                setCinematicCamera(true); 
                                cinematicTimer.current = GLOBAL_CONFIG.CINEMATIC_CAMERA.DURATION;

                                if (currentTarget && activeTracking) {
                                    performMeleeSnap(currentTarget);
                                }
                            } else {
                                meleeState.current = 'RECOVERY';
                                meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                            }
                        }
                    }
                    else if (meleeState.current === 'SLASH_3') {
                        // NEW LOGIC FOR 3RD HIT
                        const config = GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3;
                        const passed = config.DURATION_FRAMES - meleeTimer.current;
                        const activeTracking = isMeleeTrackingActive.current;

                        if (passed < config.DAMAGE_DELAY) {
                            if (activeTracking && currentTarget) {
                                position.current.y = MathUtils.lerp(position.current.y, currentTarget.position.y, 0.2);
                                const dirToTarget = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                dirToTarget.y = 0; 
                                velocity.current.x = dirToTarget.x * config.APPROACH_SPEED;
                                velocity.current.z = dirToTarget.z * config.APPROACH_SPEED;
                            } else {
                                const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion).normalize();
                                fwd.y = 0;
                                velocity.current.x = fwd.x * config.FORWARD_STEP_SPEED;
                                velocity.current.z = fwd.z * config.FORWARD_STEP_SPEED;
                            }
                        }

                        if (!hasMeleeHitRef.current && passed > config.DAMAGE_DELAY && currentTarget) {
                            const dist = position.current.distanceTo(currentTarget.position);
                            const tolerance = activeTracking ? GLOBAL_CONFIG.MELEE_HIT_TOLERANCE : 0;

                            if (dist < GLOBAL_CONFIG.MELEE_RANGE + tolerance) { 
                                const knockback = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                // PASS FLAG FOR KNOCKDOWN
                                applyHit(currentTarget.id, knockback, config.KNOCKBACK_POWER, config.STUN_DURATION, config.HIT_STOP_FRAMES, config.IS_KNOCKDOWN); 
                                
                                velocity.current.set(0, 0, 0);
                                const chaseDir = new Vector3().subVectors(currentTarget.position, position.current).normalize();
                                chaseDir.y = 0;
                                velocity.current.add(chaseDir.multiplyScalar(config.CHASE_VELOCITY));

                                performMeleeSnap(currentTarget);
                                playHitSound(0);
                                hasMeleeHitRef.current = true;
                            }
                        }
                        meleeTimer.current -= timeScale;
                        if (meleeTimer.current <= 0) {
                            meleeState.current = 'RECOVERY';
                            meleeTimer.current = GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                            // NOTE: Do not force camera off here; let timer handle it.
                        }
                    }
                    else if (meleeState.current === 'RECOVERY') {
                        meleeTimer.current -= timeScale;
                        // Apply slight gravity in recovery if needed, or keep suspended?
                        // Usually recovery drops you.
                        velocity.current.y -= GLOBAL_CONFIG.GRAVITY * 0.5 * timeScale; 
                        
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
                        velocity.current.set(0, 0, 0);
                        
                        if (isRainbowStep.current && position.current.y < 1.5) {
                             velocity.current.y = 0.02; 
                             isGrounded.current = false; 
                        }
                        
                        evadeRecoveryTimer.current = isRainbowStep.current ? GLOBAL_CONFIG.RAINBOW_STEP_RECOVERY_FRAMES : GLOBAL_CONFIG.EVADE_RECOVERY_FRAMES;
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
                        
                        // STANDARD GRAVITY (Only if not melee, not dashing, etc)
                        if (!isDashing.current) velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
                    }
                }
                
                // --- COLLISION RESOLUTION ---
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

            if (!stunned) {
                if (meleeState.current === 'LUNGE') {
                    if (velocity.current.lengthSq() > 0.01) {
                        const lookPos = position.current.clone().add(velocity.current);
                        meshRef.current.lookAt(lookPos);
                    }
                }
                else if (meleeState.current === 'STARTUP' || meleeState.current.includes('SLASH') || meleeState.current === 'RECOVERY') {
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
                const shouldRealignHorizon = meleeState.current === 'RECOVERY' || (visualState === 'IDLE' && !isShooting.current);
                if (shouldRealignHorizon) {
                    const fwd = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                    fwd.y = 0; fwd.normalize();
                    if (fwd.lengthSq() > 0.1) {
                        const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), fwd);
                        meshRef.current.quaternion.slerp(targetQuat, 0.15 * timeScale);
                    }
                }
                meshRef.current.updateMatrixWorld(true);
            }

            // --- ANIMATION SYSTEM UPDATE ---
            
            // 1. Select Clip
            // Use NEUTRAL if not grounded OR if performing landing animation (to prevent leg snapping from falling pose)
            let activeClip = (isGrounded.current && nextVisualState !== 'LANDING') ? ANIMATION_CLIPS.IDLE : ANIMATION_CLIPS.NEUTRAL;
            let speed = 1.0;
            let blend = 0.2; 

            if (stunned) {
                activeClip = ANIMATION_CLIPS.IDLE; 
            } 
            else if (meleeState.current === 'LUNGE') {
                activeClip = ANIMATION_CLIPS.MELEE_STARTUP;
                blend = 0.2;
            }
            else if (meleeState.current === 'STARTUP') {
                activeClip = ANIMATION_CLIPS.MELEE_STARTUP;
                speed = 60 / GLOBAL_CONFIG.MELEE_STARTUP_FRAMES * 1.5;
                blend = 0.1;
            }
            else if (meleeState.current === 'SLASH_1') {
                activeClip = ANIMATION_CLIPS.MELEE_SLASH_1;
                // SPEED: Matches Logic Duration
                speed = 60 / GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_1.DURATION_FRAMES;
                blend = 0.05; 
            }
            else if (meleeState.current === 'SLASH_2') {
                activeClip = ANIMATION_CLIPS.MELEE_SLASH_2;
                speed = 60 / GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_2.DURATION_FRAMES;
                blend = 0.05;
            }
            else if (meleeState.current === 'SLASH_3') {
                activeClip = ANIMATION_CLIPS.MELEE_SLASH_3;
                speed = 60 / GLOBAL_CONFIG.MELEE_COMBO_DATA.SLASH_3.DURATION_FRAMES; 
                blend = 0.05;
            }
            else if (meleeState.current === 'RECOVERY') {
                activeClip = ANIMATION_CLIPS.MELEE_RECOVERY;
                speed = 60 / GLOBAL_CONFIG.MELEE_RECOVERY_FRAMES;
                blend = 0.1;
            }
            else if (isDashing.current) {
                activeClip = activeWeapon === 'SABER' ? ANIMATION_CLIPS.DASH_SABER : ANIMATION_CLIPS.DASH_GUN;
                blend = 0.2;
            }
            
            // 2. Update Controller
            animator.play(activeClip, blend, speed, true); 
            animator.update(delta);
            
            // 3. Get Result
            const animatedPose = animator.getCurrentPose();
            
            // 4. PROCEDURAL OVERRIDES (PHYSICS LAYERS)
            
            // HELPER FOR SERVO/LERP SMOOTHING
            const lerpSpeedFall = 0.25 * timeScale;
            const smoothRot = (currentVal: number, targetVal: number) => MathUtils.lerp(currentVal, targetVal, lerpSpeedFall);

            // A. FALLING LOGIC - REWRITTEN TO USE SERVO/LERP
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
                
                // Calculate TARGET Fall Poses (Lerp from Neutral Base to Max Fall Pitch)
                const targetRightThighX = MathUtils.lerp(DEFAULT_MECH_POSE.RIGHT_LEG.THIGH.x, GLOBAL_CONFIG.FALL_LEG_PITCH_RIGHT, animWeight);
                const targetLeftThighX = MathUtils.lerp(DEFAULT_MECH_POSE.LEFT_LEG.THIGH.x, GLOBAL_CONFIG.FALL_LEG_PITCH_LEFT, animWeight);
                
                const targetRightKnee = MathUtils.lerp(DEFAULT_MECH_POSE.RIGHT_LEG.KNEE, GLOBAL_CONFIG.FALL_KNEE_BEND_RIGHT, animWeight);
                const targetLeftKnee = MathUtils.lerp(DEFAULT_MECH_POSE.LEFT_LEG.KNEE, GLOBAL_CONFIG.FALL_KNEE_BEND_LEFT, animWeight);
                
                // Spread
                const targetRightThighZ = MathUtils.lerp(DEFAULT_MECH_POSE.RIGHT_LEG.THIGH.z, GLOBAL_CONFIG.FALL_LEG_SPREAD, animWeight);
                const targetLeftThighZ = MathUtils.lerp(DEFAULT_MECH_POSE.LEFT_LEG.THIGH.z, -GLOBAL_CONFIG.FALL_LEG_SPREAD, animWeight);
                
                const targetBodyTilt = MathUtils.lerp(DEFAULT_MECH_POSE.TORSO.x, GLOBAL_CONFIG.FALL_BODY_TILT, animWeight);

                // Apply Servo Smoothing (Lerp from PREVIOUS FRAME actual rotation to TARGET)
                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.x = smoothRot(rightLegRef.current.rotation.x, targetRightThighX);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.x = smoothRot(leftLegRef.current.rotation.x, targetLeftThighX);
                
                if (rightLowerLegRef.current) animatedPose.RIGHT_LEG.KNEE = smoothRot(rightLowerLegRef.current.rotation.x, targetRightKnee);
                if (leftLowerLegRef.current) animatedPose.LEFT_LEG.KNEE = smoothRot(leftLowerLegRef.current.rotation.x, targetLeftKnee);

                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.z = smoothRot(rightLegRef.current.rotation.z, targetRightThighZ);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.z = smoothRot(leftLegRef.current.rotation.z, targetLeftThighZ);

                if (torsoRef.current) animatedPose.TORSO.x = smoothRot(torsoRef.current.rotation.x, targetBodyTilt);
            }

            // B. LANDING LOGIC - REWRITTEN TO USE SERVO/LERP APPROACH
            if (visualState === 'LANDING') {
                const total = GLOBAL_CONFIG.LANDING_VISUAL_DURATION;
                const current = visualLandingFrames.current; 
                const progress = 1 - (current / total); 
                let w = 0;
                const r = GLOBAL_CONFIG.LANDING_ANIM_RATIO;
                if (progress < r) w = progress / r;
                else w = 1 - ((progress - r) / (1 - r));

                // 1. Thighs
                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.x = smoothRot(rightLegRef.current.rotation.x, GLOBAL_CONFIG.LANDING_LEG_PITCH_RIGHT * w);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.x = smoothRot(leftLegRef.current.rotation.x, GLOBAL_CONFIG.LANDING_LEG_PITCH_LEFT * w);

                // 2. Knees (Base offset is 0.2, matching Unit.tsx logic)
                if (rightLowerLegRef.current) animatedPose.RIGHT_LEG.KNEE = smoothRot(rightLowerLegRef.current.rotation.x, 0.2 + (GLOBAL_CONFIG.LANDING_KNEE_BEND_RIGHT - 0.2) * w);
                if (leftLowerLegRef.current) animatedPose.LEFT_LEG.KNEE = smoothRot(leftLowerLegRef.current.rotation.x, 0.2 + (GLOBAL_CONFIG.LANDING_KNEE_BEND_LEFT - 0.2) * w);

                // 3. Ankles (Base offset is -0.2)
                if (rightFootRef.current) animatedPose.RIGHT_LEG.ANKLE.x = smoothRot(rightFootRef.current.rotation.x, -0.2 + (GLOBAL_CONFIG.LANDING_ANKLE_PITCH_RIGHT - -0.2) * w);
                if (leftFootRef.current) animatedPose.LEFT_LEG.ANKLE.x = smoothRot(leftFootRef.current.rotation.x, -0.2 + (GLOBAL_CONFIG.LANDING_ANKLE_PITCH_LEFT - -0.2) * w);

                // 4. Leg Splay (Z Axis)
                if (rightLegRef.current) animatedPose.RIGHT_LEG.THIGH.z = smoothRot(rightLegRef.current.rotation.z, 0.05 + GLOBAL_CONFIG.LANDING_LEG_SPLAY * w);
                if (leftLegRef.current) animatedPose.LEFT_LEG.THIGH.z = smoothRot(leftLegRef.current.rotation.z, -0.05 - GLOBAL_CONFIG.LANDING_LEG_SPLAY * w);

                // 5. Body Tilt
                if (torsoRef.current) animatedPose.TORSO.x = smoothRot(torsoRef.current.rotation.x, GLOBAL_CONFIG.LANDING_BODY_TILT * w);
            }

            // C. WALK CYCLE (BLENDED)
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

                // Blend Walk Cycle
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
                
                // Sway & Head
                animatedPose.TORSO.x = MathUtils.lerp(animatedPose.TORSO.x, 0.5, w); 
                animatedPose.CHEST.y = MathUtils.lerp(animatedPose.CHEST.y, sin * 0.22, w);
                animatedPose.CHEST.z = MathUtils.lerp(animatedPose.CHEST.z, cos * 0.1, w);
                animatedPose.HEAD.y = MathUtils.lerp(animatedPose.HEAD.y, -sin * 0.22, w);

                // Override leg spread
                animatedPose.RIGHT_LEG.THIGH.z = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.z, 0, w);
                animatedPose.LEFT_LEG.THIGH.z = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.z, 0, w);
                animatedPose.RIGHT_LEG.THIGH.y = MathUtils.lerp(animatedPose.RIGHT_LEG.THIGH.y, 0, w);
                animatedPose.LEFT_LEG.THIGH.y = MathUtils.lerp(animatedPose.LEFT_LEG.THIGH.y, 0, w);
            }

            // D. AIMING
            if (isShooting.current && currentTarget && gunArmRef.current) {
                // Calculate aim quaternion
                const shoulderPos = new Vector3();
                gunArmRef.current.getWorldPosition(shoulderPos);
                const targetPos = currentTarget.position.clone();
                const dirToTarget = targetPos.sub(shoulderPos).normalize();
                const bodyInverseQuat = meshRef.current.quaternion.clone().invert();
                const localDir = dirToTarget.applyQuaternion(bodyInverseQuat);
                const defaultForward = new Vector3(0, -1, 0.2).normalize(); // Default arm vector
                const aimQuat = new Quaternion().setFromUnitVectors(defaultForward, localDir);
                const aimEuler = new Euler().setFromQuaternion(aimQuat);

                // Blend aiming based on shoot timer
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
                
                // Lerp from current animation pose to aim pose
                animatedPose.LEFT_ARM.SHOULDER.x = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.x, aimEuler.x, aimWeight);
                animatedPose.LEFT_ARM.SHOULDER.y = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.y, aimEuler.y, aimWeight);
                animatedPose.LEFT_ARM.SHOULDER.z = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.z, aimEuler.z, aimWeight);
            }
            
            // 5. Apply Final Pose
            
            // Falling body tilt inertia for legs container
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

            // --- SMOOTH HIP OFFSET ---
            // Calculate target hip offset (dip) based on landing animation
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

            // If we are in LANDING state, snap to target to preserve the impact curve punchiness.
            // If we are exiting LANDING (e.g. interrupted by dash), smooth back to 0.
            if (visualState === 'LANDING') {
                currentHipOffset.current = targetHipOffset;
            } else {
                currentHipOffset.current = MathUtils.lerp(currentHipOffset.current, 0, 0.2 * timeScale);
            }

            applyPoseToModel(animatedPose, currentHipOffset.current, currentLegInertiaRot.current);

            // E. HEAD LOOK AT (PROCEDURAL OVERRIDE - POST RENDER)
            // Apply this *after* applyPoseToModel so it overwrites the animation clip's head rotation
            if (headRef.current && !stunned) {
                // 1. Default to Animation Pose (Base State)
                const animHeadQuat = new Quaternion().setFromEuler(new Euler(animatedPose.HEAD.x, animatedPose.HEAD.y, animatedPose.HEAD.z));
                let targetQuat = animHeadQuat;
                let trackSpeed = 0.1 * timeScale;

                // 2. Apply LookAt Overrides if allowed
                // Disable tracking during MELEE sequences to let animation play out naturally
                const isMelee = meleeState.current !== 'NONE';
                const isCinematic = useGameStore.getState().isCinematicCameraActive;
                
                if (!isMelee && !isCinematic) {
                    const currentTarget = targets[currentTargetIndex];
                    if (currentTarget) {
                        // Update world matrices so we have correct parent transforms
                        meshRef.current.updateMatrixWorld();
                        
                        const headWorldPos = new Vector3();
                        headRef.current.getWorldPosition(headWorldPos);
                        
                        // Look at target chest/head height
                        const targetLookPos = currentTarget.position.clone().add(new Vector3(0, 1.0, 0));
                        const dirToTarget = targetLookPos.clone().sub(headWorldPos).normalize();
                        const bodyFwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion).normalize();
                        
                        // Only look if target is roughly in front (> 78 degrees arc)
                        if (bodyFwd.dot(dirToTarget) > 0.2) {
                            // Calculate the Local Rotation needed to look at target
                            const parentWorldQuat = new Quaternion();
                            if (headRef.current.parent) {
                                headRef.current.parent.getWorldQuaternion(parentWorldQuat);
                            }
                            
                            const m = new Matrix4();
                            m.lookAt(headWorldPos, targetLookPos, new Vector3(0, 1, 0)); // Standard Up
                            const worldLookQuat = new Quaternion().setFromRotationMatrix(m);
                            
                            // Local = ParentInverse * World
                            const localLookQuat = parentWorldQuat.clone().invert().multiply(worldLookQuat);

                            // Correction for GLB models
                            const correction = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
                            localLookQuat.multiply(correction);
                            
                            targetQuat = localLookQuat;
                            trackSpeed = 0.2 * timeScale; // Track faster than resetting
                        }
                    }
                } else {
                    // During melee or cinematic, blend quickly back to animation pose
                    trackSpeed = 0.2 * timeScale;
                }
                
                // 3. Smoothly interpolate and Apply
                headLookQuat.current.slerp(targetQuat, trackSpeed);
                headRef.current.quaternion.copy(headLookQuat.current);
            }


            // 6. Shooting Logic
            if (isShooting.current) {
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
                            const fwd = new Vector3(0,0,1); muzzleRef.current.getWorldDirection(fwd); direction = fwd.normalize();
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

        // --- CAMERA UPDATE (RUNS ALWAYS, even if HitStop) ---
        const { isCinematicCameraActive } = useGameStore.getState();
        const currentTarget = targets[currentTargetIndex];
        const camConfig = GLOBAL_CONFIG.CINEMATIC_CAMERA;
        
        let targetCamPos = position.current.clone().add(new Vector3(0, 7, 14)); 
        let targetLookAt = position.current.clone().add(new Vector3(0, 2, 0)); 
        let targetFov = 60; // Default FOV
        let lerpFactor = 0.1 * timeScale;

        if (isCinematicCameraActive && meshRef.current) {
            // CINEMATIC MODE: Fixed relative to player
            const offset = camConfig.OFFSET; 
            
            // Convert local offset to world based on player rotation
            const localOffset = new Vector3(offset.x, offset.y, offset.z);
            localOffset.applyQuaternion(meshRef.current.quaternion);
            
            targetCamPos = position.current.clone().add(localOffset);
            targetLookAt = position.current.clone().add(new Vector3(0, 1.5, 0)); // Look at chest
            
            targetFov = camConfig.FOV;
            lerpFactor = camConfig.SMOOTHING * timeScale;
        } else {
            // STANDARD TRACKING MODE
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
        
        // Apply Camera Shake on Hit Stop
        if (hitStop > 0) {
            const shake = 0.3; // Strong shake
            targetCamPos.add(new Vector3((Math.random()-0.5)*shake, (Math.random()-0.5)*shake, (Math.random()-0.5)*shake));
        } else if (wasStunnedRef.current) {
             // Minor shake on stun
             const shake = 0.1;
             targetCamPos.add(new Vector3((Math.random()-0.5)*shake, (Math.random()-0.5)*shake, (Math.random()-0.5)*shake));
        }
        
        // Apply Position & LookAt
        camera.position.lerp(targetCamPos, lerpFactor);
        camera.lookAt(targetLookAt);

        // Apply FOV Change
        if (camera instanceof PerspectiveCamera) {
            // Check if significant change needed to avoid unnecessary matrix updates
            if (Math.abs(camera.fov - targetFov) > 0.1) {
                camera.fov = MathUtils.lerp(camera.fov, targetFov, lerpFactor);
                camera.updateProjectionMatrix();
            }
        }
    });
    const isDashingOrAscending = visualState === 'DASH' || visualState === 'ASCEND' || visualState === 'MELEE';
    const isTrailActive = trailTimer.current > 0; 
    const isAscending = visualState === 'ASCEND';
    const isThrusting = isDashingOrAscending;

    const armorColor = '#eeeeee';
    const chestColor = '#2244aa';
    const feetColor = '#aa2222';
   
    return (
        <group>
            <mesh ref={meshRef}>
                <group position={[0, 2.0, 0]}>
                    <group ref={torsoRef}>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[0.6, 0.5, 0.5]} />
                            <meshToonMaterial color="#ff0000" />
                            <Edges threshold={15} color="black" />
                        </mesh>
                        <GhostEmitter active={isTrailActive} size={[0.6, 0.5, 0.5]} rainbow={trailRainbow.current} />
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
                            <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                                <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                                <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]} ref={rightForeArmRef}>
                                    <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                    <group ref={rightForearmTwistRef}>
                                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                            <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                            <group ref={rightWristRef} position={[0, -0.35, 0]}>
                                                <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                            </group>
                                        </group>
                                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={shieldRef}>
                                                <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                                    <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.1, 1.7, 0.7]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                                    <mesh position={[0.06, 0.2, 0]}><boxGeometry args={[0.05, 1.5, 0.5]} /><meshToonMaterial color="#ff0000" /></mesh>
                                                </group>
                                        </group>
                                    </group>
                                </group>
                            </group>
                            <group position={[-0.65, 0.1, 0]} ref={gunArmRef} >
                                <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                                <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]} ref={leftForeArmRef}>
                                    <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                                    <group ref={leftForearmTwistRef}>
                                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                            <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                            <group ref={leftWristRef} position={[0, -0.35, 0]}>
                                                <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                                <group visible={activeWeapon === 'SABER'} position={[0, 0, 0.1]} rotation={[Math.PI/1.8, 0, 0]}>
                                                    <BeamSaber active={activeWeapon === 'SABER'} meleeState={meleeState} />
                                                </group>
                                            </group>
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
