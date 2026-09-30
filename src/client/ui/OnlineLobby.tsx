import React, { useState } from 'react';
import { battleClient, useNetwork, configuredUrl } from '../network/client';
import { PROTOCOL_VERSION } from '../../shared/protocol';

const field = 'w-full rounded border border-slate-600 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400';
const button = 'rounded border border-cyan-500/60 bg-cyan-900/40 px-4 py-3 hover:bg-cyan-800/60 disabled:opacity-40';
export function OnlineLobby({ onBack }: { onBack: () => void }) {
  const { status, room, playerId, error } = useNetwork();
  const [name, setName] = useState('Pilot');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function enter(create: boolean) {
    setBusy(true); useNetwork.setState({ error: '' });
    try {
      await battleClient.connect();
      battleClient.send(create ? { type: 'create', version: PROTOCOL_VERSION, name: name.trim() }
        : { type: 'join', version: PROTOCOL_VERSION, name: name.trim(), code: code.trim().toUpperCase() });
    } catch (e) { useNetwork.setState({ error: e instanceof Error ? e.message : '连接失败' }); }
    finally { setBusy(false); }
  }
  const me = room?.players.find(p => p.id === playerId);
  return <div className="h-full overflow-y-auto flex items-start sm:items-center justify-center p-4 bg-slate-950 text-slate-100">
    <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8 shadow-xl">
      <div className="text-xs tracking-widest text-cyan-400 mb-2">PROJECT G-VS · PRIVATE MATCH</div>
      <h1 className="text-3xl font-bold mb-6">{room ? '对战房间' : '在线对战'}</h1>
      {!room ? <div className="space-y-4">
        <label className="block text-sm">驾驶员昵称<input aria-label="驾驶员昵称" className={`${field} mt-2`} maxLength={20} value={name} onChange={e => setName(e.target.value)} /></label>
        <button className={`${button} w-full`} disabled={busy || !name.trim()} onClick={() => enter(true)}>创建 1v1 房间</button>
        <div className="border-t border-slate-700 pt-4 flex gap-2">
          <input aria-label="房间码" className={`${field} uppercase font-mono tracking-widest min-w-0`} placeholder="六位房间码" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
          <button className={`${button} shrink-0`} disabled={busy || !name.trim() || !/^[A-Z2-9]{6}$/.test(code)} onClick={() => enter(false)}>加入</button>
        </div>
        <p className="text-xs text-slate-400 leading-5">双方准备后开始。首版不支持断线恢复，离线将判负。推荐同区域网络；血量和命中由服务器裁定。</p>
        {!configuredUrl() && <p className="text-amber-300 text-sm">尚未配置服务器地址，单机训练仍可使用。</p>}
      </div> : <div className="space-y-5">
        <div className="rounded-lg border border-cyan-800 bg-slate-950 p-4 text-center">
          <span className="text-xs text-slate-400">将此房间码发送给朋友</span>
          <div className="font-mono text-4xl tracking-widest text-cyan-300 my-2" data-testid="room-code">{room.code}</div>
          <button className="text-xs underline text-slate-300" onClick={async () => {
            try { await navigator.clipboard.writeText(room.code); setCopied(true); }
            catch { useNetwork.setState({ error: '无法自动复制，请手动选择房间码。' }); }
          }}>{copied ? '已复制' : '复制房间码'}</button>
        </div>
        {[0, 1].map(i => { const p = room.players[i]; return <div key={i} className="flex justify-between border-b border-slate-700 pb-3 text-sm">
          <span>{p ? `${p.name}${p.id === playerId ? '（你）' : ''} · ${p.team}` : '等待另一位驾驶员…'}</span>
          <span className={p?.ready ? 'text-emerald-400' : 'text-slate-400'}>{p ? p.ready ? '已准备' : '未准备' : ''}</span>
        </div>; })}
        <button className={`${button} w-full`} onClick={() => battleClient.send({ type: 'ready', ready: !me?.ready })}>{me?.ready ? '取消准备' : '准备战斗'}</button>
      </div>}
      {(error || status === 'connecting') && <div role="alert" className="mt-4 text-sm text-amber-200 break-words">{status === 'connecting' ? '正在连接服务器…' : error}</div>}
      <button className="mt-6 text-sm text-slate-400 hover:text-white" onClick={onBack}>← 返回主菜单</button>
    </section>
  </div>;
}
