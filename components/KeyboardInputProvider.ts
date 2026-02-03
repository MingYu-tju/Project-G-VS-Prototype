// KeyboardInputProvider.ts - Converts keyboard events to MechInput
import { useRef, useEffect, useCallback } from 'react';
import { MechInput, createEmptyInput } from './MechInput';
import { GLOBAL_CONFIG } from '../types';

/**
 * Internal state for tracking keyboard input
 */
interface KeyboardState {
  keys: { [key: string]: boolean };
  lastKeyPressTime: number;
  lastKeyPressed: string;
  lastDirectionKeyReleaseTimes: { [key: string]: number };
  
  // L key (boost) tracking
  lPressStartTime: number;
  lastLReleaseTime: number;
  lConsumedByAction: boolean;
  lConsumedByDash: boolean;
  preserveDoubleTapOnRelease: boolean;
  
  // Previous frame state for edge detection
  prevBoostPressed: boolean;
}

/**
 * Hook that provides keyboard input as MechInput interface
 * @returns Object containing current input state and update function
 */
export function useKeyboardInput(enabled: boolean = true) {
  const stateRef = useRef<KeyboardState>({
    keys: {},
    lastKeyPressTime: 0,
    lastKeyPressed: '',
    lastDirectionKeyReleaseTimes: {},
    lPressStartTime: 0,
    lastLReleaseTime: 0,
    lConsumedByAction: false,
    lConsumedByDash: false,
    preserveDoubleTapOnRelease: false,
    prevBoostPressed: false,
  });
  
  const inputRef = useRef<MechInput>(createEmptyInput());
  
  // Pending actions that were triggered by keydown events
  const pendingActionsRef = useRef<{
    shoot: boolean;
    melee: boolean;
    cycleTarget: boolean;
    dashTrigger: boolean;
    doubleTapDirection: 'w' | 'a' | 's' | 'd' | null;
  }>({
    shoot: false,
    melee: false,
    cycleTarget: false,
    dashTrigger: false,
    doubleTapDirection: null,
  });

  // Handle keydown
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    const key = e.key.toLowerCase();
    const state = stateRef.current;
    const now = Date.now();
    
    // Ignore repeat events
    if (state.keys[key]) return;
    
    state.keys[key] = true;
    
    // Direction key double-tap detection
    if (['w', 'a', 's', 'd'].includes(key)) {
      const lastRelease = state.lastDirectionKeyReleaseTimes[key] || 0;
      if (now - lastRelease < GLOBAL_CONFIG.DOUBLE_TAP_WINDOW) {
        pendingActionsRef.current.doubleTapDirection = key as 'w' | 'a' | 's' | 'd';
      }
      state.lastKeyPressed = key;
      state.lastKeyPressTime = now;
    }
    
    // Action buttons
    if (key === 'j') {
      pendingActionsRef.current.shoot = true;
    }
    if (key === 'k') {
      pendingActionsRef.current.melee = true;
    }
    if (key === ' ') {
      pendingActionsRef.current.cycleTarget = true;
    }
    
    // L key (boost/dash)
    if (key === 'l') {
      const timeSinceLastRelease = now - state.lastLReleaseTime;
      if (timeSinceLastRelease < GLOBAL_CONFIG.INPUT_DASH_WINDOW) {
        // Double-tap L detected -> trigger dash
        state.lConsumedByDash = true;
        state.lConsumedByAction = true;
        pendingActionsRef.current.dashTrigger = true;
      } else {
        state.lPressStartTime = now;
        state.lConsumedByAction = false;
        state.lConsumedByDash = false;
      }
    }
  }, [enabled]);

  // Handle keyup
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const state = stateRef.current;
    
    state.keys[key] = false;
    
    // Track direction release times for double-tap
    if (['w', 'a', 's', 'd'].includes(key)) {
      state.lastDirectionKeyReleaseTimes[key] = Date.now();
    }
    
    // L key release
    if (key === 'l') {
      if (state.lConsumedByAction && !state.preserveDoubleTapOnRelease) {
        state.lastLReleaseTime = 0;
      } else {
        state.lastLReleaseTime = Date.now();
      }
      state.preserveDoubleTapOnRelease = false;
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, handleKeyDown, handleKeyUp]);

  /**
   * Call this each frame to get the current input state
   * This consumes edge-triggered events (shoot, melee, etc.)
   */
  const getInput = useCallback((): MechInput => {
    const state = stateRef.current;
    const pending = pendingActionsRef.current;
    const input = inputRef.current;
    
    // Movement (continuous)
    input.moveX = 0;
    input.moveZ = 0;
    if (state.keys['w']) input.moveZ -= 1;
    if (state.keys['s']) input.moveZ += 1;
    if (state.keys['a']) input.moveX -= 1;
    if (state.keys['d']) input.moveX += 1;
    
    // Normalize diagonal movement
    const moveMag = Math.sqrt(input.moveX * input.moveX + input.moveZ * input.moveZ);
    if (moveMag > 1) {
      input.moveX /= moveMag;
      input.moveZ /= moveMag;
    }
    
    // Boost state
    const boostPressed = state.keys['l'] || false;
    input.boostJustPressed = boostPressed && !state.prevBoostPressed;
    input.boostJustReleased = !boostPressed && state.prevBoostPressed;
    input.boostPressed = boostPressed;
    state.prevBoostPressed = boostPressed;
    
    // Edge-triggered actions (consume and reset)
    input.shoot = pending.shoot;
    input.melee = pending.melee;
    input.cycleTarget = pending.cycleTarget;
    input.dashTrigger = pending.dashTrigger;
    input.doubleTapDirection = pending.doubleTapDirection;
    
    // Reset pending actions
    pending.shoot = false;
    pending.melee = false;
    pending.cycleTarget = false;
    pending.dashTrigger = false;
    pending.doubleTapDirection = null;
    
    return input;
  }, []);

  /**
   * Mark L key as consumed by an action (prevents double-tap on release)
   */
  const consumeBoostAction = useCallback(() => {
    stateRef.current.lConsumedByAction = true;
  }, []);

  /**
   * Check if L key has been held long enough for ascent
   */
  const isBoostHeldForAscent = useCallback((): boolean => {
    const state = stateRef.current;
    if (!state.keys['l']) return false;
    const holdDuration = Date.now() - state.lPressStartTime;
    return holdDuration >= GLOBAL_CONFIG.INPUT_ASCENT_HOLD_THRESHOLD;
  }, []);

  /**
   * Get raw key state
   */
  const isKeyPressed = useCallback((key: string): boolean => {
    return stateRef.current.keys[key.toLowerCase()] || false;
  }, []);

  return {
    getInput,
    consumeBoostAction,
    isBoostHeldForAscent,
    isKeyPressed,
    stateRef,
  };
}
