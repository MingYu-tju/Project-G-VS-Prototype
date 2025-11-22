import React, { useEffect, useRef, useState } from 'react';

// Actions we can bind
type ActionType = 'JUMP' | 'DASH' | 'SHOOT' | 'SWITCH TARGET';

// Default standard mapping (Xbox/PS layout approximations)
// 0: A/Cross, 1: B/Circle, 2: X/Square, 3: Y/Triangle, etc.
const DEFAULT_MAPPING: Record<number, ActionType> = {
    7: 'JUMP',   // A / Cross
    0: 'DASH',   // B / Circle
    2: 'SHOOT',  // X / Square
    1: 'SWITCH TARGET', // Y / Triangle
};

// Map Action to the actual Keyboard Key that Player.tsx listens for
const ACTION_TO_KEY: Record<ActionType, string> = {
    'JUMP': ' ',
    'DASH': 'l',
    'SHOOT': 'j',
    'SWITCH TARGET': 'e'
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
    
    // Track previous frame button states to detect "Just Pressed" for rebinding
    const prevButtons = useRef<boolean[]>([]);
    
    // Track dispatched keys to avoid spamming events during gameplay
    const keyState = useRef<{ [key: string]: boolean }>({});

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('gvs_gamepad_mapping');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Convert string keys back to numbers if JSON stringified them
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
        localStorage.setItem('gvs_gamepad_mapping', JSON.stringify(mapping));
    }, [mapping]);

    // --- GAME LOOP ---
    const update = () => {
        const gamepads = navigator.getGamepads();
        if (!gamepads) return;

        const gp = gamepads[0]; // Primary controller
        if (!gp) {
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        // --- REBINDING MODE ---
        if (listeningFor) {
            // Check for any button press to bind
            gp.buttons.forEach((btn, index) => {
                if (btn.pressed && !prevButtons.current[index]) {
                    const newMapping = { ...mapping };
                    
                    // Clear old bindings for this action to ensure 1:1 mapping preference
                    // (Optional, but cleaner for UI)
                    Object.keys(newMapping).forEach(key => {
                         if (newMapping[parseInt(key)] === listeningFor) {
                             delete newMapping[parseInt(key)];
                         }
                    });
                    
                    newMapping[index] = listeningFor;
                    setMapping(newMapping);
                    setListeningFor(null); // Exit listening mode
                }
            });
            
            // Update prev buttons
            gp.buttons.forEach((b, i) => prevButtons.current[i] = b.pressed);
            requestRef.current = requestAnimationFrame(update);
            return; // SKIP GAMEPLAY LOGIC WHILE REBINDING
        }

        // --- SETTINGS MENU OPEN? ---
        if (isOpen) {
            // Update button state history to prevent immediate triggers on resume
             gp.buttons.forEach((b, i) => prevButtons.current[i] = b.pressed);
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        // --- GAMEPLAY LOGIC ---

        // 1. AXES (Left Stick) - Hardcoded for movement
        const THRESHOLD = 0.5;
        const axisX = gp.axes[0];
        const axisY = gp.axes[1];

        const axisKeys: { [key: string]: boolean } = {
            'd': axisX > THRESHOLD,
            'a': axisX < -THRESHOLD,
            's': axisY > THRESHOLD,
            'w': axisY < -THRESHOLD,
        };

        // 2. BUTTONS (Based on Mapping)
        const buttonKeys: { [key: string]: boolean } = {
            ' ': false, 'l': false, 'j': false, 'e': false
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

        // Merge
        const allKeys = { ...axisKeys, ...buttonKeys };

        // 3. DISPATCH EVENTS
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
        
        // Update prev buttons
        gp.buttons.forEach((b, i) => prevButtons.current[i] = b.pressed);

        requestRef.current = requestAnimationFrame(update);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(requestRef.current);
    }, [isOpen, listeningFor, mapping]);

    // --- UI HELPERS ---
    const getButtonForAction = (action: ActionType) => {
        const idx = Object.keys(mapping).find(key => mapping[parseInt(key)] === action);
        return idx !== undefined ? `BTN ${idx}` : 'UNBOUND';
    };

    return (
        <>
            {/* TOGGLE BUTTON (Top Left) */}
            <div className="absolute top-4 left-4 z-50">
                <button 
                    onClick={() => setIsOpen(true)}
                    className="bg-black/60 border border-cyan-500/50 text-cyan-400 px-4 py-2 rounded hover:bg-cyan-900/50 transition-colors font-mono text-xs tracking-widest backdrop-blur-sm"
                >
                    GAME PAD SETTINGS
                </button>
            </div>

            {/* SETTINGS OVERLAY */}
            {isOpen && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-md bg-gray-900/90 border border-gray-700 p-8 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] relative">
                        
                        <h2 className="text-2xl text-white font-mono font-bold tracking-widest mb-8 text-center border-b border-gray-700 pb-4">
                            CONTROLS CONFIG
                        </h2>

                        <div className="space-y-4">
                            {(['DASH', 'JUMP', 'SHOOT', 'SWITCH TARGET'] as ActionType[]).map((action) => (
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
                            CLICK TO BIND • PRESS BUTTON ON GAMEPAD
                        </div>

                    </div>
                </div>
            )}
        </>
    );
};