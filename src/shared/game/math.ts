import type { Vec3 } from './types.js';

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, n: number): Vec3 => vec(a.x * n, a.y * n, a.z * n);
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const distance = (a: Vec3, b: Vec3) => length(sub(a, b));
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const normalize = (a: Vec3) => scale(a, 1 / (length(a) || 1));
export const horizontal = (a: Vec3) => vec(a.x, 0, a.z);
export const forward = (yaw: number) => vec(Math.sin(yaw), 0, Math.cos(yaw));
export const yawOf = (a: Vec3) => Math.atan2(a.x, a.z);
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const turn = (a: number, b: number, max: number) => a + Math.max(-max, Math.min(max, angleDelta(a, b)));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export function inputDirection(x: number, z: number, yaw: number): Vec3 {
  return normalize(vec(-Math.cos(yaw) * x - Math.sin(yaw) * z, 0, Math.sin(yaw) * x - Math.cos(yaw) * z));
}
export function segmentDistance(a: Vec3, b: Vec3, point: Vec3): { distance: number; t: number } {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(point, a), ab) / (dot(ab, ab) || 1)));
  return { distance: distance(lerp(a, b, t), point), t };
}
