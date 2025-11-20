import React from 'react';
import { GameScene } from './components/GameScene';
import { HUD } from './components/HUD';

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
      
      {/* Simple Overlay if no WebGL support (optional, keeping it clean for now) */}
    </div>
  );
}

export default App;