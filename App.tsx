
import React from 'react';
import { GameScene } from './components/GameScene';
import { HUD } from './components/HUD';
import { MobileControls } from './components/MobileControls';
import { GamepadControls } from './components/GamepadControls';

function App() {
  return (
    <div className="w-full h-screen relative bg-black">
      {/* 3D Layer */}
      <div className="absolute inset-0 z-0">
        <GameScene />
      </div>
      
      {/* UI Layer */}
      <div className="absolute inset-0 z-10">
        <HUD />
      </div>

      {/* Mobile Controls Layer (Auto-detects mobile) */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <MobileControls />
      </div>

      {/* Gamepad Input Listener */}
      <GamepadControls />
      
    </div>
  );
}

export default App;
