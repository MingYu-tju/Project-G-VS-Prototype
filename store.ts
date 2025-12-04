import { create } from 'zustand';
import { Vector3, MathUtils } from 'three';
import { GameEntity, Team, RED_LOCK_DISTANCE, LockState, Projectile, GLOBAL_CONFIG, HitEffectData, NPCConfig, DEFAULT_NPC_CONFIG } from './types';
import { AINodeDefinition } from './components/AIEngine'; 

// ... (GameState interface remains unchanged) ...
interface GameState {
  // Game Lifecycle
  isGameStarted: boolean;
  startGame: () => void;

  // Entities
  playerPos: Vector3;
  targets: GameEntity[];
  
  // Player Hit State
  playerLastHitTime: number;
  playerLastHitDuration: number; 
  playerKnockbackDir: Vector3;
  playerKnockbackPower: number;
  playerHitStop: number; 

  // New: Player Offense State (Who is player hitting?)
  playerMeleeTargetId: string | null;

  // Projectiles & Combat
  projectiles: Projectile[];
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  
  // Guidance Breaking
  lastMeleeCutTime: Record<string, number>;
  
  // Global Effects
  hitEffects: HitEffectData[];
  
  // Lock-on System
  currentTargetIndex: number;
  lockState: LockState;
  
  // Player Status
  boost: number;
  maxBoost: number;
  isOverheated: boolean;
  
  // Cinematic Camera
  isCinematicCameraActive: boolean;
  setCinematicCamera: (active: boolean) => void;
  
  // AI Control
  areNPCsPaused: boolean;
  npcConfig: NPCConfig;
  aiTreeData: AINodeDefinition; // Dynamic AI Tree Data
  
  // Graphics Settings
  isDarkScene: boolean; 
  isRimLightOn: boolean;
  isOutlineOn: boolean; 
  showStats: boolean;

  // Actions
  setPlayerPos: (pos: Vector3) => void;
  updateTargetPosition: (id: string, pos: Vector3) => void;
  updateUnitTarget: (id: string, targetId: string | null) => void;
  updateUnitMeleeTarget: (id: string, meleeTargetId: string | null) => void; 
  setPlayerMeleeTarget: (targetId: string | null) => void; 
  
  cycleTarget: () => void;
  consumeBoost: (amount: number) => boolean;
  refillBoost: () => void;
  setOverheat: (status: boolean) => void;
  
  // Combat Actions
  spawnProjectile: (projectile: Projectile) => void;
  updateProjectiles: (delta: number) => void;
  consumeAmmo: () => boolean;
  recoverAmmo: () => void;
  applyHit: (targetId: string, attackerId: string, impactDirection: Vector3, force?: number, stunDuration?: number, hitStopFrames?: number, isKnockdown?: boolean) => void;
  decrementHitStop: (delta: number) => void;
  
  // Guidance Actions
  cutTracking: (targetId: string) => void; 
  triggerMeleeCut: (targetId: string) => void; 
  
  // AI Actions
  toggleNPCsPaused: () => void;
  updateNpcConfig: (config: Partial<NPCConfig>) => void;
  updateAiTree: (newTree: AINodeDefinition) => void; 
  
  // Graphics Actions
  toggleScene: () => void; 
  toggleRimLight: () => void;
  toggleOutline: () => void; 
  toggleStats: () => void;
}

// --- EXVS "VETERAN" AI TREE ---
// Logic Flow:
// 1. SURVIVAL: If threatened -> Step (Side Dash).
// 2. CANCELS (Flow): 
//    - If Shot Fired -> Dash (Zunda).
//    - If Melee Whiff -> Rainbow Step.
//    - If Dashing > 0.3s -> Ascend (Inertia Jump).
// 3. OFFENSE (Initiation):
//    - If Close -> Melee.
//    - If Mid -> Shoot.
// 4. MOVEMENT (Default):
//    - If Idle -> Start Dash (Begins Inertia Loop).

const DEFAULT_AI_TREE: AINodeDefinition = {
  "id": "root_exvs_pro",
  "type": "Selector",
  "children": [
    {
      "id": "survival_layer",
      "type": "Sequence",
      "children": [
        { "id": "cond_threat", "type": "CheckThreat" },
        { "id": "cond_can_defend", "type": "CheckCanDefend" },
        { "id": "cond_boost_safe", "type": "CheckBoost", "params": { "threshold": 5 } },
        // High reflex dodge
        { "id": "act_evade", "type": "ActionEvade", "params": { "isRainbow": false } }
      ]
    },
    {
      "id": "melee_defense_layer",
      "type": "Sequence",
      "children": [
        { "id": "cond_melee_threat", "type": "CheckMeleeTargeted" },
        { "id": "cond_can_defend_2", "type": "CheckCanDefend" },
        { "id": "cond_dist_melee_def", "type": "CheckDistance", "params": { "operator": "<", "value": 20 } },
        { "id": "act_evade_melee", "type": "ActionEvade", "params": { "isRainbow": false } }
      ]
    },
    {
      "id": "cancel_layer",
      "type": "Selector",
      "children": [
        {
          "id": "melee_rainbow_cancel",
          "type": "Sequence",
          "children": [
            { "id": "check_is_meleeing", "type": "CheckState", "params": { "state": "MELEE" } },
            { "id": "check_whiff", "type": "CheckMeleeWhiff" },
            { "id": "cond_boost_rb", "type": "CheckBoost", "params": { "threshold": 20 } },
            { "id": "act_rainbow", "type": "ActionEvade", "params": { "isRainbow": true } }
          ]
        },
        {
          "id": "zunda_cancel",
          "type": "Sequence",
          "children": [
            { "id": "check_is_shooting", "type": "CheckState", "params": { "state": "SHOOTING" } },
            { "id": "check_fired", "type": "CheckShotFired" },
            { "id": "cond_boost_zunda", "type": "CheckBoost", "params": { "threshold": 10 } },
            { "id": "act_dash_cancel", "type": "ActionDash" }
          ]
        },
        {
          "id": "inertia_jump_execution",
          "type": "Sequence",
          "children": [
             // If we have been dashing for > 0.3s, conserve momentum by Ascending
            { "id": "check_dashing", "type": "CheckState", "params": { "state": "DASHING" } },
            { "id": "check_dash_time", "type": "CheckStateDuration", "params": { "min": 0.3 } },
            { "id": "cond_boost_ascend", "type": "CheckBoost", "params": { "threshold": 10 } },
            { "id": "act_ascend", "type": "ActionAscend" }
          ]
        }
      ]
    },
    {
      "id": "offense_layer",
      "type": "Selector",
      "children": [
          {
            "id": "melee_attack",
            "type": "Sequence",
            "children": [
              { "id": "cond_can_act_m", "type": "CheckCanAct" },
              { "id": "cond_dist_melee", "type": "CheckDistance", "params": { "operator": "<", "value": "CONFIG_MELEE" } },
              { "id": "cond_boost_m", "type": "CheckBoost", "params": { "threshold": 30 } },
              { "id": "prob_melee_start", "type": "Probability", "params": { "chance": "CONFIG_MELEE_AGGRESSION" } },
              { "id": "act_melee_start", "type": "ActionMelee" }
            ]
          },
          {
            "id": "shoot_attack",
            "type": "Sequence",
            "children": [
              { "id": "cond_can_act_s", "type": "CheckCanAct" },
              // Don't shoot if too far (Red Lock range approx)
              { "id": "cond_dist_shoot", "type": "CheckDistance", "params": { "operator": "<", "value": 70 } },
              { "id": "cond_ammo", "type": "CheckAmmo" },
              // If we just dashed (Zunda window), higher chance to shoot
              { "id": "prob_shoot", "type": "Probability", "params": { "chance": "CONFIG_SHOOT" } },
              { "id": "act_shoot_start", "type": "ActionShoot" }
            ]
          }
      ]
    },
    {
      "id": "movement_init_layer",
      "type": "Sequence",
      "children": [
        // If we are IDLE (landed or standing), start the loop again
        { "id": "cond_can_act_move", "type": "CheckCanAct" },
        { "id": "cond_boost_move", "type": "CheckBoost", "params": { "threshold": 15 } },
        // High probability to move, low probability to stand still
        { "id": "prob_move", "type": "Probability", "params": { "chance": 0.9 } },
        { "id": "act_dash_move", "type": "ActionDash" }
      ]
    }
  ]
};

// ... (Rest of store.ts remains identical, just updated DEFAULT_AI_TREE) ...
// Initial Targets
const initialTargets: GameEntity[] = [
  { id: 'enemy-1', position: new Vector3(0, 2, -50), type: 'ENEMY', team: Team.RED, name: "ZAKU-II Custom", lastHitTime: 0, lastHitDuration: 500, targetId: null, meleeTargetId: null, knockbackPower: 1, isKnockedDown: false, hitStop: 0 },
  { id: 'enemy-2', position: new Vector3(30, 5, -30), type: 'ENEMY', team: Team.RED, name: "DOM Trooper", lastHitTime: 0, lastHitDuration: 500, targetId: null, meleeTargetId: null, knockbackPower: 1, isKnockedDown: false, hitStop: 0 },
  { id: 'ally-1', position: new Vector3(-20, 0, -10), type: 'ALLY', team: Team.BLUE, name: "GM Sniper", lastHitTime: 0, lastHitDuration: 500, targetId: null, meleeTargetId: null, knockbackPower: 1, isKnockedDown: false, hitStop: 0 },
];

export const useGameStore = create<GameState>((set, get) => ({
  isGameStarted: false,
  startGame: () => set({ isGameStarted: true }),

  playerPos: new Vector3(0, 0, 0),
  targets: initialTargets,
  
  playerLastHitTime: 0,
  playerLastHitDuration: 500,
  playerKnockbackDir: new Vector3(0, 0, 0),
  playerKnockbackPower: 1,
  playerHitStop: 0,
  
  playerMeleeTargetId: null, // Who is player lunging at?

  currentTargetIndex: 0,
  lockState: LockState.GREEN,
  
  projectiles: [],
  ammo: GLOBAL_CONFIG.MAX_AMMO,
  maxAmmo: GLOBAL_CONFIG.MAX_AMMO,
  lastShotTime: 0,
  
  hitEffects: [],
  lastMeleeCutTime: {},

  boost: 100,
  maxBoost: 100,
  isOverheated: false,
  
  isCinematicCameraActive: false,
  setCinematicCamera: (active) => set({ isCinematicCameraActive: active }),
  
  areNPCsPaused: true,
  npcConfig: DEFAULT_NPC_CONFIG, 
  aiTreeData: DEFAULT_AI_TREE, 
  
  isDarkScene: false,
  isRimLightOn: true,
  isOutlineOn: false, 
  showStats: false,

  setPlayerPos: (pos) => {
    set({ playerPos: pos });
    
    const { targets, currentTargetIndex } = get();
    const target = targets[currentTargetIndex];
    if (target) {
      const distance = pos.distanceTo(target.position);
      const newState = distance < RED_LOCK_DISTANCE ? LockState.RED : LockState.GREEN;
      if (newState !== get().lockState) {
        set({ lockState: newState });
      }
    }
  },

  updateTargetPosition: (id, pos) => {
    set((state) => ({
      targets: state.targets.map(t => t.id === id ? { ...t, position: pos } : t)
    }));
  },
  
  updateUnitTarget: (id, targetId) => {
    set((state) => ({
      targets: state.targets.map(t => t.id === id ? { ...t, targetId } : t)
    }));
  },
  
  updateUnitMeleeTarget: (id, meleeTargetId) => {
    set((state) => ({
      targets: state.targets.map(t => t.id === id ? { ...t, meleeTargetId } : t)
    }));
  },

  setPlayerMeleeTarget: (targetId) => {
    set({ playerMeleeTargetId: targetId });
  },

  cycleTarget: () => {
    set((state) => {
      const { targets, currentTargetIndex } = state;
      const enemyIndices = targets
        .map((t, i) => (t.type === 'ENEMY' ? i : -1))
        .filter(i => i !== -1);

      if (enemyIndices.length === 0) return state;
      const currentEnemyIndex = enemyIndices.indexOf(currentTargetIndex);
      const nextEnemyIndex = enemyIndices[(currentEnemyIndex + 1) % enemyIndices.length];
      return { currentTargetIndex: nextEnemyIndex };
    });
  },

  consumeBoost: (amount) => {
    const { boost, isOverheated } = get();
    if (isOverheated || boost <= 0) return false;
    const newBoost = Math.max(0, boost - amount);
    set({ boost: newBoost });
    if (newBoost === 0) {
      set({ isOverheated: true });
    }
    return true;
  },

  refillBoost: () => {
    set((state) => ({ boost: state.maxBoost, isOverheated: false }));
  },

  setOverheat: (status) => set({ isOverheated: status }),

  consumeAmmo: () => {
    const { ammo } = get();
    if (ammo > 0) {
      set({ ammo: ammo - 1, lastShotTime: Date.now() });
      return true;
    }
    return false;
  },

  recoverAmmo: () => {
    set((state) => {
      if (state.ammo < state.maxAmmo) {
        return { ammo: state.ammo + 1 };
      }
      return {};
    });
  },

  spawnProjectile: (projectile) => {
    set((state) => ({ projectiles: [...state.projectiles, projectile] }));
  },

  updateProjectiles: (delta: number) => {
    const timeScale = delta * 60;

    set((state) => {
      const nextProjectiles = state.projectiles
        .map(p => {
          const movementStep = p.velocity.clone().multiplyScalar(timeScale);
          const newPos = p.position.clone().add(movementStep);
          
          let newVel = p.velocity.clone();
          let isStillHoming = p.isHoming;

          if (p.isHoming && p.targetId) {
            let targetPos: Vector3 | null = null;
            if (p.targetId === 'player') {
                targetPos = state.playerPos.clone();
            } else {
                const t = state.targets.find(t => t.id === p.targetId);
                if (t) targetPos = t.position.clone();
            }

            if (targetPos) {
               const aimTargetPos = targetPos.clone().add(new Vector3(0, 1.5, 0));
               const toTarget = aimTargetPos.sub(newPos);
               const dirToTarget = toTarget.clone().normalize();
               const currentDir = p.velocity.clone().normalize();
               
               if (currentDir.dot(dirToTarget) < 0) {
                   isStillHoming = false;
               } else {
                   const fwd = p.forwardDirection.clone().normalize();
                   const forwardVel = fwd.clone().multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED);
                   const forwardComponent = fwd.clone().multiplyScalar(toTarget.dot(fwd));
                   const lateralVector = toTarget.clone().sub(forwardComponent);
                   
                   if (lateralVector.lengthSq() > 0.001) {
                       lateralVector.normalize();
                       const lateralVel = lateralVector.multiplyScalar(GLOBAL_CONFIG.HOMING_LATERAL_SPEED);
                       newVel = forwardVel.add(lateralVel);
                   } else {
                       newVel = forwardVel;
                   }
               }
            }
          }

          return { ...p, position: newPos, velocity: newVel, isHoming: isStillHoming, ttl: p.ttl - timeScale };
        })
        .filter(p => p.ttl > 0); 

      return { projectiles: nextProjectiles };
    });
  },

  applyHit: (targetId: string, attackerId: string, impactDirection: Vector3, force: number = 1.0, stunDuration: number = 500, hitStopFrames: number = 0, isKnockdown: boolean = false) => {
      set((state) => {
          let impactPos = new Vector3();
          if (targetId === 'player') {
              impactPos.copy(state.playerPos).add(new Vector3(0, 1.5, 0));
          } else {
              const t = state.targets.find(t => t.id === targetId);
              if (t) impactPos.copy(t.position).add(new Vector3(0, 1.5, 0));
          }
          impactPos.sub(impactDirection.clone().multiplyScalar(0.5));

          const newEffect: HitEffectData = {
              id: `hit-${Date.now()}-${Math.random()}`,
              position: impactPos,
              startTime: Date.now(),
              type: 'SLASH', 
              scale: force > 1.5 ? 1.5 : 1.0
          };

          const updates: Partial<GameState> = {
              hitEffects: [...state.hitEffects, newEffect]
          };

          if (targetId === 'player') {
              updates.playerLastHitTime = Date.now();
              updates.playerLastHitDuration = stunDuration;
              updates.playerKnockbackDir = impactDirection;
              updates.playerKnockbackPower = force;
              updates.playerHitStop = hitStopFrames; 
          } 
          
          if (attackerId === 'player') {
               updates.playerHitStop = hitStopFrames;
          } 

          updates.targets = state.targets.map(t => {
              let newT = { ...t };
              if (t.id === targetId) {
                   newT.lastHitTime = Date.now();
                   newT.lastHitDuration = stunDuration;
                   newT.knockbackDir = impactDirection;
                   newT.knockbackPower = force;
                   newT.isKnockedDown = isKnockdown;
                   newT.hitStop = hitStopFrames;
              }
              if (t.id === attackerId) {
                   newT.hitStop = hitStopFrames;
              }
              return newT;
          });

          return updates;
      });
  },

  decrementHitStop: (delta: number) => {
      set(state => {
          const decay = delta * 60;
          const newPlayerHitStop = Math.max(0, state.playerHitStop - decay);
          
          const newTargets = state.targets.map(t => ({
              ...t,
              hitStop: Math.max(0, t.hitStop - decay)
          }));

          const now = Date.now();
          let newEffects = state.hitEffects;
          if (state.hitEffects.length > 0 && now - state.hitEffects[0].startTime > 1000) {
               newEffects = state.hitEffects.filter(e => now - e.startTime < 1000);
          }
          
          return { 
              playerHitStop: newPlayerHitStop,
              targets: newTargets,
              hitEffects: newEffects
          };
      });
  },

  cutTracking: (targetId: string) => {
      set((state) => ({
          projectiles: state.projectiles.map(p => 
              p.targetId === targetId ? { ...p, isHoming: false } : p
          )
      }));
  },

  triggerMeleeCut: (targetId: string) => {
      set(state => ({
          lastMeleeCutTime: {
              ...state.lastMeleeCutTime,
              [targetId]: Date.now()
          }
      }));
  },
  
  toggleNPCsPaused: () => {
      set(state => ({ areNPCsPaused: !state.areNPCsPaused }));
  },
  
  updateNpcConfig: (config) => {
      set(state => ({
          npcConfig: { ...state.npcConfig, ...config }
      }));
  },

  updateAiTree: (newTree) => {
      set({ aiTreeData: newTree });
  },
  
  toggleScene: () => {
      set(state => ({ isDarkScene: !state.isDarkScene }));
  },

  toggleRimLight: () => {
      set(state => ({ isRimLightOn: !state.isRimLightOn }));
  },

  toggleOutline: () => {
      set(state => ({ isOutlineOn: !state.isOutlineOn }));
  },

  toggleStats: () => {
      set(state => ({ showStats: !state.showStats }));
  }
}));