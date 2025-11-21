import { create } from 'zustand';
import { Vector3, MathUtils } from 'three';
import { GameEntity, Team, RED_LOCK_DISTANCE, LockState, Projectile, GLOBAL_CONFIG } from './types';

interface GameState {
  // Entities
  playerPos: Vector3;
  targets: GameEntity[];
  
  // Player Hit State
  playerLastHitTime: number;
  playerKnockbackDir: Vector3;

  // Projectiles & Combat
  projectiles: Projectile[];
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  
  // Lock-on System
  currentTargetIndex: number;
  lockState: LockState;
  
  // Player Status
  boost: number;
  maxBoost: number;
  isOverheated: boolean;
  
  // Actions
  setPlayerPos: (pos: Vector3) => void;
  updateTargetPosition: (id: string, pos: Vector3) => void;
  updateUnitTarget: (id: string, targetId: string | null) => void; // New Action
  cycleTarget: () => void;
  consumeBoost: (amount: number) => boolean;
  refillBoost: () => void;
  setOverheat: (status: boolean) => void;
  
  // Combat Actions
  spawnProjectile: (projectile: Projectile) => void;
  updateProjectiles: (delta: number) => void; // Accepts delta now
  consumeAmmo: () => boolean;
  recoverAmmo: () => void;
  applyHit: (targetId: string, impactDirection: Vector3) => void;
  
  // New: Cut Tracking (Step)
  cutTracking: (targetId: string) => void;
}

// Initial Targets
const initialTargets: GameEntity[] = [
  { id: 'enemy-1', position: new Vector3(0, 2, -50), type: 'ENEMY', team: Team.RED, name: "ZAKU-II Custom", lastHitTime: 0, targetId: null },
  { id: 'enemy-2', position: new Vector3(30, 5, -30), type: 'ENEMY', team: Team.RED, name: "DOM Trooper", lastHitTime: 0, targetId: null },
  { id: 'ally-1', position: new Vector3(-20, 0, -10), type: 'ALLY', team: Team.BLUE, name: "GM Sniper", lastHitTime: 0, targetId: null },
];

export const useGameStore = create<GameState>((set, get) => ({
  playerPos: new Vector3(0, 0, 0),
  targets: initialTargets,
  
  playerLastHitTime: 0,
  playerKnockbackDir: new Vector3(0, 0, 0),

  currentTargetIndex: 0,
  lockState: LockState.GREEN,
  
  projectiles: [],
  ammo: GLOBAL_CONFIG.MAX_AMMO,
  maxAmmo: GLOBAL_CONFIG.MAX_AMMO,
  lastShotTime: 0,

  boost: 100,
  maxBoost: 100,
  isOverheated: false,

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
    // Calculate Time Scale: 
    // If delta is 1/60 (16ms), timeScale is 1.
    // If delta is 1/144 (7ms), timeScale is ~0.42.
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
                
               const dirToTarget = aimTargetPos.sub(newPos).normalize();
               const fwd = p.forwardDirection.clone().normalize();
               
               // Stop homing if we passed the target
               const currentDir = p.velocity.clone().normalize();
               const dot = currentDir.dot(dirToTarget);

               if (dot < 0) {
                   isStillHoming = false;
               } else {
                   // Drift Logic
                   // Apply turn rate scaled by timeScale
                   const hRate = GLOBAL_CONFIG.HOMING_TURN_RATE_HORIZONTAL * 5.0 * timeScale; 
                   const vRate = GLOBAL_CONFIG.HOMING_TURN_RATE_VERTICAL * 5.0 * timeScale;

                   newVel.x += dirToTarget.x * hRate;
                   newVel.z += dirToTarget.z * hRate;
                   newVel.y += dirToTarget.y * vRate;

                   // Constrain forward speed
                   const currentForwardSpeed = newVel.dot(fwd);
                   const fixedForwardVel = fwd.clone().multiplyScalar(GLOBAL_CONFIG.BULLET_SPEED);
                   const lateralVel = newVel.clone().sub(fwd.clone().multiplyScalar(currentForwardSpeed));
                   
                   newVel = fixedForwardVel.add(lateralVel);
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

  applyHit: (targetId: string, impactDirection: Vector3) => {
      set((state) => {
          if (targetId === 'player') {
              return {
                  playerLastHitTime: Date.now(),
                  playerKnockbackDir: impactDirection
              };
          } else {
              return {
                  targets: state.targets.map(t => t.id === targetId ? { 
                      ...t, 
                      lastHitTime: Date.now(),
                      knockbackDir: impactDirection 
                  } : t)
              };
          }
      });
  },

  cutTracking: (targetId: string) => {
      set((state) => ({
          projectiles: state.projectiles.map(p => 
              p.targetId === targetId ? { ...p, isHoming: false } : p
          )
      }));
  }
}));