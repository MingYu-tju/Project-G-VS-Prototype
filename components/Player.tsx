
import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Mesh, MathUtils, Group, DoubleSide, Quaternion } from 'three';
import { Trail, Edges } from '@react-three/drei';
import { useGameStore } from '../store';
import { Team, LockState, GLOBAL_CONFIG } from '../types';

// Muzzle Offset is now used only as a fallback or local offset reference.
// Actual spawning uses World Position of the muzzle ref.
const FRAME_DURATION = 1 / 60;

// --- SOUND ---
const playShootSound = () => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
};

// --- VISUAL EFFECTS ---

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

// Speed Lines for Evade
const SpeedLines: React.FC<{ visible: boolean }> = ({ visible }) => {
    const groupRef = useRef<Group>(null);
    const LINE_COUNT = 6;
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
                     <meshBasicMaterial color="#ccffff" transparent opacity={0.6} depthWrite={false} />
                 </mesh>
            ))}
        </group>
    )
}

export const Player: React.FC = () => {
  const meshRef = useRef<Mesh>(null);
  const headRef = useRef<Group>(null);
  const legsRef = useRef<Group>(null);
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
    cutTracking
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
  
  // Action State
  const isDashing = useRef(false);
  const dashStartTime = useRef(0);
  const dashReleaseTime = useRef<number | null>(null); 
  const currentDashSpeed = useRef(0);
  const dashDirection = useRef(new Vector3(0, 0, -1)); 
  
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
  
  // Visual State
  const [visualState, setVisualState] = useState<'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE'>('IDLE');
  const [isStunned, setIsStunned] = useState(false);
  
  const ammoRegenTimer = useRef(0);

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

  // Setup Inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const now = Date.now();
      
      if (!keys.current[key]) {
          if (['w', 'a', 's', 'd'].includes(key)) {
              if (key === lastKeyPressed.current && (now - lastKeyPressTime.current < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW)) {
                 if (!isOverheated && boost > GLOBAL_CONFIG.EVADE_BOOST_COST && !isStunned && landingFrames.current <= 0) {
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
                          isFrontal = dot >= 0;
                       }
    
                       shootMode.current = isFrontal ? 'MOVE' : 'STOP';
    
                       if (isDashing.current) {
                           isDashing.current = false;
                       }
                   }
               }
          }
    
          if (key === 'l') {
            const now = Date.now();
            if (!isOverheated && boost > GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT && !isStunned) {
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
              consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT);

              if (isGrounded.current) {
                  velocity.current.y = GLOBAL_CONFIG.DASH_GROUND_HOP_VELOCITY;
                  isGrounded.current = false;
              }
              
              const inputDir = getCameraRelativeInput();
              if (inputDir) {
                  dashDirection.current.copy(inputDir);
              } else {
                  const camDir = new Vector3();
                  camera.getWorldDirection(camDir);
                  camDir.y = 0;
                  dashDirection.current.copy(camDir.normalize());
              }
              
              velocity.current.x = dashDirection.current.x * GLOBAL_CONFIG.DASH_BURST_SPEED;
              velocity.current.z = dashDirection.current.z * GLOBAL_CONFIG.DASH_BURST_SPEED;
            }
          }
          
          if (key === 'e') {
            useGameStore.getState().cycleTarget();
          }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [boost, isOverheated, consumeBoost, camera, consumeAmmo, isStunned, targets, currentTargetIndex, cutTracking]);

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

    const timeScale = delta * 60;
    const now = Date.now();
    const currentTarget = targets[currentTargetIndex];
    const moveDir = getCameraRelativeInput();
    const spaceHeld = keys.current[' '];
    const hasMoveInput = !!moveDir;

    const stunned = now - playerLastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;
    
    if (wasStunnedRef.current && !stunned) {
        if (isGrounded.current) {
            landingFrames.current = getLandingLag();
            velocity.current.set(0, 0, 0);
        }
    }
    wasStunnedRef.current = stunned;
    setIsStunned(stunned);

    ammoRegenTimer.current += delta;
    if (ammoRegenTimer.current > GLOBAL_CONFIG.AMMO_REGEN_TIME) {
        recoverAmmo();
        ammoRegenTimer.current = 0;
    }

    let nextVisualState: 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' = 'IDLE';

    // ==========================================
    // 1. STATE & PHYSICS CALCULATION
    // ==========================================

    if (stunned) {
        isDashing.current = false;
        isShooting.current = false;
        isEvading.current = false; 
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

            if (spaceHeld) {
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                    isEvading.current = false; 
                    nextVisualState = 'ASCEND';
                    velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED; 
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
        else if (isDashing.current) {
            if (isOverheated || boost <= 0) {
                isDashing.current = false;
            }
            else if (spaceHeld && (now - dashStartTime.current > GLOBAL_CONFIG.DASH_GRACE_PERIOD)) {
                isDashing.current = false;
            }
            else {
                if (hasMoveInput) {
                    dashReleaseTime.current = null;
                } else {
                    if (dashReleaseTime.current === null) {
                        dashReleaseTime.current = now;
                    }
                    if (now - dashReleaseTime.current > GLOBAL_CONFIG.DASH_COAST_DURATION) {
                        isDashing.current = false;
                    }
                }
            }
        }

        if (nextVisualState === 'EVADE') {
        }
        else if (isShooting.current) {
            nextVisualState = 'SHOOT';
            if (shootMode.current === 'STOP') {
                velocity.current.set(0, 0, 0); 
            } else {
                const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
                const frictionFactor = Math.pow(friction, timeScale);
                velocity.current.x *= frictionFactor;
                velocity.current.z *= frictionFactor;
                velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
            }
        }
        else if (landingFrames.current > 0) {
            velocity.current.set(0, 0, 0);
            landingFrames.current -= 1 * timeScale; 
            nextVisualState = 'LANDING';
            if (landingFrames.current <= 0) { 
                 landingFrames.current = 0;
                 refillBoost();
            }
        } 
        else {
            if (isDashing.current) {
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_HOLD * timeScale)) {
                    nextVisualState = 'DASH';
                    currentDashSpeed.current = MathUtils.lerp(currentDashSpeed.current, GLOBAL_CONFIG.DASH_SUSTAIN_SPEED, GLOBAL_CONFIG.DASH_DECAY_FACTOR * timeScale);
                    if (moveDir) {
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
            else if (spaceHeld && !isOverheated) {
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                    nextVisualState = 'ASCEND';
                    velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                    
                    const currentPlanarSpeed = Math.sqrt(velocity.current.x**2 + velocity.current.z**2);
                    
                    if (moveDir) {
                         const currentVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                         if (currentPlanarSpeed > 0.01) {
                             const angle = moveDir.angleTo(currentVel);
                             let axis = new Vector3().crossVectors(currentVel, moveDir).normalize();
                             if (axis.lengthSq() < 0.01) {
                                if (angle > 1.0) axis = new Vector3(0, 1, 0);
                             }
                             if (axis.lengthSq() > 0.01) {
                                 const rotateAmount = Math.min(angle, GLOBAL_CONFIG.ASCENT_TURN_SPEED * timeScale);
                                 currentVel.applyAxisAngle(axis, rotateAmount);
                             }
                         } else {
                             currentVel.copy(moveDir).multiplyScalar(0.01);
                         }

                         if (currentPlanarSpeed > GLOBAL_CONFIG.WALK_SPEED * 1.1) {
                             velocity.current.x = currentVel.x * Math.pow(0.995, timeScale);
                             velocity.current.z = currentVel.z * Math.pow(0.995, timeScale);
                         } else {
                             const newDir = currentVel.normalize();
                             const newSpeed = MathUtils.lerp(currentPlanarSpeed, GLOBAL_CONFIG.WALK_SPEED, 0.2 * timeScale);
                             velocity.current.x = newDir.x * newSpeed;
                             velocity.current.z = newDir.z * newSpeed;
                         }
                    } else {
                        velocity.current.x *= Math.pow(0.9, timeScale);
                        velocity.current.z *= Math.pow(0.9, timeScale);
                    }
                }
            }
            else {
                // GROUND MOVEMENT (WALK)
                if (isGrounded.current) {
                    if (moveDir) {
                        nextVisualState = 'WALK';
                        
                        // Smooth Steering Logic
                        const currentVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                        const speed = currentVel.length();

                        // Smooth Steering Logic
                        // 获取当前的基准方向：如果有速度则用速度方向，如果是静止则用机体当前朝向
                        let effectiveDir = currentVel.clone();
                        if (speed < 0.01) {
                            effectiveDir = new Vector3(0, 0, 1).applyQuaternion(meshRef.current.quaternion);
                            effectiveDir.y = 0;
                        }
                        effectiveDir.normalize();

                        // 计算输入方向与当前基准方向的夹角
                        const angle = moveDir.angleTo(effectiveDir);
                        if (angle > 0.001) {
                            let axis = new Vector3().crossVectors(effectiveDir, moveDir).normalize();
                            // 防止共线导致的 axis 异常
                            if (axis.lengthSq() < 0.01) {
                                axis = new Vector3(0, 1, 0);
                            }
                            
                            const turnRate = GLOBAL_CONFIG.GROUND_TURN_SPEED * timeScale;
                            const rotateAmount = Math.min(angle, turnRate);
                            
                            // 核心修改：将 effectiveDir (基准方向) 旋转一点点，作为新的速度方向
                            effectiveDir.applyAxisAngle(axis, rotateAmount);
                            
                            // 将旋转后的方向赋值回 currentVel
                            currentVel.copy(effectiveDir);
                        } else {
                            // 已经在方向上了，直接沿用
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
            meshRef.current.lookAt(currentTarget.position.x, meshRef.current.position.y, currentTarget.position.z);
        }
        else if (isEvading.current) {
             if (currentTarget) {
                meshRef.current.lookAt(currentTarget.position.x, meshRef.current.position.y, currentTarget.position.z);
             }
        }
        else if (isDashing.current) {
            const lookPos = position.current.clone().add(dashDirection.current);
            meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
        }
        else {
            const horizVel = new Vector3(velocity.current.x, 0, velocity.current.z);
            if (horizVel.lengthSq() > 0.001) { 
                const lookPos = position.current.clone().add(horizVel);
                meshRef.current.lookAt(lookPos.x, position.current.y, lookPos.z);
            }
        }
        meshRef.current.updateMatrixWorld(true);

        // 2. Gun Arm Aiming Logic (360 Degree Slerp)
        if (gunArmRef.current) {
            if (isShooting.current && currentTarget) {
                // Get directions in world space
                const shoulderPos = new Vector3();
                gunArmRef.current.getWorldPosition(shoulderPos);
                const targetPos = currentTarget.position.clone();
                
                // Direction from shoulder to target
                const dirToTarget = targetPos.sub(shoulderPos).normalize();
                
                // Convert to Body Local Space (because gunArmRef is child of Body)
                const bodyInverseQuat = meshRef.current.quaternion.clone().invert();
                const localDir = dirToTarget.applyQuaternion(bodyInverseQuat);
                
                // The default forward vector for the gun arm (when rotation is 0,0,0)
                // Based on hierarchy, Z+ seems to be forward relative to the shoulder group
                const defaultForward = new Vector3(0, -1, 0.2).normalize();
                
                // Calculate target quaternion to look at direction
                const targetQuat = new Quaternion().setFromUnitVectors(defaultForward, localDir);
                
                const startup = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES;
                const recovery = GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
                const identity = new Quaternion(); // Identity (0,0,0 rotation)

                if (shootTimer.current < startup) {
                    // Startup: Slerp from Identity to Target
                    const t = shootTimer.current / startup;
                    const smoothT = t * t * (3 - 2 * t);
                    gunArmRef.current.quaternion.slerpQuaternions(identity, targetQuat, smoothT);
                } else {
                     // Recovery: Slerp from Target back to Identity
                     const t = (shootTimer.current - startup) / recovery;
                     gunArmRef.current.quaternion.slerpQuaternions(targetQuat, identity, t);
                }
            } else {
                // Instant reset if not shooting (e.g. Dash Cancel)
                gunArmRef.current.quaternion.identity();
            }
        }

        // 3. Head Tracking
        if (headRef.current) {
             const t = targets[currentTargetIndex];
             let shouldLook = false;
             if (t) {
                 const fwd = new Vector3(0,0,1).applyQuaternion(meshRef.current.quaternion);
                 const dirToT = t.position.clone().sub(position.current).normalize();
                 if (fwd.dot(dirToT) > 0.2) { 
                     shouldLook = true;
                    // 1. 记录当前角度
                    const startQuat = headRef.current.quaternion.clone();

                    // 2. 瞬间看向目标（计算目标角度）
                    headRef.current.lookAt(t.position);
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

        // 4. Leg Inertia Sway
        if (legsRef.current) {
             const invRot = meshRef.current.quaternion.clone().invert();
             const localVel = velocity.current.clone().applyQuaternion(invRot);
             
             const targetPitch = localVel.z * 1.5; 
             const targetRoll = -localVel.x * 1.5;

             legsRef.current.rotation.x = MathUtils.lerp(legsRef.current.rotation.x, targetPitch, 0.1);
             legsRef.current.rotation.z = MathUtils.lerp(legsRef.current.rotation.z, targetRoll, 0.1);
        }
    }

    // ==========================================
    // 4. ACTIONS (Shooting)
    // ==========================================
    
    if (!stunned && isShooting.current) {
        shootTimer.current += 1 * timeScale; 
        
        if (shootTimer.current >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && !hasFired.current) {
            hasFired.current = true;
            playShootSound();
            setShowMuzzleFlash(true);
            setTimeout(() => setShowMuzzleFlash(false), 100);

            // DYNAMIC SPAWN POSITION & DIRECTION
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
                     // Get world direction of muzzle
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

        if (shootTimer.current >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES) {
            isShooting.current = false;
            shootTimer.current = 0;
            if (isGrounded.current) {
                landingFrames.current = getLandingLag();
            }
        }
    }

    // ==========================================
    // 5. CAMERA (Unified)
    // ==========================================
    
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

  // Colors for parts
  const chestColor = isStunned ? '#ffffff' : '#2244aa';
  const feetColor = '#aa2222';

  return (
    <group>
      <mesh ref={meshRef} castShadow>
          <group position={[0, 2.0, 0]}> {/* Center of Waist */}
            
            {/* WAIST */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.6, 0.5, 0.5]} />
                <meshToonMaterial color="#ff0000" />
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
                        {/* V-Fin */}
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
                        {/* Chin */}
                        <mesh position={[0, -0.18, 0.23]}>
                                <boxGeometry args={[0.1, 0.08, 0.05]} />
                                <meshToonMaterial color="red" />
                                <Edges threshold={15} color="black" />
                        </mesh>
                        
                        {/* Citroën Vents */}
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

                        {/* Eyes */}
                        <mesh position={[0, 0.05, 0.226]}>
                            <planeGeometry args={[0.25, 0.08]} />
                            <meshBasicMaterial color="#00ff00" toneMapped={false} />
                        </mesh>
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
                                    <group position={[0.2, 0, 0.1]} rotation={[0, 0, 0]}>
                                        <mesh position={[0, 0.2, 0]}>
                                            <boxGeometry args={[0.1, 1.4, 0.6]} />
                                            <meshToonMaterial color={armorColor} />
                                            <Edges threshold={15} color="black" />
                                        </mesh>
                                        <mesh position={[0.06, 0.2, 0]}>
                                            <boxGeometry args={[0.05, 1.2, 0.4]} />
                                            <meshToonMaterial color="#ffaa00" />
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
                                <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} />
                        </group>
                        <group position={[-0.25, -0.8, -0.45]}>
                                <cylinderGeometry args={[0.1, 0.15, 0.2]} />
                                <meshToonMaterial color="#222" />
                                <ThrusterPlume active={isThrusting} offset={[0, -0.1, 0]} isAscending={isAscending} />
                        </group>

                    </group>
            </group>

            {/* LEGS GROUP */}
            <group ref={legsRef}>
                <group position={[0.25, -0.3, 0]} rotation={[-0.1, 0, 0.05]}>
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

                <group position={[-0.25, -0.3, 0]} rotation={[-0.1, 0, -0.05]}>
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
            
            {isDashingOrAscending && (
                <Trail width={2} length={4} color={engineColor} attenuation={(t) => t * t}>
                    <mesh visible={false} />
                </Trail>
            )}
          </group>
      </mesh>
      
      <group ref={speedLinesRef}>
          <SpeedLines visible={visualState === 'EVADE'} />
      </group>
    </group>
  );
};
