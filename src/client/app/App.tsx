import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BattleScene } from '../render/BattleScene';
import { BattleHUD } from '../ui/BattleHUD';
import { MobileControls } from '../ui/MobileControls';
import { GamepadControls } from '../ui/GamepadControls';
import { OnlineLobby } from '../ui/OnlineLobby';
import { TrainingRuntime } from '../game/runtime';
import type { GameRuntime } from '../game/runtime';
import { OnlineRuntime } from '../network/runtime';
import { battleClient, useNetwork } from '../network/client';
import { useSettings } from '../state/settings';
import { resumeAudioContext } from '../game/AudioController';
import { requestMobileFullscreen } from './fullscreen';

const PoseEditor = lazy(() => import('../editors/PoseEditor').then(m => ({ default: m.PoseEditor })));
const ModelBuilder = lazy(() => import('../editors/ModelBuilder').then(m => ({ default: m.ModelBuilder })));
const loading = <div className="absolute inset-0 grid place-items-center bg-slate-950 text-cyan-300">正在加载机体资源…</div>;

function Game({ runtime, onExit }: { runtime: GameRuntime; onExit: () => void }) {
  return <div className="absolute inset-0">
    <Suspense fallback={loading}><BattleScene runtime={runtime} /></Suspense>
    <BattleHUD runtime={runtime} onExit={onExit} />
    <MobileControls /><GamepadControls />
  </div>;
}
function Training({ onExit }: { onExit: () => void }) {
  const [runtime] = useState(() => new TrainingRuntime());
  useEffect(() => () => runtime.dispose(), [runtime]);
  return <Game runtime={runtime} onExit={onExit} />;
}
function OnlineGame({ matchId, onExit }: { matchId: string; onExit: () => void }) {
  const network = useNetwork();
  const [runtime, setRuntime] = useState<OnlineRuntime | null>(null);
  useEffect(() => {
    let current: OnlineRuntime | null = null;
    const start = (snapshot: NonNullable<typeof battleClient.latest>) => {
      if (snapshot.matchId !== matchId || current) return;
      current = new OnlineRuntime(network.playerId, matchId, snapshot.world);
      setRuntime(current);
    };
    if (battleClient.latest) start(battleClient.latest);
    const stop = battleClient.subscribe(start);
    return () => { stop(); current?.dispose(); };
  }, [matchId, network.playerId]);
  const room = network.room;
  const result = runtime?.world.result;
  const ready = room?.players.find(p => p.id === network.playerId)?.ready;
  return <>
    {runtime ? <Game runtime={runtime} onExit={onExit} /> : loading}
    {room?.phase === 'countdown' && <div className="absolute inset-0 z-40 pointer-events-none grid place-items-center">
      <div className="text-center"><div className="text-cyan-300 tracking-widest">GET READY</div><div className="text-8xl font-bold mt-4">{Math.max(1, Math.ceil(room.countdown / 60))}</div></div>
    </div>}
    {room?.phase === 'finished' && <div className="absolute inset-0 z-[80] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-600 rounded-xl p-7 text-center">
        <h2 className="text-3xl font-bold">{result?.winner === null ? '平局' : result?.winner === room.players.find(p => p.id === network.playerId)?.team ? 'VICTORY' : 'DEFEAT'}</h2>
        <p className="mt-3 text-slate-400">{result?.reason === 'disconnect' ? '对手已离线' : result?.reason === 'timeout' ? '时间结束' : '对局结束'}</p>
        <p className="mt-2 text-xs text-slate-500">双方准备后开始新的一局。</p>
        <button className="mt-6 w-full rounded bg-cyan-700 px-4 py-3" disabled={room.players.length < 2} onClick={() => battleClient.send({ type: 'ready', ready: !ready })}>{ready ? '取消准备' : room.players.length < 2 ? '等待对手重新加入' : '准备再战'}</button>
        <button className="mt-4 text-sm text-slate-400" onClick={onExit}>退出房间</button>
      </div>
    </div>}
    {network.error && <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[80] bg-red-950/90 p-3 rounded text-sm">{network.error}</div>}
  </>;
}
export default function App() {
  const [mode, setMode] = useState<'menu' | 'training' | 'online'>('menu');
  const [editor, setEditor] = useState<'pose' | 'model' | null>(null);
  const settings = useSettings();
  const network = useNetwork();
  const [toolsOpen, setToolsOpen] = useState(false);
  const exit = () => { battleClient.disconnect(); setMode('menu'); };
  const isMatch = mode === 'online' && !!network.room?.matchId && network.room.phase !== 'waiting';
  return <div className="w-full h-full relative text-slate-100">
    {mode === 'menu' && !editor && <div className="h-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_#12304c,_#05080f_70%)] overflow-y-auto">
      <main className="max-w-xl w-full py-10 text-center">
        <p className="text-xs tracking-[0.35em] text-cyan-400 mb-6">HIGH MOBILITY MECH COMBAT</p>
        <h1 className="text-5xl sm:text-7xl font-black italic tracking-tight">PROJECT <span className="text-cyan-300">G-VS</span></h1>
        <p className="text-slate-400 mt-5 mb-10">惯性机动 · 锁定射击 · 近身格斗</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <button className="text-left border border-slate-600 bg-slate-900/80 rounded-xl p-6 hover:border-cyan-300" onClick={() => { requestMobileFullscreen(); void resumeAudioContext(); setMode('training'); }}><b className="text-xl">单机训练</b><p className="text-sm text-slate-400 mt-2">离线运行 · 自由练习与 AI</p></button>
          <button className="text-left border border-cyan-600 bg-cyan-950/60 rounded-xl p-6 hover:bg-cyan-900/60" onClick={() => { requestMobileFullscreen(); void resumeAudioContext(); useNetwork.setState({ error: '' }); setMode('online'); }}><b className="text-xl text-cyan-300">在线对战</b><p className="text-sm text-slate-400 mt-2">房间码邀请 · 1v1 实时对战</p></button>
        </div>
        <div className="flex justify-center gap-6 mt-8 text-xs text-slate-500"><button onClick={() => setEditor('pose')}>姿势 / 动画编辑器</button><button onClick={() => setEditor('model')}>模型工厂</button></div>
        <p className="mt-10 text-xs text-slate-600">ONLINE PROTOTYPE · 0.1 · Keyboard / Gamepad / Touch</p>
      </main>
    </div>}
    {editor && <Suspense fallback={loading}>{editor === 'pose' ? <PoseEditor onClose={() => setEditor(null)} /> : <ModelBuilder onClose={() => setEditor(null)} />}</Suspense>}
    {mode === 'training' && !editor && <Training onExit={() => setMode('menu')} />}
    {mode === 'online' && !isMatch && <OnlineLobby onBack={exit} />}
    {isMatch && <OnlineGame key={network.room!.matchId} matchId={network.room!.matchId} onExit={exit} />}
    {(mode === 'training' || isMatch) && !editor && <div className="absolute top-14 left-4 z-[60] flex gap-2 text-xs">
      <button className="bg-slate-900/90 rounded px-3 py-2 border border-slate-600" onClick={() => setToolsOpen(!toolsOpen)}>显示设置</button>
      {toolsOpen && <div className="flex flex-wrap gap-1 bg-slate-900/90 rounded p-1 max-w-[70vw]">
        {(['isDarkScene', 'isRimLightOn', 'isOutlineOn', 'showStats'] as const).map((k, i) => <button key={k} className="px-2 py-1" onClick={() => settings.toggle(k)}>{['夜景', '边缘光', '描边', '性能'][i]} {settings[k] ? 'ON' : 'OFF'}</button>)}
        {mode === 'training' && <button className="px-2 py-1 text-cyan-300" onClick={() => settings.toggle('areNPCsPaused')}>AI {settings.areNPCsPaused ? '暂停' : '运行'}</button>}
      </div>}
    </div>}
  </div>;
}
