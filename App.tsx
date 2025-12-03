import React, { useState, useEffect, useCallback } from 'react';
import { GameScene } from './components/GameScene';
import { HUD } from './components/HUD';
import { MobileControls } from './components/MobileControls';
import { GamepadControls } from './components/GamepadControls';
import { PoseEditor } from './components/PoseEditor';
import { ModelBuilder } from './components/ModelBuilder';
import { useGameStore } from './store';
import { resumeAudioContext } from './components/AudioController'; // Updated Import

function App() {
  const { 
    isGameStarted, 
    startGame, 
    isRimLightOn, 
    toggleRimLight,
    isOutlineOn,
    toggleOutline, 
    showStats, 
    toggleStats,
    areNPCsPaused,
    toggleNPCsPaused,
    isDarkScene,
    toggleScene
  } = useGameStore();
  
  const [showEditor, setShowEditor] = useState(false);
  const [showModelBuilder, setShowModelBuilder] = useState(false);
  
  // UI State for Tools Menu Collapse
  const [isToolsOpen, setIsToolsOpen] = useState(true);

  // Auto-collapse tools on mobile initially
  useEffect(() => {
      if (window.innerWidth < 768) {
          setIsToolsOpen(false);
      }
  }, []);

  const handleStart = useCallback(() => {
    resumeAudioContext();
    
    // Attempt to enter fullscreen mode ONLY on mobile devices
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;

    if (isMobile) {
        const elem = document.documentElement as any;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch((err: any) => {
            console.log(`Fullscreen request failed: ${err.message}`);
          });
        } else if (elem.webkitRequestFullscreen) { /* Safari */
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
          elem.msRequestFullscreen();
        }
    }

    startGame();
  }, [startGame]);

  // --- AUTO-START ON INPUT ---
  useEffect(() => {
    if (isGameStarted || showEditor || showModelBuilder) return;

    // 1. Keyboard Listener
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.isTrusted) {
            handleStart();
        }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 2. Raw Gamepad Polling
    let animationFrameId: number;
    const pollGamepad = () => {
        const gamepads = navigator.getGamepads();
        let pressed = false;
        for (const gp of gamepads) {
            if (gp && gp.buttons.some(b => b.pressed)) {
                pressed = true;
                break;
            }
        }
        
        if (pressed) {
            handleStart();
        } else {
            animationFrameId = requestAnimationFrame(pollGamepad);
        }
    };
    animationFrameId = requestAnimationFrame(pollGamepad);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        cancelAnimationFrame(animationFrameId);
    };
  }, [isGameStarted, showEditor, showModelBuilder, handleStart]);

  return (
    <div className="w-full h-screen relative bg-black select-none overflow-hidden">
      
      {/* OVERLAYS */}
      {showEditor && <PoseEditor onClose={() => setShowEditor(false)} />}
      {showModelBuilder && <ModelBuilder onClose={() => setShowModelBuilder(false)} />}

      {!showEditor && !showModelBuilder && (
          <>
            {/* START SCREEN OVERLAY */}
            {!isGameStarted && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm text-white">
                    <div className="relative mb-8 group">
                        <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 drop-shadow-[0_0_15px_rgba(0,255,255,0.5)]">
                            PROJECT G-VS
                        </h1>
                        <div className="absolute -bottom-2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>
                    </div>

                    <p className="mb-10 text-gray-400 font-mono text-xs md:text-sm tracking-widest border border-gray-800 px-4 py-2 rounded bg-black/50">
                        HIGH MOBILITY MECH SIMULATOR
                    </p>

                    <button
                        onClick={handleStart}
                        className="relative px-10 py-4 bg-cyan-600/20 hover:bg-cyan-500/30 text-cyan-400 font-bold rounded border border-cyan-500/50 shadow-[0_0_30px_rgba(0,255,255,0.2)] transition-all duration-200 active:scale-95 group overflow-hidden"
                    >
                        <span className="relative z-10 tracking-[0.2em] group-hover:text-white transition-colors">SYSTEM START</span>
                        <div className="absolute inset-0 bg-cyan-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    </button>
                    
                    <p className="mt-4 text-[10px] text-gray-500 animate-pulse">
                        PRESS ANY KEY OR BUTTON TO START
                    </p>

                    <div className="mt-16 text-[10px] text-gray-600 font-mono">
                        VER. PROTOTYPE-0.3
                    </div>
                </div>
            )}
            
            {/* TOP ROW: STATS BUTTON (Next to Gamepad Button which is at top-4 left-4) */}
            <div className="absolute top-4 left-48 z-50 pointer-events-none">
                <button 
                    onClick={toggleStats}
                    className={`pointer-events-auto px-3 py-1 md:px-4 md:py-2 rounded border transition-colors font-mono text-[10px] md:text-xs tracking-widest ${
                        showStats 
                        ? 'bg-green-900/80 hover:bg-green-800 border-green-500 text-green-300' 
                        : 'bg-black/60 hover:bg-gray-800 border-gray-600 text-gray-500'
                    }`}
                >
                    STATS: {showStats ? "ON" : "OFF"}
                </button>
            </div>

            {/* SECOND ROW: TOOLS MENU (Collapsible) */}
            <div className="absolute top-16 left-4 z-50 flex flex-row items-center space-x-2 pointer-events-auto transition-all duration-300">
                {/* Toggle Button */}
                <button 
                    onClick={() => setIsToolsOpen(!isToolsOpen)}
                    className={`h-6 flex items-center justify-center rounded border font-mono text-[10px] font-bold transition-all ${
                        isToolsOpen 
                        ? 'w-6 bg-gray-800 text-gray-500 border-gray-600 hover:text-white' 
                        : 'px-3 bg-cyan-900/80 text-cyan-300 border-cyan-500 hover:bg-cyan-800 shadow-[0_0_10px_rgba(0,255,255,0.3)]'
                    }`}
                    title={isToolsOpen ? "Collapse Menu" : "Expand Tools"}
                >
                    {isToolsOpen ? "✕" : "TOOLS"}
                </button>

                {/* Collapsible Container */}
                <div className={`flex flex-row space-x-2 overflow-hidden transition-all duration-300 origin-left ${isToolsOpen ? 'opacity-100 max-w-[700px]' : 'opacity-0 max-w-0'}`}>
                    <button 
                        onClick={() => setShowEditor(true)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-[10px] px-3 py-1 rounded border border-gray-700 transition-colors font-mono whitespace-nowrap"
                    >
                        POSE EDITOR
                    </button>
                    <button 
                        onClick={() => setShowModelBuilder(true)}
                        className="bg-gray-800 hover:bg-gray-700 text-cyan-400 hover:text-white text-[10px] px-3 py-1 rounded border border-cyan-900/50 transition-colors font-mono whitespace-nowrap"
                    >
                        MODEL FACTORY
                    </button>
                    <button 
                        onClick={toggleScene}
                        className={`text-[10px] px-3 py-1 rounded border transition-colors font-mono whitespace-nowrap ${
                            !isDarkScene 
                            ? 'bg-yellow-600/80 hover:bg-yellow-500 border-yellow-400 text-white' 
                            : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-500'
                        }`}
                    >
                        SCENE: {isDarkScene ? "DARK" : "LIGHT"}
                    </button>
                    <button 
                        onClick={toggleRimLight}
                        className={`text-[10px] px-3 py-1 rounded border transition-colors font-mono whitespace-nowrap ${
                            isRimLightOn 
                            ? 'bg-cyan-900/80 hover:bg-cyan-800 border-cyan-500 text-cyan-300' 
                            : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-500'
                        }`}
                    >
                        RIM: {isRimLightOn ? "ON" : "OFF"}
                    </button>
                    <button 
                        onClick={toggleOutline}
                        className={`text-[10px] px-3 py-1 rounded border transition-colors font-mono whitespace-nowrap ${
                            isOutlineOn 
                            ? 'bg-cyan-900/80 hover:bg-cyan-800 border-cyan-500 text-cyan-300' 
                            : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-500'
                        }`}
                    >
                        OUTLINE: {isOutlineOn ? "ON" : "OFF"}
                    </button>
                    <button 
                        onClick={toggleNPCsPaused}
                        className={`px-3 py-1 rounded border text-[10px] font-mono transition-all whitespace-nowrap ${
                            areNPCsPaused 
                            ? 'bg-red-900/80 hover:bg-red-800 border-red-500 text-red-300' 
                            : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-500'
                        }`}
                    >
                        AI: {areNPCsPaused ? "PAUSED" : "ACTIVE"}
                    </button>
                </div>
            </div>

            {/* 3D Layer */}
            <div className="absolute inset-0 z-0">
                <GameScene />
            </div>
            
            {/* UI Layer */}
            <div className={`absolute inset-0 z-10 transition-opacity duration-1000 ${isGameStarted ? 'opacity-100' : 'opacity-0'}`}>
                <HUD />
            </div>

            {/* Mobile Controls Layer */}
            <div className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-1000 ${isGameStarted ? 'opacity-100' : 'opacity-0'}`}>
                <MobileControls />
            </div>

            {/* Gamepad Input Listener (Renders its own button at top-4 left-4) */}
            <GamepadControls />
          </>
      )}
      
    </div>
  );
}

export default App;