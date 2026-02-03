// MechInput.ts - Unified input interface for both keyboard and AI control
import { Vector3 } from 'three';

/**
 * Represents a single frame of input for a mech unit.
 * Both keyboard (player) and AI (NPC) produce this interface.
 */
export interface MechInput {
  // === Movement Input (normalized -1 to 1) ===
  moveX: number;  // Left (-1) / Right (+1) - corresponds to A/D keys
  moveZ: number;  // Forward (-1) / Back (+1) - corresponds to W/S keys (note: -Z is forward in Three.js)
  
  // === Action Buttons (edge-triggered, true only on press frame) ===
  shoot: boolean;       // J key
  melee: boolean;       // K key
  cycleTarget: boolean; // Space key
  
  // === Boost Input (for dash/ascend) ===
  boostPressed: boolean;       // L key is currently held
  boostJustPressed: boolean;   // L key was just pressed this frame
  boostJustReleased: boolean;  // L key was just released this frame
  
  // === Double-Tap Evade Detection ===
  // If a direction key was double-tapped this frame, this contains the direction
  doubleTapDirection: 'w' | 'a' | 's' | 'd' | null;
  
  // === Dash Trigger (already processed double-tap L detection) ===
  dashTrigger: boolean;  // True if dash should be initiated (double-tap L)
}

/**
 * Default/empty input - no buttons pressed, no movement
 */
export const EMPTY_INPUT: MechInput = {
  moveX: 0,
  moveZ: 0,
  shoot: false,
  melee: false,
  cycleTarget: false,
  boostPressed: false,
  boostJustPressed: false,
  boostJustReleased: false,
  doubleTapDirection: null,
  dashTrigger: false,
};

/**
 * Create a fresh input object (mutable)
 */
export function createEmptyInput(): MechInput {
  return { ...EMPTY_INPUT };
}

/**
 * AI Configuration interface for tunable NPC behavior
 */
export interface AIConfig {
  // Personality traits (0-1 scale)
  aggressiveness: number;      // Higher = more likely to melee, approach
  defensiveness: number;       // Higher = more likely to evade, keep distance
  accuracy: number;            // Affects aim prediction / shot timing
  
  // Timing parameters
  reactionTimeMs: number;      // Milliseconds delay before reacting to threats
  decisionIntervalMs: number;  // How often AI reconsiders actions
  
  // Probability weights
  shootChance: number;         // Per-decision chance to shoot when able
  meleeChance: number;         // Per-decision chance to melee when in range
  evadeChance: number;         // Per-decision chance to evade when threatened
  comboContinueChance: number; // Chance to continue melee combo after hit
  rainbowDashChance: number;   // Chance to use rainbow dash (虹闪) at melee end
  
  // Distance thresholds
  preferredDistance: number;   // AI tries to maintain this distance
  meleeEngageDistance: number; // Will attempt melee if closer than this
}

/**
 * Default AI configuration - balanced but more aggressive melee
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  aggressiveness: 0.6,         // Increased from 0.5 for more melee
  defensiveness: 0.5,
  accuracy: 0.7,
  reactionTimeMs: 200,
  decisionIntervalMs: 400,     // Faster decisions
  shootChance: 0.25,           // Slightly lower shoot chance
  meleeChance: 0.6,            // Higher melee chance (was 0.4)
  evadeChance: 0.45,           // Slightly higher evade chance
  comboContinueChance: 0.8,
  rainbowDashChance: 0.4,      // 40% chance to rainbow dash on failed melee
  preferredDistance: 35,       // Slightly closer preferred distance
  meleeEngageDistance: 25,     // Larger melee engage range (was 20)
};

/**
 * Aggressive AI preset
 */
export const AGGRESSIVE_AI_CONFIG: AIConfig = {
  ...DEFAULT_AI_CONFIG,
  aggressiveness: 0.85,
  defensiveness: 0.2,
  meleeChance: 0.85,
  rainbowDashChance: 0.8,      // High rainbow dash for aggressive melee
  meleeEngageDistance: 35,
  preferredDistance: 20,
};

/**
 * Defensive AI preset
 */
export const DEFENSIVE_AI_CONFIG: AIConfig = {
  ...DEFAULT_AI_CONFIG,
  aggressiveness: 0.2,
  defensiveness: 0.8,
  shootChance: 0.5,
  evadeChance: 0.6,
  rainbowDashChance: 0.2,      // Low rainbow dash for defensive playstyle
  preferredDistance: 55,
  meleeEngageDistance: 10,
};
