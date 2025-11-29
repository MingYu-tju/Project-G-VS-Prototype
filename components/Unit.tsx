import React, { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Group, MathUtils, DoubleSide, Quaternion, Shape, AdditiveBlending, Matrix4, Euler, MeshToonMaterial, Color, BoxGeometry } from 'three';
import { Text, Html, Edges, useGLTF } from '@react-three/drei';
import { Team, GLOBAL_CONFIG, RED_LOCK_DISTANCE, MechPose, DEFAULT_MECH_POSE, RotationVector } from '../types';
import { useGameStore } from '../store';
import { ANIMATION_CLIPS } from '../animations'; 
import { AnimationController, clonePose } from './AnimationSystem';

const FRAME_DURATION = 1 / 60;

// --- VISUALS ---

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
  useFrame(() => {
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
    // Simplified GhostEmitter for Unit to avoid instanced mesh complexity if not needed, 
    // but for consistency with Player.tsx we keep it empty or simple if performance is concern.
    // For now, let's just use a simple conditional render to avoid too many draw calls on NPCs.
    // Or return null if we don't want trails on NPCs yet.
    if (!active) return null;
    return null; 
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
            <meshToonMaterial color={color} />
            <Edges threshold={15} color="black" />
        </mesh>
    );
};

interface UnitProps {
  id: string;
  position: Vector3;
  team: Team;
  name: string;
  isTargeted: boolean;
  lastHitTime: number;
  lastHitDuration?: number; 
  knockbackDir?: Vector3;
  knockbackPower?: number;
  isKnockedDown?: boolean;
}

export const Unit: React.FC<UnitProps> = ({ id, position: initialPos, team, name, isTargeted, lastHitTime, lastHitDuration = GLOBAL_CONFIG.KNOCKBACK_DURATION, knockbackDir, knockbackPower = 1.0, isKnockedDown = false }) => {
  const groupRef = useRef<Group>(null);
  const rotateGroupRef = useRef<Group>(null); // Acts as the "MeshRef" container for rotation
  
  // --- REFS (Aligned with Player.tsx naming) ---
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
  
  const gunArmRef = useRef<Group>(null); // Left Shoulder (Gun Arm)
  const rightArmRef = useRef<Group>(null); // Right Shoulder
  
  const rightForeArmRef = useRef<Group>(null);
  const leftForeArmRef = useRef<Group>(null);
  const leftForearmTwistRef = useRef<Group>(null);
  const rightForearmTwistRef = useRef<Group>(null);
  const leftWristRef = useRef<Group>(null);
  const rightWristRef = useRef<Group>(null);
  
  const gunMeshRef = useRef<Group>(null);
  const shieldRef = useRef<Group>(null);
  const muzzleRef = useRef<Group>(null);
  
  // Physics State
  const position = useRef(initialPos.clone());
  const velocity = useRef(new Vector3(0, 0, 0));
  const isGrounded = useRef(true);
  const landingFrames = useRef(0);
  const boost = useRef(100);

  // Animation State
  const visualLandingFrames = useRef(0);
  const wasFallingRef = useRef(false);
  const currentFallTime = useRef(0);
  const totalPredictedFallFrames = useRef(0);
  const currentHipOffset = useRef(0);
  const currentLegInertiaRot = useRef({ x: 0, y: 0, z: 0 });
  const [dashTriggerTime, setDashTriggerTime] = useState(0); 
  
  // VFX State Vars (mocking Player.tsx vars for compatibility)
  const trailRainbow = useRef(false);

  // Walking Animation
  const walkCycle = useRef(0);
  const currentWalkWeight = useRef(0);

  // AI State
  const aiState = useRef<'IDLE' | 'DASHING' | 'ASCENDING' | 'FALLING' | 'SHOOTING' | 'KNOCKED_DOWN' | 'WAKE_UP'>('IDLE');
  const aiTimer = useRef(0);
  const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
  
  const targetSwitchTimer = useRef(0);
  const localTargetId = useRef<string | null>(null);
  const shootCooldown = useRef(0);
  const shootSequence = useRef(0); 
  
  // Knockdown Logic
  const wakeUpTimer = useRef(0);
  const wasKnockedDownRef = useRef(false);
  const knockdownTriggerTimeRef = useRef(0); // New: Tracks when the current knockdown started

  // Movement Vars
  const dashDirection = useRef(new Vector3(0, 0, 1));
  const currentDashSpeed = useRef(0);
  const moveInput = useRef(new Vector3(0, 0, 0));

  // Visual State
  const [isThrusting, setIsThrusting] = useState(false);
  const [isAscendingState, setIsAscendingState] = useState(false); 
  const [isStunned, setIsStunned] = useState(false);
  const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
  
  // Compatibility vars for Player.tsx structure
  const isTrailActive = isThrusting; 
  const isAscending = isAscendingState;
  
  // Animator
  const animator = useMemo(() => new AnimationController(), []);
  // Head Tracking smoothing
  const headLookQuat = useRef(new Quaternion());
  
  const spawnProjectile = useGameStore(state => state.spawnProjectile);
  const hitStop = useGameStore(state => state.hitStop); 
  const areNPCsPaused = useGameStore(state => state.areNPCsPaused); 
  const clockRef = useRef(0);

  // --- HELPER: Apply Pose to Refs (Copied from Player.tsx) ---
  const applyPoseToModel = (pose: MechPose, hipOffset: number, legContainerRot: {x:number, y:number, z:number}) => {
       const setRot = (ref: React.MutableRefObject<Group | null>, rot: RotationVector) => {
           if (ref.current) {
               ref.current.rotation.set(rot.x, rot.y, rot.z);
           }
       };

       setRot(torsoRef, pose.TORSO);
       setRot(upperBodyRef, pose.CHEST);
       // Head handled separately for LookAt
       
       setRot(gunArmRef, pose.LEFT_ARM.SHOULDER); 
       setRot(leftForeArmRef, pose.LEFT_ARM.ELBOW);
       if (leftForearmTwistRef.current) setRot(leftForearmTwistRef, pose.LEFT_ARM.FOREARM);
       if (leftWristRef.current) setRot(leftWristRef, pose.LEFT_ARM.WRIST);

       setRot(rightArmRef, pose.RIGHT_ARM.SHOULDER);
       setRot(rightForeArmRef, pose.RIGHT_ARM.ELBOW);
       if (rightForearmTwistRef.current) setRot(rightForearmTwistRef, pose.RIGHT_ARM.FOREARM);
       if (rightWristRef.current) setRot(rightWristRef, pose.RIGHT_ARM.WRIST);

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
    if (!groupRef.current || !rotateGroupRef.current) return;

    if (hitStop > 0) return;

    clockRef.current += delta;
    const timeScale = delta * 60;

    const freshState = useGameStore.getState();
    const freshTargets = freshState.targets;
    const freshPlayerPos = freshState.playerPos;

    const getTargetPos = (): Vector3 | null => {
        if (localTargetId.current === 'player') return freshPlayerPos.clone();
        const t = freshTargets.find(t => t.id === localTargetId.current);
        return t ? t.position.clone() : null;
    };

    const currentlyAscending = aiState.current === 'ASCENDING';
    if (currentlyAscending !== isAscendingState) {
        setIsAscendingState(currentlyAscending);
    }

    const now = Date.now();
    const stunned = now - lastHitTime < lastHitDuration;
    setIsStunned(stunned);

    // --- HIT REACTION & KNOCKDOWN LOGIC ---
    if (isKnockedDown && !wasKnockedDownRef.current) {
        aiState.current = 'KNOCKED_DOWN';
        velocity.current.y = GLOBAL_CONFIG.KNOCKDOWN.INIT_Y_VELOCITY;
        // Record when this knockdown started so we can distinguish the launch hit from subsequent juggles
        knockdownTriggerTimeRef.current = lastHitTime; 
        
        if (knockbackDir) {
            const horiz = knockbackDir.clone();
            horiz.y = 0; 
            if(horiz.lengthSq() > 0) horiz.normalize();
            velocity.current.x = horiz.x * GLOBAL_CONFIG.KNOCKDOWN.INIT_Y_VELOCITY * 0.5;
            velocity.current.z = horiz.z * GLOBAL_CONFIG.KNOCKDOWN.INIT_Y_VELOCITY * 0.5;
        }
        animator.play(ANIMATION_CLIPS.KNOCKDOWN, 0.1);
        setIsThrusting(false);
    }
    wasKnockedDownRef.current = isKnockedDown;

    // --- STATE MACHINE (PHYSICS) ---
    if (aiState.current === 'KNOCKED_DOWN') {
        // JUGGLE LOGIC:
        const isJuggled = stunned && (lastHitTime > knockdownTriggerTimeRef.current);

        if (isJuggled) {
            // --- AIR JUGGLE (Suspended) ---
            velocity.current.set(0, 0, 0); 
            
            // Apply horizontal force if knocked back (Hit Impulse)
            if (knockbackDir) {
                 const force = GLOBAL_CONFIG.KNOCKBACK_SPEED * knockbackPower * 0.5; 
                 const horizontalDir = knockbackDir.clone();
                 horizontalDir.y = 0; 
                 if (horizontalDir.lengthSq() > 0) horizontalDir.normalize();
                 position.current.add(horizontalDir.multiplyScalar(force * timeScale));
            }
            
            animator.play(ANIMATION_CLIPS.IDLE, 0.1);
        } else {
            // --- NORMAL FALLING (Launch or Freefall) ---
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
        if (wakeUpTimer.current < 500) {
             animator.play(ANIMATION_CLIPS.WAKEUP, 0.5);
        } else {
             animator.play(ANIMATION_CLIPS.KNOCKDOWN, 0.1); 
        }
        if (wakeUpTimer.current <= 0) {
            aiState.current = 'IDLE';
            animator.play(ANIMATION_CLIPS.IDLE, 0.5);
        }
    }
    else if (stunned) {
        // Normal ground stun
        setIsThrusting(false);
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
        // --- NORMAL AI BEHAVIOR ---
        targetSwitchTimer.current -= delta; 
        if (targetSwitchTimer.current <= 0) {
            targetSwitchTimer.current = MathUtils.randFloat(GLOBAL_CONFIG.AI_TARGET_SWITCH_MIN, GLOBAL_CONFIG.AI_TARGET_SWITCH_MAX); 
            
            const potentialTargets = [];
            if (team === Team.RED) {
                potentialTargets.push('player');
                freshTargets.forEach(t => { if (t.team === Team.BLUE) potentialTargets.push(t.id); });
            } else {
                freshTargets.forEach(t => { if (t.team === Team.RED) potentialTargets.push(t.id); });
            }
            if (potentialTargets.length > 0) {
                localTargetId.current = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                useGameStore.getState().updateUnitTarget(id, localTargetId.current);
            }
        }

        if (areNPCsPaused) {
            if (aiState.current === 'DASHING' || aiState.current === 'ASCENDING' || aiState.current === 'SHOOTING') {
                 aiState.current = 'IDLE';
                 setIsThrusting(false);
                 moveInput.current.set(0,0,0);
                 dashDirection.current.set(0,0,0);
            }
        } else {
            shootCooldown.current -= delta;
            
            if (landingFrames.current <= 0 && aiState.current !== 'SHOOTING' && shootCooldown.current <= 0) {
                if (Math.random() < GLOBAL_CONFIG.AI_SHOOT_PROBABILITY) { 
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
                     shootSequence.current = 0;
                     const currentRecovery = shootMode.current === 'STOP' ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                     const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;
                     aiTimer.current = (totalFrames / 60) * 1000; 
                     shootCooldown.current = MathUtils.randFloat(GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MIN, GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MAX); 
                }
            }

            aiTimer.current -= delta * 1000; 

            if (aiState.current === 'SHOOTING' && aiTimer.current <= 0) {
                aiState.current = 'IDLE';
                aiTimer.current = 500; 
                shootSequence.current = 0;
            }

            if (aiTimer.current <= 0 && landingFrames.current <= 0 && aiState.current !== 'SHOOTING') {
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
                  if (boost.current > 20) {
                      aiState.current = 'DASHING';
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
                  } else {
                      aiState.current = 'IDLE'; 
                      aiTimer.current = 500;
                  }
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
                const totalDurationMs = (totalFrames / 60) * 1000;
                const elapsedMs = totalDurationMs - aiTimer.current;
                const elapsedFrames = (elapsedMs / 1000) * 60;

                if (elapsedFrames >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && shootSequence.current === 0) {
                    shootSequence.current = 1;
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

            if (aiState.current !== 'SHOOTING') {
                 const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                 const frictionFactor = Math.pow(friction, timeScale);
                 velocity.current.x *= frictionFactor;
                 velocity.current.z *= frictionFactor;
                 
                 if (aiState.current !== 'DASHING') {
                     velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
                 }
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

    useGameStore.getState().updateTargetPosition(id, position.current.clone());

    // 3. VISUAL UPDATE
    groupRef.current.position.copy(position.current);

    // Rotation Logic (Only if not knockdown)
    if (aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        const isWalking = isGrounded.current && velocity.current.lengthSq() > 0.01 && aiState.current !== 'DASHING' && aiState.current !== 'SHOOTING';

        if (aiState.current === 'SHOOTING') {
            const tPos = getTargetPos();
            if (tPos && shootMode.current === 'STOP') {
                 rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
        }
        } else if (aiState.current === 'DASHING') {
            const lookPos = position.current.clone().add(dashDirection.current);
            rotateGroupRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
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

    // --- ANIMATION SYSTEM ---
    
    // 1. Select Base Clip
    if (aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        const isIdle = isGrounded.current && aiState.current === 'IDLE' && landingFrames.current <= 0;
        let activeClip = isIdle ? ANIMATION_CLIPS.IDLE : ANIMATION_CLIPS.NEUTRAL;
        
        if (aiState.current === 'DASHING') activeClip = ANIMATION_CLIPS.DASH_GUN;
        
        animator.play(activeClip, 0.2);
    }
    
    animator.update(delta);
    const animatedPose = animator.getCurrentPose();

    // 2. Procedural Overrides
    
    const lerpSpeedFall = 0.25 * timeScale;
    const smoothRot = (currentVal: number, targetVal: number) => MathUtils.lerp(currentVal, targetVal, lerpSpeedFall);

    if (!isKnockedDown && !stunned && aiState.current !== 'KNOCKED_DOWN' && aiState.current !== 'WAKE_UP') {
        
        // A. FALLING
        const isFalling = !isGrounded.current && aiState.current !== 'DASHING' && aiState.current !== 'ASCENDING';
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

        // B. LANDING
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

        // C. WALKING
        const isWalking = isGrounded.current && velocity.current.lengthSq() > 0.01 && aiState.current !== 'DASHING' && aiState.current !== 'SHOOTING';
        const targetWalkWeight = isWalking ? 1.0 : 0.0;
        currentWalkWeight.current = MathUtils.lerp(currentWalkWeight.current, targetWalkWeight, 0.15 * timeScale);

        if (currentWalkWeight.current > 0.01) {
            if (isWalking) {
                const speedVal = new Vector3(velocity.current.x, 0, velocity.current.z).length();
                if (speedVal > 0.05) {
                    walkCycle.current += delta * 9.5;
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
        }

        // D. AIMING
        if (aiState.current === 'SHOOTING' && gunArmRef.current) {
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
                 const totalFrames = startup + recovery;
                 const totalDurationMs = (totalFrames / 60) * 1000;
                 const elapsedMs = totalDurationMs - aiTimer.current;
                 const elapsedFrames = (elapsedMs / 1000) * 60;

                 let aimWeight = 0;
                 if (elapsedFrames < startup) {
                     if (elapsedFrames < aiming) {
                         const t = elapsedFrames / aiming;
                         aimWeight = 1 - Math.pow(1 - t, 3);
                     } else {
                         aimWeight = 1.0;
                     }
                 } else {
                     const t = (elapsedFrames - startup) / recovery;
                     aimWeight = 1.0 - t;
                 }
                 
                 animatedPose.LEFT_ARM.SHOULDER.x = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.x, aimEuler.x, aimWeight);
                 animatedPose.LEFT_ARM.SHOULDER.y = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.y, aimEuler.y, aimWeight);
                 animatedPose.LEFT_ARM.SHOULDER.z = MathUtils.lerp(animatedPose.LEFT_ARM.SHOULDER.z, aimEuler.z, aimWeight);
             }
        }
    }

    // 3. Apply Final Pose
    let targetInertiaX = 0;
    let targetInertiaZ = 0;
    if (!stunned && aiState.current !== 'KNOCKED_DOWN') {
        const allowInertia = false; 
        if (allowInertia) { 
             const invRot = rotateGroupRef.current.quaternion.clone().invert();
             const localVel = velocity.current.clone().applyQuaternion(invRot);
             targetInertiaX = localVel.z * 1.0; 
             targetInertiaZ = -localVel.x * 1.0;
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
    if (visualLandingFrames.current > 0) {
        currentHipOffset.current = targetHipOffset;
    } else {
        currentHipOffset.current = MathUtils.lerp(currentHipOffset.current, 0, 0.2 * timeScale);
    }

    applyPoseToModel(animatedPose, currentHipOffset.current, currentLegInertiaRot.current);

    // E. HEAD TRACKING
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

  // --- COLORS ---
  const armorColor = team === Team.RED ? '#ff8888' : '#eeeeee';
  const chestColor = team === Team.RED ? '#880000' : '#2244aa';
  const feetColor = team === Team.RED ? '#333333' : '#aa2222';
  const activeWeapon = 'GUN'; // Force gun for units for now
  const waistColor = '#333333';

  return (
    <group ref={groupRef}>
      <group ref={rotateGroupRef}>
         <group position={[0, 2.0, 0]}>
            {/* TORSO GROUP (Waist Logic + Visuals) */}
            <group ref={torsoRef}>
                {/* --- WAIST VISUALS (New Trapezoid Armor) --- */}
                <group position={[0, 0.26, -0.043]} rotation={[0, 0, 0]} scale={[0.8, 0.7, 0.9]}>
                    <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                </group>
                
                {/* Waist_2 (Lower Waist) */}
                <group position={[0, 0.021, -0.044]} rotation={[-3.143, 0, 0]} scale={[0.8, 0.9, 0.9]}>
                    <Trapezoid args={[0.75, 0.3, 0.35, 1.15, 1.35]} color={waistColor} />
                </group>
                {/* --- WAIST / HIP VISUALS (New Detailed Hip) --- */}
                <group name="Hip">
                    {/* HIP_1 (Center Block) */}
                    <group position={[0, -0.296, 0]} scale={[0.4, 1, 1]}>
                        <mesh><boxGeometry args={[0.5, 0.5, 0.5]} /><meshToonMaterial color="#444444" /><Edges threshold={15} color="black" /></mesh>
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
                        <mesh><boxGeometry args={[0.2, 0.05, 0.15]} /><meshToonMaterial color="#ff0000" /><Edges threshold={15} color="black" /></mesh>
                    </group>

                    {/* HIP_5 (Red Trim Bottom) */}
                    <group position={[0, -0.207, 0.408]} rotation={[0.6, 0, 0]} scale={[0.9, 0.4, 0.8]}>
                        <mesh><boxGeometry args={[0.2, 0.05, 0.2]} /><meshToonMaterial color="#ff0000" /><Edges threshold={15} color="black" /></mesh>
                    </group>

                    {/* HIP_6 (Front Skirt Left) */}
                    <group position={[0.037, 0, 0.077]} rotation={[0, -0.1, -0.1]} scale={[0.9, 1, 1]}>
                        <group position={[-0.303, -0.266, 0.253]} rotation={[0, 0, -1.6]}>
                             <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                        </group>
                        <group position={[-0.299, -0.096, 0.253]}>
                             <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[-0.298, -0.215, 0.32]} rotation={[1.571, 0, 0]}>
                             {/* Prism: Cylinder with 4 segments rotated 45 deg */}
                             <mesh rotation={[0, Math.PI/4, 0]}>
                                <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                <meshToonMaterial color="#ffaa00" />
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>
                    </group>

                    {/* HIP_7 (Front Skirt Right) */}
                    <group position={[-0.037, 0, 0.077]} rotation={[0, 0.1, 0.1]} scale={[0.9, 1, 1]}>
                        <group position={[0.303, -0.266, 0.253]} rotation={[0, 0, 1.6]}>
                             <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                        </group>
                        <group position={[0.299, -0.096, 0.253]}>
                             <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[0.298, -0.215, 0.32]} rotation={[1.571, 0, 0]}>
                             <mesh rotation={[0, Math.PI/4, 0]}>
                                <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                <meshToonMaterial color="#ffaa00" />
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>
                    </group>

                    {/* HIP_8 (Rear Skirt Left) */}
                    <group position={[-0.037, 0, 0.121]} rotation={[0, -0.1, 0.1]} scale={[0.9, 1, 1]}>
                        <group position={[0.303, -0.266, -0.418]} rotation={[0, 0, 1.6]}>
                             <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                        </group>
                        <group position={[0.299, -0.096, -0.418]}>
                             <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[0.298, -0.215, -0.475]} rotation={[-1.571, 0, 0]}>
                             <mesh rotation={[0, Math.PI/4, 0]}>
                                <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                <meshToonMaterial color="#ffaa00" />
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>
                    </group>

                    {/* HIP_9 (Rear Skirt Right) */}
                    <group position={[0.037, 0, 0.121]} rotation={[0, 0.1, -0.1]} scale={[0.9, 1, 1]}>
                        <group position={[-0.303, -0.266, -0.418]} rotation={[0, 0, -1.6]}>
                             <Trapezoid args={[0.3, 0.35, 0.1, 1.5, 1]} color={armorColor} />
                        </group>
                        <group position={[-0.299, -0.096, -0.418]}>
                             <mesh><boxGeometry args={[0.35, 0.1, 0.1]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[-0.298, -0.215, -0.475]} rotation={[-1.571, 0, 0]}>
                             <mesh rotation={[0, Math.PI/4, 0]}>
                                <cylinderGeometry args={[0.15, 0.2, 0.1, 4]} />
                                <meshToonMaterial color="#ffaa00" />
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>
                    </group>

                    {/* HIP_10 (Back Butt Plate) */}
                    <group position={[0, 0, -1.522]}>
                        <group position={[0, -0.211, 1.2]}>
                             <mesh><boxGeometry args={[0.2, 0.35, 0.2]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[0, -0.369, 1.2]} rotation={[-1.571, 0, 0]}>
                             <Trapezoid args={[0.2, 0.2, 0.4, 1, 0.25]} color={armorColor} />
                        </group>
                    </group>

                    {/* HIP_11 (Side Skirt Left) */}
                    <group scale={[0.9, 1, 1]}>
                        <group position={[0.48, -0.178, 0]} rotation={[0, 0, 0.3]}>
                             <mesh><boxGeometry args={[0.1, 0.4, 0.4]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[0.506, -0.088, 0]} rotation={[0, 0, 0.3]}>
                             <mesh><boxGeometry args={[0.1, 0.3, 0.25]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                    </group>

                    {/* HIP_12 (Side Skirt Right) */}
                    <group scale={[0.9, 1, 1]}>
                        <group position={[-0.48, -0.178, 0]} rotation={[0, 0, -0.3]}>
                             <mesh><boxGeometry args={[0.1, 0.4, 0.4]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                        <group position={[-0.506, -0.088, 0]} rotation={[0, 0, -0.3]}>
                             <mesh><boxGeometry args={[0.1, 0.3, 0.25]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                        </group>
                    </group>
                </group>

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
                                <meshToonMaterial color={chestColor} />
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>

                        {/* CHEST_2 */}
                        <group position={[0, 0.321, -0.016]} rotation={[0, 0, 0]} scale={[0.8, 0.1, 0.7]}>
                             <mesh>
                                <boxGeometry args={[0.5, 0.5, 0.5]} />
                                <meshToonMaterial color="#ffaa00" />
                                <Edges threshold={15} color="black" />
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
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>

                        {/* vent_r */}
                        <group position={[-0.225, -0.091, 0.43]} rotation={[0.315, 0, 0]} scale={[0.7, 0.8, 1.1]}>
                             <mesh>
                                <boxGeometry args={[0.35, 0.25, 0.05]} />
                                <meshToonMaterial color="#ffaa00" />
                                <Edges threshold={15} color="black" />
                             </mesh>
                        </group>
                    </group>

                    {/* HEAD */}
                    <group ref={headRef}>
                        <MechaHead mainColor={armorColor} />
                    </group>

                    {/* RIGHT ARM */}
                    <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                        <group position={[0.034, 0, 0.011]}>
                            {/* R Shoulder_1 */}
                             <group position={[0.013, 0.032, -0.143]} scale={[1, 0.7, 0.8]}>
                                <mesh>
                                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                                    <meshToonMaterial color={armorColor} />
                                    <Edges threshold={15} color="black" />
                                </mesh>
                             </group>
                        </group>

                        <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                        <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]} ref={rightForeArmRef}>
                            <mesh><boxGeometry args={[0.25, 0.6, 0.3]} /><meshToonMaterial color="#444" /><Edges threshold={15} color="black" /></mesh>
                            <group ref={rightForearmTwistRef}>
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                    <mesh>
                                        <boxGeometry args={[0.28, 0.6, 0.35]} />
                                        <meshToonMaterial color={armorColor} />
                                        <Edges threshold={15} color="black" />
                                    </mesh>
                                    <group ref={rightWristRef} position={[0, -0.35, 0]}>
                                        <mesh>
                                            <boxGeometry args={[0.25, 0.3, 0.25]} />
                                            <meshToonMaterial color="#222" />
                                        </mesh>
                                    </group>
                                </group>
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={shieldRef}>
                                        <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                            <mesh position={[0, 0.2, 0]}>
                                                <boxGeometry args={[0.1, 1.7, 0.7]} />
                                                <meshToonMaterial color={armorColor} />
                                                <Edges threshold={15} color="black" />
                                            </mesh>
                                            <mesh position={[0.06, 0, 0]}>
                                                <boxGeometry args={[0.1, 1.55, 0.5]} />
                                                <meshToonMaterial color={waistColor} />
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
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                             </mesh>
                         </group>

                        <GhostEmitter active={isTrailActive} size={[0.5, 0.5, 0.5]} rainbow={trailRainbow.current} />
                        <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]} ref={leftForeArmRef}>
                            <mesh>
                                <boxGeometry args={[0.25, 0.6, 0.3]} />
                                <meshToonMaterial color="#444" />
                                <Edges threshold={15} color="black" />
                            </mesh>
                            <group ref={leftForearmTwistRef}>
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                    <mesh><boxGeometry args={[0.28, 0.6, 0.35]} /><meshToonMaterial color={armorColor} /><Edges threshold={15} color="black" /></mesh>
                                    <group ref={leftWristRef} position={[0, -0.35, 0]}>
                                        <mesh><boxGeometry args={[0.25, 0.3, 0.25]} /><meshToonMaterial color="#222" /></mesh>
                                        
                                        {/* SABER MODEL */}
                                        <group visible={activeWeapon === 'SABER'} position={[0, 0, 0.1]} rotation={[Math.PI/1.8, 0, 0]}>
                                            <group visible={activeWeapon === 'SABER'}>
                                                <mesh position={[0, -0.25, 0]}>
                                                    <cylinderGeometry args={[0.035, 0.04, 0.7, 8]} />
                                                    <meshToonMaterial color="white" />
                                                    <Edges threshold={15} color="#999" />
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
                    <group position={[0, -0.056, -0.365]}>
                        <mesh><boxGeometry args={[0.7, 0.8, 0.3]} /><meshToonMaterial color="#333" /><Edges threshold={15} color="black" /></mesh>
                        <mesh position={[0.324, 0.5, 0]} rotation={[0.2, 0, -0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><meshToonMaterial color="white" /><Edges threshold={15} color="black" /></mesh>
                        <mesh position={[-0.324, 0.5, 0]} rotation={[0.2, 0, 0.2]}><cylinderGeometry args={[0.04, 0.04, 0.65]} /><meshToonMaterial color="white" /><Edges threshold={15} color="black" /></mesh>
                        <group position={[0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                        <group position={[-0.25, -0.9, -0.4]}><cylinderGeometry args={[0.1, 0.15, 0.2]} /><meshToonMaterial color="#222" /><ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} /></group>
                        <BoostBurst triggerTime={dashTriggerTime} />
                    </group>
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
                            </mesh>
                            <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}>
                                <boxGeometry args={[0.25, 0.3, 0.1]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                            <group ref={rightFootRef} position={[0, -0.8, 0.05]} rotation={[-0.2, 0, 0]}>
                                <mesh position={[0, -0.1, 0.1]}>
                                    <boxGeometry args={[0.32, 0.2, 0.7]} />
                                    <meshToonMaterial color={feetColor} />
                                    <Edges threshold={15} color="black" />
                                </mesh>
                                <GhostEmitter active={isThrusting} size={[0.32, 0.2, 0.7]} offset={[0, -0.1, 0.1]} rainbow={trailRainbow.current} />
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
                            </mesh>
                            <mesh position={[0, -0.2, 0.25]} rotation={[-0.2, 0, 0]}>
                                <boxGeometry args={[0.25, 0.3, 0.1]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                            <group ref={leftFootRef} position={[0, -0.8, 0.05]} rotation={[-0.1, 0, 0]}>
                                <mesh position={[0, -0.1, 0.1]}>
                                    <boxGeometry args={[0.32, 0.2, 0.7]} />
                                    <meshToonMaterial color={feetColor} />
                                    <Edges threshold={15} color="black" />
                                </mesh>
                                <GhostEmitter active={isThrusting} size={[0.32, 0.2, 0.7]} offset={[0, -0.1, 0.1]} rainbow={trailRainbow.current} />
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
        style={{ 
            pointerEvents: 'none', 
            transition: 'all 0.2s',
            opacity: isTargeted ? 1 : 0.6
        }}
      >
        <div className={`text-xs md:text-sm font-bold px-1.5 md:px-3 py-0.5 rounded border whitespace-nowrap ${
              isTargeted ? 'border-yellow-400 text-yellow-400 bg-black/60' : 'border-gray-500 text-gray-300 bg-black/40'
            }`}>
              {name}
        </div>
      </Html>
    </group>
  );
};