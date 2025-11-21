import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Stars } from '@react-three/drei';
import { DoubleSide, AdditiveBlending } from 'three';
import { Player } from './Player';
import { Unit } from './Unit';
import { Projectile } from './Projectile';
import { LockReticle } from './LockReticle';
import { useGameStore } from '../store';
import { GLOBAL_CONFIG } from '../types';

// --- FPS LIMITER CONSTANTS ---
const TARGET_FPS = 60;
const FRAME_DURATION = 1 / TARGET_FPS;

// Scene Manager: Handles Global Logic (Projectiles)
const SceneManager: React.FC = () => {
    const updateProjectiles = useGameStore(state => state.updateProjectiles);
    const clockRef = useRef(0);

    useFrame((state, delta) => {
        clockRef.current += delta;
        // Only execute if enough time has passed (Cap at 60 FPS)
        if (clockRef.current >= FRAME_DURATION) {
            updateProjectiles();
            // Reset clock. 
            // NOTE: Setting to 0 instead of subtracting ensures we never "catch up" 
            // on low FPS, satisfying the "slow down on low FPS" requirement,
            // and strictly caps high FPS devices to 1 update per interval.
            clockRef.current = 0; 
        }
    });
    return null;
}

// --- VISUALS ---

const BoundaryWall: React.FC = () => {
    const meshRef = useRef<any>(null);
    const meshRef2 = useRef<any>(null);
    const radius = GLOBAL_CONFIG.BOUNDARY_LIMIT;
    
    const clockRef = useRef(0);

    useFrame((state, delta) => {
        clockRef.current += delta;
        if (clockRef.current < FRAME_DURATION) return;
        clockRef.current = 0;

        // Animation Logic running at ~60FPS
        const t = state.clock.getElapsedTime();
        if (meshRef.current) {
            meshRef.current.material.opacity = 0.2 + Math.sin(t * 2) * 0.1;
            meshRef.current.rotation.y = t * 0.05;
        }
        if (meshRef2.current) {
            meshRef2.current.rotation.y = -t * 0.02;
        }
    });

    return (
        <group>
            {/* Outer Slow Rotating Wall */}
            <mesh ref={meshRef} position={[0, 15, 0]}>
                <cylinderGeometry args={[radius, radius, 30, 64, 1, true]} /> 
                <meshBasicMaterial 
                    color="#00ffff" 
                    transparent 
                    opacity={0.3} 
                    side={DoubleSide} 
                    blending={AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
            
            {/* Inner Fast Wireframe Wall */}
            <mesh ref={meshRef2} position={[0, 15, 0]}>
                <cylinderGeometry args={[radius - 0.5, radius - 0.5, 30, 32, 10, true]} />
                <meshBasicMaterial 
                    color="#aa00ff" 
                    transparent 
                    opacity={0.15} 
                    wireframe 
                    side={DoubleSide}
                    blending={AdditiveBlending}
                />
            </mesh>

            {/* Floor Ring Glow */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.1, 0]}>
                <ringGeometry args={[radius - 2, radius, 64]} />
                <meshBasicMaterial color="#00ffff" transparent opacity={0.6} side={DoubleSide} blending={AdditiveBlending} />
            </mesh>
        </group>
    );
};

const ArenaFloor: React.FC = () => {
    return (
        <group position={[0, -0.05, 0]}>
            {/* Dark Reflective-ish Floor Plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
               <planeGeometry args={[1000, 1000]} />
               <meshStandardMaterial 
                    color="#080810" 
                    roughness={0.4} 
                    metalness={0.6} 
               />
            </mesh>

            {/* Grid - Neon Blue/Cyan for Sci-Fi look */}
            <Grid 
              position={[0, 0, 0]}
              args={[300, 300]} 
              cellSize={5} 
              cellThickness={1} 
              cellColor="#1a55ff"      // Darker blue for small cells
              sectionSize={25} 
              sectionThickness={1.5} 
              sectionColor="#00ccff"   // Bright cyan for sections
              fadeDistance={100} 
              infiniteGrid 
            />
        </group>
    );
}

export const GameScene: React.FC = () => {
  const { targets, currentTargetIndex, projectiles } = useGameStore();

  return (
    <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }} gl={{ antialias: true }}>
      
      {/* 1. Dark Background for Stars */}
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 30, 150]} />
      
      <SceneManager />

      {/* --- LIGHTING --- */}
      <ambientLight intensity={0.5} color="#aaddff" />
      
      {/* Fill Light - Cool tone */}
      <hemisphereLight args={['#4444ff', '#000000', 0.6]} />

      {/* Main Shadows */}
      <directionalLight 
        position={[50, 100, 50]} 
        intensity={2.5} 
        color="#ffffff"
        castShadow 
        shadow-mapSize={[2048, 2048]} 
      />
      
      {/* Rim Light for edge definition */}
      <pointLight position={[-50, 20, -50]} intensity={200} color="#00ffff" distance={100} />

      {/* 2. Stars */}
      <Stars radius={150} depth={50} count={6000} factor={5} saturation={0} fade speed={0.5} />

      {/* --- WORLD --- */}
      <ArenaFloor />
      <BoundaryWall />

      {/* Entities */}
      <Player />
      
      {targets.map((t, index) => (
        <Unit 
          key={t.id}
          id={t.id}
          position={t.position} 
          team={t.team} 
          name={t.name}
          isTargeted={index === currentTargetIndex}
          lastHitTime={t.lastHitTime}
          knockbackDir={t.knockbackDir}
        />
      ))}

      {/* Projectiles */}
      {projectiles.map(p => (
          <Projectile key={p.id} data={p} />
      ))}

      <LockReticle />

    </Canvas>
  );
};