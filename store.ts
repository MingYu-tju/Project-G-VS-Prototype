
import { create } from 'zustand';
import { Vector3, MathUtils } from 'three';
import { GameEntity, Team, RED_LOCK_DISTANCE, LockState, Projectile, GLOBAL_CONFIG, HitEffectData } from './types';

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
  playerHitStop: number; // NEW: Local player hitstop

  // Projectiles & Combat
  projectiles: Projectile[];
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  
  // Global Effects
  // hitStop: number; // REMOVED: Replaced by individual hitStops
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
  
  // Graphics Settings
  isDarkScene: boolean; 
  isRimLightOn: boolean;
  isOutlineOn: boolean; 
  showStats: boolean;

  // Actions
  setPlayerPos: (pos: Vector3) => void;
  updateTargetPosition: (id: string, pos: Vector3) => void;
  updateUnitTarget: (id: string, targetId: string | null) => void;
  cycleTarget: () => void;
  consumeBoost: (amount: number) => boolean;
  refillBoost: () => void;
  setOverheat: (status: boolean) => void;
  
  // Combat Actions
  spawnProjectile: (projectile: Projectile) => void;
  updateProjectiles: (delta: number) => void;
  consumeAmmo: () => boolean;
  recoverAmmo: () => void;
  // Updated Signature: now accepts attackerId
  applyHit: (targetId: string, attackerId: string, impactDirection: Vector3, force?: number, stunDuration?: number, hitStopFrames?: number, isKnockdown?: boolean) => void;
  decrementHitStop: (delta: number) => void;
  
  // New: Cut Tracking (Step)
  cutTracking: (targetId: string) => void;
  
  // AI Actions
  toggleNPCsPaused: () => void;
  
  // Graphics Actions
  toggleScene: () => void; 
  toggleRimLight: () => void;
  toggleOutline: () => void; 
  toggleStats: () => void;
}

// Initial Targets
const initialTargets: GameEntity[] = [
  { id: 'enemy-1', position: new Vector3(0, 2, -50), type: 'ENEMY', team: Team.RED, name: "ZAKU-II Custom", lastHitTime: 0, lastHitDuration: 500, targetId: null, knockbackPower: 1, isKnockedDown: false, hitStop: 0 },
  { id: 'enemy-2', position: new Vector3(30, 5, -30), type: 'ENEMY', team: Team.RED, name: "DOM Trooper", lastHitTime: 0, lastHitDuration: 500, targetId: null, knockbackPower: 1, isKnockedDown: false, hitStop: 0 },
  { id: 'ally-1', position: new Vector3(-20, 0, -10), type: 'ALLY', team: Team.BLUE, name: "GM Sniper", lastHitTime: 0, lastHitDuration: 500, targetId: null, knockbackPower: 1, isKnockedDown: false, hitStop: 0 },
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

  currentTargetIndex: 0,
  lockState: LockState.GREEN,
  
  projectiles: [],
  ammo: GLOBAL_CONFIG.MAX_AMMO,
  maxAmmo: GLOBAL_CONFIG.MAX_AMMO,
  lastShotTime: 0,
  
  hitEffects: [],

  boost: 100,
  maxBoost: 100,
  isOverheated: false,
  
  isCinematicCameraActive: false,
  setCinematicCamera: (active) => set({ isCinematicCameraActive: active }),
  
  areNPCsPaused: true,
  isDarkScene: false,
  isRimLightOn: true,
  isOutlineOn: false, 
  showStats: false,

  setPlayerPos: (pos) => {
    set({ playerPos: pos });
    
    // Update Lock State based on distance
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

  // --- COMBAT ACTIONS ---

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
    // Projectiles update independently now. 
    // They will handle their own hit detection which triggers local hit stops.
    
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
               // Aim at chest height
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
          // Spawn VFX
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

          // Apply to Victim
          if (targetId === 'player') {
              updates.playerLastHitTime = Date.now();
              updates.playerLastHitDuration = stunDuration;
              updates.playerKnockbackDir = impactDirection;
              updates.playerKnockbackPower = force;
              updates.playerHitStop = hitStopFrames; // Freeze player
          } else {
              // Map through targets to update victim
              // We'll handle Attacker in a second pass or same pass
              // Better to do one map
          }
          
          // Apply to Attacker (Hit Stop / Impact Pause)
          if (attackerId === 'player') {
               updates.playerHitStop = hitStopFrames;
          } 

          // Unified update for targets array
          updates.targets = state.targets.map(t => {
              let newT = { ...t };
              // Is this the victim?
              if (t.id === targetId) {
                   newT.lastHitTime = Date.now();
                   newT.lastHitDuration = stunDuration;
                   newT.knockbackDir = impactDirection;
                   newT.knockbackPower = force;
                   newT.isKnockedDown = isKnockdown;
                   newT.hitStop = hitStopFrames;
              }
              // Is this the attacker?
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

          // Clean up old effects occasionally
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
  
  toggleNPCsPaused: () => {
      set(state => ({ areNPCsPaused: !state.areNPCsPaused }));
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
