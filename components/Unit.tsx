import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Group, MathUtils, DoubleSide } from 'three';
import { Text, Html } from '@react-three/drei';
import { Team, GLOBAL_CONFIG } from '../types';
import { useGameStore } from '../store';

// Helper for Muzzle position
const MUZZLE_OFFSET = new Vector3(0.6, 1.6, 1.45);
const FRAME_DURATION = 1 / 60;

// --- VISUALS ---
const ThrusterPlume: React.FC<{ active: boolean, offset: [number, number, number], isAscending?: boolean }> = ({ active, offset, isAscending }) => {
  const groupRef = useRef<Group>(null);
  useFrame(() => {
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
  
  // Physics State
  const position = useRef(initialPos.clone());
  const velocity = useRef(new Vector3(0, 0, 0));
  const isGrounded = useRef(true);
  const landingFrames = useRef(0);
  const boost = useRef(100);

  // AI State
  const aiState = useRef<'IDLE' | 'DASHING' | 'ASCENDING' | 'FALLING' | 'SHOOTING'>('IDLE');
  const aiTimer = useRef(0);
  
  // Target & Shoot AI
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
  const [isStunned, setIsStunned] = useState(false);
  const [showMuzzleFlash, setShowMuzzleFlash] = useState(false);

  // Access Store
  const spawnProjectile = useGameStore(state => state.spawnProjectile);
  const playerPos = useGameStore(state => state.playerPos);
  const targets = useGameStore(state => state.targets);

  // FPS Limiter
  const clockRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current || !rotateGroupRef.current) return;

    // --- FPS LIMITER ---
    clockRef.current += delta;
    if (clockRef.current < FRAME_DURATION) return;
    clockRef.current = 0;

    // --- CHECK STUN ---
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

        // Circular Boundary Clamp
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

    // --- AI: TARGET SELECTION ---
    targetSwitchTimer.current -= FRAME_DURATION; // Use fixed step
    if (targetSwitchTimer.current <= 0) {
        // Use GLOBAL_CONFIG for switch time
        targetSwitchTimer.current = MathUtils.randFloat(GLOBAL_CONFIG.AI_TARGET_SWITCH_MIN, GLOBAL_CONFIG.AI_TARGET_SWITCH_MAX); 
        
        const potentialTargets = [];
        if (team === Team.RED) {
            potentialTargets.push('player');
            targets.forEach(t => { if (t.team === Team.BLUE) potentialTargets.push(t.id); });
        } else {
            targets.forEach(t => { if (t.team === Team.RED) potentialTargets.push(t.id); });
        }
        
        if (potentialTargets.length > 0) {
            localTargetId.current = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
        }
    }

    const getTargetPos = (): Vector3 | null => {
        if (localTargetId.current === 'player') return playerPos.clone();
        const t = targets.find(t => t.id === localTargetId.current);
        return t ? t.position.clone() : null;
    };

    // --- AI: SHOOTING TRIGGER ---
    shootCooldown.current -= FRAME_DURATION;
    
    if (landingFrames.current <= 0 && aiState.current !== 'SHOOTING' && shootCooldown.current <= 0) {
        // Use GLOBAL_CONFIG for probability
        if (Math.random() < GLOBAL_CONFIG.AI_SHOOT_PROBABILITY) { 
             aiState.current = 'SHOOTING';
             shootSequence.current = 0;
             const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
             // aiTimer uses milliseconds
             aiTimer.current = (totalFrames / 60) * 1000; 
             // Use GLOBAL_CONFIG for cooldown
             shootCooldown.current = MathUtils.randFloat(GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MIN, GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MAX); 
        }
    }

    // --- AI: DECISION ---
    aiTimer.current -= FRAME_DURATION * 1000; // Use fixed step

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

    // --- PHYSICS LOOP ---
    
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
            velocity.current.set(0,0,0); 
            
            const totalFrames = GLOBAL_CONFIG.SHOT_STARTUP_FRAMES + GLOBAL_CONFIG.SHOT_RECOVERY_FRAMES;
            const totalDurationMs = (totalFrames / 60) * 1000;
            const elapsedMs = totalDurationMs - aiTimer.current;
            const elapsedFrames = (elapsedMs / 1000) * 60;

            if (elapsedFrames >= GLOBAL_CONFIG.SHOT_STARTUP_FRAMES && shootSequence.current === 0) {
                shootSequence.current = 1;
                setShowMuzzleFlash(true);
                setTimeout(() => setShowMuzzleFlash(false), 100);

                const unitRotation = rotateGroupRef.current.quaternion.clone();
                const offset = MUZZLE_OFFSET.clone().applyQuaternion(unitRotation);
                const spawnPos = position.current.clone().add(offset);
                
                const tPos = getTargetPos();
                let direction = new Vector3(0,0,1).applyQuaternion(unitRotation);
                if (tPos) {
                    direction = tPos.sub(spawnPos).normalize();
                }
                
                const forwardDir = direction.clone();

                spawnProjectile({
                    id: `proj-${id}-${Date.now()}`,
                    ownerId: id,
                    targetId: localTargetId.current,
                    position: spawnPos,
                    velocity: direction.multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED),
                    forwardDirection: forwardDir,
                    isHoming: true, 
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
        
        // Circular Boundary Clamp
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

    // Sync Store
    useGameStore.getState().updateTargetPosition(id, position.current.clone());

    // 3. VISUAL UPDATE
    groupRef.current.position.copy(position.current);

    // Rotation Logic
    if (aiState.current === 'SHOOTING') {
        const tPos = getTargetPos();
        if (tPos) {
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

  });

  const mainColor = isStunned ? '#ffffff' : (team === Team.RED ? '#aa2222' : '#2244aa'); 
  const secondaryColor = '#333';
  const engineColor = '#ffaa00';
  const isAscending = aiState.current === 'ASCENDING';

  return (
    <group ref={groupRef}>
      <group ref={rotateGroupRef}>
        <group position={[0, 1, 0]}>
            <mesh castShadow receiveShadow>
                <boxGeometry args={[1, 2, 1]} />
                <meshStandardMaterial color={mainColor} />
            </mesh>
            <mesh position={[0, 1.2, 0]}>
                <boxGeometry args={[0.6, 0.4, 0.6]} />
                <meshStandardMaterial color={secondaryColor} />
                <mesh position={[0, 0, 0.31]}>
                    {team === Team.RED ? (
                        <circleGeometry args={[0.15, 16]} />
                    ) : (
                        <planeGeometry args={[0.4, 0.15]} />
                    )}
                    <meshBasicMaterial color={team === Team.RED ? "#ff0000" : "#00ff00"} />
                </mesh>
            </mesh>
            <group position={[0.6, 0.5, 0.5]}>
                <mesh>
                    <boxGeometry args={[0.2, 0.3, 1.2]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
                <mesh position={[0, 0.1, 0.7]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 0.4]} />
                    <meshStandardMaterial color="#222" />
                </mesh>
                <group position={[0, 0.1, 0.95]}>
                     <MuzzleFlash active={showMuzzleFlash} />
                </group>
            </group>
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
                    <ThrusterPlume active={isThrusting} offset={[0, -0.2, -0.5]} isAscending={isAscending} />
                </group>
                <group position={[0.25, -0.6, 0]}>
                    <mesh rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[0.15, 0.2, 0.4]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                    <ThrusterPlume active={isThrusting} offset={[0, -0.2, -0.5]} isAscending={isAscending} />
                </group>
            </group>
        </group>
      </group>
      <Html position={[0, 3.2, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`text-xs font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
              isTargeted ? 'border-yellow-400 text-yellow-400 bg-black/60' : 'border-gray-500 text-gray-300 bg-black/40'
            }`}>
              {name}
        </div>
      </Html>
    </group>
  );
};