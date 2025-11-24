
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Stars, Sparkles, Float } from '@react-three/drei';
import { DoubleSide, AdditiveBlending, MathUtils, Color, Vector3 } from 'three';
import { Player } from './Player';
import { Unit } from './Unit';
import { Projectile } from './Projectile';
import { LockReticle } from './LockReticle';
import { useGameStore } from '../store';
import { GLOBAL_CONFIG } from '../types';

// Scene Manager: Handles Global Logic (Projectiles)
const SceneManager: React.FC = () => {
    const updateProjectiles = useGameStore(state => state.updateProjectiles);

    useFrame((state, delta) => {
        // Run every frame, but pass delta for smooth interpolation
        updateProjectiles(delta);
    });
    return null;
}

// --- VISUALS ---

const SimulationWall: React.FC = () => {
    const outerRef = useRef<any>(null);
    const innerRef = useRef<any>(null);
    const ringRef = useRef<any>(null);
    const radius = GLOBAL_CONFIG.BOUNDARY_LIMIT;
    const height = 60;

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        
        // Rotate walls in opposite directions
        if (outerRef.current) {
            outerRef.current.rotation.y = t * 0.02;
            outerRef.current.material.opacity = 0.15 + Math.sin(t * 1.5) * 0.05;
        }
        if (innerRef.current) {
            innerRef.current.rotation.y = -t * 0.05;
            // Pulse effect
            const scale = 1 + Math.sin(t * 3) * 0.002;
            innerRef.current.scale.set(scale, 1, scale);
        }
        // Move scan ring up and down
        if (ringRef.current) {
            ringRef.current.position.y = (Math.sin(t * 0.5) * 0.5 + 0.5) * (height * 0.8);
        }
    });

    return (
        <group position={[0, 0, 0]}>
            {/* 1. Hexagon/Wireframe Outer Structure */}
            <mesh ref={outerRef} position={[0, height/2, 0]}>
                <cylinderGeometry args={[radius, radius, height, 24, 5, true]} /> 
                <meshBasicMaterial 
                    color="#00aaff" 
                    wireframe
                    transparent 
                    opacity={0.2} 
                    side={DoubleSide} 
                    blending={AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
            
            {/* 2. Inner High-Speed Data Wall */}
            <mesh ref={innerRef} position={[0, height/2, 0]}>
                <cylinderGeometry args={[radius - 1, radius - 1, height, 64, 1, true]} />
                <meshBasicMaterial 
                    color="#0044ff" 
                    transparent 
                    opacity={0.1} 
                    side={DoubleSide}
                    blending={AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>

            {/* 3. Scanning Ring */}
            <mesh ref={ringRef} rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[radius - 0.5, 0.5, 16, 100]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.3} blending={AdditiveBlending} />
            </mesh>

            {/* 4. Floor Warning Ring */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]}>
                <ringGeometry args={[radius - 2, radius, 64]} />
                <meshBasicMaterial color="#ff0055" transparent opacity={0.4} side={DoubleSide} blending={AdditiveBlending} />
            </mesh>
        </group>
    );
};

const DigitalFloor: React.FC = () => {
    return (
        <group position={[0, -0.05, 0]}>
            {/* Base Floor Plane - Matte Industrial Grey (No Flickering Reflections) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
               <planeGeometry args={[1000, 1000]} />
               <meshStandardMaterial 
                    color="#1a1d26" // Dark Slate Grey (Lighter than pitch black)
                    roughness={0.8} // Matte finish
                    metalness={0.2} 
               />
            </mesh>

            {/* Single Unified Grid (No Z-Fighting) */}
            <Grid 
              position={[0, 0.01, 0]}
              args={[300, 300]} 
              cellSize={10} 
              cellThickness={0.8} 
              cellColor="#2f3b4c" // Low contrast subtle grey-blue
              sectionSize={50} 
              sectionThickness={1.2} 
              sectionColor="#0066cc" // Professional Tech Blue (Not Neon Cyan)
              fadeDistance={150} 
              infiniteGrid 
            />
        </group>
    );
}

const FloatingDataDebris: React.FC = () => {
    // Create instanced mesh of floating geometric cubes
    // Enhanced visual feedback with dual-layer particles
    
    return (
        <group>
            {/* Layer 1: Ambient Binary Dust (Dense, Slow, Background) */}
            <Sparkles 
                count={400} 
                scale={[150, 80, 150]} 
                size={8} 
                speed={0.8} 
                opacity={0.4} 
                color="#0088ff" 
                position={[0, 30, 0]}
            />

            {/* Layer 2: High Speed Data Packets (Sparse, Fast, Bright, Upward) */}
            <Sparkles 
                count={80} 
                scale={[100, 100, 100]} 
                size={25} 
                speed={3.5} // Much faster
                opacity={0.9} 
                color="#ccffff" 
                position={[0, 40, 0]}
                noise={20} // More erratic movement
            />
        </group>
    )
}

export const GameScene: React.FC = () => {
  const { targets, currentTargetIndex, projectiles } = useGameStore();

  return (
    <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }} gl={{ antialias: true, toneMappingExposure: 1.2 }}>
      
      {/* 1. Atmosphere */}
      <color attach="background" args={['#05070a']} />
      {/* Dark blue fog for depth */}
      <fog attach="fog" args={['#05070a', 40, 180]} />
      
      <SceneManager />

      {/* --- LIGHTING --- */}
      <ambientLight intensity={0.4} color="#002244" />
      
      {/* Neon Rim Lights */}
      <pointLight position={[-100, 50, -100]} intensity={2000} color="#0088ff" distance={300} />
      <pointLight position={[100, 50, 100]} intensity={2000} color="#ff00aa" distance={300} />

      {/* Main Sun (Simulated) */}
      <directionalLight 
        position={[50, 80, 30]} 
        intensity={3} 
        color="#ddeeff"
        //castShadow 
        shadow-bias={-0.0005}
        shadow-mapSize={[2048, 2048]} 
      />

      {/* 2. Background Stars */}
      <Stars radius={200} depth={50} count={8000} factor={6} saturation={0} fade speed={0.2} />

      {/* --- WORLD GEOMETRY --- */}
      <DigitalFloor />
      <SimulationWall />
      <FloatingDataDebris />

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
