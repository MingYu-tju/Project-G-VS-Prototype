import React, { useEffect, useState } from 'react';
import { SIM } from '../../shared/game/config';
import type { GameRuntime } from '../game/runtime';
import { OnlineRuntime } from '../network/runtime';
import { useNetwork } from '../network/client';

export function BattleHUD({ runtime, onExit }: { runtime: GameRuntime; onExit: () => void }) {
  const [, refresh] = useState(0);
  useEffect(() => { const id = setInterval(() => refresh(n => n + 1), 100); return () => clearInterval(id); }, []);
  const latency = useNetwork(s => s.latency);
  const m = runtime.world.mechs.find(m => m.id === runtime.localId);
  const predicted = runtime.display.mechs.find(m => m.id === runtime.localId) ?? m;
  if (!m || !predicted) return null;
  const enemy = runtime.world.mechs.find(e => e.id === m.targetId);
  const seconds = Math.ceil(runtime.world.timeRemaining / SIM.hz);
  const stale = runtime instanceof OnlineRuntime && runtime.stale;
  return <div className="absolute inset-0 pointer-events-none z-10 select-none">
    <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center font-mono text-xs bg-black/60 rounded px-4 py-2">
      <div className="text-xl font-bold">{runtime.world.training ? 'TRAINING' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</div>
      {!runtime.world.training && <span className="text-cyan-300">RTT {latency} ms</span>}
    </div>
    <button onClick={onExit} className="absolute right-3 top-3 pointer-events-auto border border-white/30 rounded bg-black/60 px-3 py-2 text-xs">退出</button>
    <div className="absolute left-4 top-24 w-40 sm:w-64 bg-black/50 rounded p-2">
      <div className="flex justify-between text-sm"><span>YOU · {m.team}</span><b data-testid="self-hp">{runtime.world.training ? '∞' : m.hp} HP</b></div>
      <div className="h-3 mt-1 bg-black/50"><div className="h-full bg-cyan-400" style={{ width: `${m.hp / SIM.maxHp * 100}%` }} /></div>
      {enemy && <><div className="flex justify-between text-xs mt-3"><span>{enemy.name}</span><b>{runtime.world.training ? '∞' : enemy.hp} HP</b></div>
        <div className="h-2 mt-1 bg-black/50"><div className="h-full bg-rose-500" style={{ width: `${enemy.hp / SIM.maxHp * 100}%` }} /></div></>}
    </div>
    {stale && <div className="absolute top-36 left-1/2 -translate-x-1/2 bg-red-950/90 text-red-200 px-4 py-2 rounded">同步中断，等待服务器…</div>}
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-48 sm:w-72 text-center font-mono text-xs bg-black/40 px-3 py-2 rounded">
      <div className="flex justify-between mb-1"><span>BOOST</span><span>{predicted.overheated ? 'OVERHEAT' : `${Math.ceil(predicted.boost)}%`}</span></div>
      <div className="h-2 bg-slate-900"><div className={`h-full ${predicted.overheated ? 'bg-red-500' : 'bg-cyan-400'}`} style={{ width: `${predicted.boost}%` }} /></div>
      <div className="mt-2">BEAM RIFLE {predicted.ammo} / {SIM.maxAmmo}</div>
    </div>
    <div className="hidden lg:block absolute bottom-6 left-4 text-xs text-white/70 bg-black/50 p-3 leading-6 rounded">
      WASD 移动 · 双击方向 STEP<br />L 短按跳跃 / 长按升空 / 双击冲刺<br />J 射击 · K 格斗 / 连段 · SPACE 切换目标
    </div>
  </div>;
}
