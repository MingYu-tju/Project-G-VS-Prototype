
import React, { useEffect, useRef, useState } from 'react';

// Actions we can bind
// UNIFIED: DASH and JUMP are now a single 'BOOST' action (Tap = Dash, Hold = Jump/Ascend)
type ActionType = 'BOOST' | 'SHOOT' | 'SWITCH TARGET';

// Default standard mapping (Xbox/PS layout approximations)
// 0: A/Cross, 1: B/Circle, 2: X/Square, 3: Y/Triangle
const DEFAULT_MAPPING: Record<number, ActionType> = {
    0: 'BOOST',          // A / Cross - Primary Movement (Dash/Jump)
    2: 'SHOOT',          // X / Square - Primary Attack
    1: 'SWITCH TARGET',  // B / Circle - Utility
};

// Map Action to the actual Keyboard Key that Player.tsx listens for
const ACTION_TO_KEY: Record<ActionType, string> = {
    'BOOST': 'l', // Maps to 'l' which handles both Dash (tap) and Ascend (hold)
    'SHOOT': 'j',
    'SWITCH TARGET': ' '
};

// Helper to dispatch keyboard events
const simulateKey = (key: string, type: 'keydown' | 'keyup') => {
    const event = new KeyboardEvent(type, {
        key: key,
        code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`,
        bubbles: true,
        cancelable: true,
    });
    window.dispatchEvent(event);
};

export const GamepadControls: React.FC = () => {
    const requestRef = useRef<number>(0);
    
    // --- STATE ---
    const [isOpen, setIsOpen] = useState(false);
    const [mapping, setMapping] = useState<Record<number, ActionType>>(DEFAULT_MAPPING);
    const [listeningFor, setListeningFor] = useState<ActionType | null>(null);
    
    // Active Gamepad Selection
    const [activeGamepadIndex, setActiveGamepadIndex] = useState<number>(0);
    const [availableGamepads, setAvailableGamepads] = useState<{index: number, id: string}[]>([]);
    const [currentGamepadId, setCurrentGamepadId] = useState<string>("");

    // Track previous frame button states to detect "Just Pressed" for rebinding
    const prevButtons = useRef<boolean[]>([]);
    
    // Track dispatched keys to avoid spamming events during gameplay
    const keyState = useRef<{ [key: string]: boolean }>({});

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('gvs_gamepad_mapping_v2'); // Updated key for new schema
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const numKeyed: Record<number, ActionType> = {};
                for (const k in parsed) numKeyed[parseInt(k)] = parsed[k];
                setMapping(numKeyed);
            } catch (e) {
                console.error("Failed to load mappings", e);
            }
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        localStorage.setItem('gvs_gamepad_mapping_v2', JSON.stringify(mapping));
    }, [mapping]);

    // --- GAME LOOP ---
    const update = () => {
        const gamepads = navigator.getGamepads();
        if (!gamepads) return;

        // 1. Scan for available gamepads (for UI)
        const currentAvailable: {index: number, id: string}[] = [];
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                currentAvailable.push({ index: i, id: gamepads[i]!.id });
            }
        }
        
        // Check if the currently selected index is still valid
        let gp = gamepads[activeGamepadIndex];
        
        // If selected gamepad is disconnected, try to fallback to the first available one
        if (!gp && currentAvailable.length > 0) {
            gp = gamepads[currentAvailable[0].index];
        }

        // --- UI STATE SYNC ---
        if (isOpen) {
             if (JSON.stringify(currentAvailable) !== JSON.stringify(availableGamepads)) {
                 setAvailableGamepads(currentAvailable);
             }
             if (gp && gp.id !== currentGamepadId) {
                 setCurrentGamepadId(gp.id);
             }
        }

        if (!gp) {
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        // --- REBINDING MODE ---
        if (listeningFor) {
            gp.buttons.forEach((btn, index) => {
                if (btn.pressed && !prevButtons.current[index]) {
                    const newMapping = { ...mapping };
                    // Remove any existing bindings for this action to avoid conflicts
                    Object.keys(newMapping).forEach(key => {
                         if (newMapping[parseInt(key)] === listeningFor) {
                             delete newMapping[parseInt(key)];
                         }
                    });
                    newMapping[index] = listeningFor;
                    setMapping(newMapping);
                    setListeningFor(null); 
                }
            });
            gp.buttons.forEach((b, i) => prevButtons.current[i] = b.pressed);
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        // --- SETTINGS MENU OPEN? ---
        if (isOpen) {
             gp.buttons.forEach((b, i) => prevButtons.current[i] = b.pressed);
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        // --- GAMEPLAY LOGIC ---

        const THRESHOLD = 0.5;
        const axisX = gp.axes[0] || 0;
        const axisY = gp.axes[1] || 0;

        const axisKeys: { [key: string]: boolean } = {
            'd': axisX > THRESHOLD,
            'a': axisX < -THRESHOLD,
            's': axisY > THRESHOLD,
            'w': axisY < -THRESHOLD,
        };

        const buttonKeys: { [key: string]: boolean } = {
            ' ': false, 'l': false, 'j': false
        };

        gp.buttons.forEach((btn, index) => {
            if (btn.pressed) {
                const action = mapping[index];
                if (action) {
                    const keyChar = ACTION_TO_KEY[action];
                    if (keyChar) buttonKeys[keyChar] = true;
                }
            }
        });

        const allKeys = { ...axisKeys, ...buttonKeys };

        for (const key in allKeys) {
            const isPressed = allKeys[key];
            const wasPressed = keyState.current[key];

            if (isPressed && !wasPressed) {
                simulateKey(key, 'keydown');
                keyState.current[key] = true;
            } else if (!isPressed && wasPressed) {
                simulateKey(key, 'keyup');
                keyState.current[key] = false;
            }
        }
        
        gp.buttons.forEach((b, i) => prevButtons.current[i] = b.pressed);

        requestRef.current = requestAnimationFrame(update);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(requestRef.current);
    }, [isOpen, listeningFor, mapping, activeGamepadIndex, availableGamepads]); 

    // --- UI HANDLERS ---
    const getButtonForAction = (action: ActionType) => {
        const idx = Object.keys(mapping).find(key => mapping[parseInt(key)] === action);
        return idx !== undefined ? `BTN ${idx}` : 'UNBOUND';
    };

    const cycleGamepad = (direction: 'next' | 'prev') => {
        if (availableGamepads.length <= 1) return;
        
        const currentIndexInList = availableGamepads.findIndex(g => g.index === activeGamepadIndex);
        let nextIndexInList = direction === 'next' ? currentIndexInList + 1 : currentIndexInList - 1;
        
        if (nextIndexInList >= availableGamepads.length) nextIndexInList = 0;
        if (nextIndexInList < 0) nextIndexInList = availableGamepads.length - 1;
        
        setActiveGamepadIndex(availableGamepads[nextIndexInList].index);
    };

    return (
        <>
            <div className="absolute top-4 left-4 z-50">
                <button 
                    onClick={() => setIsOpen(true)}
                    className="bg-black/60 border border-cyan-500/50 text-cyan-400 px-2 py-1 md:px-4 md:py-2 rounded hover:bg-cyan-900/50 transition-colors font-mono text-[10px] md:text-xs tracking-widest backdrop-blur-sm"
                >
                    GAME PAD SETTINGS
                </button>
            </div>

            {isOpen && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-md bg-gray-900/90 border border-gray-700 p-8 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
                        
                        <h2 className="text-2xl text-white font-mono font-bold tracking-widest mb-4 text-center border-b border-gray-700 pb-4">
                            CONTROLS CONFIG
                        </h2>
                        
                        {/* Controller Selection */}
                        <div className="mb-6 bg-black/30 p-3 rounded border border-gray-700">
                             <div className="text-[10px] text-gray-500 font-mono text-center mb-1">ACTIVE CONTROLLER</div>
                             
                             <div className="flex items-center justify-between">
                                 <button 
                                    onClick={() => cycleGamepad('prev')}
                                    className="text-cyan-500 hover:text-white px-2 font-bold disabled:opacity-30"
                                    disabled={availableGamepads.length <= 1}
                                 >
                                     &lt;
                                 </button>
                                 
                                 <div className="text-xs text-cyan-300 font-mono truncate px-2 text-center flex-1">
                                     {availableGamepads.length > 0 
                                        ? `[${activeGamepadIndex}] ${currentGamepadId.substring(0, 20)}...` 
                                        : "NO GAMEPAD DETECTED"}
                                 </div>
                                 
                                 <button 
                                    onClick={() => cycleGamepad('next')}
                                    className="text-cyan-500 hover:text-white px-2 font-bold disabled:opacity-30"
                                    disabled={availableGamepads.length <= 1}
                                 >
                                     &gt;
                                 </button>
                             </div>
                             
                             <div className="text-center mt-1">
                                 <span className="text-[9px] text-gray-600 font-mono">
                                     {availableGamepads.length} DEVICE(S) FOUND
                                 </span>
                             </div>
                        </div>

                        <div className="space-y-4">
                            {(['BOOST', 'SHOOT', 'SWITCH TARGET'] as ActionType[]).map((action) => (
                                <div key={action} className="flex items-center justify-between group">
                                    <span className="text-gray-400 font-mono text-sm group-hover:text-white transition-colors">
                                        {action}
                                    </span>
                                    
                                    <button
                                        onClick={() => setListeningFor(action)}
                                        className={`
                                            w-32 py-2 rounded font-mono text-sm font-bold transition-all
                                            ${listeningFor === action 
                                                ? 'bg-yellow-500 text-black animate-pulse' 
                                                : 'bg-gray-800 text-cyan-400 hover:bg-gray-700 border border-gray-600'}
                                        `}
                                    >
                                        {listeningFor === action ? 'PRESS...' : getButtonForAction(action)}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-10 flex justify-center">
                            <button 
                                onClick={() => { setIsOpen(false); setListeningFor(null); }}
                                className="px-8 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-mono rounded transition-colors"
                            >
                                RESUME
                            </button>
                        </div>

                        <div className="absolute bottom-4 left-0 w-full text-center text-gray-600 text-[10px] font-mono">
                            SELECT DEVICE • CLICK TO BIND
                        </div>

                    </div>
                </div>
            )}
        </>
    );
};
