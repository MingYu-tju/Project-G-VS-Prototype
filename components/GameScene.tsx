import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Stars, Sparkles, Environment, Lightformer } from '@react-three/drei';
import { DoubleSide, AdditiveBlending, MathUtils, Color, Vector3, Mesh, Group, Quaternion, Euler } from 'three';
import { Player } from './Player';
import { Unit } from './Unit';
import { Projectile } from './Projectile';
import { LockReticle } from './LockReticle';
import { useGameStore } from '../store';
import { GLOBAL_CONFIG, HitEffectData } from '../types';


// --- VISUAL EFFECT COMPONENT (METAL SPARKS & FIRE) ---
const HitEffectRenderer: React.FC<{ data: HitEffectData }> = ({ data }) => {
    const groupRef = useRef<Group>(null);
    const flashRef = useRef<Mesh>(null);
    const sparksRef = useRef<Group>(null);
    const fireRef = useRef<Group>(null);
    
    // 1. Generate random spark trajectories (Fast, directional streaks)
    const sparkData = useMemo(() => {
        const count = 32; // More sparks for juicier hits
        return new Array(count).fill(0).map(() => {
            const dir = new Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();
            
            const quaternion = new Quaternion();
            quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir);

            return {
                dir,
                rotation: quaternion,
                speed: 10 + Math.random() * 15, // High speed variation
                size: 0.5 + Math.random() * 1.0, // Varying lengths
                thick: 0.1 + Math.random() * 0.2 // Varying thickness
            };
        });
    }, []);

    // 2. Generate Fire/Plasma Chunks (Slower, expanding blobs)
    const fireData = useMemo(() => {
        const count = 12; 
        return new Array(count).fill(0).map(() => {
            const dir = new Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();
            
            return {
                dir,
                speed: 2 + Math.random() * 5, // Slower than sparks
                scale: 0.4 + Math.random() * 0.6,
                rotAxis: new Vector3(Math.random(), Math.random(), Math.random()).normalize(),
                rotSpeed: (Math.random() - 0.5) * 15
            };
        });
    }, []);

    useFrame(() => {
        if (!groupRef.current) return;

        const now = Date.now();
        const age = (now - data.startTime) / 1000;
        const duration = 0.35; // Short explosion duration
        
        if (age > duration) {
            groupRef.current.visible = false;
            return;
        }
        
        const progress = age / duration;
        const easeOut = 1 - Math.pow(1 - progress, 2); // Decelerate

        // 1. Central Flash (Instant expand, fast fade)
        if (flashRef.current) {
            const flashLife = Math.max(0, 1 - (progress * 4)); // Flash dies very quickly
            const flashScale = (1 + progress * 3) * flashLife * data.scale * 2;
            flashRef.current.scale.setScalar(flashScale);
            if (flashRef.current.material) {
                (flashRef.current.material as any).opacity = flashLife;
            }
        }

        // 2. Sparks Animation (Fly out and thin)
        if (sparksRef.current) {
            sparksRef.current.children.forEach((child, i) => {
                const spark = sparkData[i];
                
                // Linear motion
                const dist = spark.speed * age;
                child.position.copy(spark.dir).multiplyScalar(dist);
                
                // Scale logic: Stretch based on speed initially, then shrink to nothing
                const lifeFactor = 1 - progress;
                const length = spark.size * lifeFactor; 
                const thickness = spark.thick * lifeFactor * 2; // Start thick, get thin
                
                child.scale.set(thickness, thickness, length);
            });
        }

        // 3. Fire/Debris Animation (Expand and rotate)
        if (fireRef.current) {
            fireRef.current.children.forEach((child, i) => {
                const fire = fireData[i];
                
                // Move outward with drag
                const dist = fire.speed * easeOut; 
                child.position.copy(fire.dir).multiplyScalar(dist);
                
                // Rotate debris
                child.rotateOnAxis(fire.rotAxis, fire.rotSpeed * 0.02);
                
                // Scale down over life
                const s = Math.max(0, (1 - progress) * fire.scale * data.scale);
                child.scale.setScalar(s);
            });
        }
    });

    return (
        <group ref={groupRef} position={data.position}>
            {/* Core Flash */}
            <mesh ref={flashRef}>
                <sphereGeometry args={[0.6, 16, 16]} />
                <meshBasicMaterial color="#fff5cc" transparent blending={AdditiveBlending} depthWrite={false} />
            </mesh>
            
            {/* Metal Sparks (Streaks) */}
            <group ref={sparksRef}>
                {sparkData.map((spark, i) => (
                    <mesh key={`spark-${i}`} quaternion={spark.rotation}>
                        <boxGeometry args={[0.1, 0.1, 1]} /> 
                        <meshBasicMaterial color="#ffaa00" transparent blending={AdditiveBlending} depthWrite={false} />
                    </mesh>
                ))}
            </group>

            {/* Fire/Plasma Debris (Chunks) */}
            <group ref={fireRef}>
                {fireData.map((fire, i) => (
                    <mesh key={`fire-${i}`}>
                        {/* Icosahedron looks like a jagged rock/fireball */}
                        <icosahedronGeometry args={[0.5, 0]} /> 
                        <meshBasicMaterial color="#ff4400" transparent blending={AdditiveBlending} depthWrite={false} opacity={0.8} />
                    </mesh>
                ))}
            </group>
        </group>
    );
}

// --- MANAGERS ---

const SceneManager: React.FC = () => {
    const updateProjectiles = useGameStore(state => state.updateProjectiles);
    const decrementHitStop = useGameStore(state => state.decrementHitStop);

    useFrame((state, delta) => {
        decrementHitStop(delta);
        updateProjectiles(delta);
    });
    return null;
}

const EffectManager: React.FC = () => {
    const hitEffects = useGameStore(state => state.hitEffects);
    const now = Date.now();
    const activeEffects = hitEffects.filter(e => now - e.startTime < 500); 

    return (
        <group>
            {activeEffects.map(e => (
                <HitEffectRenderer key={e.id} data={e} />
            ))}
        </group>
    )
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
        if (outerRef.current) {
            outerRef.current.rotation.y = t * 0.02;
            outerRef.current.material.opacity = 0.15 + Math.sin(t * 1.5) * 0.05;
        }
        if (innerRef.current) {
            innerRef.current.rotation.y = -t * 0.05;
            const scale = 1 + Math.sin(t * 3) * 0.002;
            innerRef.current.scale.set(scale, 1, scale);
        }
        if (ringRef.current) {
            ringRef.current.position.y = (Math.sin(t * 0.5) * 0.5 + 0.5) * (height * 0.8);
        }
    });

    return (
        <group position={[0, 0, 0]}>
            <mesh ref={outerRef} position={[0, height/2, 0]}>
                <cylinderGeometry args={[radius, radius, height, 24, 5, true]} /> 
                <meshBasicMaterial color="#00aaff" wireframe transparent opacity={0.2} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
            <mesh ref={innerRef} position={[0, height/2, 0]}>
                <cylinderGeometry args={[radius - 1, radius - 1, height, 64, 1, true]} />
                <meshBasicMaterial color="#0044ff" transparent opacity={0.1} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
            <mesh ref={ringRef} rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[radius - 0.5, 0.5, 16, 100]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.3} blending={AdditiveBlending} />
            </mesh>
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
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
               <planeGeometry args={[1000, 1000]} />
               <meshStandardMaterial color="#1a1d26" roughness={0.8} metalness={0.2} />
            </mesh>
            <Grid position={[0, 0.01, 0]} args={[300, 300]} cellSize={10} cellThickness={0.8} cellColor="#2f3b4c" sectionSize={50} sectionThickness={1.2} sectionColor="#0066cc" fadeDistance={150} infiniteGrid />
        </group>
    );
}

const FloatingDataDebris: React.FC = () => {
    return (
        <group>
            <Sparkles count={400} scale={[150, 80, 150]} size={8} speed={0.8} opacity={0.4} color="#0088ff" position={[0, 30, 0]} />
            <Sparkles count={80} scale={[100, 100, 100]} size={25} speed={3.5} opacity={0.9} color="#ccffff" position={[0, 40, 0]} noise={20} />
        </group>
    )
}

export const GameScene: React.FC = () => {
  const { targets, currentTargetIndex, projectiles } = useGameStore();

  return (
    <Canvas 
        camera={{ position: [0, 5, 10], fov: 60 }} 
        gl={{ 
            antialias: true, 
            toneMappingExposure: 1.1 // Slight overexposure for bloom-like effect on bright parts
        }}
        shadows={false} // Disable shadow maps for performance
    >
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 50, 150]} />

      {/* 1. PROCEDURAL STUDIO ENVIRONMENT */}
      {/* This creates the metallic reflections. We use high contrast light formers. */}
      <Environment resolution={512}>
        <group rotation={[-Math.PI / 4, -0.3, 0]}>
            {/* Main Reflection (Soft White) */}
            <Lightformer intensity={1.5} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
            {/* Rim Reflection Left (Cool Blue) - Defines the left edge */}
            <Lightformer intensity={4} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[20, 1, 1]} color="#00ffff" />
            {/* Rim Reflection Right (Warm Orange) - Defines the right edge */}
            <Lightformer intensity={4} rotation-y={-Math.PI / 2} position={[5, 1, -1]} scale={[20, 1, 1]} color="#ffaa00" />
            {/* Bottom Fill */}
            <Lightformer intensity={0.5} rotation-x={-Math.PI / 2} position={[0, -5, 0]} scale={[10, 10, 1]} color="white" />
        </group>
      </Environment>

      {/* 2. DRAMATIC LIGHTING */}
      {/* Ambient: Low to keep shadows dark and contrasty */}
      <ambientLight intensity={0.3} color="#202030" />
      
      {/* Key Light: Sharp sunlight */}
      <directionalLight position={[30, 50, 20]} intensity={2.5} color="#ffffff" />
      
      {/* Rim Light (Back): VERY bright cyan light to separate mech from background (The "Edge" replacement) */}
      <spotLight 
        position={[0, 10, -20]} 
        angle={0.8} 
        penumbra={0.5} 
        intensity={20} 
        color="#00ffff" 
        distance={80} 
        target-position={[0, 0, 0]}
      />
      
      {/* Fill Light (Side): Subtle purple fill */}
      <pointLight position={[-30, 10, 0]} intensity={500} color="#aa00ff" distance={50} />


      {/* Atmosphere */}
      <Stars radius={200} depth={50} count={3000} factor={4} saturation={0} fade speed={0.2} />

      <SceneManager />
      <EffectManager />

      {/* Re-import original visual components properly in real file */}
      <DigitalFloor />
      <SimulationWall />
      <FloatingDataDebris />
      {/* Placeholder for visual components to ensure valid JSX in this snippet */}
      <gridHelper args={[200, 20, 0x112233, 0x112233]} position={[0, -0.01, 0]} />

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
          lastHitDuration={t.lastHitDuration}
          knockbackDir={t.knockbackDir}
          knockbackPower={t.knockbackPower}
          isKnockedDown={t.isKnockedDown}
        />
      ))}

      {projectiles.map(p => (
          <Projectile key={p.id} data={p} />
      ))}

      <LockReticle />

    </Canvas>
  );
};