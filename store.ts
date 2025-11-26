
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
  playerLastHitDuration: number; // New
  playerKnockbackDir: Vector3;
  playerKnockbackPower: number;

  // Projectiles & Combat
  projectiles: Projectile[];
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  
  // Global Effects
  hitStop: number; // Frames to freeze simulation (Card Stop / Hit Stop)
  hitEffects: HitEffectData[];
  
  // Lock-on System
  currentTargetIndex: number;
  lockState: LockState;
  
  // Player Status
  boost: number;
  maxBoost: number;
  isOverheated: boolean;
  
  // AI Control
  areNPCsPaused: boolean;

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
  applyHit: (targetId: string, impactDirection: Vector3, force?: number, stunDuration?: number, hitStopFrames?: number) => void; // Updated signature
  decrementHitStop: () => void; // New action to tick hitstop
  
  // New: Cut Tracking (Step)
  cutTracking: (targetId: string) => void;
  
  // AI Actions
  toggleNPCsPaused: () => void;
}

// Initial Targets
const initialTargets: GameEntity[] = [
  { id: 'enemy-1', position: new Vector3(0, 2, -50), type: 'ENEMY', team: Team.RED, name: "ZAKU-II Custom", lastHitTime: 0, lastHitDuration: 500, targetId: null, knockbackPower: 1 },
  { id: 'enemy-2', position: new Vector3(30, 5, -30), type: 'ENEMY', team: Team.RED, name: "DOM Trooper", lastHitTime: 0, lastHitDuration: 500, targetId: null, knockbackPower: 1 },
  { id: 'ally-1', position: new Vector3(-20, 0, -10), type: 'ALLY', team: Team.BLUE, name: "GM Sniper", lastHitTime: 0, lastHitDuration: 500, targetId: null, knockbackPower: 1 },
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

  currentTargetIndex: 0,
  lockState: LockState.GREEN,
  
  projectiles: [],
  ammo: GLOBAL_CONFIG.MAX_AMMO,
  maxAmmo: GLOBAL_CONFIG.MAX_AMMO,
  lastShotTime: 0,
  
  hitStop: 0,
  hitEffects: [],

  boost: 100,
  maxBoost: 100,
  isOverheated: false,
  
  areNPCsPaused: false,

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
    // If hit stop is active, freeze projectiles
    if (get().hitStop > 0) return;

    // Calculate Time Scale: 
    // If delta is 1/60 (16ms), timeScale is 1.
    const timeScale = delta * 60;

    set((state) => {
      const nextProjectiles = state.projectiles
        .map(p => {
          // 1. Move Projectile (Velocity is defined as "Units per 60hz Frame", so multiply by timeScale)
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
               
               // Vector from Bullet to Target
               const toTarget = aimTargetPos.sub(newPos);
               const dirToTarget = toTarget.clone().normalize();
               const currentDir = p.velocity.clone().normalize();
               
               // Stop homing if we passed the target (dot product check)
               if (currentDir.dot(dirToTarget) < 0) {
                   isStillHoming = false;
               } else {
                   // --- CONSTANT VELOCITY HOMING LOGIC ---
                   
                   // 1. Get Fixed Forward Velocity (Bullet Logic: Always moves forward at BULLET_SPEED)
                   const fwd = p.forwardDirection.clone().normalize();
                   const forwardVel = fwd.clone().multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED);
                   
                   // 2. Calculate Desired Lateral Direction
                   // We want the component of 'toTarget' that is PERPENDICULAR to 'fwd'.
                   // Projection of A onto B: (A . B) * B
                   const forwardComponent = fwd.clone().multiplyScalar(toTarget.dot(fwd));
                   const lateralVector = toTarget.clone().sub(forwardComponent);
                   
                   // 3. Apply Fixed Lateral Speed
                   // If there is a need to correct laterally...
                   if (lateralVector.lengthSq() > 0.001) {
                       lateralVector.normalize();
                       const lateralVel = lateralVector.multiplyScalar(GLOBAL_CONFIG.HOMING_LATERAL_SPEED);
                       
                       // 4. Combine: New Velocity = Fixed Forward + Fixed Lateral
                       // NOTE: Velocity is stored as "units per frame", so we don't multiply by timeScale here.
                       // Movement step calculation above handles timeScale.
                       newVel = forwardVel.add(lateralVel);
                   } else {
                       // Perfectly aligned, just move forward
                       newVel = forwardVel;
                   }
               }
            }
          }

          // 3. Decrease TTL (TTL is in frames, so decrease by timeScale)
          return { ...p, position: newPos, velocity: newVel, isHoming: isStillHoming, ttl: p.ttl - timeScale };
        })
        .filter(p => p.ttl > 0); 

      return { projectiles: nextProjectiles };
    });
  },

  applyHit: (targetId: string, impactDirection: Vector3, force: number = 1.0, stunDuration: number = 500, hitStopFrames: number = 0) => {
      set((state) => {
          // Spawn VFX
          // Need to calculate approximate impact point. 
          // For simplicity, we'll place it at the target's position but slightly offset towards impact direction (reversed)
          let impactPos = new Vector3();
          if (targetId === 'player') {
              impactPos.copy(state.playerPos).add(new Vector3(0, 1.5, 0));
          } else {
              const t = state.targets.find(t => t.id === targetId);
              if (t) impactPos.copy(t.position).add(new Vector3(0, 1.5, 0));
          }
          // Offset slightly towards where the hit came from
          impactPos.sub(impactDirection.clone().multiplyScalar(0.5));

          const newEffect: HitEffectData = {
              id: `hit-${Date.now()}-${Math.random()}`,
              position: impactPos,
              startTime: Date.now(),
              type: 'SLASH', // Or determine based on source
              scale: force > 1.5 ? 1.5 : 1.0 // Big hits = big flash
          };

          const updates: Partial<GameState> = {
              hitStop: hitStopFrames,
              hitEffects: [...state.hitEffects, newEffect]
          };

          if (targetId === 'player') {
              updates.playerLastHitTime = Date.now();
              updates.playerLastHitDuration = stunDuration;
              updates.playerKnockbackDir = impactDirection;
              updates.playerKnockbackPower = force;
          } else {
              updates.targets = state.targets.map(t => t.id === targetId ? { 
                  ...t, 
                  lastHitTime: Date.now(),
                  lastHitDuration: stunDuration,
                  knockbackDir: impactDirection,
                  knockbackPower: force
              } : t);
          }
          return updates;
      });
  },

  decrementHitStop: () => {
      set(state => {
          if (state.hitStop > 0) {
              return { hitStop: Math.max(0, state.hitStop - 1) };
          }
          
          // Clean up old effects occasionally if list gets huge? 
          // For now, GameScene renders based on time, so stale effects just invisible.
          // Let's filter out very old effects (older than 1s) to keep memory clean
          const now = Date.now();
          if (state.hitEffects.length > 0 && now - state.hitEffects[0].startTime > 1000) {
               return { hitEffects: state.hitEffects.filter(e => now - e.startTime < 1000) };
          }
          
          return {};
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
  }
}));
