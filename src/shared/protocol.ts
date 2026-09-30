import type { MechInput, Team, World } from './game/types.js';

export const PROTOCOL_VERSION = 1;
export const MAX_PAYLOAD = 8192;
export type ClientMessage =
  | { type: 'create'; version: number; name: string }
  | { type: 'join'; version: number; name: string; code: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'leave' }
  | { type: 'input'; matchId: string; seq: number; input: MechInput }
  | { type: 'ping'; time: number };
export interface RoomPlayer { id: string; name: string; team: Team; ready: boolean }
export interface RoomInfo {
  code: string;
  phase: 'waiting' | 'countdown' | 'playing' | 'finished';
  players: RoomPlayer[];
  matchId: string;
  countdown: number;
}
export type ServerMessage =
  | { type: 'welcome'; version: number; playerId: string }
  | { type: 'room'; room: RoomInfo }
  | { type: 'snapshot'; matchId: string; world: World; ack: Record<string, number> }
  | { type: 'left' }
  | { type: 'error'; message: string }
  | { type: 'pong'; time: number };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nameValid = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 20 && !/[\u0000-\u001f\u007f]/.test(v);
export function isInput(v: unknown): v is MechInput {
  if (!object(v) || !finite(v.moveX) || !finite(v.moveZ) || Math.abs(v.moveX) > 1 || Math.abs(v.moveZ) > 1 ||
    !finite(v.yaw) || Math.abs(v.yaw) > Math.PI * 2) return false;
  for (const key of ['boost', 'shoot', 'melee', 'cycleTarget', 'boostPressed', 'boostReleased']) if (typeof v[key] !== 'boolean') return false;
  for (const key of ['directionPressed', 'directionReleased']) if (v[key] !== null && !['w', 'a', 's', 'd'].includes(v[key] as string)) return false;
  return true;
}
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (!object(v)) return null;
    switch (v.type) {
      case 'create': return v.version === PROTOCOL_VERSION && nameValid(v.name) ? { type: 'create', version: PROTOCOL_VERSION, name: v.name.trim() } : null;
      case 'join': return v.version === PROTOCOL_VERSION && nameValid(v.name) && typeof v.code === 'string' && /^[A-Z2-9]{6}$/.test(v.code)
        ? { type: 'join', version: PROTOCOL_VERSION, name: v.name.trim(), code: v.code } : null;
      case 'ready': return typeof v.ready === 'boolean' ? { type: 'ready', ready: v.ready } : null;
      case 'leave': return { type: 'leave' };
      case 'ping': return finite(v.time) && v.time >= 0 ? { type: 'ping', time: v.time } : null;
      case 'input': return typeof v.matchId === 'string' && v.matchId.length <= 64 && Number.isSafeInteger(v.seq) && (v.seq as number) > 0 && isInput(v.input)
        ? { type: 'input', matchId: v.matchId, seq: v.seq as number, input: v.input } : null;
      default: return null;
    }
  } catch { return null; }
}
