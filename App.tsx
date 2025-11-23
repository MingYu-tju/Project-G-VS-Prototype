import React from 'react';
import { GameScene } from './components/GameScene';
import { HUD } from './components/HUD';
import { MobileControls } from './components/MobileControls';
import { GamepadControls } from './components/GamepadControls';
import { useGameStore } from './store';
import { resumeAudioContext } from './components/Player';

function App() {
  const { isGameStarted, startGame } = useGameStore();

  const handleStart = () => {
    // 1. Trigger Audio Context Resume (Must happen on user interaction)
    resumeAudioContext();
    // 2. Start Game Loop
    startGame();
  };

  return (
    <div className="w-full h-screen relative bg-black select-none overflow-hidden">
      
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

            <div className="mt-16 text-[10px] text-gray-600 font-mono">
                VER. PROTOTYPE-0.2
            </div>
        </div>
      )}

      {/* 3D Layer */}
      <div className="absolute inset-0 z-0">
        <GameScene />
      </div>
      
      {/* UI Layer */}
      <div className={`absolute inset-0 z-10 transition-opacity duration-1000 ${isGameStarted ? 'opacity-100' : 'opacity-0'}`}>
        <HUD />
      </div>

      {/* Mobile Controls Layer (Auto-detects mobile) */}
      <div className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-1000 ${isGameStarted ? 'opacity-100' : 'opacity-0'}`}>
        <MobileControls />
      </div>

      {/* Gamepad Input Listener */}
      <GamepadControls />
      
    </div>
  );
}

export default App;