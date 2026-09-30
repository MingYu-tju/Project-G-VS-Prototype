import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3, AdditiveBlending, PerspectiveCamera } from 'three';
import { Arena } from './Arena';
import { MechView } from './MechView';
import { orientBeam } from './projectileVisual';
import type { GameRuntime } from '../game/runtime';
import type { CombatEvent } from '../../shared/game/types';
import { SIM } from '../../shared/game/config';
import { playBoostSound, playHitSound, playShootSound, playStepSound, playDropSound } from '../game/AudioController';

function CameraRig({ runtime }: { runtime: GameRuntime }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    const m = runtime.display.mechs.find(t => t.id === runtime.localId);
    if (!m) return;
    const target = runtime.display.mechs.find(t => t.id === m.targetId);
    const position = new Vector3(m.position.x, m.position.y, m.position.z);
    const look = position.clone().add(new Vector3(0, 2, 0));
    let cameraPos = position.clone().add(new Vector3(0, 7, 14));
    if (target) {
      const to = new Vector3(target.position.x, target.position.y, target.position.z);
      const direction = to.clone().sub(position).normalize();
      cameraPos = position.clone().addScaledVector(direction, -10).add(new Vector3(0, 6, 0));
      look.lerp(to.clone().add(new Vector3(0, 2, 0)), 0.3);
    }
    if (m.meleePhase.endsWith('SLASH_3') && !m.stun) {
      cameraPos = position.clone().add(new Vector3(8, 4, 6).applyAxisAngle(new Vector3(0, 1, 0), m.yaw));
    }
    camera.position.lerp(cameraPos, 1 - Math.exp(-7 * Math.min(delta, 0.1)));
    camera.lookAt(look);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = m.meleePhase.endsWith('SLASH_3') ? 75 : 60; camera.updateProjectionMatrix();
    }
    // Cinematic camera does not change the character's input reference mid-combo.
    const forward = target && m.meleePhase.endsWith('SLASH_3')
      ? new Vector3(target.position.x - m.position.x, 0, target.position.z - m.position.z)
      : camera.getWorldDirection(new Vector3());
    runtime.input.yaw = Math.atan2(forward.x, forward.z);
  }, -0.5);
  return null;
}
function BulletView({ runtime, id }: { runtime: GameRuntime; id: number }) {
  const ref = useRef<Group>(null);
  const initial = runtime.display.bullets.find(b => b.id === id);
  useFrame(() => {
    const bullet = runtime.display.bullets.find(b => b.id === id);
    if (!ref.current) return;
    ref.current.visible = !!bullet;
    if (bullet) {
      ref.current.position.set(bullet.position.x, bullet.position.y, bullet.position.z);
      orientBeam(ref.current.quaternion, bullet.forward);
    }
  });
  return <group ref={ref} visible={false}>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 7, 8]} /><meshBasicMaterial color="white" /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.4, 0.4, 7.5, 8]} /><meshBasicMaterial color={initial?.team === 'RED' ? '#ff2266' : '#00ffff'} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} /></mesh>
  </group>;
}
function HitFlash({ event }: { event: CombatEvent }) {
  const ref = useRef<Group>(null); const start = useRef(performance.now());
  useFrame(() => {
    if (!ref.current) return;
    const age = (performance.now() - start.current) / 350;
    ref.current.visible = age < 1;
    ref.current.scale.setScalar(Math.max(0, 1 - age) * 1.6);
    ref.current.rotation.y += 0.1;
  });
  return <group ref={ref} position={[event.position.x, event.position.y + 1.5, event.position.z]}>
    <mesh><icosahedronGeometry args={[0.8, 0]} /><meshBasicMaterial color="#fff4c0" /></mesh>
    <mesh><icosahedronGeometry args={[1.3, 0]} /><meshBasicMaterial color="#ff9500" wireframe /></mesh>
  </group>;
}
function Reticle({ runtime }: { runtime: GameRuntime }) {
  const ref = useRef<Group>(null);
  const [red, setRed] = useState(false);
  useFrame(() => {
    const local = runtime.display.mechs.find(m => m.id === runtime.localId);
    const target = runtime.display.mechs.find(m => m.id === local?.targetId && m.hp > 0);
    if (!ref.current) return;
    ref.current.visible = !!target;
    if (target && local) {
      ref.current.position.set(target.position.x, target.position.y + 1.5, target.position.z);
      setRed(new Vector3(local.position.x, local.position.y, local.position.z).distanceTo(new Vector3(target.position.x, target.position.y, target.position.z)) < SIM.lockDistance);
    }
  });
  const { camera } = useThree();
  useFrame(() => { if (ref.current) ref.current.quaternion.copy(camera.quaternion); });
  return <group ref={ref}><mesh><ringGeometry args={[2.3, 2.36, 4]} /><meshBasicMaterial color={red ? '#ff3659' : '#45f5a8'} depthTest={false} transparent opacity={0.85} /></mesh></group>;
}
function WorldView({ runtime }: { runtime: GameRuntime }) {
  const [bullets, setBullets] = useState<number[]>([]);
  const bulletKey = useRef('');
  const [effects, setEffects] = useState<CombatEvent[]>([]);
  const effectsRef = useRef<{ event: CombatEvent; expires: number }[]>([]);
  useEffect(() => { runtime.input.attach(); return () => runtime.input.dispose(); }, [runtime]);
  useFrame((_, delta) => {
    runtime.advance(delta);
    const ids = runtime.display.bullets.map(b => b.id);
    const key = ids.join(',');
    if (key !== bulletKey.current) { bulletKey.current = key; setBullets(ids); }
    const me = runtime.world.mechs.find(m => m.id === runtime.localId);
    const now = performance.now();
    const before = effectsRef.current.length;
    effectsRef.current = effectsRef.current.filter(e => e.expires > now);
    const events = runtime.takeEvents();
    for (const e of events) {
      const distance = me ? Math.hypot(e.position.x - me.position.x, e.position.z - me.position.z) : 0;
      const volume = Math.max(0, 1 - distance / 100);
      if (e.kind === 'hit') { effectsRef.current.push({ event: e, expires: now + 400 }); playHitSound(distance); }
      if (e.kind === 'shot') playShootSound(volume * 0.4);
      if (e.kind === 'dash') playBoostSound(volume * 0.6);
      if (e.kind === 'step') playStepSound(volume * 0.6);
      if (e.kind === 'land') playDropSound(volume * 0.5);
    }
    if (before !== effectsRef.current.length || events.some(e => e.kind === 'hit')) setEffects(effectsRef.current.map(e => e.event));
  }, -2);
  return <>
    <Arena />
    {runtime.world.mechs.map(m => <MechView runtime={runtime} id={m.id} key={m.id} />)}
    {bullets.map(id => <BulletView key={id} runtime={runtime} id={id} />)}
    {effects.map(e => <HitFlash event={e} key={e.id} />)}
    <Reticle runtime={runtime} /><CameraRig runtime={runtime} />
  </>;
}
export function BattleScene({ runtime }: { runtime: GameRuntime }) {
  return <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 7, 14], fov: 60 }}>
    <WorldView runtime={runtime} />
  </Canvas>;
}
