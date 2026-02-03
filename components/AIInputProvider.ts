// AIInputProvider.ts - Generates MechInput based on AI decision making
import { useRef, useCallback } from 'react';
import { Vector3, MathUtils } from 'three';
import { MechInput, createEmptyInput, AIConfig, DEFAULT_AI_CONFIG } from './MechInput';
import { GLOBAL_CONFIG, Team, RED_LOCK_DISTANCE } from '../types';
import { useGameStore } from '../store';

/**
 * AI Decision State Machine
 */
type AIDecisionState = 
  | 'IDLE'
  | 'APPROACHING'
  | 'RETREATING'
  | 'STRAFING'
  | 'SHOOTING'
  | 'MELEE_ENGAGE'
  | 'EVADING'
  | 'RECOVERING';

interface AIState {
  currentDecision: AIDecisionState;
  decisionTimer: number;
  lastDecisionTime: number;
  
  // Target tracking
  currentTargetId: string | null;
  targetSwitchTimer: number;
  
  // Combat cooldowns
  shootCooldown: number;
  meleeCooldown: number;
  evadeCooldown: number;
  
  // Current action durations
  actionTimer: number;
  strafeDirection: number; // -1 or 1
  
  // Melee combo state
  isInMeleeCombo: boolean;
  meleeComboStage: number;
  
  // Input state for edge detection
  prevShoot: boolean;
  prevMelee: boolean;
  prevBoost: boolean;
  
  // Rainbow dash (虹闪) state
  pendingRainbowDash: boolean;
}

function createInitialAIState(): AIState {
  return {
    currentDecision: 'IDLE',
    decisionTimer: 0,
    lastDecisionTime: 0,
    currentTargetId: null,
    targetSwitchTimer: 0,
    shootCooldown: 0,
    meleeCooldown: 0,
    evadeCooldown: 0,
    actionTimer: 0,
    strafeDirection: 1,
    isInMeleeCombo: false,
    meleeComboStage: 0,
    prevShoot: false,
    prevMelee: false,
    prevBoost: false,
    pendingRainbowDash: false,
  };
}

interface AIInputContext {
  myPosition: Vector3;
  myTeam: Team;
  myId: string;
  delta: number;
  isStunned: boolean;
  isKnockedDown: boolean;
  boost: number;
  isGrounded: boolean;
  meleeState: string;
}

/**
 * Hook that generates AI-driven MechInput
 */
export function useAIInput(config: AIConfig = DEFAULT_AI_CONFIG) {
  const stateRef = useRef<AIState>(createInitialAIState());
  const inputRef = useRef<MechInput>(createEmptyInput());

  /**
   * Detect incoming projectile threats
   */
  const detectThreats = useCallback((myPosition: Vector3, myTeam: Team): boolean => {
    const state = useGameStore.getState();
    const projectiles = state.projectiles;
    
    for (const p of projectiles) {
      if (p.team !== myTeam) {
        const dist = p.position.distanceTo(myPosition);
        if (dist < 18) {
          // Check if headed towards us
          const toMe = myPosition.clone().sub(p.position).normalize();
          const pVel = p.velocity.clone().normalize();
          if (pVel.dot(toMe) > 0.7) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  /**
   * Get best target for this AI
   */
  const selectTarget = useCallback((myPosition: Vector3, myTeam: Team, myId: string): string | null => {
    const state = useGameStore.getState();
    const targets = state.targets;
    const playerPos = state.playerPos;
    
    const potentialTargets: { id: string; distance: number }[] = [];
    
    // Add player as target if enemy team
    if (myTeam === Team.RED) {
      potentialTargets.push({
        id: 'player',
        distance: myPosition.distanceTo(playerPos),
      });
    }
    
    // Add other units
    for (const t of targets) {
      if (t.id === myId) continue;
      if (t.team !== myTeam) {
        potentialTargets.push({
          id: t.id,
          distance: myPosition.distanceTo(t.position),
        });
      }
    }
    
    if (potentialTargets.length === 0) return null;
    
    // Prefer closer targets with some randomness
    potentialTargets.sort((a, b) => a.distance - b.distance);
    
    // 70% chance to pick closest, 30% random
    if (Math.random() < 0.7 || potentialTargets.length === 1) {
      return potentialTargets[0].id;
    }
    return potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
  }, []);

  /**
   * Get position of a target by ID
   */
  const getTargetPosition = useCallback((targetId: string | null): Vector3 | null => {
    if (!targetId) return null;
    
    const state = useGameStore.getState();
    if (targetId === 'player') {
      return state.playerPos.clone();
    }
    const target = state.targets.find(t => t.id === targetId);
    return target ? target.position.clone() : null;
  }, []);

  /**
   * Main AI decision-making function with distance-based action selection
   */
  const makeDecision = useCallback((ctx: AIInputContext, aiState: AIState): AIDecisionState => {
    const targetPos = getTargetPosition(aiState.currentTargetId);
    if (!targetPos) return 'IDLE';
    
    const distance = ctx.myPosition.distanceTo(targetPos);
    const isInRedLock = distance < RED_LOCK_DISTANCE;
    const hasThreat = detectThreats(ctx.myPosition, ctx.myTeam);
    
    // Calculate distance-based action probabilities
    // Close range: high melee, low shoot
    // Far range: low melee, high shoot
    const meleeRangeFactor = Math.max(0, 1 - (distance / config.meleeEngageDistance)); // 1 when close, 0 when far
    const shootRangeFactor = Math.min(1, distance / config.preferredDistance); // 0 when close, 1 when far
    
    // Priority 1: Evade if threatened and able
    if (hasThreat && aiState.evadeCooldown <= 0 && ctx.boost > 15) {
      // Higher evade chance based on defensiveness
      const evadeRoll = Math.random();
      if (evadeRoll < config.evadeChance * (config.defensiveness + 0.3)) {
        return 'EVADING';
      }
    }
    
    // Priority 2: Melee if close - MUCH STRONGER preference when close
    if (distance < config.meleeEngageDistance && aiState.meleeCooldown <= 0 && ctx.boost > 20) {
      // Very aggressive melee calculation:
      // - Base chance from config.meleeChance (0.6 default, 0.85 aggressive)
      // - Multiplied by (aggressiveness + meleeRangeFactor) where meleeRangeFactor is 1 at close range
      // - At minimum distance, effective chance = meleeChance * (aggressiveness + 1.0) = almost guaranteed
      const effectiveMeleeChance = Math.min(0.95, config.meleeChance * (config.aggressiveness + meleeRangeFactor));
      if (Math.random() < effectiveMeleeChance) {
        return 'MELEE_ENGAGE';
      }
    }
    
    // Priority 3: Shoot if far - prefer shooting at range
    if (aiState.shootCooldown <= 0) {
      // Higher shoot chance when far
      const shootChance = config.shootChance * (0.5 + shootRangeFactor * 0.5);
      if (Math.random() < shootChance) {
        return 'SHOOTING';
      }
    }
    
    // Priority 4: Approach if too far (to get into melee range)
    if (distance > config.preferredDistance * 1.2) {
      return 'APPROACHING';
    }
    
    // Priority 5: Retreat if too close for comfort (and not aggressive enough for melee)
    if (distance < config.preferredDistance * 0.3 && Math.random() > config.aggressiveness) {
      return 'RETREATING';
    }
    
    // Default: Strafe at preferred distance
    if (Math.random() < 0.4) {
      return 'STRAFING';
    }
    
    return 'IDLE';
  }, [config, getTargetPosition, detectThreats]);

  /**
   * Generate input for current frame based on AI state
   */
  const getInput = useCallback((ctx: AIInputContext): MechInput => {
    const aiState = stateRef.current;
    const input = inputRef.current;
    const deltaMs = ctx.delta * 1000;
    
    // Reset input
    input.moveX = 0;
    input.moveZ = 0;
    input.shoot = false;
    input.melee = false;
    input.cycleTarget = false;
    input.dashTrigger = false;
    input.doubleTapDirection = null;
    input.boostPressed = false;
    input.boostJustPressed = false;
    input.boostJustReleased = false;
    
    // Skip if incapacitated
    if (ctx.isStunned || ctx.isKnockedDown) {
      aiState.currentDecision = 'RECOVERING';
      aiState.actionTimer = 500;
      return input;
    }
    
    // Update cooldowns
    aiState.shootCooldown = Math.max(0, aiState.shootCooldown - deltaMs);
    aiState.meleeCooldown = Math.max(0, aiState.meleeCooldown - deltaMs);
    aiState.evadeCooldown = Math.max(0, aiState.evadeCooldown - deltaMs);
    aiState.actionTimer = Math.max(0, aiState.actionTimer - deltaMs);
    aiState.targetSwitchTimer -= deltaMs;
    aiState.decisionTimer -= deltaMs;
    
    // Target switching
    if (aiState.targetSwitchTimer <= 0) {
      aiState.currentTargetId = selectTarget(ctx.myPosition, ctx.myTeam, ctx.myId);
      aiState.targetSwitchTimer = MathUtils.randFloat(
        GLOBAL_CONFIG.AI_TARGET_SWITCH_MIN * 1000,
        GLOBAL_CONFIG.AI_TARGET_SWITCH_MAX * 1000
      );
      // Update store
      useGameStore.getState().updateUnitTarget(ctx.myId, aiState.currentTargetId);
    }
    
    // Make new decision if timer expired
    if (aiState.decisionTimer <= 0 && aiState.actionTimer <= 0) {
      const newDecision = makeDecision(ctx, aiState);
      aiState.currentDecision = newDecision;
      aiState.decisionTimer = config.decisionIntervalMs;
      aiState.lastDecisionTime = Date.now();
      
      // Initialize action based on decision
      switch (newDecision) {
        case 'SHOOTING':
          aiState.actionTimer = 1500; // Will be cut short by actual shot duration
          aiState.shootCooldown = MathUtils.randFloat(
            GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MIN * 1000,
            GLOBAL_CONFIG.AI_SHOOT_COOLDOWN_MAX * 1000
          );
          break;
        case 'MELEE_ENGAGE':
          aiState.actionTimer = 2000;
          aiState.meleeCooldown = 3000;
          aiState.isInMeleeCombo = true;
          aiState.meleeComboStage = 0;
          break;
        case 'EVADING':
          aiState.actionTimer = 500;
          aiState.evadeCooldown = 1500;
          aiState.strafeDirection = Math.random() > 0.5 ? 1 : -1;
          break;
        case 'STRAFING':
          aiState.actionTimer = MathUtils.randFloat(500, 1500);
          aiState.strafeDirection = Math.random() > 0.5 ? 1 : -1;
          break;
        case 'APPROACHING':
        case 'RETREATING':
          aiState.actionTimer = MathUtils.randFloat(300, 800);
          break;
      }
    }
    
    // Get target info for movement calculations
    const targetPos = getTargetPosition(aiState.currentTargetId);
    let toTarget = new Vector3(0, 0, -1);
    if (targetPos) {
      toTarget = targetPos.clone().sub(ctx.myPosition);
      toTarget.y = 0;
      if (toTarget.lengthSq() > 0.001) toTarget.normalize();
    }
    
    // Calculate right vector (perpendicular to target direction)
    const rightVec = new Vector3().crossVectors(new Vector3(0, 1, 0), toTarget).normalize();
    
    // Generate input based on current decision
    switch (aiState.currentDecision) {
      case 'APPROACHING':
        input.moveZ = -1; // Forward
        input.dashTrigger = !aiState.prevBoost && ctx.boost > 25 && Math.random() < 0.1;
        input.boostPressed = ctx.boost > 20 && Math.random() < 0.3;
        break;
        
      case 'RETREATING':
        input.moveZ = 1; // Backward
        input.moveX = aiState.strafeDirection * 0.5; // Slight strafe
        input.boostPressed = ctx.boost > 20 && Math.random() < 0.2;
        break;
        
      case 'STRAFING':
        input.moveX = aiState.strafeDirection;
        // Occasional direction change
        if (Math.random() < 0.02) {
          aiState.strafeDirection *= -1;
        }
        break;
        
      case 'SHOOTING':
        // Stop movement briefly while shooting (STOP mode behavior)
        input.moveX = 0;
        input.moveZ = 0;
        // Trigger shoot on first frame
        if (!aiState.prevShoot) {
          input.shoot = true;
        }
        break;
        
      case 'MELEE_ENGAGE':
        // Move toward target
        input.moveZ = -1;
        // Trigger melee
        if (!aiState.prevMelee && aiState.meleeComboStage === 0) {
          input.melee = true;
          aiState.meleeComboStage = 1;
        }
        // Continue combo based on config
        if (ctx.meleeState.includes('SLASH') && Math.random() < config.comboContinueChance) {
          input.melee = true;
        }
        
        // --- RAINBOW DASH (虹闪) TRIGGER ---
        // During recovery, if we whiffed, chance to trigger side evade cancel
        if (ctx.meleeState.includes('RECOVERY') && Math.random() < config.rainbowDashChance) {
          // Trigger side evade for rainbow dash cancel
          aiState.strafeDirection = Math.random() > 0.5 ? 1 : -1;
          input.doubleTapDirection = aiState.strafeDirection > 0 ? 'd' : 'a';
          // After rainbow dash, we can immediately try melee again
          aiState.meleeComboStage = 0;
          aiState.pendingRainbowDash = true;
        }
        // If we just rainbow dashed, queue up next melee
        if (aiState.pendingRainbowDash && !ctx.meleeState.includes('RECOVERY')) {
          input.melee = true;
          aiState.pendingRainbowDash = false;
        }
        break;
        
      case 'EVADING':
        // Double-tap strafe direction
        input.doubleTapDirection = aiState.strafeDirection > 0 ? 'd' : 'a';
        aiState.currentDecision = 'STRAFING'; // Transition after evade
        break;
        
      case 'RECOVERING':
        // Do nothing, wait for recovery
        break;
        
      case 'IDLE':
      default:
        // Light random movement
        if (Math.random() < 0.1) {
          input.moveX = (Math.random() - 0.5) * 0.5;
          input.moveZ = (Math.random() - 0.5) * 0.5;
        }
        break;
    }
    
    // Edge detection for next frame
    aiState.prevShoot = input.shoot;
    aiState.prevMelee = input.melee;
    aiState.prevBoost = input.boostPressed;
    
    // Handle boost edge detection
    if (input.boostPressed && !aiState.prevBoost) {
      input.boostJustPressed = true;
    }
    if (!input.boostPressed && aiState.prevBoost) {
      input.boostJustReleased = true;
    }
    
    return input;
  }, [config, selectTarget, getTargetPosition, makeDecision]);

  /**
   * Reset AI state (e.g., on respawn)
   */
  const reset = useCallback(() => {
    stateRef.current = createInitialAIState();
  }, []);

  /**
   * Notify AI that melee combo ended
   */
  const onMeleeEnd = useCallback(() => {
    stateRef.current.isInMeleeCombo = false;
    stateRef.current.meleeComboStage = 0;
  }, []);

  return {
    getInput,
    reset,
    onMeleeEnd,
    stateRef,
  };
}
