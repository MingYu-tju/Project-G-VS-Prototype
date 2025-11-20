import React from 'react';
import { Html } from '@react-three/drei';
import { useGameStore } from '../store';
import { LockState } from '../types';

export const LockReticle: React.FC = () => {
  const { targets, currentTargetIndex, lockState } = useGameStore();
  const target = targets[currentTargetIndex];

  if (!target) return null;

  const isRed = lockState === LockState.RED;
  const colorClass = isRed ? 'border-red-500 shadow-red-500/50' : 'border-green-400 shadow-green-400/50';
  
  // [CONFIG] Adjust Y offset here to move the UI up/down
  // +1.5 is roughly chest/head height
  const uiPosition: [number, number, number] = [target.position.x, target.position.y + 1.5, target.position.z];

  return (
    <group position={uiPosition}>
      <Html position={[0, 0, 0]} center zIndexRange={[100, 0]}>
        {/* Increased w-32 to w-40 (+25%) */}
        <div className="relative w-40 h-40 flex items-center justify-center pointer-events-none select-none">
            
            {/* Main Rotating Ring */}
            {/* Increased w-16 to w-20 (+25%) */}
            <div 
                className={`absolute w-20 h-20 border-2 rounded-full flex items-center justify-center transition-all duration-300 ${colorClass} ${isRed ? 'scale-110 rotate-45 border-4' : 'scale-100'}`}
            >
               {isRed && <div className="w-1 h-1 bg-red-500 animate-ping" />}
            </div>

            {/* Outer Brackets */}
            {/* Increased w-24 to w-32 (+33%, closest tailwind step) */}
            <div 
                className={`absolute w-32 h-32 border-l-2 border-r-2 border-opacity-60 rounded-lg transition-colors duration-300 ${isRed ? 'border-red-500' : 'border-green-500'}`} 
            />
            
            {/* Distance Text */}
            <div className={`absolute -bottom-8 text-xs font-mono font-bold ${isRed ? 'text-red-400' : 'text-green-400'} bg-black/60 px-1 rounded whitespace-nowrap`}>
                 LOCK {isRed ? '[ACTIVE]' : ''}
            </div>

        </div>
      </Html>
    </group>
  );
};