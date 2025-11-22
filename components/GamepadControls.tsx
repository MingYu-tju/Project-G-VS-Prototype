
import React, { useEffect, useRef } from 'react';

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

export const GamepadControls: React.FC = () => {
    const requestRef = useRef<number>(0);
    
    // Track state of mapped keys to prevent event spam
    // Keys: 'w', 'a', 's', 'd', ' ', 'j', 'l', 'e'
    const keyState = useRef<{ [key: string]: boolean }>({
        'w': false, 'a': false, 's': false, 'd': false,
        ' ': false, 'j': false, 'l': false, 'e': false
    });

    const update = () => {
        const gamepads = navigator.getGamepads();
        if (!gamepads) return;

        const gp = gamepads[0]; // Primary controller
        if (!gp) {
            requestRef.current = requestAnimationFrame(update);
            return;
        }

        // --- AXES (Left Stick) ---
        // Threshold for digital actuation
        const THRESHOLD = 0.5;
        const axisX = gp.axes[0]; // Left Stick X
        const axisY = gp.axes[1]; // Left Stick Y

        const newKeys: { [key: string]: boolean } = {
            'd': axisX > THRESHOLD,
            'a': axisX < -THRESHOLD,
            's': axisY > THRESHOLD,
            'w': axisY < -THRESHOLD,
        };

        // --- BUTTONS ---
        // Standard Mapping (Xbox/PS):
        // 0 (A/Cross)       -> Jump (Space)
        // 1 (B/Circle)      -> Dash (L)
        // 2 (X/Square)      -> Shoot (J)
        // 3 (Y/Triangle)    -> Target (E)
        // 4 (LB)            -> Jump (Space)
        // 5 (RB)            -> Shoot (J)
        // 6 (LT)            -> Dash (L)
        // 7 (RT)            -> Shoot (J)

        const b = gp.buttons;
        const pressed = (idx: number) => b[idx] && b[idx].pressed;

        newKeys[' '] = pressed(7);
        newKeys['l'] = pressed(0); // B or LT
        newKeys['j'] = pressed(2); // X or RB or RT
        newKeys['e'] = pressed(1); // Y

        // --- SYNC & DISPATCH ---
        for (const key in newKeys) {
            const isPressed = newKeys[key];
            const wasPressed = keyState.current[key];

            // Only dispatch event on state change to simulate real key press
            if (isPressed && !wasPressed) {
                simulateKey(key, 'keydown');
                keyState.current[key] = true;
            } else if (!isPressed && wasPressed) {
                simulateKey(key, 'keyup');
                keyState.current[key] = false;
            }
        }

        requestRef.current = requestAnimationFrame(update);
    };

    useEffect(() => {
        // Start polling loop
        requestRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(requestRef.current);
    }, []);

    return null;
};
