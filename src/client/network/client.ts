import { create } from 'zustand';
import { PROTOCOL_VERSION } from '../../shared/protocol';
import type { ClientMessage, ServerMessage, RoomInfo } from '../../shared/protocol';
import type { World } from '../../shared/game/types';

interface NetworkState {
  status: 'offline' | 'connecting' | 'connected';
  playerId: string;
  room: RoomInfo | null;
  error: string;
  latency: number;
}
export const useNetwork = create<NetworkState>(() => ({ status: 'offline', playerId: '', room: null, error: '', latency: 0 }));
export function configuredUrl(): string {
  const url = import.meta.env.VITE_WS_URL?.trim();
  if (!url) return import.meta.env.DEV ? `ws://${location.hostname}:2567` : '';
  return url;
}

export class BattleClient {
  private socket: WebSocket | null = null;
  private pingTimer = 0;
  private connectTimer = 0;
  private cancelConnect: (() => void) | null = null;
  private listeners = new Set<(msg: Extract<ServerMessage, { type: 'snapshot' }>) => void>();
  latest: { matchId: string; world: World; ack: Record<string, number> } | null = null;

  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    this.disconnect();
    const raw = configuredUrl();
    if (!raw) return Promise.reject(new Error('尚未配置对战服务器。请在 GitHub Actions Variables 中设置 VITE_WS_URL 后重新构建。'));
    let url: URL;
    try { url = new URL(raw); } catch { return Promise.reject(new Error('VITE_WS_URL 不是有效地址。')); }
    if (!['ws:', 'wss:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'wss:')) {
      return Promise.reject(new Error('HTTPS 网页必须使用安全的 wss:// 对战服务器。'));
    }
    useNetwork.setState({ status: 'connecting', error: '' });
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url); this.socket = ws;
      let welcomed = false;
      this.cancelConnect = () => reject(new Error('连接已取消。'));
      this.connectTimer = window.setTimeout(() => {
        if (!welcomed) { ws.close(); reject(new Error('连接服务器超时。')); }
      }, 8000);
      ws.onmessage = event => {
        if (this.socket !== ws) return;
        let msg: ServerMessage;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'welcome') {
          if (msg.version !== PROTOCOL_VERSION) { ws.close(); reject(new Error('客户端与服务器版本不一致。')); return; }
          welcomed = true; this.cancelConnect = null; clearTimeout(this.connectTimer);
          useNetwork.setState({ status: 'connected', playerId: msg.playerId, error: '' });
          this.pingTimer = window.setInterval(() => this.send({ type: 'ping', time: performance.now() }), 1500);
          resolve();
        } else if (msg.type === 'room') {
          if (!msg.room.matchId || msg.room.matchId !== this.latest?.matchId) this.latest = null;
          useNetwork.setState({ room: msg.room });
        } else if (msg.type === 'snapshot') {
          if (msg.matchId !== useNetwork.getState().room?.matchId) return;
          this.latest = msg;
          for (const fn of this.listeners) fn(msg);
        } else if (msg.type === 'error') useNetwork.setState({ error: msg.message });
        else if (msg.type === 'pong') useNetwork.setState({ latency: Math.round(performance.now() - msg.time) });
        else if (msg.type === 'left') { this.latest = null; useNetwork.setState({ room: null }); }
      };
      ws.onerror = () => { if (!welcomed) reject(new Error('无法连接对战服务器，请检查服务地址和服务是否启动。')); };
      ws.onclose = () => {
        if (this.socket !== ws) return;
        clearTimeout(this.connectTimer); clearInterval(this.pingTimer);
        this.cancelConnect = null; this.socket = null; this.latest = null;
        useNetwork.setState({ status: 'offline', room: null, error: '连接已断开，请重新加入房间；本版不恢复中断的对局。' });
        if (!welcomed) reject(new Error('连接未建立。'));
      };
    });
  }
  send(msg: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    if (this.socket.bufferedAmount > 64 * 1024) return false;
    this.socket.send(JSON.stringify(msg)); return true;
  }
  subscribe(fn: (msg: Extract<ServerMessage, { type: 'snapshot' }>) => void) {
    this.listeners.add(fn); return () => { this.listeners.delete(fn); };
  }
  disconnect() {
    clearInterval(this.pingTimer); clearTimeout(this.connectTimer);
    this.cancelConnect?.(); this.cancelConnect = null;
    const ws = this.socket; this.socket = null;
    if (ws) { ws.onmessage = null; ws.onclose = null; ws.close(); }
    this.latest = null;
    useNetwork.setState({ status: 'offline', room: null, playerId: '' });
  }
}
export const battleClient = new BattleClient();
