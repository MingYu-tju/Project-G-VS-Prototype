
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Group, MathUtils, DoubleSide, Quaternion, Shape, AdditiveBlending, Matrix4, Euler, MeshToonMaterial, Color } from 'three';
import { Text, Html, Edges, useGLTF } from '@react-three/drei';
import { Team, GLOBAL_CONFIG, RED_LOCK_DISTANCE } from '../types';
import { useGameStore } from '../store';
import { IDLE_POSE, DASH_POSE_GUN } from '../animations';

const FRAME_DURATION = 1 / 60;

// --- VISUALS ---

// Copied from Player.tsx for consistency
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

// --- NEW: MECHA HEAD COMPONENT (GLB Loader via gltfjsx structure) ---
// Using absolute path to models to ensure correct resolution on custom domain
const MODEL_PATH = '/models/head.glb';
useGLTF.preload(MODEL_PATH);

const MechaHead: React.FC<{ mainColor: string }> = ({ mainColor }) => {
    const { nodes } = useGLTF(MODEL_PATH) as any;
    
    // Common properties for all head meshes - Removed shadows for performance
    const meshProps = {};

    return (
        <group position={[-0.08, 0.4, 0.1]} >
            <group dispose={null}>
                <group position={[-0, -0.28, -0]} scale={0.02}>
                    <group rotation={[Math.PI / 2, 0, 0]}>
                    
                    {/* Iterate through all head polygons and apply style */}
                    {/* Polygon_35 is the main helmet part - Removed Edges per user request */}
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

interface UnitProps {
  id: string;
  position: Vector3;
  team: Team;
  name: string;
  isTargeted: boolean;
  lastHitTime: number;
  knockbackDir?: Vector3;
}

export const Unit: React.FC<UnitProps> = ({ id, position: initialPos, team, name, isTargeted, lastHitTime, knockbackDir }) => {
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
  const rightForeArmRef = useRef<Group>(null); // NEW: Right Forearm
  const leftForeArmRef = useRef<Group>(null); // NEW: Left Forearm
  const shieldRef = useRef<Group>(null); // NEW: Independent Shield
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
  const currentUpperBodyTilt = useRef(0);
  const [dashTriggerTime, setDashTriggerTime] = useState(0); 

  // Walking Animation
  const walkCycle = useRef(0);

  // AI State
  const aiState = useRef<'IDLE' | 'DASHING' | 'ASCENDING' | 'FALLING' | 'SHOOTING'>('IDLE');
  const aiTimer = useRef(0);
  const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
  
  const targetSwitchTimer = useRef(0);
  const localTargetId = useRef<string | null>(null);
  const shootCooldown = useRef(0);
  const shootSequence = useRef(0); 

  // Movement Vars
  const dashDirection = useRef(new Vector3(0, 0, 1));
  const currentDashSpeed = useRef(0);
  const moveInput = useRef(new Vector3(0, 0, 0));

  // Visual State
  const [isThrusting, setIsThrusting] = useState(false);
  const [isAscendingState, setIsAscendingState] = useState(false); 
  const [isStunned, setIsStunned] = useState(false);
  const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
  
  const spawnProjectile = useGameStore(state => state.spawnProjectile);
  const clockRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current || !rotateGroupRef.current) return;

    clockRef.current += delta;
    const timeScale = delta * 60;

    const currentlyAscending = aiState.current === 'ASCENDING';
    if (currentlyAscending !== isAscendingState) {
        setIsAscendingState(currentlyAscending);
    }

    const now = Date.now();
    const stunned = now - lastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;
    setIsStunned(stunned);

    // --- INTERRUPT ANIMATION ---
    if (aiState.current === 'DASHING' || aiState.current === 'SHOOTING' || stunned) {
        visualLandingFrames.current = 0;
    }

    if (stunned) {
        setIsThrusting(false);
        velocity.current.set(0, 0, 0);
        
        // 1. Apply Knockback Physics
        if (knockbackDir) {
             position.current.add(knockbackDir.clone().multiplyScalar(GLOBAL_CONFIG.KNOCKBACK_SPEED * timeScale));
        }
        velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
        position.current.y += velocity.current.y * timeScale;
        if (position.current.y <= 0) {
            position.current.y = 0;
            velocity.current.y = 0;
        }

        // 2. Specific Stun Animation (Overrides Procedural)
        // Forced Backward Tilt + Head Recoil
        const progress = (now - lastHitTime) / GLOBAL_CONFIG.KNOCKBACK_DURATION;
        // Curve: Fast recoil (0-0.2), Slow recovery (0.2-1.0)
        let animVal = 0;
        if (progress < 0.2) {
            animVal = progress / 0.2;
        } else {
            animVal = 1 - (progress - 0.2) / 0.8;
        }
        
        if (upperBodyRef.current) {
            // Tilt back violently (negative X) and slightly diagonally based on hit dir if possible
            // Simplification: Just back and slight roll
            upperBodyRef.current.rotation.x = MathUtils.lerp(0, -0.8, animVal);
            upperBodyRef.current.rotation.z = MathUtils.lerp(0, 0.2, animVal); // Slight twist
        }
        if (headRef.current) {
            // Head snaps back further
            headRef.current.rotation.x = MathUtils.lerp(0, -0.5, animVal);
        }
        
        // Reset limbs to neutral hanging during stun
        if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0.2);
        if (gunArmRef.current) gunArmRef.current.rotation.set(0, 0, -0.2);
        if (legsRef.current) {
             legsRef.current.rotation.set(0,0,0);
             if (rightLegRef.current) rightLegRef.current.rotation.set(0,0,0);
             if (leftLegRef.current) leftLegRef.current.rotation.set(0,0,0);
        }

        // Boundary Check
        const maxRadius = GLOBAL_CONFIG.BOUNDARY_LIMIT - 1.0;
        const currentRadiusSq = position.current.x * position.current.x + position.current.z * position.current.z;
        if (currentRadiusSq > maxRadius * maxRadius) {
            const angle = Math.atan2(position.current.z, position.current.x);
            position.current.x = Math.cos(angle) * maxRadius;
            position.current.z = Math.sin(angle) * maxRadius;
        }

        // UPDATE POSITION AND TARGET STORE (CRITICAL FOR CAMERA TRACKING)
        groupRef.current.position.copy(position.current);
        useGameStore.getState().updateTargetPosition(id, position.current.clone());
        
        return; // Skip AI Logic
    }

    const freshState = useGameStore.getState();
    const freshTargets = freshState.targets;
    const freshPlayerPos = freshState.playerPos;

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

    const getTargetPos = (): Vector3 | null => {
        if (localTargetId.current === 'player') return freshPlayerPos.clone();
        const t = freshTargets.find(t => t.id === localTargetId.current);
        return t ? t.position.clone() : null;
    };

    shootCooldown.current -= delta;
    
    // AI LOGIC - Simple State Machine
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
             
             const currentRecovery = shootMode.current === 'STOP' 
                ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
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
      // STATE TRANSITION LOGIC
      // Important: Reset physics inputs when leaving a movement state
      
      if (aiState.current === 'DASHING') {
          // Reset input to stop infinite air drift
          moveInput.current.set(0, 0, 0); 
          
          if (Math.random() > 0.3) {
              aiState.current = 'ASCENDING';
              aiTimer.current = MathUtils.randInt(400, 800); 
          } else {
              aiState.current = 'FALLING';
              aiTimer.current = MathUtils.randInt(500, 1000);
          }
      } else if (aiState.current === 'ASCENDING') {
          moveInput.current.set(0, 0, 0); // Reset
          aiState.current = 'FALLING';
          aiTimer.current = MathUtils.randInt(1000, 2000);
      } else {
          if (boost.current > 20) {
              aiState.current = 'DASHING';
              setDashTriggerTime(Date.now()); // TRIGGER BOOST FX
              
              const biasCenter = new Vector3(0,0,0).sub(position.current).normalize().multiplyScalar(0.5);
              const randDir = new Vector3((Math.random()-0.5), 0, (Math.random()-0.5)).normalize();
              const dir = randDir.add(biasCenter).normalize();
              
              dashDirection.current.copy(dir);
              currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
              moveInput.current = dir;
              
              velocity.current.x = dir.x * GLOBAL_CONFIG.DASH_BURST_SPEED;
              velocity.current.z = dir.z * GLOBAL_CONFIG.DASH_BURST_SPEED;
              
              // Sync Ground Hop with Player: Pop up if grounded
              if (isGrounded.current || position.current.y < 1.5) {
                  velocity.current.y = GLOBAL_CONFIG.DASH_GROUND_HOP_VELOCITY;
                  isGrounded.current = false;
              } else {
                  velocity.current.y = 0;
              }
              
              boost.current -= 15;
              aiTimer.current = MathUtils.randInt(300, 600); 
          } else {
              aiState.current = 'IDLE'; 
              aiTimer.current = 500;
          }
      }
    }

    if (isGrounded.current && landingFrames.current <= 0) {
        boost.current = Math.min(100, boost.current + 1 * timeScale);
    }

    // VISUAL LANDING FRAMES DECAY
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
            
            if (shootMode.current === 'STOP') {
                 velocity.current.set(0,0,0);
            } else {
                 const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                 const frictionFactor = Math.pow(friction, timeScale);
                 velocity.current.x *= frictionFactor;
                 velocity.current.z *= frictionFactor;
                 velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
            }
            
            const currentRecovery = shootMode.current === 'STOP' 
                ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
            const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;

            const totalDurationMs = (totalFrames / 60) * 1000;
            const elapsedMs = totalDurationMs - aiTimer.current;
            const elapsedFrames = (elapsedMs / 1000) * 60;

            if (elapsedFrames >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && shootSequence.current === 0) {
                shootSequence.current = 1;
                setShowMuzzleFlash(true);
                setTimeout(() => setShowMuzzleFlash(false), 100);

                // DYNAMIC SPAWN POS
                const spawnPos = new Vector3();
                if (muzzleRef.current) {
                     muzzleRef.current.getWorldPosition(spawnPos);
                } else {
                     spawnPos.copy(position.current).add(new Vector3(0, 2, 0));
                }
                
                const tPos = getTargetPos();
                let direction: Vector3;

                if (tPos) {
                    direction = tPos.clone().sub(spawnPos).normalize();
                } else {
                    if (muzzleRef.current) {
                         const fwd = new Vector3();
                         muzzleRef.current.getWorldDirection(fwd);
                         direction = fwd.normalize();
                    } else {
                         direction = new Vector3(0,0,1).applyQuaternion(rotateGroupRef.current.quaternion);
                    }
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
            
            // FIXED: Sync with Player Dash Physics (No forced downforce)
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

    useGameStore.getState().updateTargetPosition(id, position.current.clone());

    // 3. VISUAL UPDATE
    groupRef.current.position.copy(position.current);

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
        // FIXED: Face velocity when moving on ground (matches Player)
        const horizVel = new Vector3(velocity.current.x, 0, velocity.current.z);
        if (horizVel.lengthSq() > 0.001) {
            const lookPos = position.current.clone().add(horizVel);
            rotateGroupRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
        }
    } else {
        // Default / Idle / Air: Face Target
        const tPos = getTargetPos();
        if (tPos) {
            rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
        } else {
             rotateGroupRef.current.lookAt(0, position.current.y, 0);
        }
    }
    rotateGroupRef.current.updateMatrixWorld(true);

    // --- PROCEDURAL ANIMATION ---

    const isIdle = isGrounded.current && aiState.current === 'IDLE' && landingFrames.current <= 0;
    
    // 0. Walk Cycle (NPC)
    if (isWalking) {
        const speed = new Vector3(velocity.current.x, 0, velocity.current.z).length();
        walkCycle.current += delta * 8 * (speed / GLOBAL_CONFIG.WALK_SPEED);
    }

    // 1. Head Tracking
    if (headRef.current && !stunned) {
        const tPos = getTargetPos();
        let shouldLook = false;
        if (tPos) {
             const fwd = new Vector3();
             rotateGroupRef.current.getWorldDirection(fwd);
             const dirToT = tPos.clone().sub(position.current).normalize();
             
             if (fwd.dot(dirToT) > 0.2) {
                 shouldLook = true;
                 const startQuat = headRef.current.quaternion.clone();
                 // FIX: Look at CHEST/HEAD height to prevent extreme downward pitch which moves head forward due to pivot
                 const lookAtPos = tPos.clone().add(new Vector3(0, 1.7, 0));
                 headRef.current.lookAt(lookAtPos);
                 
                 const targetQuat = headRef.current.quaternion.clone();
                 headRef.current.quaternion.copy(startQuat);
                 headRef.current.quaternion.slerp(targetQuat, 0.1);
             }
        }
        if (!shouldLook) {
            // Revert to Idle pose or Neutral
             let targetX = 0;
             let targetY = 0;
             if (isIdle) {
                 targetX = IDLE_POSE.HEAD.x;
                 targetY = IDLE_POSE.HEAD.y;
             }
            
            // Stabilize Head during Walk
            if (isWalking) {
                 const t = walkCycle.current;
                 targetY = -Math.sin(t + 0.25) * 0.1; 
            }
            
            const q = new Quaternion().setFromEuler(new Euler(targetX, targetY, 0));
            headRef.current.quaternion.slerp(q, 0.1 * timeScale);
        }
    }

    // 2. Arms (Synced with Player Logic)
    
    // Left Arm (Gun Arm)
    if (gunArmRef.current && !stunned) {
         if (aiState.current === 'SHOOTING') {
             const tPos = getTargetPos();
             if (tPos) {
                 const shoulderPos = new Vector3();
                 gunArmRef.current.getWorldPosition(shoulderPos);
                 
                 const dirToTarget = tPos.clone().sub(shoulderPos).normalize();
                 const bodyInvQuat = rotateGroupRef.current.quaternion.clone().invert();
                 const localDir = dirToTarget.applyQuaternion(bodyInvQuat);
                 
                 const defaultForward = new Vector3(0, -1, 0.2).normalize();
                 const targetQuat = new Quaternion().setFromUnitVectors(defaultForward, localDir);
                 
                 const startup = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES;
                 const aiming = GLOBAL_CONFIG.SHOT_AIM_DURATION;
                 const recovery = shootMode.current === 'STOP' 
                    ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                    : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                 const totalFrames = startup + recovery;

                 const totalDurationMs = (totalFrames / 60) * 1000;
                 const elapsedMs = totalDurationMs - aiTimer.current;
                 const elapsedFrames = (elapsedMs / 1000) * 60;
                 
                 const identity = new Quaternion();

                 if (elapsedFrames < startup) {
                     if (elapsedFrames < aiming) {
                         const t = elapsedFrames / aiming;
                         const smoothT = 1 - Math.pow(1 - t, 3);
                         gunArmRef.current.quaternion.slerpQuaternions(identity, targetQuat, smoothT);
                     } else {
                         gunArmRef.current.quaternion.copy(targetQuat);
                     }
                 } else {
                     const t = (elapsedFrames - startup) / recovery;
                     gunArmRef.current.quaternion.slerpQuaternions(targetQuat, identity, t);
                 }
             }
         } else {
             if (isWalking) {
                 // Walking Swing (optional, keeping minimal for NPC)
                 gunArmRef.current.rotation.set(0.35, -0.3, 0);
             } else {
                 if (isIdle) {
                    const target = IDLE_POSE.LEFT_ARM.SHOULDER;
                    const lerpSpeed = 0.1 * timeScale;
                    gunArmRef.current.rotation.x = MathUtils.lerp(gunArmRef.current.rotation.x, target.x, lerpSpeed);
                    gunArmRef.current.rotation.y = MathUtils.lerp(gunArmRef.current.rotation.y, target.y, lerpSpeed);
                    gunArmRef.current.rotation.z = MathUtils.lerp(gunArmRef.current.rotation.z, target.z, lerpSpeed);
                 } else {
                    gunArmRef.current.rotation.set(0.35, -0.3, 0);
                 }
             }
         }
    }
    
    // Left Forearm
    if (leftForeArmRef.current && !stunned) {
        let targetX = -0.65;
        let targetY = 0.3;
        let targetZ = 0;

        if (isIdle) {
             targetX = IDLE_POSE.LEFT_ARM.ELBOW.x;
             targetY = IDLE_POSE.LEFT_ARM.ELBOW.y;
             targetZ = IDLE_POSE.LEFT_ARM.ELBOW.z;
        }
        const lerpSpeed = 0.1 * timeScale;
        leftForeArmRef.current.rotation.x = MathUtils.lerp(leftForeArmRef.current.rotation.x, targetX, lerpSpeed);
        leftForeArmRef.current.rotation.y = MathUtils.lerp(leftForeArmRef.current.rotation.y, targetY, lerpSpeed);
        leftForeArmRef.current.rotation.z = MathUtils.lerp(leftForeArmRef.current.rotation.z, targetZ, lerpSpeed);
    }
    
    // Right Arm (Shield Arm)
    if (rightArmRef.current && !stunned) {
        let targetX = 0.35;
        let targetY = 0.3;
        let targetZ = 0;

        if (aiState.current === 'DASHING') {
            targetX = DASH_POSE_GUN.RIGHT_ARM.SHOULDER.x;
            targetY = DASH_POSE_GUN.RIGHT_ARM.SHOULDER.y;
            targetZ = DASH_POSE_GUN.RIGHT_ARM.SHOULDER.z;
        } else if (isIdle) {
            targetX = IDLE_POSE.RIGHT_ARM.SHOULDER.x;
            targetY = IDLE_POSE.RIGHT_ARM.SHOULDER.y;
            targetZ = IDLE_POSE.RIGHT_ARM.SHOULDER.z;
        }
        
        const lerpSpeed = (aiState.current === 'DASHING' ? 0.2 : 0.1) * timeScale;
        rightArmRef.current.rotation.x = MathUtils.lerp(rightArmRef.current.rotation.x, targetX, lerpSpeed);
        rightArmRef.current.rotation.y = MathUtils.lerp(rightArmRef.current.rotation.y, targetY, lerpSpeed);
        rightArmRef.current.rotation.z = MathUtils.lerp(rightArmRef.current.rotation.z, targetZ, lerpSpeed);
    }

    // Right Forearm
    if (rightForeArmRef.current && !stunned) {
        let targetX = -0.65;
        let targetY = -0.3;
        let targetZ = 0;
        
        if (aiState.current === 'DASHING') {
            targetX = DASH_POSE_GUN.RIGHT_ARM.ELBOW.x;
            targetY = DASH_POSE_GUN.RIGHT_ARM.ELBOW.y;
            targetZ = DASH_POSE_GUN.RIGHT_ARM.ELBOW.z;
        } else if (isIdle) {
            targetX = IDLE_POSE.RIGHT_ARM.ELBOW.x;
            targetY = IDLE_POSE.RIGHT_ARM.ELBOW.y;
            targetZ = IDLE_POSE.RIGHT_ARM.ELBOW.z;
        }

        const lerpSpeed = (aiState.current === 'DASHING' ? 0.2 : 0.1) * timeScale;
        rightForeArmRef.current.rotation.x = MathUtils.lerp(rightForeArmRef.current.rotation.x, targetX, lerpSpeed);
        rightForeArmRef.current.rotation.y = MathUtils.lerp(rightForeArmRef.current.rotation.y, targetY, lerpSpeed);
        rightForeArmRef.current.rotation.z = MathUtils.lerp(rightForeArmRef.current.rotation.z, targetZ, lerpSpeed);
    }

    // Shield (Independent)
    if (shieldRef.current && !stunned) {
        let targetPos = { x: 0, y: -0.5, z: 0.1 };
        let targetRot = { x: -0.2, y: 0, z: 0 };

        // NOTE: DASH_POSE_GUN does not include shield rotation, so we skip applying specific pose data here,
        // effectively using the default position defined above.

        const lerpSpeed = (aiState.current === 'DASHING' ? 0.15 : 0.1) * timeScale;
        
        shieldRef.current.position.x = MathUtils.lerp(shieldRef.current.position.x, targetPos.x, lerpSpeed);
        shieldRef.current.position.y = MathUtils.lerp(shieldRef.current.position.y, targetPos.y, lerpSpeed);
        shieldRef.current.position.z = MathUtils.lerp(shieldRef.current.position.z, targetPos.z, lerpSpeed);

        shieldRef.current.rotation.x = MathUtils.lerp(shieldRef.current.rotation.x, targetRot.x, lerpSpeed);
        shieldRef.current.rotation.y = MathUtils.lerp(shieldRef.current.rotation.y, targetRot.y, lerpSpeed);
        shieldRef.current.rotation.z = MathUtils.lerp(shieldRef.current.rotation.z, targetRot.z, lerpSpeed);
    }

    // 3. Leg Inertia Sway & Animation Logic
    if (legsRef.current && !stunned) {
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

         // REMOVED INERTIA SWAY FOR NPC
         // We ensure the legs container is straight (0,0,0) locally
         legsRef.current.rotation.x = MathUtils.lerp(legsRef.current.rotation.x, 0, 0.1);
         legsRef.current.rotation.z = MathUtils.lerp(legsRef.current.rotation.z, 0, 0.1);

         let targetRightThigh = { x: 0, y: 0, z: 0 };
         let targetLeftThigh = { x: 0, y: 0, z: 0 };
         let targetRightKneeX = 0.2; 
         let targetLeftKneeX = 0.2;  
         let targetRightAnkle = { x: -0.2, y: 0, z: 0 };
         let targetLeftAnkle = { x: -0.2, y: 0, z: 0 };
         
         let targetBodyTilt = 0;
         let targetBodyTwist = 0;
         let targetBodyRoll = 0;
         let lerpSpeed = 0.2 * timeScale; 

         if (isWalking) {
            // --- WALKING ANIMATION ---
            const t = walkCycle.current;
            const sin = Math.sin(t);
            const cos = Math.cos(t);

            targetRightThigh.x = -sin * 0.8;
            targetLeftThigh.x = sin * 0.8;
            
            targetRightKneeX = Math.max(0, cos) * 1.2 + 0.1;
            targetLeftKneeX = Math.max(0, -cos) * 1.2 + 0.1;
            
            targetRightAnkle.x = -(targetRightKneeX * 0.4) - (sin * 0.3);
            targetLeftAnkle.x = -(targetLeftKneeX * 0.4) + (sin * 0.3);
            
            targetBodyTilt = 0.2;

            if (upperBodyRef.current) {
                //upperBodyRef.current.position.y = 0.65 + Math.abs(cos) * 0.05; // Bob
                upperBodyRef.current.rotation.y = sin * 0.1; // Twist
                upperBodyRef.current.rotation.z = cos * 0.02; // Sway
            }
         }
         else if (aiState.current === 'DASHING') {
             targetRightThigh.x = -1; // Lift Right Leg
             targetRightKneeX = 2.6; // Bend Right Knee (Kick)
             targetLeftKneeX = 0.3; // Bend Right Knee (Kick)
             targetLeftThigh.x = 1.1; // Drag Left Leg
             targetLeftThigh.y = -0.5; // Rotate Out
             targetLeftThigh.z = -0.2; // Open Up
             targetLeftAnkle.x = 0.25; 
             targetRightAnkle.x = 0.8; 
             targetBodyTilt = 0.65; // Forward Lean
             lerpSpeed = 0.15 * timeScale;
             upperBodyRef.current.rotation.z = MathUtils.lerp(upperBodyRef.current.rotation.z, 0, 0.2);
             upperBodyRef.current.rotation.y = MathUtils.lerp(upperBodyRef.current.rotation.y, 0, 0.2);
         } else if (isFalling) {
             targetRightThigh.x = GLOBAL_CONFIG.FALL_LEG_PITCH_RIGHT * animWeight;
             targetLeftThigh.x = GLOBAL_CONFIG.FALL_LEG_PITCH_LEFT * animWeight;
             targetRightKneeX = 0.2 + (GLOBAL_CONFIG.FALL_KNEE_BEND_RIGHT - 0.2) * animWeight;
             targetLeftKneeX = 0.2 + (GLOBAL_CONFIG.FALL_KNEE_BEND_LEFT - 0.2) * animWeight;
             
             // Spread
             targetRightThigh.z = GLOBAL_CONFIG.FALL_LEG_SPREAD * animWeight;
             targetLeftThigh.z = -GLOBAL_CONFIG.FALL_LEG_SPREAD * animWeight;
             
             targetBodyTilt = GLOBAL_CONFIG.FALL_BODY_TILT * animWeight; 
             lerpSpeed = 0.25 * timeScale;
         } else if (visualLandingFrames.current > 0) {
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
             
             targetRightThigh.z = GLOBAL_CONFIG.LANDING_LEG_SPLAY * w;
             targetLeftThigh.z = -GLOBAL_CONFIG.LANDING_LEG_SPLAY * w;
             
             targetBodyTilt = GLOBAL_CONFIG.LANDING_BODY_TILT * w;
             rotateGroupRef.current.position.y = - (GLOBAL_CONFIG.LANDING_HIP_DIP * w);
             lerpSpeed = 0.25 * timeScale;
         } else {
             lerpSpeed = GLOBAL_CONFIG.FALL_ANIM_EXIT_SPEED * timeScale;
             rotateGroupRef.current.position.y = MathUtils.lerp(rotateGroupRef.current.position.y, 0, lerpSpeed);
             
             if (isIdle) {
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
             } else {
                targetRightThigh.z = 0.05;
                targetLeftThigh.z = -0.05;
             }

             if (upperBodyRef.current) {
                upperBodyRef.current.position.y = MathUtils.lerp(upperBodyRef.current.position.y, 0.65, 0.1);
                upperBodyRef.current.rotation.y = MathUtils.lerp(upperBodyRef.current.rotation.y, targetBodyTwist, 0.1);
                upperBodyRef.current.rotation.z = MathUtils.lerp(upperBodyRef.current.rotation.z, targetBodyRoll, 0.1);
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
         }
    }

  });

  // --- COLORS ---
  // Fixed colors, removing stun/status effect overrides per user request
  const armorColor = team === Team.RED ? '#ff8888' : '#eeeeee';
  const chestColor = team === Team.RED ? '#880000' : '#2244aa';
  const feetColor = team === Team.RED ? '#333333' : '#aa2222';
  
  return (
    <group ref={groupRef}>
      <group ref={rotateGroupRef}>
         <group position={[0, 2.0, 0]}>
            
            {/* TORSO GROUP (Waist + Chest) */}
            <group ref={torsoRef}>
                {/* WAIST */}
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[0.6, 0.5, 0.5]} />
                    <meshToonMaterial color={armorColor} /> 
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

                        {/* REPLACED HEAD WITH MECHA HEAD COMPONENT */}
                        <group ref={headRef}>
                            <MechaHead mainColor={armorColor} />
                        </group>

                        {/* ARMS */}
                        {/* Right Shoulder & Arm (Holding SHIELD) */}
                        <group position={[0.65, 0.1, 0]} rotation={[0.35, 0.3, 0]} ref={rightArmRef}>
                            <mesh>
                                <boxGeometry args={[0.5, 0.5, 0.5]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                            {/* FOREARM */}
                            <group position={[0, -0.4, 0]} rotation={[-0.65, -0.3, 0]} ref={rightForeArmRef}>
                                {/* 1. Inner Skeleton */}
                                <mesh>
                                    <boxGeometry args={[0.25, 0.6, 0.3]} />
                                    <meshToonMaterial color="#444" />
                                    <Edges threshold={15} color="black" />
                                </mesh>
                                
                                {/* 2. Outer Forearm Armor */}
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]}>
                                    <mesh>
                                        <boxGeometry args={[0.28, 0.6, 0.35]} />
                                        <meshToonMaterial color={armorColor} />
                                        <Edges threshold={15} color="black" />
                                    </mesh>
                                </group>
                                
                                {/* Right Fist (NPC) */}
                                <mesh position={[0, -0.35, 0]}>
                                    <boxGeometry args={[0.25, 0.25, 0.25]} />
                                    <meshToonMaterial color="#222" />
                                </mesh>
                                
                                {/* 3. Independent Shield Group */}
                                <group position={[0, -0.5, 0.1]} rotation={[-0.2, 0, 0]} ref={shieldRef}>
                                        <group position={[0.35, 0, 0.1]} rotation={[0, 0, -0.32]}>
                                            <mesh position={[0, 0.2, 0]}>
                                                <boxGeometry args={[0.1, 1.7, 0.7]} />
                                                <meshToonMaterial color={armorColor} />
                                                <Edges threshold={15} color="black" />
                                            </mesh>
                                            <mesh position={[0.06, 0.2, 0]}>
                                                <boxGeometry args={[0.05, 1.5, 0.5]} />
                                                <meshToonMaterial color="#ff0000" />
                                            </mesh>
                                        </group>
                                </group>
                            </group>
                        </group>

                        {/* Left Shoulder & Arm (Holding GUN) */}
                        <group position={[-0.65, 0.1, 0]} ref={gunArmRef}>
                            <mesh>
                                <boxGeometry args={[0.5, 0.5, 0.5]} />
                                <meshToonMaterial color={armorColor} />
                                <Edges threshold={15} color="black" />
                            </mesh>
                            {/* FOREARM */}
                            <group position={[0, -0.4, 0]} rotation={[-0.65, 0.3, 0]} ref={leftForeArmRef}>
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
                                        
                                        {/* Left Fist (NPC) */}
                                        <mesh position={[0, -0.35, 0]}>
                                            <boxGeometry args={[0.25, 0.25, 0.25]} />
                                            <meshToonMaterial color="#222" />
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
                                    <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscendingState} />
                            </group>
                            <group position={[-0.25, -0.9, -0.4]}>
                                    <cylinderGeometry args={[0.1, 0.15, 0.2]} />
                                    <meshToonMaterial color="#222" />
                                    <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscendingState} />
                            </group>
                            
                            {/* BOOST BURST EFFECT - Synced with Dash */}
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
                            <group ref={leftFootRef} position={[0, -0.8, 0.05]} rotation={[-0.1, 0, 0]}>
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
