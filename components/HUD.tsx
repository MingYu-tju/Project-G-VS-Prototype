import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { LockState } from '../types';

export const HUD: React.FC = () => {
  const { boost, maxBoost, isOverheated, lockState, targets, currentTargetIndex, ammo, maxAmmo } = useGameStore();
  
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
      const checkMobile = () => {
          const ua = navigator.userAgent;
          const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
          const isSmallScreen = window.innerWidth < 1024;
          const hasTouch = navigator.maxTouchPoints > 0;
          
          // Consider it mobile if it's a known mobile UA OR (has touch AND is small screen)
          setIsMobile(isMobileDevice || (hasTouch && isSmallScreen));
      };
      
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const target = targets[currentTargetIndex];

  let barColor = 'bg-blue-500';
  if (isOverheated) barColor = 'bg-red-600 animate-pulse';
  else if (boost < 30) barColor = 'bg-yellow-500';

  // Check if the current target is targeting the player
  const isTargetingPlayer = target?.targetId === 'player';
  const warningColor = lockState === LockState.RED ? 'text-red-500 fill-red-500' : 'text-green-500 fill-green-500';

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      
      {/* TARGET ALERT INDICATOR (Top Center) - Always Visible */}
      {isTargetingPlayer && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[220px] md:w-1/3 max-w-md h-24 z-50">
              <svg viewBox="0 0 400 80" className="w-full h-full drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">
                  {/* Background Shape */}
                  <path d="M0,0 L400,0 L360,40 L200,60 L40,40 Z" className={`${warningColor} opacity-20`} />
                  {/* Outline */}
                  <path d="M0,0 L40,40 L200,60 L360,40 L400,0" fill="none" stroke="currentColor" strokeWidth="2" className={warningColor} />
                  {/* Inner Detail Lines */}
                  <line x1="180" y1="10" x2="195" y2="45" stroke="currentColor" strokeWidth="1" className={warningColor} />
                  <line x1="220" y1="10" x2="205" y2="45" stroke="currentColor" strokeWidth="1" className={warningColor} />
                  
                  {/* Text */}
                  <text x="200" y="30" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="bold" letterSpacing="4" className={warningColor}>
                      WARNING
                  </text>
                  <text x="200" y="50" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="bold" letterSpacing="2" className={`${warningColor} animate-pulse`}>
                      LOCK DETECTED
                  </text>
              </svg>
          </div>
      )}

      {/* Target Info (Top Right) - DESKTOP ONLY */}
      {!isMobile && target && (
        <div className="flex absolute top-8 right-8 flex-col items-end">
           <div className={`border-2 ${lockState === LockState.RED ? 'border-red-500 bg-red-900/30' : 'border-green-500 bg-green-900/30'} px-4 py-2 rounded-lg backdrop-blur-sm transition-colors duration-300`}>
               <h2 className="text-white font-mono text-xl font-bold tracking-widest">{target.name}</h2>
               <div className="flex items-center justify-end space-x-2 mt-1">
                  <span className={`text-xs font-mono ${lockState === LockState.RED ? 'text-red-400' : 'text-green-400'}`}>DIST: {target.position.distanceTo(useGameStore.getState().playerPos).toFixed(1)}m</span>
                  <div className={`w-2 h-2 rounded-full ${lockState === LockState.RED ? 'bg-red-500 animate-ping' : 'bg-green-500'}`}></div>
               </div>
           </div>
           <div className="mt-2 text-gray-400 text-xs font-mono bg-black/50 px-2 py-1 rounded">
             [SPACE] SWITCH TARGET
           </div>
        </div>
      )}

      {/* Weapon Info - ADAPTIVE */}
      {/* On Mobile: Always Top Right, Small. On Desktop: Bottom Right, Large. */}
      <div className={`absolute transition-all duration-300 ${
          isMobile 
            ? 'top-4 right-4 w-32' // Mobile Fixed
            : 'top-4 right-4 md:top-auto md:left-auto md:bottom-8 md:right-8 w-32 md:w-60' // Desktop Responsive
      }`}>
          <div className="flex items-end justify-between bg-black/40 p-2 rounded border-r-4 border-red-500">
              <div className={`text-red-400 font-mono ${isMobile ? 'text-[10px]' : 'text-[10px] md:text-sm'}`}>BEAM RIFLE</div>
              <div className={`text-white font-mono font-bold ${isMobile ? 'text-xl' : 'text-xl md:text-3xl'}`}>
                  {ammo} <span className={`text-gray-500 ${isMobile ? 'text-xs' : 'text-xs md:text-lg'}`}>/ {maxAmmo}</span>
              </div>
          </div>
      </div>

      {/* Boost Gauge (Bottom Center) */}
      {/* On Mobile: Always narrow width to fit between controls. */}
      <div className={`absolute left-1/2 -translate-x-1/2 transition-all duration-300 ${
          isMobile 
            ? 'bottom-4 w-50' // Mobile: Higher up (above buttons), narrower
            : 'bottom-20 md:bottom-12 w-60 md:w-96' // Desktop: Lower, wider
      }`}>
         <div className={`flex justify-between text-white font-mono mb-1 shadow-black drop-shadow-md ${isMobile ? 'text-xs' : 'text-xs md:text-sm'}`}>
            <span>THRUSTER</span>
            <span className={isOverheated ? 'text-red-500 font-bold' : 'text-cyan-300'}>
                {isOverheated ? 'OVERHEAT' : `${Math.floor(boost)}%`}
            </span>
         </div>
         {/* Centered Bar Container */}
         <div className={`bg-gray-900/80 border border-gray-600 rounded skew-x-[-12deg] overflow-hidden p-0.5 relative ${isMobile ? 'h-3' : 'h-3 md:h-4'}`}>
             {/* Fill */}
             <div 
               className={`h-full ${barColor} transition-all duration-75 ease-linear`} 
               style={{ width: `${(boost / maxBoost) * 100}%` }}
             />
         </div>
      </div>

      {/* Controls Helper (Bottom Left) - DESKTOP ONLY */}
      {!isMobile && (
          <div className="hidden md:block absolute bottom-8 left-8 text-white/50 font-mono text-xs bg-black/40 p-4 rounded border-l-2 border-white/20">
             <p className="mb-1"><span className="text-white font-bold">WASD</span> : MOVE</p>
             <p className="mb-1"><span className="text-white font-bold">DOUBLE TAP (WASD)</span> : STEP</p>
             <p className="mb-1"><span className="text-white font-bold">L (HOLD)</span> : JUMP / ASCEND</p>
             <p className="mb-1"><span className="text-white font-bold">L (DOUBLE TAP)</span> : BOOST DASH</p>
             <p className="mb-1"><span className="text-white font-bold">J</span> : SHOOT</p>
             <p className="mb-1"><span className="text-white font-bold">K</span> : MELEE</p>
             <p><span className="text-white font-bold">SPACE</span> : SWITCH TARGET</p>
          </div>
      )}

    </div>
  );
};
