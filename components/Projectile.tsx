import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, DoubleSide } from 'three';
import { Projectile as ProjectileType, Team } from '../types';
import { useGameStore } from '../store';

interface Props {
  data: ProjectileType;
}

export const Projectile: React.FC<Props> = ({ data }) => {
  const meshRef = useRef<Mesh>(null);
  const [hit, setHit] = useState(false);
  
  const [impactPos, setImpactPos] = useState<Vector3 | null>(null);
  const [hitScale, setHitScale] = useState(0);

  // Actions & State
  const applyHit = useGameStore(state => state.applyHit);
  const targets = useGameStore(state => state.targets);
  const playerPos = useGameStore(state => state.playerPos);

  useFrame(() => {
    if (hit) {
        if (hitScale > 0) {
            setHitScale(prev => Math.max(0, prev - 0.08));
        }
        return; 
    }

    if (!meshRef.current) return;
    
    const lookAtPos = data.position.clone().add(data.velocity);
    meshRef.current.lookAt(lookAtPos);

    // --- COLLISION DETECTION ---
    const HIT_RADIUS = 1.5;

    if (data.team === Team.BLUE) {
        // BLUE Projectiles hit RED Targets (Enemies)
        for (const target of targets) {
            if (target.team === Team.RED && target.position.distanceTo(data.position) < HIT_RADIUS) {
                triggerHit(target.id);
                break;
            }
        }
    } else if (data.team === Team.RED) {
        // RED Projectiles hit BLUE Targets (Player or Allies)
        
        // 1. Check Player
        if (playerPos.distanceTo(data.position) < HIT_RADIUS) {
             triggerHit('player');
        } 
        // 2. Check Allies
        else {
             for (const target of targets) {
                if (target.team === Team.BLUE && target.position.distanceTo(data.position) < HIT_RADIUS) {
                    triggerHit(target.id);
                    break;
                }
            }
        }
    }
  });

  const triggerHit = (targetId: string) => {
      setHit(true);
      setHitScale(1);
      setImpactPos(data.position.clone());
      
      const knockbackDir = data.velocity.clone().normalize();
      applyHit(targetId, knockbackDir); 
  };

  if (hit && hitScale <= 0) return null;

  const renderPos = hit && impactPos ? impactPos : data.position;

  // Color based on team
  const bulletColor = data.team === Team.RED ? "red" : "#4488ff";
  const glowColor = data.team === Team.RED ? "#ff5555" : "#88bbff";

  return (
    <group position={renderPos}>
        {!hit ? (
            <mesh ref={meshRef}>
                <boxGeometry args={[0.7, 0.7, 7]} /> 
                <meshBasicMaterial color={bulletColor} />
                <mesh scale={[1.2, 1.2, 1.02]}>
                     <boxGeometry args={[0.3, 0.3, 4]} />
                     <meshBasicMaterial color={glowColor} transparent opacity={0.5} />
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