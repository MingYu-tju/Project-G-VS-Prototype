


import React, { useEffect, useRef, useState } from 'react';

// Helper to dispatch keyboard events that Player.tsx can hear
const simulateKey = (key: string, type: 'keydown' | 'keyup') => {
    const event = new KeyboardEvent(type, {
        key: key,
        code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`,
        bubbles: true,
        cancelable: true,
    });
    window.dispatchEvent(event);
};

// Extracted ActionButton to avoid re-creation on render and ensure proper event handling
const ActionButton: React.FC<{ 
    label: string, 
    kKey: string, 
    color: string, 
    posClass: string, 
    sizeClass?: string 
}> = ({ label, kKey, color, posClass, sizeClass = "w-16 h-16" }) => {
    
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        simulateKey(kKey, 'keydown');
        if (navigator.vibrate) navigator.vibrate(10);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        simulateKey(kKey, 'keyup');
    };

    return (
        <div 
            className={`absolute ${posClass} ${sizeClass} rounded-full ${color} flex items-center justify-center text-white font-bold shadow-lg active:scale-90 transition-transform select-none touch-none border-2 border-white/20 backdrop-blur-sm`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd} // Critical: Handle touch cancellation (incoming calls, off-screen, etc.)
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }} // Critical: Prevent context menu on long press
        >
            {label}
        </div>
    );
};

export const MobileControls: React.FC = () => {
    const [isMobile, setIsMobile] = useState(false);
    
    // Joystick State
    const joystickRef = useRef<HTMLDivElement>(null);
    const knobRef = useRef<HTMLDivElement>(null);
    const touchIdRef = useRef<number | null>(null);
    const centerRef = useRef<{x: number, y: number}>({x: 0, y: 0});
    const activeDirectionRef = useRef<string | null>(null);

    useEffect(() => {
        const checkMobile = () => {
            const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            setIsMobile(hasTouch && window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // --- JOYSTICK LOGIC ---
    useEffect(() => {
        if (!isMobile) return;

        const joystick = joystickRef.current;
        if (!joystick) return;

        const handleStart = (e: TouchEvent) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            touchIdRef.current = touch.identifier;
            
            const rect = joystick.getBoundingClientRect();
            centerRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            
            updateKnob(touch.clientX, touch.clientY);
        };

        const handleMove = (e: TouchEvent) => {
            e.preventDefault();
            if (touchIdRef.current === null) return;
            
            const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
            if (touch) {
                updateKnob(touch.clientX, touch.clientY);
            }
        };

        const handleEnd = (e: TouchEvent) => {
            e.preventDefault();
            const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
            if (touch) {
                touchIdRef.current = null;
                resetKnob();
            }
        };

        const updateKnob = (clientX: number, clientY: number) => {
            if (!knobRef.current) return;
            
            const maxRadius = 40;
            const dx = clientX - centerRef.current.x;
            const dy = clientY - centerRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            let limitedX = dx;
            let limitedY = dy;
            
            if (distance > maxRadius) {
                const ratio = maxRadius / distance;
                limitedX = dx * ratio;
                limitedY = dy * ratio;
            }
            
            knobRef.current.style.transform = `translate(${limitedX}px, ${limitedY}px)`;

            if (distance < 10) {
                if (activeDirectionRef.current) {
                    simulateKey(activeDirectionRef.current, 'keyup');
                    activeDirectionRef.current = null;
                }
                return;
            }

            const angle = Math.atan2(dy, dx); 
            const deg = angle * (180 / Math.PI);

            let newDir = '';
            if (deg > -135 && deg < -45) newDir = 'w';
            else if (deg > 45 && deg < 135) newDir = 's';
            else if (deg >= -45 && deg <= 45) newDir = 'd';
            else newDir = 'a';

            if (newDir !== activeDirectionRef.current) {
                if (activeDirectionRef.current) {
                    simulateKey(activeDirectionRef.current, 'keyup');
                }
                simulateKey(newDir, 'keydown');
                activeDirectionRef.current = newDir;
            }
        };

        const resetKnob = () => {
            if (knobRef.current) {
                knobRef.current.style.transform = `translate(0px, 0px)`;
            }
            if (activeDirectionRef.current) {
                simulateKey(activeDirectionRef.current, 'keyup');
                activeDirectionRef.current = null;
            }
        };

        joystick.addEventListener('touchstart', handleStart, { passive: false });
        joystick.addEventListener('touchmove', handleMove, { passive: false });
        joystick.addEventListener('touchend', handleEnd, { passive: false });
        joystick.addEventListener('touchcancel', handleEnd, { passive: false });

        return () => {
            joystick.removeEventListener('touchstart', handleStart);
            joystick.removeEventListener('touchmove', handleMove);
            joystick.removeEventListener('touchend', handleEnd);
            joystick.removeEventListener('touchcancel', handleEnd);
        };
    }, [isMobile]);

    if (!isMobile) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
            {/* LEFT JOYSTICK AREA */}
            <div className="absolute bottom-8 left-8 w-40 h-40 pointer-events-auto">
                <div 
                    ref={joystickRef}
                    className="w-full h-full rounded-full bg-gray-900/40 border border-white/20 backdrop-blur-sm relative flex items-center justify-center"
                >
                    <div 
                        ref={knobRef}
                        className="w-16 h-16 rounded-full bg-cyan-500/80 shadow-[0_0_15px_rgba(0,255,255,0.5)] border border-cyan-200"
                    />
                    <div className="absolute top-2 text-white/30 text-xs font-bold">▲</div>
                    <div className="absolute bottom-2 text-white/30 text-xs font-bold">▼</div>
                    <div className="absolute left-2 text-white/30 text-xs font-bold">◀</div>
                    <div className="absolute right-2 text-white/30 text-xs font-bold">▶</div>
                </div>
                <div className="text-center text-white/40 text-[10px] font-mono mt-2">MOVE / DOUBLE TAP TO EVADE</div>
            </div>

            {/* RIGHT BUTTONS AREA */}
            <div className="absolute bottom-8 right-8 w-48 h-48 pointer-events-auto">
                {/* SWITCH TARGET (Top Right) */}
                <ActionButton 
                    label="TGT" 
                    kKey=" " 
                    color="bg-yellow-600/60" 
                    posClass="top-0 right-0" 
                    sizeClass="w-14 h-14"
                />

                {/* BOOST (Bottom) */}
                <ActionButton 
                    label="BOOST" 
                    kKey="l" 
                    color="bg-blue-600/60" 
                    posClass="bottom-0 left-1/2 -translate-x-1/2" 
                />

                {/* SHOOT (Left) */}
                <ActionButton 
                    label="SHT" 
                    kKey="j" 
                    color="bg-red-600/60" 
                    posClass="top-1/2 left-0 -translate-y-1/2" 
                    sizeClass="w-16 h-16" 
                />

                {/* MELEE (Top Center / Right) */}
                <ActionButton 
                    label="⚔" 
                    kKey="k" 
                    color="bg-orange-600/60" 
                    posClass="top-1/2 right-0 -translate-y-1/2" 
                    sizeClass="w-16 h-16" 
                />
            </div>
        </div>
    );
};