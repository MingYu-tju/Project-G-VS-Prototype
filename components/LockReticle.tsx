import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { useGameStore } from '../store';
import { LockState } from '../types';

export const LockReticle: React.FC = () => {
  const { targets, currentTargetIndex, lockState } = useGameStore();
  const target = targets[currentTargetIndex];
  
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
      const checkMobile = () => {
          const ua = navigator.userAgent;
          const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
          const isSmallScreen = window.innerWidth < 1024;
          const hasTouch = navigator.maxTouchPoints > 0;
          
          // Consistent mobile check
          setIsMobile(isMobileDevice || (hasTouch && isSmallScreen));
      };
      
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!target) return null;

  const isRed = lockState === LockState.RED;
  const colorClass = isRed ? 'border-red-500 shadow-red-500/50' : 'border-green-400 shadow-green-400/50';
  
  // [CONFIG] Adjust Y offset here to move the UI up/down
  // +1.5 is roughly chest/head height
  const uiPosition: [number, number, number] = [target.position.x, target.position.y + 1.5, target.position.z];

  // CONDITIONAL CLASSES:
  // If isMobile is true, we DO NOT use md: prefixes, enforcing small size.
  // If isMobile is false (Desktop), we allow md: prefixes to scale it up.
  
  const containerClass = isMobile 
    ? "w-16 h-16" 
    : "w-16 h-16 md:w-40 md:h-40";

  const ringClass = isMobile
    ? "w-8 h-8"
    : "w-8 h-8 md:w-20 md:h-20";

  const bracketClass = isMobile
    ? "w-12 h-12"
    : "w-12 h-12 md:w-32 md:h-32";
    
  const textPosClass = isMobile
    ? "-bottom-4 text-[9px]"
    : "-bottom-4 md:-bottom-8 text-[9px] md:text-xs";

  return (
    <group position={uiPosition}>
      <Html position={[0, 0, 0]} center zIndexRange={[100, 0]}>
        <div className={`relative ${containerClass} flex items-center justify-center pointer-events-none select-none transition-all duration-300`}>
            
            {/* Main Rotating Ring */}
            <div 
                className={`absolute ${ringClass} border-2 rounded-full flex items-center justify-center transition-all duration-300 ${colorClass} ${isRed ? 'scale-110 rotate-45 border-4' : 'scale-100'}`}
            >
               {isRed && <div className="w-1 h-1 bg-red-500 animate-ping" />}
            </div>

            {/* Outer Brackets */}
            <div 
                className={`absolute ${bracketClass} border-l-2 border-r-2 border-opacity-60 rounded-lg transition-colors duration-300 ${isRed ? 'border-red-500' : 'border-green-500'}`} 
            />
            
            {/* Distance Text */}
            <div className={`absolute ${textPosClass} font-mono font-bold ${isRed ? 'text-red-400' : 'text-green-400'} bg-black/60 px-1 rounded whitespace-nowrap`}>
                 LOCK {isRed ? '[ACTIVE]' : ''}
            </div>

        </div>
      </Html>
    </group>
  );
};
