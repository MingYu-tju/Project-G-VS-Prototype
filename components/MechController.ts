// MechController.ts - Shared controller types and utilities
import { Vector3 } from 'three';
import { MechInput } from './MechInput';
import { Team } from '../types';

/**
 * Shared action state phases for both Player and Unit
 */
export type MeleePhase = 
  | 'NONE'
  | 'STARTUP'
  | 'SIDE_STARTUP' 
  | 'LUNGE'
  | 'SIDE_LUNGE'
  | 'SLASH_1'
  | 'SLASH_2'
  | 'SLASH_3'
  | 'SIDE_SLASH_1'
  | 'SIDE_SLASH_2'
  | 'SIDE_SLASH_3'
  | 'RECOVERY'
  | 'SIDE_RECOVERY';

export type ShootMode = 'NONE' | 'STOP' | 'WHILE_MOVING';

export type VisualState = 
  | 'IDLE' 
  | 'WALK' 
  | 'DASH' 
  | 'ASCEND' 
  | 'LANDING' 
  | 'SHOOT' 
  | 'EVADE' 
  | 'MELEE';

/**
 * Controller state snapshot
 * This represents the current state of a mech unit
 */
export interface MechState {
  // Position and velocity
  position: Vector3;
  velocity: Vector3;
  
  // Movement state
  isGrounded: boolean;
  isDashing: boolean;
  isEvading: boolean;
  isAscending: boolean;
  
  // Combat state
  isShooting: boolean;
  shootMode: ShootMode;
  meleeState: MeleePhase;
  
  // Resources
  boost: number;
  isOverheated: boolean;
  
  // Timers and flags
  landingFrames: number;
  visualState: VisualState;
  
  // Stun/damage state
  isStunned: boolean;
  isKnockedDown: boolean;
}

/**
 * Process input and determine what actions to trigger
 * This is a helper that can be used by both Player and Unit
 */
export interface InputActions {
  shouldStartDash: boolean;
  shouldStartEvade: boolean;
  shouldStartAscend: boolean;
  shouldStartShoot: boolean;
  shouldStartMelee: boolean;
  shouldCycleTarget: boolean;
  evadeDirection: 'w' | 'a' | 's' | 'd' | null;
}

/**
 * Process MechInput to determine what actions should be triggered
 * @param input The current frame's input
 * @param state The current mech state
 * @param canAct Whether the mech can perform new actions
 */
export function processInputToActions(
  input: MechInput,
  state: MechState,
  canAct: boolean
): InputActions {
  const actions: InputActions = {
    shouldStartDash: false,
    shouldStartEvade: false,
    shouldStartAscend: false,
    shouldStartShoot: false,
    shouldStartMelee: false,
    shouldCycleTarget: false,
    evadeDirection: null,
  };
  
  if (!canAct) return actions;
  
  // Target cycling
  if (input.cycleTarget) {
    actions.shouldCycleTarget = true;
  }
  
  // Shooting
  if (input.shoot && state.meleeState === 'NONE' && !state.isShooting) {
    actions.shouldStartShoot = true;
  }
  
  // Melee
  if (input.melee && state.meleeState === 'NONE' && !state.isShooting) {
    actions.shouldStartMelee = true;
  }
  
  // Dash (double-tap L)
  if (input.dashTrigger && !state.isDashing && !state.isEvading && state.meleeState === 'NONE') {
    if (state.boost > 10 && !state.isOverheated) {
      actions.shouldStartDash = true;
    }
  }
  
  // Evade (double-tap direction)
  if (input.doubleTapDirection && !state.isDashing && !state.isEvading && state.meleeState === 'NONE') {
    if (state.boost > 10 && !state.isOverheated) {
      actions.shouldStartEvade = true;
      actions.evadeDirection = input.doubleTapDirection;
    }
  }
  
  // Ascend (hold boost)
  if (input.boostPressed && !input.dashTrigger && !state.isDashing && state.meleeState === 'NONE') {
    if (state.boost > 5 && !state.isOverheated) {
      actions.shouldStartAscend = true;
    }
  }
  
  return actions;
}

/**
 * Get camera-relative direction from input
 * Note: For NPC, this should use facing direction instead
 */
export function getMoveDirectionFromInput(
  input: MechInput,
  facingDirection: Vector3
): Vector3 | null {
  if (input.moveX === 0 && input.moveZ === 0) {
    return null;
  }
  
  // Create a local coordinate system based on facing direction
  const forward = facingDirection.clone();
  forward.y = 0;
  forward.normalize();
  
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize();
  
  // Combine inputs
  const moveDir = new Vector3()
    .addScaledVector(forward, -input.moveZ) // -Z is forward
    .addScaledVector(right, -input.moveX);  // Negative for correct direction
  
  if (moveDir.lengthSq() > 0.001) {
    moveDir.normalize();
    return moveDir;
  }
  
  return null;
}

/**
 * Get target-relative direction from input
 * Used by AI where movement is relative to target position
 */
export function getMoveDirectionToTarget(
  input: MechInput,
  myPosition: Vector3,
  targetPosition: Vector3
): Vector3 | null {
  if (input.moveX === 0 && input.moveZ === 0) {
    return null;
  }
  
  // Calculate direction to target
  const toTarget = targetPosition.clone().sub(myPosition);
  toTarget.y = 0;
  
  if (toTarget.lengthSq() < 0.001) {
    return null;
  }
  
  toTarget.normalize();
  
  // Right vector (perpendicular to target direction)
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), toTarget).normalize();
  
  // Forward/back moves toward/away from target
  // Left/right strafes around target
  const moveDir = new Vector3()
    .addScaledVector(toTarget, -input.moveZ)  // -Z = toward target
    .addScaledVector(right, input.moveX);      // X = strafe
  
  if (moveDir.lengthSq() > 0.001) {
    moveDir.normalize();
    return moveDir;
  }
  
  return null;
}
