import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Mesh, MathUtils, Group, DoubleSide } from 'three';
import { Trail } from '@react-three/drei';
import { useGameStore } from '../store';
import { Team, LockState, GLOBAL_CONFIG } from '../types';

// Calculated Offset based on model hierarchy
const MUZZLE_OFFSET = new Vector3(0.6, 1.6, 1.45);
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
  
  // Visuals can run at high refresh rate for smoothness, but we can limit if desired.
  // Keeping visuals smooth (unlimited) usually looks better, but physics MUST be limited.
  useFrame((state) => {
    if (!groupRef.current) return;
    const flicker = MathUtils.randFloat(0.8, 1.2);
    const targetScale = active ? 1 : 0;
    const lerpSpeed = 0.2;
    groupRef.current.scale.z = MathUtils.lerp(groupRef.current.scale.z, targetScale * flicker, lerpSpeed);
    groupRef.current.scale.x = MathUtils.lerp(groupRef.current.scale.x, targetScale, lerpSpeed);
    groupRef.current.scale.y = MathUtils.lerp(groupRef.current.scale.y, targetScale, lerpSpeed);
    groupRef.current.visible = groupRef.current.scale.z > 0.05;
  });

  // Adjust angle based on movement state
  // Normal: 90 deg (Straight back)
  // Ascending: 90 + 60 deg (Steeper diagonal down for lift)
  const rotationX = isAscending ? Math.PI / 2 - Math.PI / 3 : Math.PI / 2;

  return (
    <group ref={groupRef} position={offset}> 
      <group rotation={[rotationX, 0, 0]}>
        <group position={[0, 0.2, 0]}>
            <mesh rotation={[0, Math.PI / 4, 0]}>
                <planeGeometry args={[0.3, 2.0]} /> 
                <meshBasicMaterial color="#00ffff" transparent opacity={0.7} side={DoubleSide} depthWrite={false} />
            </mesh>
            <mesh rotation={[0, -Math.PI / 4, 0]}>
                <planeGeometry args={[0.3, 2.0]} />
                <meshBasicMaterial color="#00ffff" transparent opacity={0.7} side={DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, -0.8, 0]}> 
                <cylinderGeometry args={[0.03, 0.01, 1.5, 8]} />
                <meshBasicMaterial color="#e0ffff" transparent opacity={0.9} depthWrite={false} />
            </mesh>
        </group>
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

export const Player: React.FC = () => {
  const meshRef = useRef<Mesh>(null);
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
    playerKnockbackDir
  } = useGameStore();

  // Physics State
  const velocity = useRef(new Vector3(0, 0, 0));
  const position = useRef(new Vector3(0, 0, 0));
  const isGrounded = useRef(true);
  const landingFrames = useRef(0);
  
  // Input State
  const keys = useRef<{ [key: string]: boolean }>({});
  
  // Action State
  const isDashing = useRef(false);
  const dashStartTime = useRef(0);
  const dashReleaseTime = useRef<number | null>(null); 
  const currentDashSpeed = useRef(0);
  const dashDirection = useRef(new Vector3(0, 0, -1)); 
  
  // Combat State
  const isShooting = useRef(false);
  const shootTimer = useRef(0);
  const hasFired = useRef(false);
  const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);
  
  // Visual State
  const [visualState, setVisualState] = useState<'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT'>('IDLE');
  const [isStunned, setIsStunned] = useState(false);
  
  const ammoRegenTimer = useRef(0);
  
  // FPS Limiter Logic
  const clockRef = useRef(0);

  // Setup Inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!keys.current[key]) {
        keys.current[key] = true;

        // SHOOT Trigger ('J')
        if (key === 'j') {
             if (!isShooting.current && landingFrames.current <= 0 && !isStunned) {
                 const hasAmmo = consumeAmmo();
                 if (hasAmmo) {
                     isShooting.current = true;
                     shootTimer.current = 0;
                     hasFired.current = false;
                     // Trigger Dash Cancel if dashing
                     if (isDashing.current) {
                         isDashing.current = false;
                     }
                 }
             }
        }

        // Dash Trigger ('L' Key)
        if (key === 'l') {
          const now = Date.now();
          if (!isOverheated && boost > GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT && !isStunned) {
            
            // DASH CANCEL
            if (isShooting.current) {
                isShooting.current = false;
                shootTimer.current = 0;
                // If bullet hasn't spawned yet, it won't.
            }

            isDashing.current = true;
            dashStartTime.current = now;
            dashReleaseTime.current = null; 
            currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
            consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT);
            
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
            velocity.current.y = 0;
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
  }, [boost, isOverheated, consumeBoost, camera, consumeAmmo, isStunned]);

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

    // --- DELTA TIME SCALING ---
    // Standardize logic to 60 FPS reference
    // If running at 144fps, delta ~ 0.007, timeScale ~ 0.42
    // If running at 60fps, delta ~ 0.016, timeScale ~ 1.0
    const timeScale = delta * 60;

    const now = Date.now();
    const currentTarget = targets[currentTargetIndex];
    const moveDir = getCameraRelativeInput();
    const spaceHeld = keys.current[' '];
    const hasMoveInput = !!moveDir;

    // --- CHECK HIT STUN ---
    const stunned = now - playerLastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;
    setIsStunned(stunned);

    // Ammo Regen
    ammoRegenTimer.current += delta;
    if (ammoRegenTimer.current > GLOBAL_CONFIG.AMMO_REGEN_TIME) {
        recoverAmmo();
        ammoRegenTimer.current = 0;
    }

    let dashJustEnded = false; 
    let nextVisualState: 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' = 'IDLE';

    // ==========================================
    // 1. STATE & PHYSICS CALCULATION
    // ==========================================

    if (stunned) {
        // --- STUNNED STATE ---
        isDashing.current = false;
        isShooting.current = false;
        shootTimer.current = 0;
        landingFrames.current = 0; 

        // Knockback Physics (Scaled)
        velocity.current.set(0, velocity.current.y - GLOBAL_CONFIG.GRAVITY * timeScale, 0);
        position.current.add(playerKnockbackDir.clone().multiplyScalar(GLOBAL_CONFIG.KNOCKBACK_SPEED * timeScale));
        position.current.y += velocity.current.y * timeScale;

    } else {
        // --- NORMAL STATE ---
        
        if (isDashing.current) {
            if (isOverheated || boost <= 0) {
                isDashing.current = false;
                dashJustEnded = true;
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
                        dashJustEnded = true;
                    }
                }
            }
        }

        // 1.2 Calculate Velocity
        if (isShooting.current) {
            nextVisualState = 'SHOOT';
            velocity.current.set(0, 0, 0); 
        }
        else if (landingFrames.current > 0) {
            velocity.current.set(0, 0, 0);
            landingFrames.current -= 1 * timeScale; // Decrease based on time
            nextVisualState = 'LANDING';
            if (landingFrames.current <= 0) { // Use <= due to float
                 landingFrames.current = 0;
                 refillBoost();
            }
        } 
        else {
            if (isDashing.current) {
                // Boost consumption is constant per second approx, so scale by timeScale
                // Originally per frame value:
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_HOLD * timeScale)) {
                    nextVisualState = 'DASH';
                    
                    // Decay Speed
                    // Lerp alpha needs to be time adjusted: 1 - (1 - alpha)^timeScale
                    // Simplified for small values: alpha * timeScale
                    currentDashSpeed.current = MathUtils.lerp(currentDashSpeed.current, GLOBAL_CONFIG.DASH_SUSTAIN_SPEED, GLOBAL_CONFIG.DASH_DECAY_FACTOR * timeScale);

                    if (moveDir) {
                        const angle = moveDir.angleTo(dashDirection.current);
                        const axis = new Vector3().crossVectors(dashDirection.current, moveDir).normalize();
                        // Rotate amount scaled
                        const rotateAmount = Math.min(angle, GLOBAL_CONFIG.DASH_TURN_SPEED * timeScale);
                        dashDirection.current.applyAxisAngle(axis, rotateAmount);
                        dashDirection.current.normalize();
                    }
                    velocity.current.x = dashDirection.current.x * currentDashSpeed.current;
                    velocity.current.z = dashDirection.current.z * currentDashSpeed.current;
                    
                    if (position.current.y < 3.0) velocity.current.y = -0.05;
                    else velocity.current.y = 0;

                } else {
                    isDashing.current = false;
                    dashJustEnded = true;
                }
            }
            else if (spaceHeld && !isOverheated) {
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                    nextVisualState = 'ASCEND';
                    velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                    const currentPlanarSpeed = Math.sqrt(velocity.current.x**2 + velocity.current.z**2);
                    if (currentPlanarSpeed > GLOBAL_CONFIG.WALK_SPEED * 1.1) {
                        // --- INERTIA JUMP LOGIC ---
                        if (moveDir) {
                             // FIX: ROTATE VELOCITY INSTEAD OF ADDING TINY FORCE
                             // Current planar velocity vector
                             const currentVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                             const speed = currentVel.length();
                             
                             // Rotate towards input direction
                             const angle = moveDir.angleTo(currentVel);
                             const axis = new Vector3().crossVectors(currentVel, moveDir).normalize();
                             // Steering capability during inertia jump (0.03 is typical for limited air control)
                             const rotateAmount = Math.min(angle, 0.03 * timeScale); 
                             currentVel.applyAxisAngle(axis, rotateAmount);
                             
                             // Apply back
                             velocity.current.x = currentVel.x;
                             velocity.current.z = currentVel.z;
                        }
                    } else {
                        if (moveDir) {
                            velocity.current.x = moveDir.x * GLOBAL_CONFIG.WALK_SPEED;
                            velocity.current.z = moveDir.z * GLOBAL_CONFIG.WALK_SPEED;
                        } else {
                            // Damping
                            velocity.current.x *= Math.pow(0.9, timeScale);
                            velocity.current.z *= Math.pow(0.9, timeScale);
                        }
                    }
                }
            }
            else {
                if (dashJustEnded && (isGrounded.current || position.current.y < 2.0)) {
                    landingFrames.current = getLandingLag();
                    nextVisualState = 'LANDING';
                    velocity.current.set(0,0,0);
                    position.current.y = 0; 
                    isGrounded.current = true;
                }
                else if (isGrounded.current) {
                    if (moveDir) {
                        nextVisualState = 'WALK';
                        velocity.current.x = moveDir.x * GLOBAL_CONFIG.WALK_SPEED;
                        velocity.current.z = moveDir.z * GLOBAL_CONFIG.WALK_SPEED;
                    }
                } else {
                    if (moveDir) {
                        velocity.current.addScaledVector(moveDir, 0.002 * timeScale);
                    }
                }
            }

            // Friction (Exponential Decay for frame independence)
            const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
            const frictionFactor = Math.pow(friction, timeScale);
            velocity.current.x *= frictionFactor;
            velocity.current.z *= frictionFactor;

            if (!isDashing.current) {
                velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
            }
        }
        
        // Apply Physics with Time Scaling
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
            if (!stunned && !isDashing.current && !dashJustEnded) {
                 landingFrames.current = getLandingLag(); 
            }
            if (isDashing.current) isDashing.current = false; 
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

    if (!stunned) {
        if (isShooting.current && currentTarget) {
            meshRef.current.lookAt(currentTarget.position.x, meshRef.current.position.y, currentTarget.position.z);
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
    }

    // ==========================================
    // 4. ACTIONS (Shooting)
    // ==========================================
    
    if (!stunned && isShooting.current) {
        shootTimer.current += 1 * timeScale; // Scale timer
        
        if (shootTimer.current >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && !hasFired.current) {
            hasFired.current = true;
            playShootSound();
            setShowMuzzleFlash(true);
            setTimeout(() => setShowMuzzleFlash(false), 100);

            const playerRotation = meshRef.current.quaternion.clone();
            const offset = MUZZLE_OFFSET.clone();
            offset.applyQuaternion(playerRotation);
            const spawnPos = position.current.clone().add(offset);

            const targetEntity = targets[currentTargetIndex];
            let direction = new Vector3(0, 0, 1).applyQuaternion(playerRotation);
            
            if (targetEntity) {
                 direction = targetEntity.position.clone().sub(spawnPos).normalize();
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
    
    let targetCamPos = position.current.clone().add(new Vector3(0, 6, 14)); 
    let targetLookAt = position.current.clone();

    if (currentTarget) {
        const pToT = new Vector3().subVectors(currentTarget.position, position.current);
        const dir = pToT.normalize();
        const camOffsetDist = 10;
        const camHeight = 5;
        targetCamPos = position.current.clone().add(dir.multiplyScalar(-camOffsetDist)).add(new Vector3(0, camHeight, 0));
        targetLookAt = position.current.clone().lerp(currentTarget.position, 0.3);
        targetLookAt.y += 1;
    } else {
        targetCamPos = position.current.clone().add(new Vector3(0, 5, 10));
        targetLookAt = position.current.clone();
    }

    if (stunned) {
        const shakeAmount = 0.1;
        targetCamPos.x += (Math.random() - 0.5) * shakeAmount;
        targetCamPos.y += (Math.random() - 0.5) * shakeAmount;
        targetCamPos.z += (Math.random() - 0.5) * shakeAmount;
    }

    camera.position.lerp(targetCamPos, 0.1 * timeScale); // Smooth cam slightly adjusted by time
    camera.lookAt(targetLookAt);
  });

  // Visual Colors
  let meshColor = '#eee'; 
  if (isStunned) meshColor = '#ffffff'; 
  else if (isOverheated) meshColor = '#333'; 
  else if (visualState === 'LANDING') meshColor = '#666'; 

  const engineColor = visualState === 'DASH' ? '#00ffff' : (visualState === 'ASCEND' ? '#ffaa00' : '#333');
  const isDashingOrAscending = visualState === 'DASH' || visualState === 'ASCEND';
  const isAscending = visualState === 'ASCEND';

  return (
    <group>
      <mesh ref={meshRef} castShadow>
          {/* LIFT VISUALS UP so Y=0 is feet */}
          <group position={[0, 1, 0]}>
            
            {/* Body */}
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1, 2, 1]} />
                <meshStandardMaterial color={meshColor} />
            </mesh>
            
            {/* Head */}
            <mesh position={[0, 1.2, 0]}>
                <boxGeometry args={[0.6, 0.4, 0.6]} />
                <meshStandardMaterial color="#333" />
                <mesh position={[0, 0, 0.31]}>
                    <planeGeometry args={[0.4, 0.15]} />
                    <meshBasicMaterial color="#00ff00" />
                </mesh>
            </mesh>

            {/* Weapon (Right Hand) */}
            <group position={[0.6, 0.5, 0.5]}>
                {/* Gun Body */}
                <mesh>
                    <boxGeometry args={[0.2, 0.3, 1.2]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
                {/* Barrel */}
                <mesh position={[0, 0.1, 0.7]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 0.4]} />
                    <meshStandardMaterial color="#222" />
                </mesh>
                
                {/* Invisible Muzzle Marker */}
                <group position={[0, 0.1, 0.95]} ref={muzzleRef}>
                     <MuzzleFlash active={showMuzzleFlash} />
                </group>
            </group>

            {/* Backpack */}
            <group position={[0, 0.5, -0.55]}>
                <mesh>
                    <boxGeometry args={[0.8, 1.2, 0.4]} />
                    <meshStandardMaterial color="#444" />
                </mesh>
                <group position={[-0.25, -0.6, 0]}>
                    <mesh rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.15, 0.2, 0.4]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                    <ThrusterPlume active={isDashingOrAscending} offset={[0, -0.2, -0.5]} isAscending={isAscending} />
                </group>
                <group position={[0.25, -0.6, 0]}>
                    <mesh rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.15, 0.2, 0.4]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                    <ThrusterPlume active={isDashingOrAscending} offset={[0, -0.2, -0.5]} isAscending={isAscending} />
                </group>
            </group>
            
            {/* Trails */}
            {isDashingOrAscending && (
                <Trail width={2} length={4} color={engineColor} attenuation={(t) => t * t}>
                    <mesh visible={false} />
                </Trail>
            )}
          </group>
      </mesh>
    </group>
  );
};