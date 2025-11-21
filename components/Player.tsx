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
                // Move lines BACKWARDS (negative Z relative to movement direction)
                // This makes them streak behind the player
                child.position.z -= 1.8;
                
                // Reset if too far back
                if (child.position.z < -TRAIL_LENGTH) {
                    child.position.z = MathUtils.randFloat(0, 3); // Start slightly ahead/at player
                    child.position.x = MathUtils.randFloat(-0.6, 0.6); // Tight horizontal spread
                    child.position.y = MathUtils.randFloat(0.5, 2.5); // Height of the mech
                }
                
                // Fade out based on distance from center
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
                        MathUtils.randFloat(-5, 0) // Initial scattered positions behind
                    ]} 
                    rotation={[Math.PI/2, 0, 0]}
                >
                     {/* Much longer and thinner for 'fast' look */}
                     <cylinderGeometry args={[0.015, 0.015, LINE_GEOM_LENGTH]} />
                     <meshBasicMaterial color="#ccffff" transparent opacity={0.6} depthWrite={false} />
                 </mesh>
            ))}
        </group>
    )
}

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
    playerKnockbackDir,
    cutTracking // New Action
  } = useGameStore();

  // Physics State
  const velocity = useRef(new Vector3(0, 0, 0));
  const position = useRef(new Vector3(0, 0, 0));
  const isGrounded = useRef(true);
  const landingFrames = useRef(0);
  const wasStunnedRef = useRef(false); // Track previous stun state to detect recovery
  
  // Input State
  const keys = useRef<{ [key: string]: boolean }>({});
  // Double Tap State
  const lastKeyPressTime = useRef(0);
  const lastKeyPressed = useRef<string>("");
  
  // Action State
  const isDashing = useRef(false);
  const dashStartTime = useRef(0);
  const dashReleaseTime = useRef<number | null>(null); 
  const currentDashSpeed = useRef(0);
  const dashDirection = useRef(new Vector3(0, 0, -1)); 
  
  // Evade State (Step)
  const isEvading = useRef(false);
  const evadeTimer = useRef(0);
  const evadeDirection = useRef(new Vector3(0, 0, 0)); // Camera relative direction of the step
  
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

  // Helper to calculate direction based on a specific key (for double tap)
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
      
      // Check if key is already pressed to avoid repeat events triggering logic
      if (!keys.current[key]) {
          
          // Double Tap Detection (Moved INSIDE the !keys check)
          if (['w', 'a', 's', 'd'].includes(key)) {
              if (key === lastKeyPressed.current && (now - lastKeyPressTime.current < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW)) {
                 // Trigger Evade
                 if (!isOverheated && boost > GLOBAL_CONFIG.EVADE_BOOST_COST && !isStunned && landingFrames.current <= 0) {
                     // Attempt Evade
                     if (consumeBoost(GLOBAL_CONFIG.EVADE_BOOST_COST)) {
                         isEvading.current = true;
                         evadeTimer.current = GLOBAL_CONFIG.EVADE_DURATION;
                         
                         // Cut Tracking
                         cutTracking('player');
                         
                         // Set Direction (Camera Relative)
                         const dir = getDirectionFromKey(key);
                         evadeDirection.current.copy(dir);
                         
                         // Set Burst Velocity
                         velocity.current.x = dir.x * GLOBAL_CONFIG.EVADE_SPEED;
                         velocity.current.z = dir.z * GLOBAL_CONFIG.EVADE_SPEED;
                         velocity.current.y = 0; // Step is planar
                         
                         // Cancel Dash/Shoot
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
    
          // SHOOT Trigger ('J')
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
              
              // CANCEL EVADE into DASH
              if (isEvading.current) {
                  isEvading.current = false;
                  evadeTimer.current = 0;
              }
    
              // DASH CANCEL SHOOT
              if (isShooting.current) {
                  isShooting.current = false;
                  shootTimer.current = 0;
              }
    
              isDashing.current = true;
              dashStartTime.current = now;
              dashReleaseTime.current = null; 
              currentDashSpeed.current = GLOBAL_CONFIG.DASH_BURST_SPEED;
              consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_DASH_INIT);

              // GROUND DASH HOP MECHANIC
              if (isGrounded.current) {
                  // Give a smooth initial upward velocity
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
              
              // Don't reset Y velocity if already in air, let it dampen naturally in update loop
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

    // --- DELTA TIME SCALING ---
    const timeScale = delta * 60;

    const now = Date.now();
    const currentTarget = targets[currentTargetIndex];
    const moveDir = getCameraRelativeInput();
    const spaceHeld = keys.current[' '];
    const hasMoveInput = !!moveDir;

    // --- CHECK HIT STUN ---
    const stunned = now - playerLastHitTime < GLOBAL_CONFIG.KNOCKBACK_DURATION;
    
    // Detect Stun Recovery Transition
    if (wasStunnedRef.current && !stunned) {
        // Just recovered from stun
        // If on ground, trigger landing lag
        if (isGrounded.current) {
            landingFrames.current = getLandingLag();
            velocity.current.set(0, 0, 0);
        }
    }
    wasStunnedRef.current = stunned;
    setIsStunned(stunned);

    // Ammo Regen
    ammoRegenTimer.current += delta;
    if (ammoRegenTimer.current > GLOBAL_CONFIG.AMMO_REGEN_TIME) {
        recoverAmmo();
        ammoRegenTimer.current = 0;
    }

    let dashJustEnded = false; 
    let nextVisualState: 'IDLE' | 'WALK' | 'DASH' | 'ASCEND' | 'LANDING' | 'SHOOT' | 'EVADE' = 'IDLE';

    // ==========================================
    // 1. STATE & PHYSICS CALCULATION
    // ==========================================

    if (stunned) {
        // --- STUNNED STATE ---
        isDashing.current = false;
        isShooting.current = false;
        isEvading.current = false; // Cancel Evade
        shootTimer.current = 0;
        landingFrames.current = 0; 

        velocity.current.set(0, velocity.current.y - GLOBAL_CONFIG.GRAVITY * timeScale, 0);
        position.current.add(playerKnockbackDir.clone().multiplyScalar(GLOBAL_CONFIG.KNOCKBACK_SPEED * timeScale));
        position.current.y += velocity.current.y * timeScale;

    } else {
        // --- NORMAL STATE ---
        
        // HANDLE EVADE STATE
        if (isEvading.current) {
            nextVisualState = 'EVADE';
            evadeTimer.current -= 1 * timeScale;
            
            // Physics: Constant velocity during evade, no drag
            velocity.current.x = evadeDirection.current.x * GLOBAL_CONFIG.EVADE_SPEED;
            velocity.current.z = evadeDirection.current.z * GLOBAL_CONFIG.EVADE_SPEED;
            velocity.current.y = 0; // Strict Planar movement

            // SC (Step Cancel) - Jump during evade to preserve inertia but gain height
            if (spaceHeld) {
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                    isEvading.current = false; // Exit evade state
                    nextVisualState = 'ASCEND';
                    // KEEP X/Z VELOCITY (Inertia Inheritance)
                    velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED; 
                } else {
                    // Out of boost, finish evade
                }
            }

            if (evadeTimer.current <= 0) {
                isEvading.current = false;
                velocity.current.set(0, 0, 0);
                // If we end step on the ground, trigger landing lag
                if (isGrounded.current) {
                    landingFrames.current = getLandingLag();
                }
            }
        }
        else if (isDashing.current) {
            // Dash Logic
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

        // 1.2 Calculate Velocity based on State
        if (nextVisualState === 'EVADE') {
             // Velocity already set in EVADE block
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
            // Regular Movement Logic (Dash, Ascend, Walk, Fall)
            
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
                    
                    // Apply strong damping to vertical velocity during dash to simulate hover/flight
                    // This flattens out the initial hop smoothly
                    velocity.current.y *= 0.85;

                } else {
                    isDashing.current = false;
                    dashJustEnded = true;
                }
            }
            else if (spaceHeld && !isOverheated) {
                // ASCEND / SC Logic
                if (consumeBoost(GLOBAL_CONFIG.BOOST_CONSUMPTION_ASCENT * timeScale)) {
                    nextVisualState = 'ASCEND';
                    velocity.current.y = GLOBAL_CONFIG.ASCENT_SPEED;
                    
                    const currentPlanarSpeed = Math.sqrt(velocity.current.x**2 + velocity.current.z**2);
                    
                    // UNIFIED STEERING LOGIC
                    if (moveDir) {
                         const currentVel = new Vector3(velocity.current.x, 0, velocity.current.z);
                         
                         // If we have significant speed, steer by rotation
                         if (currentPlanarSpeed > 0.01) {
                             const angle = moveDir.angleTo(currentVel);
                             let axis = new Vector3().crossVectors(currentVel, moveDir).normalize();
                             
                             // Handle 180 degree turn case or parallel vectors
                             if (axis.lengthSq() < 0.01) {
                                if (angle > 1.0) axis = new Vector3(0, 1, 0); // Anti-parallel
                             }

                             if (axis.lengthSq() > 0.01) {
                                 const rotateAmount = Math.min(angle, GLOBAL_CONFIG.ASCENT_TURN_SPEED * timeScale);
                                 currentVel.applyAxisAngle(axis, rotateAmount);
                             }
                         } else {
                             // From standstill, just point in direction (magnitude handled below)
                             currentVel.copy(moveDir).multiplyScalar(0.01);
                         }

                         // Speed Management
                         if (currentPlanarSpeed > GLOBAL_CONFIG.WALK_SPEED * 1.1) {
                             // SC / High Speed Inertia (Decay slowly)
                             velocity.current.x = currentVel.x * Math.pow(0.995, timeScale);
                             velocity.current.z = currentVel.z * Math.pow(0.995, timeScale);
                         } else {
                             // Standard Ascent (Accelerate towards Walk Speed)
                             // We want to smoothly transition to WALK_SPEED magnitude
                             const newDir = currentVel.normalize();
                             const newSpeed = MathUtils.lerp(currentPlanarSpeed, GLOBAL_CONFIG.WALK_SPEED, 0.2 * timeScale);
                             
                             velocity.current.x = newDir.x * newSpeed;
                             velocity.current.z = newDir.z * newSpeed;
                         }
                    } else {
                        // No Input - Air Friction
                        velocity.current.x *= Math.pow(0.9, timeScale);
                        velocity.current.z *= Math.pow(0.9, timeScale);
                    }
                }
            }
            else {
                // Free Fall / Walk
                
                // NOTE: Removed "Snap to ground on dash end" block here to allow natural fall
                
                if (isGrounded.current) {
                    if (moveDir) {
                        nextVisualState = 'WALK';
                        velocity.current.x = moveDir.x * GLOBAL_CONFIG.WALK_SPEED;
                        velocity.current.z = moveDir.z * GLOBAL_CONFIG.WALK_SPEED;
                    } else {
                        // Ground Stop (Instant)
                        velocity.current.x = 0;
                        velocity.current.z = 0;
                    }
                } else {
                    // AIR DRIFT (Free Fall)
                    if (moveDir) {
                        velocity.current.addScaledVector(moveDir, 0.002 * timeScale);
                    }
                }
            }

            // Global Friction (if not Evading)
            const friction = isGrounded.current ? GLOBAL_CONFIG.FRICTION_GROUND : GLOBAL_CONFIG.FRICTION_AIR;
            const frictionFactor = Math.pow(friction, timeScale);
            
            // Don't apply heavy friction if we are ASCENDING (handled inside ascend block)
            if (nextVisualState !== 'ASCEND') {
                 velocity.current.x *= frictionFactor;
                 velocity.current.z *= frictionFactor;
            }
            
            if (!isDashing.current) {
                velocity.current.y -= GLOBAL_CONFIG.GRAVITY * timeScale;
            }
        }
        
        // Apply Physics
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
            // Trigger landing lag if we land (and we are not evading/stunned/dashing)
            // We allow Landing Lag even if dashJustEnded is true (i.e. we landed immediately after dash)
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

    if (!stunned) {
        if (isShooting.current && currentTarget) {
            meshRef.current.lookAt(currentTarget.position.x, meshRef.current.position.y, currentTarget.position.z);
        }
        else if (isEvading.current) {
             // During EVADE, do NOT rotate body to movement dir (strafing)
             // If targeted, face target, else face generic forward
             if (currentTarget) {
                meshRef.current.lookAt(currentTarget.position.x, meshRef.current.position.y, currentTarget.position.z);
             } else {
                 // Maintain previous rotation or lock to camera?
                 // Let's keep it looking where it was (don't update lookAt) OR look at 'virtual' front
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
  
  // Align speed lines group to movement direction
  const speedLinesRef = useRef<Group>(null);
  useFrame(() => {
      if (speedLinesRef.current && isEvading.current) {
           // Orient lines opposite to velocity
           const vel = velocity.current.clone().normalize();
           if (vel.lengthSq() > 0) {
               speedLinesRef.current.position.copy(position.current);
               // lookAt aligns the Z-axis. 
               // We look AT the direction we are going.
               // This means Local -Z points FORWARD (movement dir).
               // Therefore Local +Z points BACKWARD.
               speedLinesRef.current.lookAt(position.current.clone().sub(vel));
           }
      }
  })

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
      
      {/* Speed Lines Overlay Group - Detached from main mesh rotation to align with velocity */}
      <group ref={speedLinesRef}>
          <SpeedLines visible={visualState === 'EVADE'} />
      </group>
    </group>
  );
};