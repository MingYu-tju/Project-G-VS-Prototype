
import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, DoubleSide, AdditiveBlending, MathUtils } from 'three';
import { Projectile as ProjectileType, Team, GLOBAL_CONFIG } from '../types';
import { useGameStore } from '../store';
import { playHitSound } from './AudioController';

interface Props {
  data: ProjectileType;
}

export const Projectile: React.FC<Props> = ({ data }) => {
  const meshRef = useRef<Mesh>(null);
  
  // State for rendering updates
  const [hit, setHit] = useState(false);
  
  // Ref for logic updates (Synchronous lock to prevent multi-frame hits at low FPS)
  const isHitRef = useRef(false);
  
  const [impactPos, setImpactPos] = useState<Vector3 | null>(null);
  const [hitScale, setHitScale] = useState(0);

  // Actions & State
  const applyHit = useGameStore(state => state.applyHit);
  const targets = useGameStore(state => state.targets);
  const playerPos = useGameStore(state => state.playerPos);
  // Use local projectile hit logic, but we check if the *owner* is in hitstop for pausing? 
  // Actually projectile movement should generally only freeze if the game is paused, 
  // but for "Hit Stop", usually the projectile freezes momentarily if it caused the hit.
  // However, in this architecture, projectiles handle their own updates.
  // We will rely on the store's updateProjectiles loop for movement, but visual effects run here.
  
  useFrame(() => {
    // 1. Visual Effects Phase: ALWAYS RUN
    if (hit) {
        if (hitScale > 0) {
            setHitScale(prev => Math.max(0, prev - 0.08));
        }
        return; 
    }

    // 3. Logic Guard Phase
    if (isHitRef.current) return;

    if (!meshRef.current) return;
    
    const lookAtPos = data.position.clone().add(data.forwardDirection);
    meshRef.current.lookAt(lookAtPos);

    // --- COLLISION DETECTION ---
    const HIT_THRESHOLD = GLOBAL_CONFIG.UNIT_HITBOX_RADIUS + GLOBAL_CONFIG.PROJECTILE_HITBOX_RADIUS;

    if (data.team === Team.BLUE) {
        for (const target of targets) {
            if (target.team === Team.RED && target.position.distanceTo(data.position) < HIT_THRESHOLD) {
                triggerHit(target.id);
                break;
            }
        }
    } else if (data.team === Team.RED) {
        if (playerPos.distanceTo(data.position) < HIT_THRESHOLD) {
             triggerHit('player');
        } 
        else {
             for (const target of targets) {
                if (target.team === Team.BLUE && target.position.distanceTo(data.position) < HIT_THRESHOLD) {
                    triggerHit(target.id);
                    break;
                }
            }
        }
    }
  });

  const triggerHit = (targetId: string) => {
      if (isHitRef.current) return;
      isHitRef.current = true;

      setHit(true);
      setHitScale(1);
      setImpactPos(data.position.clone());
      
      const knockbackDir = data.velocity.clone().normalize();
      // FIXED: Passed data.ownerId as the second argument (attackerId)
      applyHit(targetId, data.ownerId, knockbackDir, 1.0, GLOBAL_CONFIG.KNOCKBACK_DURATION, 0);
      
      const distanceToPlayer = data.position.distanceTo(playerPos);
      playHitSound(distanceToPlayer);
  };

  if (hit && hitScale <= 0) return null;

  const renderPos = hit && impactPos ? impactPos : data.position;

  const isRed = data.team === Team.RED;
  const glowColor = isRed ? "#ff2266" : "#00ffff"; 
  const coreColor = "#ffffff";

  return (
    <group position={renderPos}>
        {!hit ? (
            <mesh ref={meshRef}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.08, 0.08, 7, 8]} />
                    <meshBasicMaterial color={coreColor} />
                </mesh>

                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.4, 0.4, 7.5, 8]} />
                    <meshBasicMaterial 
                        color={glowColor} 
                        transparent 
                        opacity={0.5} 
                        blending={AdditiveBlending} 
                        depthWrite={false} 
                    />
                </mesh>
            </mesh>
        ) : (
            <group scale={[1.5, 1.5, 1.5]}>
                <mesh scale={[hitScale, hitScale, hitScale]}>
                    <sphereGeometry args={[1.2, 16, 16]} />
                    <meshBasicMaterial color="#ffffaa" transparent opacity={0.9} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]} scale={[2 - hitScale, 2 - hitScale, 1]}>
                    <ringGeometry args={[1.5, 2.5, 32]} />
                    <meshBasicMaterial color="#ff5500" transparent opacity={hitScale * 0.8} side={DoubleSide} />
                </mesh>
                <mesh scale={[hitScale * 1.5, hitScale * 1.5, hitScale * 1.5]} rotation={[Math.random(), Math.random(), Math.random()]}>
                     <icosahedronGeometry args={[1.5, 0]} />
                     <meshBasicMaterial color="#ff8800" wireframe transparent opacity={hitScale * 0.6} />
                </mesh>
            </group>
        )}
    </group>
  );
};
