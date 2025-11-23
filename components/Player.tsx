
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Mesh, MathUtils, Group, DoubleSide, AdditiveBlending, Quaternion, Matrix4, Shape } from 'three';
import { Trail, Edges } from '@react-three/drei';
import { useGameStore } from '../store';
import { Team, LockState, GLOBAL_CONFIG } from '../types';
import { DASH_SFX_BASE64, SHOOT_SFX_BASE64 } from '../assets';

const FRAME_DURATION = 1 / 60;

// --- AUDIO MANAGER ---
// Lazy load AudioContext to comply with browser autoplay policies
let globalAudioCtx: AudioContext | null = null;
let boostAudioBuffer: AudioBuffer | null = null;
let shootAudioBuffer: AudioBuffer | null = null;
let isBoostLoading = false;
let isShootLoading = false;

const getAudioContext = () => {
    if (!globalAudioCtx) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            globalAudioCtx = new AudioContext();
        }
    }
    return globalAudioCtx;
};

// --- PROCEDURAL AUDIO GENERATORS (Fallback for missing/empty files) ---

// Generates a Sci-Fi "Swish" noise burst
const generateProceduralDash = (ctx: AudioContext): AudioBuffer => {
    const duration = 0.6;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
        // 1. Base White Noise
        const noise = Math.random() * 2 - 1;
        
        // 2. Amplitude Envelope (Fast attack, long tail)
        const t = i / frameCount;
        let envelope = 0;
        if (t < 0.1) envelope = t / 0.1; // Attack
        else envelope = 1 - ((t - 0.1) / 0.9); // Decay
        envelope = Math.pow(envelope, 2); // Quadratic curve for smoother fade

        // 3. Simple Lowpass Filter Simulation (Moving Average - crude but fast)
        // Ideally we use BiquadFilterNode at runtime, but for a baked buffer:
        // We just let the noise be "hissy" which fits a steam thruster.
        
        data[i] = noise * envelope * 0.5; // Scale volume
    }
    return buffer;
};

// Generates a Retro "Pew" Laser
const generateProceduralShoot = (ctx: AudioContext): AudioBuffer => {
    const duration = 0.3;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const progress = i / frameCount;

        // Frequency Sweep: 1200Hz -> 200Hz
        const frequency = 1200 - (1000 * Math.pow(progress, 0.5));
        
        // Waveform: Square-ish (using sine with sign)
        const val = Math.sign(Math.sin(2 * Math.PI * frequency * t));

        // Envelope
        const envelope = 1 - progress;

        data[i] = val * envelope * 0.3;
    }
    return buffer;
};

// EXPORTED HELPER for App.tsx to resume audio on Start Click
export const resumeAudioContext = async () => {
    const ctx = getAudioContext();
    if (ctx) {
        try {
            if (ctx.state === 'suspended') {
                await ctx.resume();
                console.log("AudioContext resumed successfully.");
            }
            
            // Force load/generate buffers if missing
            if (!boostAudioBuffer && !isBoostLoading) loadCustomBoostSound();
            if (!shootAudioBuffer && !isShootLoading) loadCustomShootSound();
            
        } catch (e) {
            console.error("Failed to resume audio context:", e);
        }
    }
};

// Preloader for Custom Boost Sound
const loadCustomBoostSound = async () => {
    if (boostAudioBuffer || isBoostLoading) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;

    // Check if Base64 string is populated (length > 50 assumes valid data uri header + content)
    if (DASH_SFX_BASE64.length < 50) {
        console.warn("DASH_SFX_BASE64 in assets.ts is empty. Using procedural fallback.");
        boostAudioBuffer = generateProceduralDash(ctx);
        return;
    }

    isBoostLoading = true;
    try {
        console.log(`Attempting to load boost sound from Base64 asset...`);
        const response = await fetch(DASH_SFX_BASE64);
        const arrayBuffer = await response.arrayBuffer();
        
        if (arrayBuffer.byteLength === 0) {
             throw new Error("Buffer is empty");
        }

        const decodedData = await ctx.decodeAudioData(arrayBuffer);
        boostAudioBuffer = decodedData;
        console.log("Custom boost sound loaded.");
    } catch (error) {
        console.warn("Using procedural DASH sound due to load error:", error);
        // FALLBACK: Generate procedural buffer
        boostAudioBuffer = generateProceduralDash(ctx);
    } finally {
        isBoostLoading = false;
    }
};

// Preloader for Custom Shoot Sound
const loadCustomShootSound = async () => {
    if (shootAudioBuffer || isShootLoading) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;

    // Check if Base64 string is populated
    if (SHOOT_SFX_BASE64.length < 50) {
        console.warn("SHOOT_SFX_BASE64 in assets.ts is empty. Using procedural fallback.");
        shootAudioBuffer = generateProceduralShoot(ctx);
        return;
    }

    isShootLoading = true;
    try {
        console.log(`Attempting to load shoot sound from Base64 asset...`);
        const response = await fetch(SHOOT_SFX_BASE64);
        const arrayBuffer = await response.arrayBuffer();
        
        if (arrayBuffer.byteLength === 0) throw new Error("Buffer is empty");

        const decodedData = await ctx.decodeAudioData(arrayBuffer);
        shootAudioBuffer = decodedData;
        console.log("Custom shoot sound loaded.");
    } catch (error) {
        console.warn("Using procedural SHOOT sound due to load error:", error);
        // FALLBACK: Generate procedural buffer
        shootAudioBuffer = generateProceduralShoot(ctx);
    } finally {
        isShootLoading = false;
    }
};

const playShootSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    // 1. Prefer Buffer (Loaded or Procedural)
    if (shootAudioBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = shootAudioBuffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.4; 
        source.connect(gain);
        gain.connect(ctx.destination);
        source.playbackRate.value = 0.9 + Math.random() * 0.2; // Pitch variation
        source.start(0);
        return;
    }
    
    // 2. Ultimate Fallback (Oscillator) if even buffer generation failed
    playBeamRifleSynth(ctx);
};

// Procedural Beam Rifle Sound (Fallback)
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

const playBoostSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    // 1. Prefer Buffer (Loaded or Procedural)
    if (boostAudioBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = boostAudioBuffer;
        const gain = ctx.createGain();
        
        // Add a lowpass filter to make the white noise sound more like an engine
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        source.start(0);
        return;
    }

    // 2. Ultimate Fallback (Oscillator)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
};

// --- VISUAL EFFECTS ---
const BoostBurst: React.FC<{ triggerTime: number }> = ({ triggerTime }) => {
const groupRef = useRef<Group>(null);
// --- CONFIGURATION (ADJUST HERE) ---
const DURATION = 0.4; 
const CONE_LENGTH = 1.6;      // Length of the burst cones
const CONE_WIDTH = 0.08;    // Width at the base (outer end)
const TILT_ANGLE = -35;     // Degrees. -90 points straight back. -65 flares out.
const BURST_COLOR = "#00ffff"; 
// -----------------------------------

useFrame(() => {
    if (!groupRef.current) return;
    
    const now = Date.now();
    const elapsed = (now - triggerTime) / 1000; // convert to seconds

    if (elapsed > DURATION) {
        groupRef.current.visible = false;
        return;
    }

    groupRef.current.visible = true;

    // Animation Logic
    // 1. Scale: Explodes outward (0.5 -> 2.5)
    const scaleProgress = elapsed / DURATION;
    const scale = MathUtils.lerp(0.5, 2.5, Math.pow(scaleProgress, 0.3));
    groupRef.current.scale.setScalar(scale);

    // 2. Opacity: Fast fade in, then slow fade out
    let opacity = 0;
    if (elapsed < 0.1) {
        opacity = elapsed / 0.1; // 0 -> 1
    } else {
        const fadeOutProgress = (elapsed - 0.1) / (DURATION - 0.1);
        opacity = 1 - fadeOutProgress; // 1 -> 0
    }
    
    // Apply opacity to specific children (Meshes)
    groupRef.current.children.forEach((angleGroup: any) => {
        if (angleGroup.children && angleGroup.children[0] && angleGroup.children[0].children[0]) {
            const mesh = angleGroup.children[0].children[0];
            if (mesh.material) mesh.material.opacity = opacity;
        }
    });
});

return (
    <group ref={groupRef} visible={false} position={[0, -0.2, -0.3]} rotation={[0, 0, 0]}>
        {/* 4 Cones forming a Tetrahedron-like X shape */}
        {[45, 135, 225, 315].map((angle, i) => (
            // 1. Rotate around Z axis to form X cross
            <group key={i} rotation={[0, 0, MathUtils.degToRad(angle)]}>
                
                {/* 2. Tilt X axis to flare OUT from the center (Tetrahedron style) */}
                {/* Cylinder points +Y. Rotating X by -90 points it to +Z. */}
                <group rotation={[MathUtils.degToRad(TILT_ANGLE), 0, 0]}>
                    
                    {/* 3. Offset Mesh so it starts at center and grows outward */}
                    <mesh position={[0, CONE_LENGTH / 2, 0]}> 
                        {/* Top Radius 0 (Cone Tip), Bottom Radius CONE_WIDTH. */}
                        {/* R3F Cylinder: radiusTop, radiusBottom, height */}
                        <cylinderGeometry args={[0, CONE_WIDTH, CONE_LENGTH, 8, 1]} /> 
                        <meshBasicMaterial 
                            color={BURST_COLOR} 
                            transparent 
                            depthWrite={false} 
                            blending={AdditiveBlending} 
                        />
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
// Speed Lines for Evade (Restored)
const SpeedLines: React.FC<{ visible: boolean }> = ({ visible }) => {
const groupRef = useRef<Group>(null);
const LINE_COUNT = 12;
const TRAIL_LENGTH = 3; // How far back they go
const LINE_GEOM_LENGTH = 3; // The visual length of the mesh

useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    if (visible) {
        groupRef.current.children.forEach((child: any, i: number) => {
            child.position.z -= 1.8;
            if (child.position.z < -TRAIL_LENGTH) {
                child.position.z = MathUtils.randFloat(0, 3); 
                child.position.x = MathUtils.randFloat(-0.6, 0.6); 
                child.position.y = MathUtils.randFloat(0.5, 2.5); 
            }
            const opacity = Math.max(0, 1 - (Math.abs(child.position.z) / TRAIL_LENGTH));
            child.material.opacity = opacity * 0.6;
        });
    }
});

return (
    <group ref={groupRef} visible={false}>
        {[...Array(LINE_COUNT)].map((_, i) => (
             <mesh 
                key={i} 
                position={[
                    MathUtils.randFloat(-0.6, 0.6), 
                    MathUtils.randFloat(0.5, 2.5), 
                    MathUtils.randFloat(-5, 0) 
                ]} 
                rotation={[Math.PI/2, 0, 0]}
            >
                 <cylinderGeometry args={[0.015, 0.015, LINE_GEOM_LENGTH]} />
                 <meshBasicMaterial color="#ffd700" transparent opacity={1} depthWrite={false} />
             </mesh>
        ))}
    </group>
)
}
export const Player: React.FC = () => {
const meshRef = useRef<Mesh>(null);
const headRef = useRef<Group>(null);
const upperBodyRef = useRef<Group>(null); // NEW: Ref for chest/upper body animation
const legsRef = useRef<Group>(null);
// NEW: Individual leg refs for splaying animation
const rightLegRef = useRef<Group>(null);
const leftLegRef = useRef<Group>(null);
const rightLowerLegRef = useRef<Group>(null); // NEW: Ref for Right Shin (Shield Side - Knee Kick)
const leftLowerLegRef = useRef<Group>(null); // NEW: Ref for Left Shin
const rightFootRef = useRef<Group>(null); // NEW: Ref for Right Foot Ankle

const gunArmRef = useRef<Group>(null);
const muzzleRef = useRef<Group>(null);
const { camera } = useThree();
// State from Store
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
cutTracking,
isGameStarted // Import this to disable inputs if not started
} = useGameStore();
// Physics State
const velocity = useRef(new Vector3(0, 0, 0));
const position = useRef(new Vector3(0, 0, 0));
const isGrounded = useRef(true);
const landingFrames = useRef(0);
const wasStunnedRef = useRef(false);
// Input State
const keys = useRef<{ [key: string]: boolean }>({});
const lastKeyPressTime = useRef(0);
const lastKeyPressed = useRef<string>("");

// NEW INPUT STATE FOR L-KEY (Ascent/Dash)
const lPressStartTime = useRef(0);
const lastLReleaseTime = useRef(0);
// lConsumedByAction: Tracks if the current press did *anything* (Dash, Ascent, Hop).
// If true, releasing the key will NOT trigger a short hop or double tap prime.
const lConsumedByAction = useRef(false); 
// lConsumedByDash: SPECIFICALLY tracks if the current press was used to trigger a DASH.
// If true, holding the key will NOT trigger an ascent (prevents Jump Cancel during dash hold).
const lConsumedByDash = useRef(false);
// NEW: Special flag to allow double-tap even if the first tap was consumed (e.g. Evade Cancel)
const preserveDoubleTapOnRelease = useRef(false);

// Action State
const isDashing = useRef(false);
const dashStartTime = useRef(0);
const dashReleaseTime = useRef<number | null>(null);
const currentDashSpeed = useRef(0);
const dashDirection = useRef(new Vector3(0, 0, -1));
const dashBuffer = useRef(false); // Buffer input for dash
const dashCooldownTimer = useRef(0); // Cooldown timer for dash
// NEW: Dash Burst / Jump Cancel Buffer logic
const dashBurstTimer = useRef(0); // Counts down during burst phase
const jumpBuffer = useRef(false); // Tracks if jump was pressed during burst
const forcedAscentFrames = useRef(0); // Forces ascent state for short hop
// Animation Variables
const currentUpperBodyTilt = useRef(0); // NEW: Track upper body forward tilt angle
const wasFallingRef = useRef(false); // NEW: Track falling state change
const currentFallTime = useRef(0); // NEW: Track duration of current fall
const totalPredictedFallFrames = useRef(0); // NEW: Calculated total frames for fall

// Evade State
const isEvading = useRef(false);
const evadeTimer = useRef(0);
const evadeDirection = useRef(new Vector3(0, 0, 0));
// Combat State
const isShooting = useRef(false);
const shootTimer = useRef(0);
const hasFired = useRef(false);
const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
const [dashTriggerTime, setDashTriggerTime] = useState(0);
// Visual State
const [visualState, setVisualState] = useState<'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE'>('IDLE');
const [isStunned, setIsStunned] = useState(false);
const ammoRegenTimer = useRef(0);

// Try loading custom sounds on mount
useEffect(() => {
    // Attempt load, but the Play functions will handle fallback if this fails or is 0 bytes
    loadCustomBoostSound();
    loadCustomShootSound();
}, []);

const getDirectionFromKey = (key: string) => {
const input = new Vector3(0,0,1);
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
// Helper to start dash logic (extracted for reuse in input buffer)
const startDashAction = () => {
const now = Date.now();
// Use getState() to get the absolute latest state (especially useful if called inside useFrame after refill)
const state = useGameStore.getState();
// FIX: Allow Last-Ditch Dash (check state.boost > 0 instead of full cost)
  if (!state.isOverheated && state.boost > 0 && !isStunned) {
      if (isEvading.current) {
          isEvading.current = false;
          evadeTimer.current = 0;
      }
      if (isShooting.current) {
          isShooting.current = false;
          shootTimer.current = 0;
      }
      isDashing.current = true;
      dashStartTime.current = now;
      dashReleaseTime.current = null; 
      currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
      
      dashCooldownTimer.current = GLOBAL_CONFIG.DASH_COOLDOWN_FRAMES; // Start Cooldown
      dashBurstTimer.current = GLOBAL_CONFIG.DASH_BURST_DURATION; // Start Burst Lockout
      jumpBuffer.current = false; // Reset jump buffer
      
      // Note: using the action from the hook, which is stable
      consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT);

      setDashTriggerTime(now);
      playBoostSound();

      // FIX: Check proximity to ground (e.g., < 1.5 units) to trigger Ground Hop
      // This prevents the physics engine from snapping the player to ground and cancelling dash immediately
      // if they dash just before landing.
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
// Setup Inputs
useEffect(() => {
const handleKeyDown = (e: KeyboardEvent) => {
// Block input if game not started
if (!useGameStore.getState().isGameStarted) return;

const key = e.key.toLowerCase();
const now = Date.now();
if (!keys.current[key]) {
      if (['w', 'a', 's', 'd'].includes(key)) {
          if (key === lastKeyPressed.current && (now - lastKeyPressTime.current < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW)) {
             // FIX: Allow Last-Ditch Evade (boost > 0)
             if (!isOverheated && boost > 0 && !isStunned && landingFrames.current <= 0) {
                 if (consumeBoost(GLOBAL_CONFIG.EVADE_BOOST_COST)) {
                     isEvading.current = true;
                     evadeTimer.current = GLOBAL_CONFIG.EVADE_DURATION;
                     cutTracking('player');
                     const dir = getDirectionFromKey(key);
                     evadeDirection.current.copy(dir);
                     velocity.current.x = dir.x * GLOBAL_CONFIG.EVADE_SPEED;
                     velocity.current.z = dir.z * GLOBAL_CONFIG.EVADE_SPEED;
                     velocity.current.y = 0;
                     isDashing.current = false;
                     isShooting.current = false;
                     shootTimer.current = 0;
                 }
             }
          }
          lastKeyPressed.current = key;
          lastKeyPressTime.current = now;
      }

      keys.current[key] = true;
      
      if (key === 'j') {
           if (!isShooting.current && !isEvading.current && landingFrames.current <= 0 && !isStunned) {
               const hasAmmo = consumeAmmo();
               if (hasAmmo) {
                   isShooting.current = true;
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

      if (key === 'l') {
        const timeSinceLastRelease = now - lastLReleaseTime.current;

        if (timeSinceLastRelease < GLOBAL_CONFIG.INPUT_DASH_WINDOW) {
            // --- DOUBLE TAP DETECTED: DASH LOGIC ---
            
            // Mark as consumed specifically by Dash
            lConsumedByDash.current = true;
            // Also mark as consumed generically to prevent release actions
            lConsumedByAction.current = true;

            // 1. If in Landing Lag, BUFFER the input
            if (landingFrames.current > 0) {
                // INPUT BUFFER: Only buffer if close to recovery
                if (landingFrames.current <= GLOBAL_CONFIG.LANDING_LAG_BUFFER_WINDOW) {
                    dashBuffer.current = true;
                }
                return;
            }
            
            // 2. If in Dash Cooldown, BUFFER the input
            if (dashCooldownTimer.current > 0) {
                dashBuffer.current = true;
                return;
            }

            // 3. Otherwise attempt dash immediately
            startDashAction();
        } else {
            // --- FIRST PRESS: START HOLD TIMER FOR ASCENT ---
            lPressStartTime.current = now;
            lConsumedByAction.current = false; // Reset to allow ascent check
            lConsumedByDash.current = false;   // Reset Dash flag
        }
      }
      
      // CHANGED: Switch Target key changed from 'e' to ' ' (Space)
      if (key === ' ') {
        useGameStore.getState().cycleTarget();
      }
  }
};

const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    keys.current[key] = false;
    
    if (key === 'l') {
        // If consumed by action, usually we invalidate double tap.
        // UNLESS preserveDoubleTapOnRelease is true (e.g. Evade Cancel Ascent).
        if (lConsumedByAction.current && !preserveDoubleTapOnRelease.current) {
            lastLReleaseTime.current = 0;
        } else {
            lastLReleaseTime.current = Date.now();
        }
        // Reset flag for next press
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
// --- MECHA EYE SHAPE ---
const eyeShape = useMemo(() => {
const s = new Shape();
// Drawing Right Eye (X > 0)
s.moveTo(0.025, -0.01); // Inner Bottom
s.lineTo(0.11, 0.01); // Outer Bottom
s.lineTo(0.11, 0.06); // Outer Top
s.lineTo(0.025, 0.03); // Inner Top (Lower than outer = Angry)
s.autoClose = true;
return s;
}, []);
useFrame((state, delta) => {
if (!meshRef.current) return;
const timeScale = delta * 60;
const now = Date.now();
const currentTarget = targets[currentTargetIndex];
const moveDir = getCameraRelativeInput();
// Removed spaceHeld variable

const stunned = now - playerLastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;

if (wasStunnedRef.current && !stunned) {
    if (isGrounded.current) {
        landingFrames.current = getLandingLag();
        velocity.current.set(0, 0, 0);
    }
}
wasStunnedRef.current = stunned;
setIsStunned(stunned);

// Decrement Dash Cooldown
if (dashCooldownTimer.current > 0) {
    dashCooldownTimer.current -= 1 * timeScale;
    if (dashCooldownTimer.current <= 0) {
        dashCooldownTimer.current = 0;
        // --- COOLDOWN BUFFER CHECK ---
        if (dashBuffer.current && landingFrames.current <= 0 && !stunned) {
            startDashAction();
            dashBuffer.current = false;
        }
    }
}

// Decrement Dash Burst Timer (Lockout)
if (dashBurstTimer.current > 0) {
    dashBurstTimer.current -= 1 * timeScale;
    if (dashBurstTimer.current <= 0) {
        dashBurstTimer.current = 0;
        // --- BURST BUFFER CHECK ---
        if (jumpBuffer.current) {
            // Cancel Dash to allow transition to Ascend
            isDashing.current = false;
            jumpBuffer.current = false;
            
            // If key is NOT held anymore, force a short hop
            if (!keys.current['l']) {
                forcedAscentFrames.current = GLOBAL_CONFIG.JUMP_SHORT_HOP_FRAMES;
            }
            // If key IS held, physics loop below will catch 'isAscentInput' naturally
        }
    }
}

// Decrement Forced Ascent Timer
if (forcedAscentFrames.current > 0) {
    forcedAscentFrames.current -= 1 * timeScale;
}

ammoRegenTimer.current += delta;
if (ammoRegenTimer.current > GLOBAL_CONFIG.AMMO_REGEN_TIME) {
    recoverAmmo();
    ammoRegenTimer.current = 0;
}

let nextVisualState: 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' = 'IDLE';

// ==========================================
// 1. STATE & PHYSICS CALCULATION
// ==========================================

// DETERMINE INPUT STATES
const isLHeld = keys.current['l'];
const lHeldDuration = isLHeld ? (now - lPressStartTime.current) : 0;

// FIX: Ascent Logic Correction
// We only block ascent if the key press was explicitly used for a DASH.
// If it was used for a previous frame of Ascent (lConsumedByAction=true), we SHOULD continue.
// NEW: If Evading, allow instant ascent (ignore hold threshold)
const isEvadeCancelInput = isEvading.current && isLHeld && !lConsumedByDash.current;
const isNormalAscentInput = isLHeld && !lConsumedByDash.current && (lHeldDuration > GLOBAL_CONFIG.INPUT_ASCENT_HOLD_THRESHOLD);
const isAscentInput = isEvadeCancelInput || isNormalAscentInput;

// --- SHORT HOP LOGIC (Tap detection) ---
// If key is released, was not consumed, and enough time has passed since release that double tap is impossible
if (!isLHeld && lastLReleaseTime.current > 0 && !lConsumedByAction.current) {
    // Wait for double tap window to close BEFORE deciding whether to discard or hop
    if (now - lastLReleaseTime.current > GLOBAL_CONFIG.INPUT_DASH_WINDOW) {
        
        if (isDashing.current) {
            // FIX: If we are dashing, a short press (that failed to become a double tap) 
            // should be ignored to prevent unintended vertical movement.
            lConsumedByAction.current = true;
            lastLReleaseTime.current = 0;
        } else {
            // Trigger Short Hop
            if (!isStunned && !isOverheated && landingFrames.current <= 0 && boost > GLOBAL_CONFIG.BOOST_CONSUMPTION_SHORT_HOP) {
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_SHORT_HOP)) {
                    velocity.current.y = GLOBAL_CONFIG.JUMP_SHORT_HOP_SPEED;
                    isGrounded.current = false;
                    // Mark as consumed so it doesn't trigger again
                    lConsumedByAction.current = true;
                    lastLReleaseTime.current = 0;
                    // Optional: Force a brief ascent visual state
                    forcedAscentFrames.current = 10;
                }
            } else {
                // Even if failed (no boost/stunned), mark as consumed to stop check loop
                lConsumedByAction.current = true;
                lastLReleaseTime.current = 0;
            }
        }
    }
}

// JUMP CANCEL LOGIC (Updated for L-Key)
// If we are dashing, and we hold L long enough, trigger jump cancel logic
if (isDashing.current && isAscentInput) {
     if (dashBurstTimer.current > 0) {
         jumpBuffer.current = true; // Buffer input if in burst
     } else {
         // Grace period check
         if (now - dashStartTime.current > GLOBAL_CONFIG.DASH_GRACE_PERIOD) {
             isDashing.current = false; // Cancel Dash -> Next frame loop will catch Ascent
         }
     }
}

if (stunned) {
    isDashing.current = false;
    isShooting.current = false;
    isEvading.current = false; 
    dashBuffer.current = false; 
    jumpBuffer.current = false; // Clear Buffers
    forcedAscentFrames.current = 0;
    shootTimer.current = 0;
    landingFrames.current = 0; 

    velocity.current.set(0, velocity.current.y - GLOBAL_CONFIG.GRAVITY * timeScale, 0);
    position.current.add(playerKnockbackDir.clone().multiplyScalar(GLOBAL_CONFIG.KNOCKBACK_SPEED * timeScale));
    position.current.y += velocity.current.y * timeScale;

} else {
    if (isEvading.current) {
        nextVisualState = 'EVADE';
        evadeTimer.current -= 1 * timeScale;
        
        velocity.current.x = evadeDirection.current.x * GLOBAL_CONFIG.EVADE_SPEED;
        velocity.current.z = evadeDirection.current.z * GLOBAL_CONFIG.EVADE_SPEED;
        velocity.current.y = 0; 

        // EVADE CANCEL -> ASCENT
        if (isAscentInput) {
            if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                isEvading.current = false; 
                nextVisualState = 'ASCEND';
                velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                
                // Mark input as consumed by ascent
                lConsumedByAction.current = true;
                // NEW: Special Case - Allow this specific press to be the "first tap" for a dash double tap
                preserveDoubleTapOnRelease.current = true;
            }
        }

        if (evadeTimer.current <= 0) {
            isEvading.current = false;
            velocity.current.set(0, 0, 0);
            if (isGrounded.current) {
                landingFrames.current = getLandingLag();
            }
        }
    }
    // --- SHOOTING STATE LOGIC ---
    else if (isShooting.current && shootMode.current === 'STOP') {
        nextVisualState = 'SHOOT';
        velocity.current.set(0, 0, 0);
    }
    else if (landingFrames.current > 0) {
        velocity.current.set(0, 0, 0);
        landingFrames.current -= 1 * timeScale; 
        nextVisualState = 'LANDING';
        if (landingFrames.current <= 0) { 
             landingFrames.current = 0;
             refillBoost();
             
             // --- BUFFERED ACTION CHECK (LANDING) ---
             if (dashBuffer.current) {
                 if (dashCooldownTimer.current <= 0) {
                    startDashAction();
                    dashBuffer.current = false;
                 }
             }
        }
    } 
    else {
        // MOVEMENT LOGIC (DASH / ASCEND / WALK)
        
        // FIX: Handle Overheat during Dash properly (Coasting)
        if (isDashing.current) {
            // CHECK OVERHEAT FIRST
            // If we just ran out of boost, force coasting immediately.
            if ((isOverheated || boost <= 0) && dashReleaseTime.current === null) {
                 dashReleaseTime.current = now;
            }
            
            // CHECK INPUT RELEASE
            // For L-key dash, "release" essentially means we aren't holding input or L-key logic dictates
            // But specifically for dash, we care about movement input for coasting or the L-key itself?
            // Actually, usually in these games, holding dash extends it, releasing it coasts.
            // Since we established Double Tap = Dash, we assume the user might hold the second tap.
            if (dashReleaseTime.current === null && !isLHeld && !moveDir) {
                 dashReleaseTime.current = now;
            }

            // Note: Jump Cancel Logic moved up to ensure it runs before physics application

            // --- COASTING EXPIRY CHECK ---
            // This must run regardless of boost state if we are coasting.
            if (dashReleaseTime.current !== null) {
                 if (now - dashReleaseTime.current > GLOBAL_CONFIG.DASH_COAST_DURATION) {
                     isDashing.current = false;
                 }
            }
        }

        // --- APPLY PHYSICS BASED ON STATE ---

        // Determine if we are trying to Ascend (Key Held only)
        // FIX: Do NOT include forcedAscentFrames in the physical calculation, only visual.
        const effectiveAscent = isAscentInput; 
        const isDashBursting = dashBurstTimer.current > 0;

        if (isDashing.current) {
             const isCoasting = dashReleaseTime.current !== null;
             // If coasting, we don't consume boost, so "canSustain" is true.
             // If NOT coasting, we try to consume boost.
                 let canSustain = isCoasting;
                 
                 if (!isCoasting) {
                     const paid = consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_HOLD * timeScale);
                     if (paid) {
                         canSustain = true;
                     } else {
                         // 扣气失败。检查是不是真的没气了/过热了。
                         const checkState = useGameStore.getState();
                         if (checkState.isOverheated || checkState.boost <= 0) {
                             // 是的，没气了。强制进入滑行，并允许这一帧继续运动。
                             dashReleaseTime.current = now;
                             canSustain = true; 
                         } else {
                             canSustain = false; // 其他原因失败
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
                velocity.current.y *= 0.85; // Flatten flight
            } else {
                isDashing.current = false;
            }
        }
        else if (effectiveAscent && !isOverheated && !isDashBursting) {
            // ASCENT LOGIC
            // If checking real input (not forced), pay the cost
            let canAscend = true;
            if (isAscentInput) {
                canAscend = consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale);
                if (canAscend) {
                    // Mark as consumed so when we release, it doesn't trigger short hop or double tap
                    lConsumedByAction.current = true;
                    // NOTE: We do NOT set lConsumedByDash here.
                }
            }

            if (canAscend) {
                nextVisualState = 'ASCEND';
                velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                
                // PURE INERTIA LOGIC for Ascent
                velocity.current.x *= Math.pow(0.995, timeScale);
                velocity.current.z *= Math.pow(0.995, timeScale);

                // NEW: Horizontal Acceleration during Ascent with Speed Limit
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
            // GROUND MOVEMENT (WALK)
            if (isGrounded.current) {
                if (moveDir) {
                    nextVisualState = 'WALK';
                    const currentVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                    const speed = currentVel.length();
                    
                    // Smooth Steering Logic
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
                // AIR DRIFT (when not Dashing/Ascending)
                if (moveDir) {
                    velocity.current.addScaledVector(moveDir, 0.002 * timeScale);
                }
            }
        }

        const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
        const frictionFactor = Math.pow(friction, timeScale);
        
        // --- APPLY VISUAL OVERRIDE FOR SHORT HOP ---
        // FIX: Removed redundant check for EVADE state which was causing a TS error because nextVisualState cannot be EVADE in this scope
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
    
    position.current.add(velocity.current.clone().multiplyScalar(timeScale));
}

// ==========================================
// 2. COLLISION & CONSTRAINTS
// ==========================================

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
        if (!stunned && !isDashing.current && nextVisualState !== 'EVADE') {
             landingFrames.current = getLandingLag(); 
        }
        if (isDashing.current) isDashing.current = false; 
        if (isEvading.current) isEvading.current = false;
    }
    if (velocity.current.y < 0) velocity.current.y = 0;
} else {
    isGrounded.current = false;
}

// ==========================================
// 3. VISUAL & ORIENTATION
// ==========================================

setVisualState(nextVisualState);
setPlayerPos(position.current.clone());
meshRef.current.position.copy(position.current);

// --- ANIMATION LOGIC (Procedural) ---
if (!stunned) {
    // 1. Orientation (Body)
    if (isShooting.current && currentTarget && shootMode.current === 'STOP') {
        // Smooth Turn Logic for Stop Shot
        const dirToTarget = currentTarget.position.clone().sub(meshRef.current.position);
        dirToTarget.y = 0; 
        dirToTarget.normalize();

        if (dirToTarget.lengthSq() > 0.001) {
            const targetQuat = new Quaternion().setFromUnitVectors(new Vector3(0,0,1), dirToTarget);
            
            // Slerp speed adjustment:
            // 12 frames startup. We want to face target by the time we shoot.
            // 0.25 per frame (60fps) is fast enough.
            meshRef.current.quaternion.slerp(targetQuat, 0.25 * timeScale);
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
    meshRef.current.updateMatrixWorld(true);

    // 2. Gun Arm Aiming Logic
    if (gunArmRef.current) {
        if (isShooting.current && currentTarget) {
            const shoulderPos = new Vector3();
            gunArmRef.current.getWorldPosition(shoulderPos);
            const targetPos = currentTarget.position.clone();
            const dirToTarget = targetPos.sub(shoulderPos).normalize();
            const bodyInverseQuat = meshRef.current.quaternion.clone().invert();
            const localDir = dirToTarget.applyQuaternion(bodyInverseQuat);
            const defaultForward = new Vector3(0, -1, 0.2).normalize();
            const targetQuat = new Quaternion().setFromUnitVectors(defaultForward, localDir);
            
            const startup = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES;
            const recovery = shootMode.current === 'STOP' 
                ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
            
            const identity = new Quaternion();

            if (shootTimer.current < startup) {
                const t = shootTimer.current / startup;
                const smoothT = t * t * (3 - 2 * t);
                gunArmRef.current.quaternion.slerpQuaternions(identity, targetQuat, smoothT);
            } else {
                 const t = (shootTimer.current - startup) / recovery;
                 gunArmRef.current.quaternion.slerpQuaternions(targetQuat, identity, t);
            }
        } else {
                // 修改这里！参数对应 (X轴角度, Y轴角度, Z轴角度)
                // 例如：rotation.set(0.2, 0, -0.1) 
                // X=0.2 (向前抬起), Z=-0.1 (向外张开)
                gunArmRef.current.rotation.set(0.35, -0.3, 0);
        }
    }

    // 3. Head Tracking
    if (headRef.current) {
         const t = targets[currentTargetIndex];
         let shouldLook = false;
         if (t) {
             const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
             const dirToT = t.position.clone().sub(position.current).normalize();
             if (fwd.dot(dirToT) > -0.1) { 
                 shouldLook = true;
                const startQuat = headRef.current.quaternion.clone();
                headRef.current.lookAt(t.position);
                const targetQuat = headRef.current.quaternion.clone();
                headRef.current.quaternion.copy(startQuat);
                headRef.current.quaternion.slerp(targetQuat, 0.1);
             }
         }
         if (!shouldLook) {
             const identity = new Quaternion();
             headRef.current.quaternion.slerp(identity, 0.1);
         }
    }

    // 4. Leg Inertia Sway & Animation Logic
    if (legsRef.current) {
         // Determine if falling
         const isFalling = !isGrounded.current && !isDashing.current && nextVisualState !== 'ASCEND' && nextVisualState !== 'EVADE';
         
         // --- PREDICTIVE FALL ANIMATION LOGIC ---
         if (isFalling && !wasFallingRef.current) {
             // Just entered fall state: Calculate predicted time to impact
             const vy = velocity.current.y; // likely negative or 0
             const h = position.current.y;
             const g = GLOBAL_CONFIG.GRAVITY;
             
             // Solve quadratic: 0 = h + vy*t - 0.5*g*t^2
             // 0.5gt^2 - vy*t - h = 0
             // t = (vy + sqrt(vy^2 + 2gh)) / g
             const discriminant = vy * vy + 2 * g * h;
             if (discriminant >= 0 && g > 0) {
                 totalPredictedFallFrames.current = (vy + Math.sqrt(discriminant)) / g;
             } else {
                 totalPredictedFallFrames.current = 60; // Fallback
             }
             currentFallTime.current = 0;
         }
         wasFallingRef.current = isFalling;

         // Calculate Animation Weight (0 to 1)
         let animWeight = 0;
         if (isFalling) {
             currentFallTime.current += timeScale;
             // Protect against zero division or extreme values
             const total = Math.max(totalPredictedFallFrames.current, 1);
             const progress = Math.min(currentFallTime.current / total, 1.0);
             const ratio = GLOBAL_CONFIG.FALL_ANIM_RATIO;
             
             if (progress < ratio) {
                 // Entry Phase: 0 -> 1
                 animWeight = progress / ratio;
             } else {
                 // Exit Phase: 1 -> 0
                 // Normalized progress in exit phase: (progress - ratio) / (1 - ratio)
                 animWeight = 1 - ((progress - ratio) / (1 - ratio));
             }
         } else {
             animWeight = 0;
             currentFallTime.current = 0;
         }

         const invRot = meshRef.current.quaternion.clone().invert();
         const localVel = velocity.current.clone().applyQuaternion(invRot);
         const targetPitch = isFalling ? 0 : localVel.z * 1.5; 
         const targetRoll = isFalling ? 0 : -localVel.x * 1.5;
         legsRef.current.rotation.x = MathUtils.lerp(legsRef.current.rotation.x, targetPitch, 0.1);
         legsRef.current.rotation.z = MathUtils.lerp(legsRef.current.rotation.z, targetRoll, 0.1);

         // Animation Logic: Falling vs Dashing vs Idle
         
         let targetRightThighX = 0;
         let targetLeftThighX = 0;
         let targetRightKneeX = 0.2; // Idle default
         let targetLeftKneeX = 0.2;  // Idle default
         let targetSpread = 0;
         let targetBodyTilt = 0;
         let lerpSpeed = 0.2 * timeScale; // Smoothness factor for the weight application

         if (isDashing.current) {
             targetRightThighX = -2; // Lift Right Leg
             targetRightKneeX = 2.5; // Bend Right Knee (Kick)
             targetLeftThighX = 0.45; // Drag Left Leg
             targetSpread = 0.35;
             targetBodyTilt = 0.75; // Forward Lean
             lerpSpeed = 0.15 * timeScale;
         } else if (isFalling) {
             // Apply weight to falling pose constants
             targetRightThighX = GLOBAL_CONFIG.FALL_LEG_PITCH * animWeight; 
             targetLeftThighX = GLOBAL_CONFIG.FALL_LEG_PITCH * animWeight;
             targetRightKneeX = 0.2 + (GLOBAL_CONFIG.FALL_KNEE_BEND - 0.2) * animWeight; // Interpolate from idle knee (0.2)
             targetLeftKneeX = 0.2 + (GLOBAL_CONFIG.FALL_KNEE_BEND - 0.2) * animWeight;
             targetSpread = GLOBAL_CONFIG.FALL_LEG_SPREAD * animWeight; 
             targetBodyTilt = GLOBAL_CONFIG.FALL_BODY_TILT * animWeight; 
             
             // We want the mesh to follow the weight curve closely, but with slight smoothing
             lerpSpeed = 0.25 * timeScale;
         } else {
             // Idle / Recovery
             lerpSpeed = GLOBAL_CONFIG.FALL_ANIM_EXIT_SPEED * timeScale;
         }
         
         // Apply Rotations
         if (rightLegRef.current) {
             rightLegRef.current.rotation.x = MathUtils.lerp(rightLegRef.current.rotation.x, targetRightThighX, lerpSpeed);
             rightLegRef.current.rotation.z = MathUtils.lerp(rightLegRef.current.rotation.z, 0.05 + targetSpread, lerpSpeed);
         }
         if (leftLegRef.current) {
             leftLegRef.current.rotation.x = MathUtils.lerp(leftLegRef.current.rotation.x, targetLeftThighX, lerpSpeed);
             leftLegRef.current.rotation.z = MathUtils.lerp(leftLegRef.current.rotation.z, -0.05 - targetSpread, lerpSpeed);
         }
         if (rightLowerLegRef.current) {
             rightLowerLegRef.current.rotation.x = MathUtils.lerp(rightLowerLegRef.current.rotation.x, targetRightKneeX, lerpSpeed);
         }
         if (leftLowerLegRef.current) {
             leftLowerLegRef.current.rotation.x = MathUtils.lerp(leftLowerLegRef.current.rotation.x, targetLeftKneeX, lerpSpeed);
         }
         
         // Right Foot Ankle (Dashing override vs Idle)
         const targetRightFootX = isDashing.current ? 0.8 : -0.2; 
         if (rightFootRef.current) {
             rightFootRef.current.rotation.x = MathUtils.lerp(rightFootRef.current.rotation.x, targetRightFootX, lerpSpeed);
         }

         // Upper Body Tilt
         currentUpperBodyTilt.current = MathUtils.lerp(currentUpperBodyTilt.current, targetBodyTilt, lerpSpeed);
         if (upperBodyRef.current) {
            upperBodyRef.current.rotation.x = currentUpperBodyTilt.current;
         }
    }
}

// Re-inserting Action Logic below to ensure full file integrity
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
let armorColor = '#eeeeee';
if (isStunned) armorColor = '#ffffff';
else if (isOverheated) armorColor = '#888888';
else if (visualState === 'LANDING') armorColor = '#aaaaaa';
const engineColor = visualState === 'DASH' ? '#00ffff' : (visualState === 'ASCEND' ? '#ffaa00' : '#333');
const isDashingOrAscending = visualState === 'DASH' || visualState === 'ASCEND';
const isAscending = visualState === 'ASCEND';
const isThrusting = isDashingOrAscending;
const speedLinesRef = useRef<Group>(null);
useFrame(() => {
if (speedLinesRef.current && isEvading.current) {
const vel = velocity.current.clone().normalize();
if (vel.lengthSq() > 0) {
speedLinesRef.current.position.copy(position.current);
speedLinesRef.current.lookAt(position.current.clone().sub(vel));
}
}
})
const chestColor = isStunned ? '#ffffff' : '#2244aa';
const feetColor = '#aa2222';
return (
<group>
<mesh ref={meshRef} castShadow>
<group position={[0, 2.0, 0]}>
{/* WAIST */}
<mesh position={[0, 0, 0]}>
<boxGeometry args={[0.6, 0.5, 0.5]} />
<meshToonMaterial color="#ff0000" />
<Edges threshold={15} color="black" />
</mesh>
{/* CHEST */}
        <group ref={upperBodyRef} position={[0, 0.65, 0]}>
                <mesh>
                    <boxGeometry args={[0.9, 0.7, 0.7]} />
                    <meshToonMaterial color={chestColor} /> 
                    <Edges threshold={15} color="black" />
                </mesh>
                {/* Vents */}
                <group position={[0.28, 0.1, 0.36]}>
                    <mesh>
                        <boxGeometry args={[0.35, 0.25, 0.05]} />
                        <meshToonMaterial color="#ffaa00" />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    {[...Array(5)].map((_, index) => (
                        <mesh key={index} position={[0, 0.12 - index * 0.05, 0.03]}>
                            <boxGeometry args={[0.33, 0.02, 0.02]} />
                            <meshStandardMaterial color="#111" metalness={0.4} roughness={0.3} />
                        </mesh>
                    ))}
                </group>
                <group position={[-0.28, 0.1, 0.36]}>
                    <mesh>
                        <boxGeometry args={[0.35, 0.25, 0.05]} />
                        <meshToonMaterial color="#ffaa00" />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    {[...Array(5)].map((_, index) => (
                        <mesh key={index} position={[0, 0.12 - index * 0.05, 0.03]}>
                            <boxGeometry args={[0.33, 0.02, 0.02]} />
                            <meshStandardMaterial color="#111" metalness={0.4} roughness={0.3} />
                        </mesh>
                    ))}
                </group>

                {/* HEAD */}
                <group ref={headRef} position={[0, 0.6, 0]}>
                    <mesh>
                        <boxGeometry args={[0.4, 0.4, 0.45]} />
                        <meshToonMaterial color={armorColor} />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    <group position={[0, 0.15, 0.23]}>
                        <mesh rotation={[0, 0, 0.4]} position={[0.15, 0.15, 0]}>
                            <boxGeometry args={[0.3, 0.05, 0.02]} />
                            <meshToonMaterial color="#ffaa00" />
                        </mesh>
                        <mesh rotation={[0, 0, -0.4]} position={[-0.15, 0.15, 0]}>
                            <boxGeometry args={[0.3, 0.05, 0.02]} />
                            <meshToonMaterial color="#ffaa00" />
                        </mesh>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[0.08, 0.08, 0.05]} />
                            <meshToonMaterial color="#ff0000" />
                        </mesh>
                    </group>
                    <mesh position={[0, -0.18, 0.23]}>
                            <boxGeometry args={[0.1, 0.08, 0.05]} />
                            <meshToonMaterial color="red" />
                            <Edges threshold={15} color="black" />
                    </mesh>
                    <group position={[0, -0.06, 0.235]}>
                        <group position={[0, 0.015, 0]}>
                            <mesh position={[-0.015, -0.015, 0]} rotation={[0, 0, 0.6]}>
                                    <boxGeometry args={[0.05, 0.015, 0.001]} />
                                    <meshBasicMaterial color="#111" />
                            </mesh>
                            <mesh position={[0.015, -0.015, 0]} rotation={[0, 0, -0.6]}>
                                    <boxGeometry args={[0.04, 0.015, 0.001]} />
                                    <meshBasicMaterial color="#111" />
                            </mesh>
                        </group>
                        <group position={[0, -0.015, 0]}>
                            <mesh position={[-0.015, -0.015, 0]} rotation={[0, 0, 0.6]}>
                                    <boxGeometry args={[0.04, 0.015, 0.001]} />
                                    <meshBasicMaterial color="#111" />
                            </mesh>
                            <mesh position={[0.015, -0.015, 0]} rotation={[0, 0, -0.6]}>
                                    <boxGeometry args={[0.04, 0.015, 0.001]} />
                                    <meshBasicMaterial color="#111" />
                            </mesh>
                        </group>
                    </group>
                    
                    {/* EYES (Shape Geometry) */}
                    <group position={[0, 0.015, 0.228]}>
                        {/* Black Visor Background */}
                        <mesh position={[0, 0.02, -0.001]}>
                            <planeGeometry args={[0.24, 0.08]} />
                            <meshBasicMaterial color="#111" />
                        </mesh>
                        
                        {/* Right Eye */}
                        <mesh>
                            <shapeGeometry args={[eyeShape]} />
                            <meshBasicMaterial color="#00ff00" toneMapped={false} />
                        </mesh>
                        
                        {/* Left Eye (Mirrored) */}
                        <mesh scale={[-1, 1, 1]}>
                            <shapeGeometry args={[eyeShape]} />
                            <meshBasicMaterial color="#00ff00" toneMapped={false} />
                        </mesh>
                    </group>

                </group>

                {/* ARMS */}
                {/* Right Shoulder & Arm (Holding SHIELD) */}
                <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]}>
                    <mesh>
                        <boxGeometry args={[0.5, 0.5, 0.5]} />
                        <meshToonMaterial color={armorColor} />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]}>
                        <mesh>
                            <boxGeometry args={[0.25, 0.6, 0.3]} />
                            <meshToonMaterial color="#444" />
                            <Edges threshold={15} color="black" />
                        </mesh>
                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                <mesh>
                                <boxGeometry args={[0.28, 0.6, 0.35]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                                </mesh>
                                <group position={[0.3, 0, 0.1]} rotation={[0, 0, 0]}>
                                    <mesh position={[0, 0.2, 0]}>
                                        <boxGeometry args={[0.1, 1.4, 0.6]} />
                                        <meshToonMaterial color={armorColor} />
                                        <Edges threshold={15} color="black" />
                                    </mesh>
                                    <mesh position={[0.06, 0.2, 0]}>
                                        <boxGeometry args={[0.05, 1.2, 0.4]} />
                                        <meshToonMaterial color="#ff0000" />
                                    </mesh>
                                </group>
                        </group>
                    </group>
                </group>

                {/* Left Shoulder & Arm (Holding GUN) */}
                <group position={[-0.65, 0.1, 0]} ref={gunArmRef} >
                    <mesh>
                        <boxGeometry args={[0.5, 0.5, 0.5]} />
                        <meshToonMaterial color={armorColor} />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]}>
                        <mesh>
                            <boxGeometry args={[0.25, 0.6, 0.3]} />
                            <meshToonMaterial color="#444" />
                            <Edges threshold={15} color="black" />
                        </mesh>
                        <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                <mesh>
                                <boxGeometry args={[0.28, 0.6, 0.35]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                                </mesh>
                                <group position={[0, -0.2, 0.3]} rotation={[1.5, 0, Math.PI]}>
                                    <mesh position={[0, 0.1, -0.1]} rotation={[0.2, 0, 0]}>
                                        <boxGeometry args={[0.1, 0.2, 0.15]} />
                                        <meshToonMaterial color="#222" />
                                    </mesh>
                                    <mesh position={[0, 0.2, 0.4]}>
                                        <boxGeometry args={[0.15, 0.25, 1.0]} />
                                        <meshToonMaterial color="#444" />
                                        <Edges threshold={15} color="black" />
                                    </mesh>
                                    <mesh position={[0, 0.2, 1.0]} rotation={[Math.PI/2, 0, 0]}>
                                        <cylinderGeometry args={[0.04, 0.04, 0.6]} />
                                        <meshToonMaterial color="#222" />
                                    </mesh>
                                    <mesh position={[0.05, 0.35, 0.2]}>
                                        <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} rotation={[Math.PI/2, 0, 0]}/>
                                        <meshToonMaterial color="#222" />
                                        <mesh position={[0, 0.15, 0]} rotation={[Math.PI/2, 0, 0]}>
                                            <circleGeometry args={[0.06]} />
                                            <meshBasicMaterial color="#00ff00" />
                                        </mesh>
                                    </mesh>
                                    <group position={[0, 0.2, 1.35]} ref={muzzleRef}>
                                        <MuzzleFlash active={showMuzzleFlash} />
                                    </group>
                                </group>
                        </group>
                    </group>
                </group>

                {/* BACKPACK */}
                <group position={[0, 0.2, -0.4]}>
                    <mesh>
                        <boxGeometry args={[0.7, 0.8, 0.4]} />
                        <meshToonMaterial color="#333" />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    <mesh position={[0.3, 0.5, 0]} rotation={[0.2, 0, 0]}>
                            <cylinderGeometry args={[0.04, 0.04, 0.5]} />
                            <meshToonMaterial color="white" />
                            <Edges threshold={15} color="black" />
                    </mesh>
                    <mesh position={[-0.3, 0.5, 0]} rotation={[0.2, 0, 0]}>
                            <cylinderGeometry args={[0.04, 0.04, 0.5]} />
                            <meshToonMaterial color="white" />
                            <Edges threshold={15} color="black" />
                    </mesh>
                    
                    <group position={[0.25, -0.9, -0.4]}>
                            <cylinderGeometry args={[0.1, 0.15, 0.2]} />
                            <meshToonMaterial color="#222" />
                            <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} />
                    </group>
                    <group position={[-0.25, -0.9, -0.4]}>
                            <cylinderGeometry args={[0.1, 0.15, 0.2]} />
                            <meshToonMaterial color="#222" />
                            <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} />
                    </group>
                    
                    {/* BOOST BURST EFFECT */}
                    <BoostBurst triggerTime={dashTriggerTime} />

                </group>
        </group>

        {/* LEGS GROUP */}
        <group ref={legsRef}>
            <group ref={rightLegRef} position={[0.25, -0.3, 0]} rotation={[-0.1, 0, 0.05]}>
                    <mesh position={[0, -0.4, 0]}>
                        <boxGeometry args={[0.35, 0.7, 0.4]} />
                        <meshToonMaterial color={armorColor} />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    <group ref={rightLowerLegRef} position={[0, -0.75, 0]} rotation={[0.3, 0, 0]}>
                        <mesh position={[0, -0.4, 0]}>
                            <boxGeometry args={[0.35, 0.8, 0.45]} />
                            <meshToonMaterial color={armorColor} />
                            <Edges threshold={15} color="black" />
                            <mesh position={[0, 0.2, 0.25]} rotation={[-0.2, 0, 0]}>
                                <boxGeometry args={[0.25, 0.3, 0.1]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                        </mesh>
                        <group ref={rightFootRef} position={[0, -0.8, 0.05]} rotation={[-0.2, 0, 0]}>
                            <mesh position={[0, -0.1, 0.1]}>
                                <boxGeometry args={[0.32, 0.2, 0.7]} />
                                <meshToonMaterial color={feetColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                        </group>
                    </group>
            </group>

            <group ref={leftLegRef} position={[-0.25, -0.3, 0]} rotation={[-0.1, 0, -0.05]}>
                    <mesh position={[0, -0.4, 0]}>
                        <boxGeometry args={[0.35, 0.7, 0.4]} />
                        <meshToonMaterial color={armorColor} />
                        <Edges threshold={15} color="black" />
                    </mesh>
                    <group ref={leftLowerLegRef} position={[0, -0.75, 0]} rotation={[0.2, 0, 0]}>
                        <mesh position={[0, -0.4, 0]}>
                            <boxGeometry args={[0.35, 0.8, 0.45]} />
                            <meshToonMaterial color={armorColor} />
                            <Edges threshold={15} color="black" />
                            <mesh position={[0, 0.2, 0.25]} rotation={[-0.2, 0, 0]}>
                                <boxGeometry args={[0.25, 0.3, 0.1]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                        </mesh>
                        <group position={[0, -0.8, 0.05]} rotation={[-0.1, 0, 0]}>
                            <mesh position={[0, -0.1, 0.1]}>
                                <boxGeometry args={[0.32, 0.2, 0.7]} />
                                <meshToonMaterial color={feetColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                        </group>
                    </group>
            </group>
        </group>
        
      </group>
  </mesh>
  
  <group ref={speedLinesRef}>
      <SpeedLines visible={visualState === 'EVADE'} />
  </group>
</group>
);
}
