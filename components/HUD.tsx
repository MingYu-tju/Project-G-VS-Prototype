import React from 'react';
import { useGameStore } from '../store';
import { LockState } from '../types';

export const HUD: React.FC = () => {
  const { boost, maxBoost, isOverheated, lockState, targets, currentTargetIndex, ammo, maxAmmo } = useGameStore();
  
  const target = targets[currentTargetIndex];

  let barColor = 'bg-blue-500';
  if (isOverheated) barColor = 'bg-red-600 animate-pulse';
  else if (boost < 30) barColor = 'bg-yellow-500';

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      
      {/* Target Info (Top Right) */}
      {target && (
        <div className="absolute top-8 right-8 flex flex-col items-end">
           <div className={`border-2 ${lockState === LockState.RED ? 'border-red-500 bg-red-900/30' : 'border-green-500 bg-green-900/30'} px-4 py-2 rounded-lg backdrop-blur-sm transition-colors duration-300`}>
               <h2 className="text-white font-mono text-xl font-bold tracking-widest">{target.name}</h2>
               <div className="flex items-center justify-end space-x-2 mt-1">
                  <span className={`text-xs font-mono ${lockState === LockState.RED ? 'text-red-400' : 'text-green-400'}`}>DIST: {target.position.distanceTo(useGameStore.getState().playerPos).toFixed(1)}m</span>
                  <div className={`w-2 h-2 rounded-full ${lockState === LockState.RED ? 'bg-red-500 animate-ping' : 'bg-green-500'}`}></div>
               </div>
           </div>
           <div className="mt-2 text-gray-400 text-xs font-mono bg-black/50 px-2 py-1 rounded">
             [E] SWITCH TARGET
           </div>
        </div>
      )}

      {/* Weapon Info (Bottom Right) */}
      <div className="absolute bottom-8 right-8 w-60">
          <div className="flex items-end justify-between bg-black/40 p-2 rounded border-r-4 border-red-500">
              <div className="text-red-400 font-mono text-sm">BEAM RIFLE</div>
              <div className="text-white font-mono text-3xl font-bold">
                  {ammo} <span className="text-lg text-gray-500">/ {maxAmmo}</span>
              </div>
          </div>
      </div>

      {/* Boost Gauge (Bottom Center) */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-96">
         <div className="flex justify-between text-white font-mono text-sm mb-1 shadow-black drop-shadow-md">
            <span>THRUSTER</span>
            <span className={isOverheated ? 'text-red-500 font-bold' : 'text-cyan-300'}>
                {isOverheated ? 'OVERHEAT' : `${Math.floor(boost)}%`}
            </span>
         </div>
         {/* Centered Bar Container */}
         <div className="h-4 bg-gray-900/80 border border-gray-600 rounded skew-x-[-12deg] overflow-hidden p-0.5 relative">
             {/* Fill */}
             <div 
               className={`h-full ${barColor} transition-all duration-75 ease-linear`} 
               style={{ width: `${(boost / maxBoost) * 100}%` }}
             />
         </div>
      </div>

      {/* Controls Helper (Bottom Left) */}
      <div className="absolute bottom-8 left-8 text-white/50 font-mono text-xs bg-black/40 p-4 rounded border-l-2 border-white/20">
         <p className="mb-1"><span className="text-white font-bold">WASD</span> : MOVE</p>
         <p className="mb-1"><span className="text-white font-bold">SPACE (HOLD)</span> : ASCEND</p>
         <p className="mb-1"><span className="text-white font-bold">L</span> : BOOST DASH</p>
         <p className="mb-1"><span className="text-white font-bold">J</span> : SHOOT</p>
         <p><span className="text-white font-bold">E</span> : CYCLE TARGET</p>
      </div>

    </div>
  );
};