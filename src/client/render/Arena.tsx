import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree, addAfterEffect } from '@react-three/fiber';
import { Grid, Stars, Sparkles, Environment, Lightformer, Html, Sky } from '@react-three/drei';
import { DoubleSide, AdditiveBlending } from 'three';
import { useSettings } from '../state/settings';
const GLOBAL_CONFIG = { BOUNDARY_LIMIT: 80 };
const SimulationWall: React.FC<{ isDark: boolean, isMobile: boolean }> = ({ isDark, isMobile }) => {
    const outerRef = useRef<any>(null);
    const ringRef = useRef<any>(null);
    const radius = GLOBAL_CONFIG.BOUNDARY_LIMIT;
    const height = 60;
    
    const primaryColor = isDark ? "#00aaff" : "#0066aa";

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (outerRef.current) {
            outerRef.current.rotation.y = t * 0.02;
            outerRef.current.material.opacity = 0.1 + Math.sin(t * 1.5) * 0.05;
        }
        if (ringRef.current) {
            ringRef.current.position.y = (Math.sin(t * 0.5) * 0.5 + 0.5) * (height * 0.8);
        }
    });

    // OPTIMIZATION: Removed inner cylinder layer to reduce overdraw
    return (
        <group position={[0, 0, 0]}>
            <mesh ref={outerRef} position={[0, height/2, 0]}>
                {/* Reduced segments for mobile */}
                <cylinderGeometry args={[radius, radius, height, isMobile ? 16 : 24, 1, true]} /> 
                <meshBasicMaterial color={primaryColor} wireframe transparent opacity={0.15} side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
            </mesh>
            
            <mesh ref={ringRef} rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[radius - 0.5, 0.5, 16, 32]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.2} blending={AdditiveBlending} />
            </mesh>
            
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.2, 0]}>
                <ringGeometry args={[radius - 2, radius, 32]} />
                <meshBasicMaterial color="#ff0055" transparent opacity={0.3} side={DoubleSide} blending={AdditiveBlending} />
            </mesh>
        </group>
    );
};

const DigitalFloor: React.FC<{ isDark: boolean }> = ({ isDark }) => {
    // Dark Mode: Dark Blue/Black floor with Blue grid
    // Light Mode: Dark Grey floor (to reduce glare) with Lighter Grey grid
    
    // FIX: Using #353535 instead of #111111 to prevent Mobile PBR Shader Black Screen issues
    const planeColor = isDark ? "#1a1d26" : "#111111";
    const gridCellColor = isDark ? "#2f3b4c" : "#999999";
    const gridSectionColor = isDark ? "#0066cc" : "#555555";
    
    return (
        <group position={[0, -0.05, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
               <planeGeometry args={[1000, 1000]} />
               <meshStandardMaterial color={planeColor} roughness={0.8} metalness={0.2} />
            </mesh>
            <Grid 
                position={[0, 0.01, 0]} 
                args={[300, 300]} 
                cellSize={10} 
                cellThickness={0.8} 
                cellColor={gridCellColor} 
                sectionSize={50} 
                sectionThickness={1.2} 
                sectionColor={gridSectionColor} 
                fadeDistance={150} 
                infiniteGrid 
            />
        </group>
    );
}

const FloatingDataDebris: React.FC<{ isMobile: boolean, isDark: boolean }> = ({ isMobile, isDark }) => {
    return (
        <group>
            {/* OPTIMIZATION: Drastically reduced particle count for performance */}
            <Sparkles 
                count={isMobile ? 40 : 150} 
                scale={[150, 80, 150]} 
                size={isMobile ? 12 : 8} 
                speed={0.8} 
                opacity={0.4} 
                color={isDark ? "#0088ff" : "#004488"} 
                position={[0, 30, 0]} 
            />
            <Sparkles 
                count={isMobile ? 10 : 40} 
                scale={[100, 100, 100]} 
                size={isMobile ? 30 : 25} 
                speed={3.5} 
                opacity={0.9} 
                color={isDark ? "#ccffff" : "#ffffff"} 
                position={[0, 40, 0]} 
                noise={20} 
            />
        </group>
    )
}

// --- DETAILED STATS PANEL ---
const DetailedStats = () => {
  const { gl } = useThree();
  const [stats, setStats] = useState({ fps: 0, calls: 0, tris: 0, geoms: 0, tex: 0 });
  const frameRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  
  const renderStatsRef = useRef({ calls: 0, tris: 0 });

  useEffect(() => {
      return addAfterEffect(() => {
          renderStatsRef.current.calls = gl.info.render.calls;
          renderStatsRef.current.tris = gl.info.render.triangles;
      });
  }, [gl]);

  useFrame(() => {
    const now = performance.now();
    frameRef.current++;
    
    if (now - lastTimeRef.current >= 500) { 
      setStats({
        fps: Math.round(frameRef.current * 1000 / (now - lastTimeRef.current)),
        calls: renderStatsRef.current.calls,
        tris: renderStatsRef.current.tris,
        geoms: gl.info.memory.geometries,
        tex: gl.info.memory.textures
      });
      frameRef.current = 0;
      lastTimeRef.current = now;
    }
  });

  // Use fullscreen to ensure it overlays correctly as 2D UI, not 3D
  return (
    <Html fullscreen style={{ pointerEvents: 'none', zIndex: 999 }}>
        <div style={{
            position: 'absolute',
            top: '16px',
            left: '160px', // Positioned to the right of the Gamepad button
            background: 'rgba(5, 7, 10, 0.85)',
            color: '#00ffaa',
            padding: '8px 12px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '10px',
            border: '1px solid #006644',
            boxShadow: '0 0 10px rgba(0,255,170,0.1)',
            minWidth: '120px',
            lineHeight: '1.5',
            letterSpacing: '0.05em',
            pointerEvents: 'auto' // Allow interaction if needed (selecting text)
        }}>
          <div className="font-bold text-white border-b border-gray-700 mb-1 pb-1">SYSTEM METRICS</div>
          <div className="flex justify-between"><span>FPS:</span><span className="text-white">{stats.fps}</span></div>
          <div className="flex justify-between"><span>DRAWCALLS:</span><span className="text-white">{stats.calls}</span></div>
          <div className="flex justify-between"><span>TRIANGLES:</span><span className="text-white">{stats.tris}</span></div>
          <div className="flex justify-between"><span>GEOMETRY:</span><span className="text-white">{stats.geoms}</span></div>
          <div className="flex justify-between"><span>TEXTURES:</span><span className="text-white">{stats.tex}</span></div>
        </div>
    </Html>
  );
}


export function Arena() {
 const {isDarkScene,isRimLightOn,showStats} = useSettings();
 const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
 return <>
      {/* --- SCENE BACKGROUND & ATMOSPHERE --- */}
      {isDarkScene ? (
          <>
            <color attach="background" args={['#05070a']} />
            <fog attach="fog" args={['#05070a', 50, 150]} />
            {/* OPTIMIZATION: Reduced star count from 3000 to 1500 (500 on mobile) */}
            <Stars radius={200} depth={50} count={isMobile ? 500 : 1500} factor={4} saturation={0} fade speed={0.2} />
            
            {/* 1. PROCEDURAL STUDIO ENVIRONMENT (DARK) */}
            <Environment resolution={512}>
                <group rotation={[-Math.PI / 4, -0.3, 0]}>
                    <Lightformer intensity={1.5} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
                    {isRimLightOn && <Lightformer intensity={4} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[20, 1, 1]} color="#00ffff" />}
                    {isRimLightOn && <Lightformer intensity={4} rotation-y={-Math.PI / 2} position={[5, 1, -1]} scale={[20, 1, 1]} color="#ffaa00" />}
                    <Lightformer intensity={0.5} rotation-x={-Math.PI / 2} position={[0, -5, 0]} scale={[10, 10, 1]} color="white" />
                </group>
            </Environment>

            {/* 2. DRAMATIC LIGHTING (DARK) */}
            <ambientLight intensity={0.3} color="#202030" />
            <directionalLight position={[30, 50, 20]} intensity={2.5} color="#ffffff" />
            <pointLight position={[-30, 10, 0]} intensity={500} color="#aa00ff" distance={50} />
            
            {/* Rim Light (Back): VERY bright cyan light */}
            <spotLight 
                position={[0, 10, -20]} 
                angle={0.8} 
                penumbra={0.5} 
                intensity={isRimLightOn ? 20 : 0} 
                color="#00ffff" 
                distance={80} 
                target-position={[0, 0, 0]}
            />
          </>
      ) : (
          <>
            {/* DAYLIGHT MODE - FIX: PROCEDURAL ENVIRONMENT ONLY, NO EXTERNAL PRESETS */}
            <color attach="background" args={['#dceefb']} />
            <fog attach="fog" args={['#dceefb', 80, 200]} />
            <Sky sunPosition={[100, 20, 100]} turbidity={8} rayleigh={3} />
            
            {/* PROCEDURAL DAYLIGHT ENVIRONMENT (Replaces 'preset="city"' to fix mobile black screen) */}
            <Environment resolution={256}>
                 <group rotation={[-Math.PI / 4, -0.3, 0]}>
                    {/* Overhead Sky Light (White/Blue) */}
                    <Lightformer intensity={2} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} color="#ffffff" />
                    
                    {/* Warm Sun Reflection (Right) */}
                    <Lightformer intensity={2} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[20, 10, 1]} color="#fff0d4" />
                    
                    {/* Cool Fill Reflection (Left) */}
                    <Lightformer intensity={1} rotation-y={Math.PI / 2} position={[-10, 1, 0]} scale={[20, 10, 1]} color="#dceefb" />
                </group>
            </Environment>

            {/* SUNLIGHT */}
            <ambientLight intensity={0.9} color="#ffffff" />
            <directionalLight 
                position={[50, 100, 50]} 
                intensity={1.5} 
                color="#fff9e0" 
                castShadow 
                shadow-mapSize={[1024, 1024]}
            />
            {/* Fill Light */}
            <directionalLight position={[-10, 10, -10]} intensity={0.6} color="#e0f0ff" />

             {/* Rim Light (Back): White/Subtle for daylight */}
             <spotLight 
                position={[0, 10, -20]} 
                angle={0.8} 
                penumbra={0.5} 
                intensity={isRimLightOn ? 5 : 0} 
                color="#ffffff" 
                distance={80} 
                target-position={[0, 0, 0]}
            />
          </>
      )}


 <DigitalFloor isDark={isDarkScene} />
 <SimulationWall isDark={isDarkScene} isMobile={isMobile} />
 <FloatingDataDebris isMobile={isMobile} isDark={isDarkScene} />
 {showStats && <DetailedStats />}
 </>;
}
