import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Group, MathUtils, DoubleSide, Quaternion, Shape } from 'three';
import { Text, Html, Edges } from '@react-three/drei';
import { Team, GLOBAL_CONFIG, RED_LOCK_DISTANCE } from '../types';
import { useGameStore } from '../store';

const FRAME_DURATION = 1 / 60;

// --- VISUALS ---
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
    <group ref={groupRef} position={offset}> 
       <group rotation={[isAscending ? Math.PI + Math.PI/3 : -Math.PI/2, 0, 0]}>
            <mesh position={[0, 0, 0.8]}>
                <cylinderGeometry args={[0.02, 0.1, 1.5, 8]} rotation={[Math.PI/2, 0, 0]} />
                <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthWrite={false} />
            </mesh>
             <mesh position={[0, 0, 0.5]}>
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
  const legsRef = useRef<Group>(null);
  // NEW: Individual leg refs for splaying
  const rightLegRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  
  const gunArmRef = useRef<Group>(null);
  const muzzleRef = useRef<Group>(null);
  
  // Physics State
  const position = useRef(initialPos.clone());
  const velocity = useRef(new Vector3(0, 0, 0));
  const isGrounded = useRef(true);
  const landingFrames = useRef(0);
  const boost = useRef(100);

  // AI State
  const aiState = useRef<'IDLE' | 'DASHING' | 'ASCENDING' | 'FALLING' | 'SHOOTING'>('IDLE');
  const aiTimer = useRef(0);
  const shootMode = useRef<'MOVE' | 'STOP'>('STOP');
  
  // Target & Shoot AI
  const targetSwitchTimer = useRef(0);
  const localTargetId = useRef<string | null>(null);
  const shootCooldown = useRef(0);
  const shootSequence = useRef(0); 
  // const aimAngleRef = useRef(0); // No longer needed for 3D aiming

  // Movement Vars
  const dashDirection = useRef(new Vector3(0, 0, 1));
  const currentDashSpeed = useRef(0);
  const moveInput = useRef(new Vector3(0, 0, 0));

  // Visual State
  const [isThrusting, setIsThrusting] = useState(false);
  const [isAscendingState, setIsAscendingState] = useState(false); 
  const [isStunned, setIsStunned] = useState(false);
  const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
  
  // Animation
  const currentLegSpread = useRef(0);

  const spawnProjectile = useGameStore(state => state.spawnProjectile);
  const clockRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current || !rotateGroupRef.current) return;

    clockRef.current += delta;
    if (clockRef.current < FRAME_DURATION) return;
    clockRef.current = 0;

    const currentlyAscending = aiState.current === 'ASCENDING';
    if (currentlyAscending !== isAscendingState) {
        setIsAscendingState(currentlyAscending);
    }

    const now = Date.now();
    const stunned = now - lastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;
    setIsStunned(stunned);

    if (stunned) {
        setIsThrusting(false);
        velocity.current.set(0, 0, 0);
        if (knockbackDir) {
             position.current.add(knockbackDir.clone().multiplyScalar(GLOBAL_CONFIG.KNOCKBACK_SPEED));
        }
        velocity.current.y -= GLOBAL_CONFIG.GRAVITY;
        position.current.y += velocity.current.y;
        if (position.current.y <= 0) {
            position.current.y = 0;
            velocity.current.y = 0;
        }

        const maxRadius = GLOBAL_CONFIG.BOUNDARY_LIMIT - 1.0;
        const currentRadiusSq = position.current.x * position.current.x + position.current.z * position.current.z;
        if (currentRadiusSq > maxRadius * maxRadius) {
            const angle = Math.atan2(position.current.z, position.current.x);
            position.current.x = Math.cos(angle) * maxRadius;
            position.current.z = Math.sin(angle) * maxRadius;
        }

        groupRef.current.position.copy(position.current);
        return; 
    }

    const freshState = useGameStore.getState();
    const freshTargets = freshState.targets;
    const freshPlayerPos = freshState.playerPos;

    targetSwitchTimer.current -= FRAME_DURATION; 
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

    shootCooldown.current -= FRAME_DURATION;
    
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
             
             // --- CHANGED: Dynamic Total Frames calculation for AI ---
             const currentRecovery = shootMode.current === 'STOP' 
                ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
             const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + currentRecovery;
             
             aiTimer.current = (totalFrames / 60) * 1000; 
             shootCooldown.current = MathUtils.randFloat(GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MIN, GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MAX); 
        }
    }

    aiTimer.current -= FRAME_DURATION * 1000; 

    if (aiState.current === 'SHOOTING' && aiTimer.current <= 0) {
        aiState.current = 'IDLE';
        aiTimer.current = 500; 
        shootSequence.current = 0;
    }

    if (aiTimer.current <= 0 && landingFrames.current <= 0 && aiState.current !== 'SHOOTING') {
      if (aiState.current === 'DASHING') {
          if (Math.random() > 0.3) {
              aiState.current = 'ASCENDING';
              aiTimer.current = MathUtils.randInt(400, 800); 
          } else {
              aiState.current = 'FALLING';
              aiTimer.current = MathUtils.randInt(500, 1000);
          }
      } else if (aiState.current === 'ASCENDING') {
          aiState.current = 'FALLING';
          aiTimer.current = MathUtils.randInt(1000, 2000);
      } else {
          if (boost.current > 20) {
              aiState.current = 'DASHING';
              const biasCenter = new Vector3(0,0,0).sub(position.current).normalize().multiplyScalar(0.5);
              const randDir = new Vector3((Math.random()-0.5), 0, (Math.random()-0.5)).normalize();
              const dir = randDir.add(biasCenter).normalize();
              
              dashDirection.current.copy(dir);
              currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
              moveInput.current = dir;
              
              velocity.current.x = dir.x * GLOBAL_CONFIG.DASH_BURST_SPEED;
              velocity.current.z = dir.z * GLOBAL_CONFIG.DASH_BURST_SPEED;
              velocity.current.y = 0;
              
              boost.current -= 15;
              aiTimer.current = MathUtils.randInt(300, 600); 
          } else {
              aiState.current = 'IDLE'; 
              aiTimer.current = 500;
          }
      }
    }

    if (isGrounded.current && landingFrames.current <= 0) {
        boost.current = Math.min(100, boost.current + 1);
    }

    if (landingFrames.current > 0) {
        velocity.current.set(0,0,0);
        landingFrames.current -= 1; 
        setIsThrusting(false);
    } else {
        if (aiState.current === 'SHOOTING') {
            setIsThrusting(false);
            
            if (shootMode.current === 'STOP') {
                 velocity.current.set(0,0,0);
            } else {
                 const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                 velocity.current.x *= friction;
                 velocity.current.z *= friction;
                 velocity.current.y -= GLOBAL_CONFIG.GRAVITY;
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
            boost.current -= 0.1;
            currentDashSpeed.current = MathUtils.lerp(currentDashSpeed.current, GLOBAL_CONFIG.DASH_SUSTAIN_SPEED, GLOBAL_CONFIG.DASH_DECAY_FACTOR);
            velocity.current.x = dashDirection.current.x * currentDashSpeed.current;
            velocity.current.z = dashDirection.current.z * currentDashSpeed.current;
            if (position.current.y < 3.0) velocity.current.y = -0.05;
            else velocity.current.y = 0;

        } else if (aiState.current === 'ASCENDING') {
            setIsThrusting(true);
            boost.current -= 0.3;
            velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
            velocity.current.x += moveInput.current.x * 0.005;
            velocity.current.z += moveInput.current.z * 0.005;

        } else {
            setIsThrusting(false);
            if (!isGrounded.current) {
                 velocity.current.x += moveInput.current.x * 0.001;
                 velocity.current.z += moveInput.current.z * 0.001;
            }
        }

        if (aiState.current !== 'SHOOTING') {
             const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
             velocity.current.x *= friction;
             velocity.current.z *= friction;
             
             if (aiState.current !== 'DASHING') {
                 velocity.current.y -= GLOBAL_CONFIG.GRAVITY;
             }
        }

        position.current.add(velocity.current);
        
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

    if (aiState.current === 'SHOOTING') {
        const tPos = getTargetPos();
        if (tPos && shootMode.current === 'STOP') {
             rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
        }
    } else if (aiState.current === 'DASHING') {
        const lookPos = position.current.clone().add(dashDirection.current);
        rotateGroupRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
    } else {
        const tPos = getTargetPos();
        if (tPos) {
            rotateGroupRef.current.lookAt(tPos.x, position.current.y, tPos.z);
        } else {
             rotateGroupRef.current.lookAt(0, position.current.y, 0);
        }
    }
    rotateGroupRef.current.updateMatrixWorld(true);

    // --- PROCEDURAL ANIMATION ---
    
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
                 // 1. 记录当前角度
                 const startQuat = headRef.current.quaternion.clone();

                 // 2. 瞬间看向目标（计算目标角度）
                 headRef.current.lookAt(tPos);
                 const targetQuat = headRef.current.quaternion.clone();

                 // 3. 恢复当前角度
                 headRef.current.quaternion.copy(startQuat);

                 // 4. 平滑过渡到目标角度 (0.1 是速度，越小越慢)
                 headRef.current.quaternion.slerp(targetQuat, 0.1);
             }
        }
        if (!shouldLook) {
            const identity = new Quaternion();
            headRef.current.quaternion.slerp(identity, 0.1);
        }
    }

    // 2. Gun Arm Aiming (360 Degree Slerp)
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
                 
                 // --- CHANGED: Dynamic Recovery for AI Aiming ---
                 const startup = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES;
                 const recovery = shootMode.current === 'STOP' 
                    ? GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES_STOP 
                    : GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                 const totalFrames = startup + recovery;

                 const totalDurationMs = (totalFrames / 60) * 1000;
                 const elapsedMs = totalDurationMs - aiTimer.current;
                 const elapsedFrames = (elapsedMs / 1000) * 60;
                 
                 const identity = new Quaternion();

                 if (elapsedFrames < startup) {
                     const t = elapsedFrames / startup;
                     const smoothT = t * t * (3 - 2 * t);
                     gunArmRef.current.quaternion.slerpQuaternions(identity, targetQuat, smoothT);
                 } else {
                     const t = (elapsedFrames - startup) / recovery;
                     gunArmRef.current.quaternion.slerpQuaternions(targetQuat, identity, t);
                 }
             }
         } else {
             gunArmRef.current.quaternion.identity();
         }
    }

    // 3. Leg Inertia Sway & Splaying
    if (legsRef.current && !stunned) {
         const invRot = rotateGroupRef.current.quaternion.clone().invert();
         const localVel = velocity.current.clone().applyQuaternion(invRot);
         
         const targetPitch = localVel.z * 1.5; 
         const targetRoll = -localVel.x * 1.5;

         legsRef.current.rotation.x = MathUtils.lerp(legsRef.current.rotation.x, targetPitch, 0.1);
         legsRef.current.rotation.z = MathUtils.lerp(legsRef.current.rotation.z, targetRoll, 0.1);

         // Splay Legs Logic
         const isDashing = aiState.current === 'DASHING';
         const targetSpread = isDashing ? 0.35 : 0;
         currentLegSpread.current = MathUtils.lerp(currentLegSpread.current, targetSpread, 0.1);

         if (rightLegRef.current) rightLegRef.current.rotation.z = 0.05 + currentLegSpread.current;
         if (leftLegRef.current) leftLegRef.current.rotation.z = -0.05 - currentLegSpread.current;
    }

  });

  const armorColor = isStunned ? '#ffffff' : (team === Team.RED ? '#ff8888' : '#eeeeee');
  const chestColor = isStunned ? '#ffffff' : (team === Team.RED ? '#880000' : '#2244aa');
  const feetColor = team === Team.RED ? '#333333' : '#aa2222';

  // --- MECHA EYE SHAPE ---
  const eyeShape = useMemo(() => {
      const s = new Shape();
      // Drawing Right Eye (X > 0)
      s.moveTo(0.025, -0.01); // Inner Bottom
      s.lineTo(0.11, 0.01);   // Outer Bottom
      s.lineTo(0.11, 0.06);   // Outer Top
      s.lineTo(0.025, 0.03);  // Inner Top (Lower than outer = Angry)
      s.autoClose = true;
      return s;
  }, []);

  return (
    <group ref={groupRef}>
      <group ref={rotateGroupRef}>
         <group position={[0, 2.0, 0]}> {/* Waist Center */}
            
            {/* WAIST */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.6, 0.5, 0.5]} />
                <meshToonMaterial color={armorColor} />
                <Edges threshold={15} color="black" />
            </mesh>

            {/* CHEST */}
            <group position={[0, 0.65, 0]}>
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
                            <group position={[0, 0.025, 0]}>
                                <mesh position={[-0.025, -0.015, 0]} rotation={[0, 0, 0.8]}>
                                        <boxGeometry args={[0.07, 0.015, 0.01]} />
                                        <meshBasicMaterial color="#111" />
                                </mesh>
                                <mesh position={[0.025, -0.015, 0]} rotation={[0, 0, -0.8]}>
                                        <boxGeometry args={[0.07, 0.015, 0.01]} />
                                        <meshBasicMaterial color="#111" />
                                </mesh>
                            </group>
                            <group position={[0, -0.025, 0]}>
                                <mesh position={[-0.025, -0.015, 0]} rotation={[0, 0, 0.8]}>
                                        <boxGeometry args={[0.07, 0.015, 0.01]} />
                                        <meshBasicMaterial color="#111" />
                                </mesh>
                                <mesh position={[0.025, -0.015, 0]} rotation={[0, 0, -0.8]}>
                                        <boxGeometry args={[0.07, 0.015, 0.01]} />
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
                                <meshBasicMaterial color={team === Team.RED ? "#ff0088" : "#00ff00"} toneMapped={false} />
                            </mesh>
                            
                            {/* Left Eye (Mirrored) */}
                            <mesh scale={[-1, 1, 1]}>
                                <shapeGeometry args={[eyeShape]} />
                                <meshBasicMaterial color={team === Team.RED ? "#ff0088" : "#00ff00"} toneMapped={false} />
                            </mesh>
                        </group>

                    </group>

                    {/* ARMS */}
                    {/* Right Shoulder & Arm (Holding SHIELD) */}
                    <group position={[0.65, 0.1, 0]}>
                        <mesh>
                            <boxGeometry args={[0.5, 0.5, 0.5]} />
                            <meshToonMaterial color={armorColor} />
                            <Edges threshold={15} color="black" />
                        </mesh>
                        <group position={[0, -0.4, 0]}>
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
                    <group position={[-0.65, 0.1, 0]} ref={gunArmRef}>
                        <mesh>
                            <boxGeometry args={[0.5, 0.5, 0.5]} />
                            <meshToonMaterial color={armorColor} />
                            <Edges threshold={15} color="black" />
                        </mesh>
                        <group position={[0, -0.4, 0]}>
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
                        
                        <group position={[0.25, -0.8, -0.45]}>
                                <cylinderGeometry args={[0.1, 0.15, 0.2]} />
                                <meshToonMaterial color="#222" />
                                <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscendingState} />
                        </group>
                        <group position={[-0.25, -0.8, -0.45]}>
                                <cylinderGeometry args={[0.1, 0.15, 0.2]} />
                                <meshToonMaterial color="#222" />
                                <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscendingState} />
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
                        <group position={[0, -0.75, 0]} rotation={[0.3, 0, 0]}>
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
                            <group position={[0, -0.8, 0.05]} rotation={[-0.2, 0, 0]}>
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
                        <group position={[0, -0.75, 0]} rotation={[0.2, 0, 0]}>
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
      </group>
      <Html 
        position={[0, 4.0, 0]} 
        center 
        distanceFactor={30} 
        zIndexRange={[100, 0]}
        style={{ 
            pointerEvents: 'none', 
            transition: 'all 0.2s',
            opacity: isTargeted ? 1 : 0.6
        }}
      >
        {/* SCALED NAME TAG FOR MOBILE: smaller text and padding */}
        <div className={`text-xs md:text-sm font-bold px-1.5 md:px-3 py-0.5 rounded border whitespace-nowrap ${
              isTargeted ? 'border-yellow-400 text-yellow-400 bg-black/60' : 'border-gray-500 text-gray-300 bg-black/40'
            }`}>
              {name}
        </div>
      </Html>
    </group>
  );
};