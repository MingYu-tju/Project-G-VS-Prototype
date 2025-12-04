
import { Vector3 } from 'three';
import { NPCConfig } from '../types';

// --- CORE BEHAVIOR TREE TYPES ---

export enum AIStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  RUNNING = 'RUNNING'
}

// The bridge between the pure Logic (Tree) and the Game Object (Unit)
export interface AIContext {
  id: string;
  config: NPCConfig;
  
  // State Queries
  distToTarget: number;
  isTargetVisible: boolean;
  boost: number;
  hasThreat: boolean;
  isMeleeTargeted: boolean; // Is someone melee charging me?
  canAct: boolean; // Is Idle/Walking?
  canDefend: boolean; // Is not stunned/landing?
  
  // Detailed State
  aiState: string;
  meleePhase: string;
  isMeleeHit: boolean;
  meleeTimer: number;
  ammo: number;
  stateDuration: number; // NEW
  hasFired: boolean; // NEW
  
  // Timers
  shootCooldown: number;

  // Actions (Callbacks to Unit.tsx)
  actions: {
    evade: (isRainbow: boolean) => void;
    melee: (type: 'LUNGE' | 'SIDE') => void;
    shoot: () => void;
    dash: () => void;
    ascend: () => void;
    idle: () => void;
  };
}

export abstract class AINode {
  abstract type: string; 
  abstract tick(ctx: AIContext): AIStatus;
}

// --- SERIALIZATION TYPES ---
export type NodeParamValue = string | number | boolean;

export interface AINodeDefinition {
    id: string;
    type: string;
    children?: AINodeDefinition[];
    params?: Record<string, NodeParamValue>;
}

// --- COMPOSITES ---

export class Selector extends AINode {
  type = 'Selector';
  children: AINode[];

  constructor(children: AINode[]) {
    super();
    this.children = children;
  }

  tick(ctx: AIContext): AIStatus {
    for (const child of this.children) {
      const status = child.tick(ctx);
      if (status !== AIStatus.FAILURE) {
        return status;
      }
    }
    return AIStatus.FAILURE;
  }
}

export class Sequence extends AINode {
  type = 'Sequence';
  children: AINode[];

  constructor(children: AINode[]) {
    super();
    this.children = children;
  }

  tick(ctx: AIContext): AIStatus {
    for (const child of this.children) {
      const status = child.tick(ctx);
      if (status !== AIStatus.SUCCESS) {
        return status;
      }
    }
    return AIStatus.SUCCESS;
  }
}

// --- CONDITIONS ---

export class CheckThreat extends AINode {
  type = 'CheckThreat';
  tick(ctx: AIContext): AIStatus {
    return ctx.hasThreat ? AIStatus.SUCCESS : AIStatus.FAILURE;
  }
}

export class CheckMeleeTargeted extends AINode {
    type = 'CheckMeleeTargeted';
    tick(ctx: AIContext): AIStatus {
        return ctx.isMeleeTargeted ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckState extends AINode {
    type = 'CheckState';
    state: string;
    constructor(state: string) { super(); this.state = state; }
    tick(ctx: AIContext): AIStatus {
        return ctx.aiState === this.state ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckStateDuration extends AINode {
    type = 'CheckStateDuration';
    min: number;
    constructor(min: number) { super(); this.min = min; }
    tick(ctx: AIContext): AIStatus {
        // We compare duration (in seconds)
        return ctx.stateDuration >= this.min ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckShotFired extends AINode {
    type = 'CheckShotFired';
    tick(ctx: AIContext): AIStatus {
        return ctx.hasFired ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckMeleeWhiff extends AINode {
    type = 'CheckMeleeWhiff';
    tick(ctx: AIContext): AIStatus {
        if (ctx.aiState !== 'MELEE') return AIStatus.FAILURE;
        
        // 1. Lunge timeout (didn't reach target)
        if (ctx.meleePhase.includes('LUNGE')) {
            return ctx.meleeTimer < 10 ? AIStatus.SUCCESS : AIStatus.FAILURE;
        }
        // 2. Slash whiff (animation ending but no hit confirmed)
        if (ctx.meleePhase.includes('SLASH')) {
             if (!ctx.isMeleeHit && ctx.meleeTimer < 8) return AIStatus.SUCCESS;
        }
        return AIStatus.FAILURE;
    }
}

export class CheckAmmo extends AINode {
    type = 'CheckAmmo';
    tick(ctx: AIContext): AIStatus {
        return ctx.ammo > 0 ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckBoost extends AINode {
  type = 'CheckBoost';
  threshold: number;
  constructor(threshold: number) { super(); this.threshold = threshold; }
  
  tick(ctx: AIContext): AIStatus {
    return ctx.boost > this.threshold ? AIStatus.SUCCESS : AIStatus.FAILURE;
  }
}

export class CheckDistance extends AINode {
  type = 'CheckDistance';
  operator: '<' | '>';
  valSource: 'CONFIG_MELEE' | number;

  constructor(operator: '<' | '>', valSource: 'CONFIG_MELEE' | number) {
      super();
      this.operator = operator;
      this.valSource = valSource;
  }

  tick(ctx: AIContext): AIStatus {
    const dist = ctx.distToTarget;
    const threshold = this.valSource === 'CONFIG_MELEE' ? ctx.config.MELEE_TRIGGER_DISTANCE : this.valSource;
    
    if (this.operator === '<') return dist < threshold ? AIStatus.SUCCESS : AIStatus.FAILURE;
    return dist > threshold ? AIStatus.SUCCESS : AIStatus.FAILURE;
  }
}

export class CheckCanAct extends AINode {
    type = 'CheckCanAct';
    tick(ctx: AIContext): AIStatus {
        return ctx.canAct ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckCanDefend extends AINode {
    type = 'CheckCanDefend';
    tick(ctx: AIContext): AIStatus {
        return ctx.canDefend ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class CheckShootCooldown extends AINode {
    type = 'CheckShootCooldown';
    tick(ctx: AIContext): AIStatus {
        return ctx.shootCooldown <= 0 ? AIStatus.SUCCESS : AIStatus.FAILURE;
    }
}

export class Probability extends AINode {
  type = 'Probability';
  chanceSource: 'CONFIG_SHOOT' | 'CONFIG_MELEE_AGGRESSION' | 'CONFIG_DODGE' | 'CONFIG_MELEE_DEFENSE' | number;

  constructor(chanceSource: 'CONFIG_SHOOT' | 'CONFIG_MELEE_AGGRESSION' | 'CONFIG_DODGE' | 'CONFIG_MELEE_DEFENSE' | number) {
    super();
    this.chanceSource = chanceSource;
  }

  tick(ctx: AIContext): AIStatus {
    let chance = 0;
    if (typeof this.chanceSource === 'number') chance = this.chanceSource;
    else if (this.chanceSource === 'CONFIG_SHOOT') chance = ctx.config.SHOOT_PROBABILITY;
    else if (this.chanceSource === 'CONFIG_MELEE_AGGRESSION') chance = ctx.config.MELEE_AGGRESSION_RATE;
    else if (this.chanceSource === 'CONFIG_DODGE') chance = ctx.config.DODGE_REACTION_RATE;
    else if (this.chanceSource === 'CONFIG_MELEE_DEFENSE') chance = ctx.config.MELEE_DEFENSE_RATE;

    return Math.random() < chance ? AIStatus.SUCCESS : AIStatus.FAILURE;
  }
}

// --- ACTIONS ---

export class ActionEvade extends AINode {
  type = 'ActionEvade';
  isRainbow: boolean;
  constructor(isRainbow: boolean = false) { super(); this.isRainbow = isRainbow; }

  tick(ctx: AIContext): AIStatus {
    ctx.actions.evade(this.isRainbow);
    return AIStatus.SUCCESS;
  }
}

export class ActionMelee extends AINode {
    type = 'ActionMelee';
    tick(ctx: AIContext): AIStatus {
        const type = Math.random() > 0.5 ? 'SIDE' : 'LUNGE';
        ctx.actions.melee(type);
        return AIStatus.SUCCESS;
    }
}

export class ActionShoot extends AINode {
    type = 'ActionShoot';
    tick(ctx: AIContext): AIStatus {
        ctx.actions.shoot();
        return AIStatus.SUCCESS;
    }
}

export class ActionDash extends AINode {
    type = 'ActionDash';
    tick(ctx: AIContext): AIStatus {
        ctx.actions.dash();
        return AIStatus.SUCCESS;
    }
}

export class ActionAscend extends AINode {
    type = 'ActionAscend';
    tick(ctx: AIContext): AIStatus {
        ctx.actions.ascend();
        return AIStatus.SUCCESS;
    }
}

export class ActionIdle extends AINode {
    type = 'ActionIdle';
    tick(ctx: AIContext): AIStatus {
        ctx.actions.idle();
        return AIStatus.SUCCESS;
    }
}

// --- PARSER LOGIC (Factory) ---

export const parseBehaviorTree = (def: AINodeDefinition): AINode => {
    switch (def.type) {
        case 'Selector':
            return new Selector((def.children || []).map(parseBehaviorTree));
        case 'Sequence':
            return new Sequence((def.children || []).map(parseBehaviorTree));
        
        // Conditions
        case 'CheckThreat': return new CheckThreat();
        case 'CheckMeleeTargeted': return new CheckMeleeTargeted();
        case 'CheckCanAct': return new CheckCanAct();
        case 'CheckCanDefend': return new CheckCanDefend();
        case 'CheckShootCooldown': return new CheckShootCooldown();
        case 'CheckMeleeWhiff': return new CheckMeleeWhiff();
        case 'CheckAmmo': return new CheckAmmo();
        case 'CheckShotFired': return new CheckShotFired();
        
        case 'CheckStateDuration':
            return new CheckStateDuration(Number(def.params?.min || 0));
        
        case 'CheckBoost': 
            return new CheckBoost(Number(def.params?.threshold || 0));
        
        case 'CheckState':
            return new CheckState(String(def.params?.state || 'IDLE'));
            
        case 'CheckDistance':
            // Handle string inputs for config keys
            const valSource = isNaN(Number(def.params?.value)) 
                ? (def.params?.value as any) 
                : Number(def.params?.value);
            return new CheckDistance(
                (def.params?.operator as '<'|'>') || '<',
                valSource
            );

        case 'Probability':
             const chanceSource = isNaN(Number(def.params?.chance)) 
                ? (def.params?.chance as any) 
                : Number(def.params?.chance);
            return new Probability(chanceSource);

        // Actions
        case 'ActionEvade': 
            return new ActionEvade(Boolean(def.params?.isRainbow));
        case 'ActionMelee': return new ActionMelee();
        case 'ActionShoot': return new ActionShoot();
        case 'ActionDash': return new ActionDash();
        case 'ActionAscend': return new ActionAscend();
        case 'ActionIdle': return new ActionIdle();
        
        default:
            console.warn(`Unknown node type: ${def.type}`);
            // Return a dummy node that always fails to prevent crashes
            return new class extends AINode { type='Unknown'; tick() { return AIStatus.FAILURE; } };
    }
};

// --- METADATA FOR EDITOR ---
export const NODE_TYPES_METADATA = {
    'Composites': ['Selector', 'Sequence'],
    'Conditions': ['CheckThreat', 'CheckMeleeTargeted', 'CheckBoost', 'CheckDistance', 'CheckCanAct', 'CheckCanDefend', 'CheckShootCooldown', 'Probability', 'CheckState', 'CheckStateDuration', 'CheckShotFired', 'CheckMeleeWhiff', 'CheckAmmo'],
    'Actions': ['ActionEvade', 'ActionMelee', 'ActionShoot', 'ActionDash', 'ActionAscend', 'ActionIdle']
};

export const NODE_PARAM_DEFS: Record<string, { key: string, type: 'number'|'string'|'boolean', default: any, options?: string[] }[]> = {
    'CheckBoost': [{ key: 'threshold', type: 'number', default: 20 }],
    'CheckState': [{ key: 'state', type: 'string', default: 'MELEE' }],
    'CheckStateDuration': [{ key: 'min', type: 'number', default: 0.2 }],
    'CheckDistance': [
        { key: 'operator', type: 'string', default: '<', options: ['<', '>'] },
        { key: 'value', type: 'string', default: 'CONFIG_MELEE' } // Can be number or config key
    ],
    'Probability': [
        { key: 'chance', type: 'string', default: 0.5 } // Can be number or config key
    ],
    'ActionEvade': [
        { key: 'isRainbow', type: 'boolean', default: false }
    ]
};
