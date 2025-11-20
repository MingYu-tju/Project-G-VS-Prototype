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
  cycleTarget: () => void;
  consumeBoost: (amount: number) => boolean;
  refillBoost: () => void;
  setOverheat: (status: boolean) => void;
  
  // Combat Actions
  spawnProjectile: (projectile: Projectile) => void;
  updateProjectiles: () => void; // Called every frame to move bullets
  consumeAmmo: () => boolean;
  recoverAmmo: () => void;
  applyHit: (targetId: string, impactDirection: Vector3) => void;
}

// Initial Targets
const initialTargets: GameEntity[] = [
  { id: 'enemy-1', position: new Vector3(0, 2, -50), type: 'ENEMY', team: Team.RED, name: "ZAKU-II Custom", lastHitTime: 0 },
  { id: 'enemy-2', position: new Vector3(30, 5, -30), type: 'ENEMY', team: Team.RED, name: "DOM Trooper", lastHitTime: 0 },
  { id: 'ally-1', position: new Vector3(-20, 0, -10), type: 'ALLY', team: Team.BLUE, name: "GM Sniper", lastHitTime: 0 },
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

  updateProjectiles: () => {
    set((state) => {
      const nextProjectiles = state.projectiles
        .map(p => {
          // 1. Move Projectile
          const newPos = p.position.clone().add(p.velocity);
          
          // 2. Homing Logic (Steering)
          let newVel = p.velocity.clone();
          let isStillHoming = p.isHoming;

          if (p.isHoming && p.targetId) {
            // Resolve target (Player or Entity)
            let targetPos: Vector3 | null = null;
            
            if (p.targetId === 'player') {
                targetPos = state.playerPos.clone();
            } else {
                const t = state.targets.find(t => t.id === p.targetId);
                if (t) targetPos = t.position.clone();
            }

            if (targetPos) {
               const dirToTarget = targetPos.sub(newPos).normalize();
               const currentDir = p.velocity.clone().normalize();
               const currentSpeed = p.velocity.length();
               
               // Dot Check for pass-through
               const dot = currentDir.dot(dirToTarget);

               if (dot < 0) {
                   isStillHoming = false;
               } else {
                   // Separate Horizontal and Vertical Steering (Spherical Coordinates)
                   
                   // Current Angles
                   const currentYaw = Math.atan2(currentDir.z, currentDir.x);
                   const currentPitch = Math.asin(MathUtils.clamp(currentDir.y, -1, 1));

                   // Target Angles
                   const targetYaw = Math.atan2(dirToTarget.z, dirToTarget.x);
                   const targetPitch = Math.asin(MathUtils.clamp(dirToTarget.y, -1, 1));

                   // Yaw Interpolation (Horizontal)
                   let deltaYaw = targetYaw - currentYaw;
                   // Wrap angle to [-PI, PI]
                   while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
                   while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
                   
                   const newYaw = currentYaw + deltaYaw * GLOBAL_CONFIG.HOMING_TURN_RATE_HORIZONTAL;

                   // Pitch Interpolation (Vertical)
                   const deltaPitch = targetPitch - currentPitch;
                   const newPitch = currentPitch + deltaPitch * GLOBAL_CONFIG.HOMING_TURN_RATE_VERTICAL;

                   // Reconstruct Velocity Vector
                   const cosPitch = Math.cos(newPitch);
                   const newDirX = cosPitch * Math.cos(newYaw);
                   const newDirY = Math.sin(newPitch);
                   const newDirZ = cosPitch * Math.sin(newYaw);
                   
                   newVel.set(newDirX, newDirY, newDirZ).multiplyScalar(currentSpeed);
               }
            }
          }

          // 3. Decrease TTL
          return { ...p, position: newPos, velocity: newVel, isHoming: isStillHoming, ttl: p.ttl - 1 };
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
  }
}));