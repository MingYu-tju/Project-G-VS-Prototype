import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3, Quaternion, Euler } from 'three';
import { Html } from '@react-three/drei';
import { MechModel } from './MechModel';
import { AnimationController, clonePose } from './AnimationSystem';
import { applyWalkAnimation } from './walkAnimation';
import { applyAirborneAnimation, createAirborneAnimation } from './airborneAnimation';
import { playFootSound } from '../game/AudioController';
import { ANIMATION_CLIPS } from '../assets/animations';
import { COMBO, SIDE_COMBO, SIM } from '../../shared/game/config';
import type { GameRuntime } from '../game/runtime';
import type { MechPose } from './types';
import type { MechState, MeleePhase } from '../../shared/game/types';

function selectClip(m: MechState) {
  const a = ANIMATION_CLIPS;
  if (m.down) return m.wakeup > 0 && m.wakeup < 60 ? a.WAKEUP : a.KNOCKDOWN;
  if (m.meleePhase.includes('SLASH')) return a[(m.meleePhase.startsWith('SIDE') ? m.meleePhase : `MELEE_${m.meleePhase}`) as keyof typeof a];
  if (m.meleePhase.includes('RECOVERY')) return a.MELEE_RECOVERY;
  if (m.meleePhase.startsWith('SIDE')) return a.MELEE_SIDE_LUNGE;
  if (m.meleePhase !== 'NONE') return a.MELEE_STARTUP;
  if (m.dash || m.evade > 0) return m.weapon === 'SABER' || m.evade > 0 ? a.DASH_SABER : a.DASH_GUN;
  if (m.visual === 'ASCEND') return a.ASCEND;
  return m.grounded && m.visual !== 'LANDING' ? a.IDLE : a.NEUTRAL;
}

export function MechView({ runtime, id }: { runtime: GameRuntime; id: string }) {
  const root = useRef<Group>(null);
  const animator = useMemo(() => new AnimationController(), []);
  const pose = useMemo(() => clonePose(animator.getCurrentPose()), [animator]);
  const [visual, setVisual] = useState({ weapon: 'GUN' as 'GUN' | 'SABER', melee: 'NONE' as MeleePhase, thrust: false,
    ascending: false, trail: false, rainbow: false, dual: false, muzzle: false, burst: 0, hitStop: 0 });
  const visualRef = useRef(visual);
  const lastAction = useRef(-1);
  const walk = useRef({ cycle: 0, weight: 0 });
  const airborne = useRef(createAirborneAnimation());
  const m0 = runtime.world.mechs.find(m => m.id === id)!;
  const initialPosition = useRef<[number, number, number]>([m0.position.x, m0.position.y, m0.position.z]);
  const local = id === runtime.localId;
  useFrame((_, delta) => {
    const m = runtime.display.mechs.find(n => n.id === id);
    if (!m || !root.current) return;
    root.current.visible = m.hp > 0;
    const desired = new Vector3(m.position.x, m.position.y, m.position.z);
    const smoothing = 1 - Math.exp(-25 * Math.min(delta, 0.1));
    if (root.current.position.distanceTo(desired) > 10) root.current.position.copy(desired);
    else root.current.position.lerp(desired, local ? smoothing : 1);
    // Do not visually keep falling after the simulation has already started the landing pose.
    root.current.position.y = desired.y;
    root.current.rotation.set(m.down ? -Math.PI / 2 * (m.wakeup > 0 && m.wakeup < 60 ? m.wakeup / 60 : 1) : 0, m.yaw, 0);
    if (m.hitStop > 0) root.current.position.x += (Math.random() - 0.5) * 0.07;
    const clip = selectClip(m);
    let speed = 1;
    if (m.meleePhase.includes('SLASH')) speed = 60 / (m.meleePhase.startsWith('SIDE') ? SIDE_COMBO : COMBO)[Number(m.meleePhase.slice(-1)) - 1].duration;
    const animationDelta = m.hitStop > 0 ? 0 : Math.min(delta, 0.1);
    animator.play(clip, m.meleePhase.includes('SLASH') ? 0.05 : m.visual === 'ASCEND' ? 0.3 : 0.2, speed, true, pose);
    if (animationDelta > 0) animator.update(animationDelta);
    const p: MechPose = clonePose(animator.getCurrentPose());
    if (animationDelta > 0) applyAirborneAnimation(p, pose, airborne.current, m, animationDelta);
    const footstep = applyWalkAnimation(p, walk.current, m.grounded && m.visual === 'WALK',
      Math.hypot(m.velocity.x, m.velocity.z), animationDelta);
    if (footstep) {
      const listener = runtime.display.mechs.find(t => t.id === runtime.localId);
      const distance = listener ? Math.hypot(m.position.x - listener.position.x, m.position.z - listener.position.z) : 0;
      playFootSound(0.55 * Math.max(0, 1 - distance / 100));
    }
    const target = runtime.display.mechs.find(t => t.id === m.targetId);
    if (target && m.shootTimer >= 0) {
      const direction = new Vector3(target.position.x - m.position.x, target.position.y - m.position.y, target.position.z - m.position.z).normalize();
      direction.applyAxisAngle(new Vector3(0, 1, 0), -m.yaw);
      const aim = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0.2).normalize(), direction));
      const weight = m.shootTimer < SIM.shotStartup ? Math.min(1, m.shootTimer / 8) : Math.max(0, 1 - (m.shootTimer - SIM.shotStartup) / (m.shootMoving ? SIM.shotRecovery : SIM.shotStopRecovery));
      for (const key of ['x', 'y', 'z'] as const) p.LEFT_ARM.SHOULDER[key] += (aim[key] - p.LEFT_ARM.SHOULDER[key]) * weight;
    }
    if (m.stun > 0 && !m.down) {
      const age = (runtime.world.tick - m.lastHitTick) / 24;
      const strength = age < 1 ? Math.sin(age * Math.PI) * (1 - age) : 0;
      p.TORSO.x += 1.2 * strength;
    }
    Object.assign(pose, p);
    const burst = m.dash && m.actionTick !== lastAction.current ? Date.now() : visualRef.current.burst;
    lastAction.current = m.actionTick;
    const next = { weapon: m.weapon, melee: m.meleePhase, thrust: m.dash || m.visual === 'ASCEND' || m.meleePhase.includes('LUNGE'),
      ascending: m.visual === 'ASCEND', trail: m.evade > 0, rainbow: m.rainbow,
      dual: m.meleePhase === 'SIDE_SLASH_2' || m.meleePhase === 'SIDE_SLASH_3',
      muzzle: m.shootTimer >= SIM.shotStartup && m.shootTimer < SIM.shotStartup + 6, burst,
      hitStop: m.hitStop > 0 ? 1 : 0 };
    if (Object.keys(next).some(k => next[k] !== visualRef.current[k])) { visualRef.current = next; setVisual(next); }
  }, -1);
  return <group ref={root} position={initialPosition.current}>
    <MechModel pose={pose} team={m0.team} weapon={visual.weapon} melee={visual.melee} thrust={visual.thrust}
      ascending={visual.ascending} trail={visual.trail} rainbow={visual.rainbow} isDualWielding={visual.dual}
      muzzle={visual.muzzle} burst={visual.burst} hitStop={visual.hitStop} motion={airborne.current} />
    {!local && <Html position={[0, 4.6, 0]} center style={{ pointerEvents: 'none' }}>
      <span className="text-xs whitespace-nowrap bg-black/50 px-2 py-1 rounded" style={{ color: m0.team === 'BLUE' ? '#8cdfff' : '#ff92a2' }}>{m0.name}</span>
    </Html>}
  </group>;
}
