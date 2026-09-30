import { COMBO, SIDE_COMBO, SIM } from './config.js';
import { add, sub, scale, normalize, horizontal, distance, dot, length, forward, yawOf, turn, lerp, vec, inputDirection, segmentDistance } from './math.js';
import { emptyInput } from './types.js';
import type { World, MechState, MechInput, PlayerSpec, CombatEvent, Vec3, MeleePhase } from './types.js';

type Hit = { victim: string; attacker: string; direction: Vec3; damage: number; force: number; stun: number; stop: number; down: boolean };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const copyWorld = (world: World): World => clone(world);

export function createMech(spec: PlayerSpec): MechState {
  return {
    ...spec, position: spec.position ? { ...spec.position } : vec(0, 0, spec.team === 'BLUE' ? 25 : -25),
    velocity: vec(), yaw: spec.team === 'BLUE' ? Math.PI : 0, targetId: null,
    hp: SIM.maxHp, boost: 100, ammo: SIM.maxAmmo, ammoTimer: 0, overheated: false, grounded: true,
    landing: 0, visualLanding: 0, dash: false, dashDirection: vec(), dashSpeed: 0, dashBurst: 0,
    dashCooldown: 0, dashCoast: -1, dashBuffer: false, jumpBuffer: false, forcedAscent: 0,
    boostHeld: 0, boostWasHeld: false, boostReleaseTick: -1000, boostConsumed: false, boostUsedForDash: false,
    directionReleaseTicks: { w: -1000, a: -1000, s: -1000, d: -1000 },
    evade: 0, evadeRecovery: 0, evadeDirection: vec(), evadeCircular: 0, rainbow: false,
    shootTimer: -1, shootMoving: false, fired: false,
    meleePhase: 'NONE', meleeTimer: 0, meleeStartup: 0, meleeTargetId: null, meleeSide: 0,
    meleePenalty: false, comboBuffered: false, meleeConfirmed: false, meleeHit: false,
    stun: 0, hitStop: 0, knockback: vec(), knockbackPower: 0, down: false, wakeup: 0,
    lastHitTick: -1000, visual: 'IDLE', actionTick: 0, weapon: 'GUN',
  };
}
export function createWorld(players: PlayerSpec[], training = false): World {
  const world: World = { tick: 0, training, mechs: players.map(createMech), bullets: [], events: [], nextBulletId: 1,
    nextEventId: 1, timeRemaining: SIM.roundTicks, result: null };
  for (const m of world.mechs) m.targetId = world.mechs.find(t => t.team !== m.team)?.id ?? null;
  return world;
}
export function emit(world: World, kind: CombatEvent['kind'], m: MechState, targetId?: string) {
  world.events.push({ id: world.nextEventId++, tick: world.tick, kind, actorId: m.id, targetId, position: { ...m.position } });
}
const targetFor = (world: World, m: MechState) => world.mechs.find(t => t.id === (m.meleeTargetId ?? m.targetId) && t.team !== m.team && t.hp > 0);
const spend = (m: MechState, amount: number) => {
  if (m.overheated || m.boost <= 0) return false;
  m.boost = Math.max(0, m.boost - amount);
  m.overheated = m.boost === 0;
  return true;
};
const landingLag = (m: MechState) => m.overheated ? SIM.landingOverheat : Math.floor(SIM.landingMin + (1 - m.boost / 100) * (SIM.landingMax - SIM.landingMin));
function cancelActions(m: MechState) {
  m.dash = false; m.evade = 0; m.evadeRecovery = 0; m.shootTimer = -1;
  m.meleePhase = 'NONE'; m.meleeTargetId = null; m.comboBuffered = false; m.meleeConfirmed = false;
  m.dashBuffer = false; m.jumpBuffer = false;
}
function dash(world: World, m: MechState, direction: Vec3) {
  if (!spend(m, SIM.dashInitialCost)) return;
  cancelActions(m);
  m.dash = true; m.dashSpeed = SIM.dashBurstSpeed; m.dashBurst = SIM.dashBurstTicks;
  m.dashCooldown = SIM.dashCooldown; m.dashCoast = -1; m.visualLanding = 0;
  m.dashDirection = length(direction) > 0 ? direction : forward(m.yaw);
  if (m.grounded || m.position.y < 1.5) { m.velocity.y = SIM.dashHop; m.grounded = false; }
  m.actionTick = world.tick;
  emit(world, 'dash', m);
}
function slash(m: MechState, stage: number, side: boolean, tick: number) {
  m.meleePhase = `${side ? 'SIDE_' : ''}SLASH_${stage}` as MeleePhase;
  m.meleeTimer = (side ? SIDE_COMBO : COMBO)[stage - 1].duration;
  m.meleeHit = false; m.actionTick = tick;
}
function shoot(world: World, m: MechState, predicted: boolean) {
  m.fired = true;
  if (predicted) return;
  const position = add(m.position, add(vec(0, 1.5, 0), scale(forward(m.yaw), 0.8)));
  const target = targetFor(world, m);
  const direction = target ? normalize(sub(add(target.position, vec(0, 1.5, 0)), position)) : forward(m.yaw);
  world.bullets.push({ id: world.nextBulletId++, ownerId: m.id, team: m.team, targetId: target?.id ?? null,
    position, velocity: scale(direction, SIM.bulletSpeed), forward: direction,
    homing: !!target && distance(m.position, target.position) < SIM.lockDistance, ttl: SIM.bulletLife });
  emit(world, 'shot', m);
}

/** Shared movement/action update. It never reads rendering state, wall clocks, or browser APIs. */
function stepMech(world: World, m: MechState, input: MechInput, hits: Hit[], predicted: boolean) {
  if (m.hp <= 0) return;
  const tick = world.tick;
  const enemies = world.mechs.filter(t => t.team !== m.team && t.hp > 0);
  if (!enemies.some(t => t.id === m.targetId)) m.targetId = enemies[0]?.id ?? null;
  if (input.cycleTarget && enemies.length) m.targetId = enemies[(enemies.findIndex(t => t.id === m.targetId) + 1) % enemies.length].id;
  const target = targetFor(world, m);
  const direction = inputDirection(input.moveX, input.moveZ, input.yaw);
  const pressed = input.boostPressed || (input.boost && !m.boostWasHeld);
  const released = input.boostReleased || (!input.boost && m.boostWasHeld);
  const doubleBoost = pressed && tick - m.boostReleaseTick <= SIM.doubleBoostTicks;
  const doubleDirection = input.directionPressed && tick - m.directionReleaseTicks[input.directionPressed] <= SIM.doubleDirectionTicks;
  if (input.directionReleased) m.directionReleaseTicks[input.directionReleased] = tick;
  if (pressed) { m.boostHeld = 0; m.boostConsumed = false; m.boostUsedForDash = false; }
  if (released) m.boostReleaseTick = m.boostConsumed ? -1000 : tick;
  m.boostWasHeld = input.boost;
  m.boostHeld = input.boost ? m.boostHeld + 1 : 0;
  if (input.melee && m.meleePhase.includes('SLASH')) m.comboBuffered = true;
  if (m.hitStop > 0) { m.hitStop--; return; }
  m.ammoTimer++;
  if (m.ammoTimer >= SIM.ammoRegenTicks) { m.ammo = Math.min(SIM.maxAmmo, m.ammo + 1); m.ammoTimer = 0; }
  m.visualLanding = Math.max(0, m.visualLanding - 1);
  m.dashCooldown = Math.max(0, m.dashCooldown - 1);
  m.forcedAscent = Math.max(0, m.forcedAscent - 1);

  if (m.down) {
    m.visual = m.wakeup > 0 ? 'WAKEUP' : 'DOWN';
    if (m.wakeup > 0) {
      m.wakeup--;
      m.velocity = vec();
      if (m.wakeup === 0) { m.down = false; m.stun = 0; m.grounded = true; m.position.y = 0; m.landing = landingLag(m); }
    } else {
      m.velocity.y -= SIM.downGravity;
      m.velocity.x *= SIM.downDrag; m.velocity.z *= SIM.downDrag;
      m.position = add(m.position, m.velocity);
      if (m.position.y <= 0) { m.position.y = 0; m.wakeup = SIM.wakeupTicks; }
    }
    bound(m);
    return;
  }
  if (m.stun > 0) {
    m.stun--; m.visual = 'STUN'; cancelActions(m);
    m.velocity = scale(horizontal(m.knockback), SIM.knockbackSpeed * m.knockbackPower);
    m.position = add(m.position, m.velocity);
    if (m.stun === 0 && m.grounded) { m.landing = landingLag(m); m.visualLanding = SIM.landingVisualTicks; }
    bound(m);
    return;
  }

  if (doubleBoost) {
    m.boostUsedForDash = true; m.boostConsumed = true;
    if (m.landing > 0) m.dashBuffer = m.landing <= SIM.landingBuffer;
    else if (m.dashCooldown > 0) m.dashBuffer = true;
    else dash(world, m, direction);
  }
  if (doubleDirection && m.landing <= 0) {
    const rainbow = m.meleePhase !== 'NONE';
    if (spend(m, rainbow ? SIM.rainbowCost : SIM.stepCost)) {
      cancelActions(m); m.rainbow = rainbow;
      m.evade = rainbow ? SIM.rainbowTicks : SIM.stepTicks;
      const key = input.directionPressed!;
      m.evadeDirection = inputDirection(key === 'a' ? -1 : key === 'd' ? 1 : 0, key === 'w' ? -1 : key === 's' ? 1 : 0, input.yaw);
      m.evadeCircular = target && (key === 'a' || key === 'd') ? (key === 'a' ? 1 : -1) : 0;
      m.velocity.y = 0; m.visualLanding = 0; m.actionTick = tick;
      if (!predicted) for (const b of world.bullets) if (b.targetId === m.id) b.homing = false;
      emit(world, 'step', m);
    }
  }
  if (input.shoot && m.shootTimer < 0 && m.evade <= 0 && m.landing <= 0 && m.meleePhase === 'NONE' && m.ammo > 0) {
    m.ammo--; m.shootTimer = 0; m.fired = false; m.weapon = 'GUN'; m.visualLanding = 0;
    // The forward hemisphere (±90°) permits firing without turning the body toward the lock.
    m.shootMoving = !target || dot(forward(m.yaw), normalize(horizontal(sub(target.position, m.position)))) >= -1e-8;
    if (!m.shootMoving) m.dash = false;
    m.actionTick = tick;
  }
  if (input.melee && m.meleePhase === 'NONE' && m.shootTimer < 0 && m.landing <= 0) {
    cancelActions(m); m.weapon = 'SABER'; m.meleeTargetId = m.targetId;
    m.meleeSide = input.moveX < 0 ? 1 : input.moveX > 0 ? -1 : 0;
    const side = m.meleeSide !== 0;
    const red = !!target && distance(m.position, target.position) < SIM.lockDistance;
    m.meleePhase = `${side ? 'SIDE_' : ''}${red ? 'LUNGE' : 'STARTUP'}` as MeleePhase;
    m.meleePenalty = m.overheated || m.boost <= 0;
    m.meleeStartup = side ? SIM.sideStartup : SIM.meleeStartup;
    m.meleeTimer = red ? SIM.meleeLungeTicks * (m.meleePenalty ? 0.5 : 1) : m.meleeStartup;
    m.meleeConfirmed = false; m.meleeHit = false; m.actionTick = tick;
  }

  const ascent = input.boost && !m.boostUsedForDash && (m.boostHeld >= SIM.holdTicks || m.evade > 0);
  if (!input.boost && !m.boostConsumed && m.boostReleaseTick > 0 && tick - m.boostReleaseTick > SIM.doubleBoostTicks) {
    m.boostConsumed = true;
    if (!m.dash && m.landing <= 0 && m.meleePhase === 'NONE' && spend(m, SIM.jumpCost)) {
      m.velocity.y = SIM.jumpSpeed; m.grounded = false; m.forcedAscent = SIM.jumpTicks;
    }
  }
  if (m.dashBurst > 0) m.dashBurst--;
  if (m.dash && ascent) {
    if (m.dashBurst > 0) m.jumpBuffer = true;
    else { m.dash = false; m.jumpBuffer = false; }
  } else if (m.jumpBuffer && m.dashBurst <= 0) {
    m.dash = false; m.jumpBuffer = false; m.forcedAscent = SIM.jumpTicks;
  }

  m.visual = 'IDLE';
  if (m.meleePhase !== 'NONE') {
    m.visual = 'MELEE';
    const side = m.meleePhase.startsWith('SIDE');
    if (m.meleePhase.includes('STARTUP')) {
      m.velocity = vec();
      if (--m.meleeTimer <= 0) slash(m, 1, side, tick);
    } else if (m.meleePhase.includes('LUNGE')) {
      spend(m, SIM.meleeCost);
      const toTarget = target ? normalize(sub(target.position, m.position)) : forward(m.yaw);
      const curve = vec(toTarget.z * m.meleeSide * SIM.meleeSideArc, 0, -toTarget.x * m.meleeSide * SIM.meleeSideArc);
      m.velocity = scale(normalize(add(toTarget, curve)), SIM.meleeLungeSpeed * (m.meleePenalty ? 0.5 : 1));
      if (target) m.yaw = yawOf(toTarget);
      m.meleeStartup--; m.meleeTimer--;
      const confirmed = !!target && m.meleeStartup <= 0 && distance(m.position, target.position) < SIM.meleeRange;
      if (confirmed || m.meleeTimer <= 0) { slash(m, 1, side, tick); m.meleeConfirmed = confirmed; m.velocity = vec(); }
    } else if (m.meleePhase.includes('SLASH')) {
      const stage = Number(m.meleePhase.slice(-1));
      const move = (side ? SIDE_COMBO : COMBO)[stage - 1];
      m.velocity = vec();
      if (target) {
        const delta = sub(target.position, m.position);
        m.yaw = yawOf(delta);
        if (m.meleeConfirmed && !m.meleeHit) m.position = lerp(m.position, sub(target.position, scale(normalize(delta), move.spacing)), SIM.meleeMagnet);
        if (!m.meleeConfirmed && distance(m.position, target.position) < SIM.meleeRange) m.meleeConfirmed = true;
        if (!m.meleeHit && m.meleeConfirmed && move.duration - m.meleeTimer >= move.damageDelay && distance(m.position, target.position) < SIM.meleeRange * 1.5) {
          if (!predicted) hits.push({ victim: target.id, attacker: m.id, direction: normalize(delta), damage: move.damage,
            force: move.force, stun: move.stun, stop: move.hitStop, down: stage === 3 });
          m.meleeHit = true;
        }
      }
      if (--m.meleeTimer <= 0) {
        if (m.comboBuffered && stage < 3) {
          slash(m, stage + 1, side, tick); m.comboBuffered = false;
          m.meleeConfirmed = !!target && distance(m.position, target.position) < SIM.meleeRange * 1.5;
        } else {
          m.meleePhase = side ? 'SIDE_RECOVERY' : 'RECOVERY'; m.meleeTimer = SIM.meleeRecovery;
        }
      }
    } else {
      m.velocity.y -= SIM.gravity * 0.5;
      if (--m.meleeTimer <= 0) {
        m.meleePhase = 'NONE'; m.meleeTargetId = null;
        if (m.grounded) { m.landing = landingLag(m); m.visualLanding = SIM.landingVisualTicks; }
      }
    }
  } else if (m.evade > 0) {
    m.visual = 'EVADE'; m.evade--;
    if (m.evadeCircular && target) {
      const delta = normalize(horizontal(sub(target.position, m.position)));
      m.evadeDirection = scale(vec(delta.z, 0, -delta.x), m.evadeCircular);
    }
    m.velocity = scale(m.evadeDirection, m.rainbow ? SIM.rainbowSpeed : SIM.stepSpeed);
    if (ascent && spend(m, SIM.ascentCost)) {
      m.evade = 0; m.evadeRecovery = 0; m.velocity.y = SIM.ascentSpeed; m.grounded = false;
      m.velocity.x *= 0.7; m.velocity.z *= 0.7; m.boostConsumed = true; m.visual = 'ASCEND';
    } else if (m.evade === 0) m.evadeRecovery = m.rainbow ? SIM.rainbowRecovery : SIM.stepRecovery;
  } else if (m.shootTimer >= 0 && !m.shootMoving) {
    m.velocity = vec(); m.visual = 'SHOOT';
  } else if (m.landing > 0) {
    m.velocity = vec(); m.landing--;
    if (m.landing === 0) { m.boost = 100; m.overheated = false; }
  } else if (m.evadeRecovery > 0) {
    m.velocity = vec(); m.evadeRecovery--;
    if (m.evadeRecovery === 0 && m.grounded) { m.landing = landingLag(m); m.visualLanding = SIM.landingVisualTicks; }
  } else {
    if (m.dashBuffer && m.dashCooldown <= 0) dash(world, m, direction);
    if (m.dash && (m.overheated || (!input.boost && length(direction) === 0)) && m.dashCoast < 0) m.dashCoast = SIM.dashCoastTicks;
    if (m.dashCoast === 0) m.dash = false;
    if (m.dash) {
      m.visual = 'DASH';
      if (m.dashCoast > 0) m.dashCoast--;
      else if (!spend(m, SIM.dashCost)) m.dashCoast = SIM.dashCoastTicks;
      m.dashSpeed += (SIM.dashSustainSpeed - m.dashSpeed) * SIM.dashDecay;
      if (length(direction) > 0 && m.dashCoast < 0) m.dashDirection = forward(turn(yawOf(m.dashDirection), yawOf(direction), SIM.dashTurn));
      m.velocity.x = m.dashDirection.x * m.dashSpeed; m.velocity.z = m.dashDirection.z * m.dashSpeed; m.velocity.y *= 0.85;
      m.yaw = yawOf(m.dashDirection);
    } else if (ascent && m.visualLanding <= 0 && spend(m, SIM.ascentCost)) {
      m.visual = 'ASCEND'; m.boostConsumed = true; m.velocity.y = SIM.ascentSpeed; m.grounded = false;
      m.velocity.x += direction.x * SIM.ascentAcceleration; m.velocity.z += direction.z * SIM.ascentAcceleration;
      const speed = length(horizontal(m.velocity));
      if (speed > SIM.ascentMaxSpeed) { m.velocity.x *= SIM.ascentMaxSpeed / speed; m.velocity.z *= SIM.ascentMaxSpeed / speed; }
      if (length(direction) > 0) m.yaw = turn(m.yaw, yawOf(direction), SIM.ascentTurn);
    } else if (m.grounded) {
      if (length(direction) > 0) { m.yaw = turn(m.yaw, yawOf(direction), SIM.groundTurn); const v = scale(forward(m.yaw), SIM.walkSpeed); m.velocity.x = v.x; m.velocity.z = v.z; m.visual = 'WALK'; }
      else { m.velocity.x = 0; m.velocity.z = 0; }
    } else { m.velocity.x += direction.x * 0.002; m.velocity.z += direction.z * 0.002; }
    if (m.visual !== 'ASCEND') { m.velocity.x *= SIM.friction; m.velocity.z *= SIM.friction; }
    if (!m.dash && m.visual !== 'ASCEND') m.velocity.y -= SIM.gravity;
    if (m.forcedAscent > 0 && !m.dash) m.visual = 'ASCEND';
  }

  m.position = add(m.position, m.velocity);
  bound(m);
  if (m.position.y <= 0) {
    m.position.y = 0; m.velocity.y = Math.max(0, m.velocity.y);
    if (!m.grounded) {
      m.grounded = true;
      if (!m.dash && m.evade <= 0 && m.meleePhase === 'NONE') { m.landing = landingLag(m); m.visualLanding = SIM.landingVisualTicks; emit(world, 'land', m); }
      m.dash = false;
    }
  } else m.grounded = false;
  if (m.shootTimer >= 0) {
    m.shootTimer++;
    if (target && !m.shootMoving) m.yaw = turn(m.yaw, yawOf(sub(target.position, m.position)), 0.1);
    if (m.shootTimer >= SIM.shotStartup && !m.fired) shoot(world, m, predicted);
    if (m.shootTimer >= SIM.shotStartup + (m.shootMoving ? SIM.shotRecovery : SIM.shotStopRecovery)) {
      m.shootTimer = -1;
      if (m.grounded && !m.shootMoving) m.landing = landingLag(m);
    }
  }
  // Presentation lasts independently of the shorter boost-dependent landing lockout.
  if (m.visualLanding > 0 && m.grounded && !['DASH', 'EVADE', 'ASCEND', 'MELEE'].includes(m.visual)) {
    m.visual = 'LANDING';
  }
}
function bound(m: MechState) {
  const radius = Math.hypot(m.position.x, m.position.z);
  if (radius > SIM.boundary) { m.position.x *= SIM.boundary / radius; m.position.z *= SIM.boundary / radius; }
}
function resolveBodies(world: World) {
  const ms = world.mechs;
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const a = ms[i], b = ms[j];
    if (a.down || b.down || a.hp <= 0 || b.hp <= 0 || Math.abs(a.position.y - b.position.y) >= SIM.bodyHeight) continue;
    const delta = horizontal(sub(a.position, b.position));
    const dist = length(delta);
    if (dist < SIM.bodyRadius * 2) {
      const push = scale(dist > 0.0001 ? normalize(delta) : vec(1, 0, 0), (SIM.bodyRadius * 2 - dist) / 2);
      a.position = add(a.position, push); b.position = sub(b.position, push); bound(a); bound(b);
    }
  }
}
function stepBullets(world: World, hits: Hit[]) {
  world.bullets = world.bullets.filter(b => {
    if (--b.ttl <= 0) return false;
    const old = b.position;
    b.position = add(b.position, b.velocity);
    const candidates = world.mechs.filter(m => m.team !== b.team && m.hp > 0 && !m.down)
      .map(m => ({ m, ...segmentDistance(old, b.position, add(m.position, vec(0, 1.5, 0))) }))
      .filter(v => v.distance < SIM.hitRadius).sort((a, c) => a.t - c.t || a.m.id.localeCompare(c.m.id));
    if (candidates.length) {
      hits.push({ victim: candidates[0].m.id, attacker: b.ownerId, direction: normalize(b.velocity),
        damage: SIM.bulletDamage, force: 1, stun: SIM.bulletStun, stop: 0, down: false });
      return false;
    }
    if (b.homing) {
      const target = world.mechs.find(m => m.id === b.targetId && m.hp > 0);
      if (target) {
        const to = sub(add(target.position, vec(0, 1.5, 0)), b.position);
        if (dot(normalize(b.velocity), normalize(to)) < 0) b.homing = false;
        else {
          const fwd = normalize(b.forward);
          const lateral = sub(to, scale(fwd, dot(to, fwd)));
          const forwardVelocity = scale(fwd, SIM.bulletSpeed);
          // Preserve the prototype dead zone; normalizing rounding noise causes full-speed zigzags.
          b.velocity = dot(lateral, lateral) > 0.001
            ? add(forwardVelocity, scale(normalize(lateral), SIM.homingLateralSpeed))
            : forwardVelocity;
        }
      } else b.homing = false;
    }
    return true;
  });
}
function applyHits(world: World, hits: Hit[]) {
  // Eligibility is frozen before resolution: earlier hits in this tick cannot erase simultaneous hits.
  const vulnerable = new Set(world.mechs.filter(m => !m.down).map(m => m.id));
  for (const hit of hits.sort((a, b) => a.victim.localeCompare(b.victim) || a.attacker.localeCompare(b.attacker))) {
    const m = world.mechs.find(t => t.id === hit.victim)!;
    if (!vulnerable.has(m.id)) continue;
    m.hp = world.training ? SIM.maxHp : Math.max(0, m.hp - hit.damage);
    m.stun = Math.max(m.stun, hit.stun); m.hitStop = Math.max(m.hitStop, hit.stop);
    m.knockback = hit.direction; m.knockbackPower = hit.force; m.lastHitTick = world.tick;
    cancelActions(m);
    if (hit.down) { m.down = true; m.wakeup = 0; m.velocity = add(scale(normalize(horizontal(hit.direction)), SIM.downLaunch * 0.5), vec(0, SIM.downLaunch, 0)); }
    const attacker = world.mechs.find(t => t.id === hit.attacker);
    if (attacker) attacker.hitStop = Math.max(attacker.hitStop, hit.stop);
    emit(world, 'hit', m, hit.attacker);
  }
}
export function stepWorld(world: World, inputs: Record<string, MechInput> = {}): void {
  if (world.result) return;
  world.tick++;
  world.events = world.events.filter(e => world.tick - e.tick < 60);
  const peers = world.mechs.map(m => clone(m));
  const hits: Hit[] = [];
  const view = { ...world, mechs: peers };
  for (const m of world.mechs) stepMech(view, m, inputs[m.id] ?? emptyInput(), hits, false);
  world.nextEventId = view.nextEventId; world.nextBulletId = view.nextBulletId;
  resolveBodies(world); stepBullets(world, hits); applyHits(world, hits);
  if (!world.training) {
    world.timeRemaining = Math.max(0, world.timeRemaining - 1);
    const blue = world.mechs.filter(m => m.team === 'BLUE').reduce((n, m) => n + m.hp, 0);
    const red = world.mechs.filter(m => m.team === 'RED').reduce((n, m) => n + m.hp, 0);
    if (blue === 0 || red === 0 || world.timeRemaining === 0) world.result = {
      winner: blue === red ? null : blue > red ? 'BLUE' : 'RED', reason: blue === 0 || red === 0 ? 'ko' : 'timeout',
    };
  }
}
export function predictMech(world: World, id: string, input: MechInput): void {
  world.tick++;
  const m = world.mechs.find(t => t.id === id);
  if (m && !world.result) stepMech(world, m, input, [], true);
  world.events = [];
}
