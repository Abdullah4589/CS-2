
/* ============================== AGENTS ============================= */
/* One class for the human player and bots: movement, weapons, hitboxes, 3rd-person model. */
const HITGROUP_MULT = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };
const TEAM_BULLET_DAMAGE = 0.33; // ff_damage_reduction_bullets in CS2 competitive

const ModelKit = (() => {
  const box = (w, h, d, oy = 0) => new THREE.BoxGeometry(w, h, d).translate(0, oy, 0);
  const geo = {
    leg: box(0.17, 0.9, 0.19, -0.45), torso: box(0.46, 0.58, 0.27), head: box(0.24, 0.27, 0.26),
    cap: box(0.28, 0.11, 0.3), arm: box(0.12, 0.12, 0.5, 0), gun: box(0.07, 0.11, 0.62), boot: box(0.19, 0.1, 0.26)
  };
  const skin = new THREE.MeshLambertMaterial({ color: 0xc49a74 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d1d1d });
  const team = {
    T: { shirt: new THREE.MeshLambertMaterial({ color: 0x77623f }), pants: new THREE.MeshLambertMaterial({ color: 0x544632 }), cap: new THREE.MeshLambertMaterial({ color: 0x2f2b24 }) },
    CT: { shirt: new THREE.MeshLambertMaterial({ color: 0x3a4c63 }), pants: new THREE.MeshLambertMaterial({ color: 0x2b3747 }), cap: new THREE.MeshLambertMaterial({ color: 0x252d38 }) }
  };
  function build(side) {
    const m = team[side], root = new THREE.Group();
    const mk = (g, mat) => { const x = new THREE.Mesh(g, mat); x.castShadow = true; return x; };
    const legL = mk(geo.leg, m.pants), legR = mk(geo.leg, m.pants);
    legL.position.set(-0.11, 0.92, 0); legR.position.set(0.11, 0.92, 0);
    const bootL = mk(geo.boot, dark), bootR = mk(geo.boot, dark);
    bootL.position.set(0, -0.86, -0.03); bootR.position.set(0, -0.86, -0.03); legL.add(bootL); legR.add(bootR);
    const upper = new THREE.Group(); upper.position.y = 0.92;
    const torso = mk(geo.torso, m.shirt); torso.position.y = 0.3;
    const head = mk(geo.head, skin); head.position.y = 0.72;
    const cap = mk(geo.cap, m.cap); cap.position.y = 0.12; head.add(cap);
    const armR = mk(geo.arm, m.shirt); armR.position.set(0.2, 0.42, -0.2);
    const armL = mk(geo.arm, m.shirt); armL.position.set(-0.12, 0.38, -0.28); armL.rotation.y = -0.5;
    const gun = mk(geo.gun, dark); gun.position.set(0.12, 0.42, -0.5);
    upper.add(torso, head, armR, armL, gun);
    root.add(legL, legR, upper);
    root.userData = { legL, legR, upper, head, gun };
    return root;
  }
  return { build };
})();

let _agentId = 0;
class Agent {
  constructor(name, squad, team, isBot) {
    this.id = _agentId++; this.name = name; this.squad = squad; this.team = team; this.isBot = isBot;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true; this.crouching = false; this.crouchAmt = 0; this.height = HULL_STAND; this.walking = false;
    this.money = ECON.start;
    this.stats = { k: 0, d: 0, a: 0, dmg: 0, score: 0, mvp: 0, hs: 0 };
    this.model = null;
    this.hp = 0; this.alive = false;
    this.resetLoadout();
  }
  resetLoadout() {
    this.slots = { 1: null, 2: new Gun(this.team === 'T' ? 'glock' : 'usp'), 3: new Gun('knife'), 5: null };
    this.nades = []; this.nadeIdx = 0; this.nadeGuns = {};
    this.armor = 0; this.helmet = false; this.kit = false;
  }
  buildModel(scene) {
    if (this.model) scene.remove(this.model);
    this.model = ModelKit.build(this.team);
    scene.add(this.model);
  }
  /** Prepare for a new round at a spawn tile. Keeps surviving loadout (CS rules). */
  spawn(c, r) {
    const survived = this.alive;
    if (!survived) this.resetLoadout();
    this.kit = this.kit && survived;
    this.hp = 100; this.alive = true;
    this.pos.copy(World.spot(c, r)); this.pos.x += rand(-0.6, 0.6); this.pos.z += rand(-0.6, 0.6);
    this.vel.set(0, 0, 0);
    this.yaw = this.team === 'T' ? 0 : Math.PI; this.pitch = 0;
    this.crouching = false; this.crouchAmt = 0; this.height = HULL_STAND; this.onGround = true;
    this.flashT = 0; this.flashMax = 1; this.spottedUntil = 0; this.dmgBy = {}; this.stepAcc = 0; this.deathT = 0;
    this.roundKills = 0; this.plantProg = 0; this.defuseProg = 0; this.slots[5] = null;
    for (const s of [1, 2]) if (this.slots[s]) { this.slots[s].reloading = false; this.slots[s].scope = 0; }
    this.cur = this.slots[1] ? 1 : 2; this.prev = 3; this.drawEnd = 0;
    if (this.model) { this.model.visible = true; this.model.rotation.set(0, 0, 0); }
  }
  eyeH() { return lerp(EYE_STAND, EYE_CROUCH, this.crouchAmt); }
  eye(out) { return (out || new THREE.Vector3()).set(this.pos.x, this.pos.y + this.eyeH(), this.pos.z); }
  gun() {
    if (this.cur === 4) {
      const id = this.nades[this.nadeIdx]; if (!id) return this.slots[3];
      return this.nadeGuns[id] || (this.nadeGuns[id] = new Gun(id));
    }
    return this.slots[this.cur] || this.slots[3];
  }
  hasBomb() { return !!this.slots[5]; }
  maxSpeed() {
    const g = this.gun();
    let s = (g.scope && g.def.speedScoped ? g.def.speedScoped : g.def.speed) * U2M;
    if (this.crouchAmt > 0.5) s *= 0.34; else if (this.walking) s *= 0.52;
    if (this.planting || this.defusing) s = 0;
    return s;
  }
  switchTo(slot, silent) {
    if (slot === 4) {
      if (!this.nades.length) return false;
      if (this.cur === 4) this.nadeIdx = (this.nadeIdx + 1) % this.nades.length;
    } else if (!this.slots[slot]) return false;
    else if (slot === this.cur) return false;
    const g = this.gun(); if (g) { g.reloading = false; g.scope = 0; }
    if (this.cur !== slot) this.prev = this.cur;
    this.cur = slot;
    this.drawEnd = G.time + (slot === 3 ? 0.3 : 0.55);
    if (this === G.player && !silent) { Sound.deploy(); Viewmodel.rebuild(); }
    if (this === G.player && silent) Viewmodel.rebuild();
    return true;
  }
  /** Source-style ground friction + acceleration, air strafing, then collide. */
  move(dt, wx, wz, jump) {
    const max = this.maxSpeed(), v = this.vel;
    if (this.onGround) {
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) { const drop = Math.max(sp, 2.03) * 5.2 * dt, ns = Math.max(0, sp - drop) / sp; v.x *= ns; v.z *= ns; }
      this.accelerate(wx, wz, max, 5.5 * max * dt);
      if (jump && this.crouchAmt < 0.9) { v.y = JUMP_V; this.onGround = false; if (this.isBot || this !== G.player) Sound.land(this.pos); }
    } else this.accelerate(wx, wz, Math.min(max, 0.76), 12 * max * dt);
    // Crouch hull (can't stand up under a low ceiling)
    const want = this.crouching ? 1 : 0;
    this.crouchAmt = clamp(this.crouchAmt + (want - this.crouchAmt) * Math.min(1, dt * 12), 0, 1);
    this.height = lerp(HULL_STAND, HULL_CROUCH, this.crouchAmt);
    const landed = moveAndCollide(this, dt);
    if (landed > 6) { Sound.land(this === G.player ? null : this.pos); if (landed > 11) this.fallDamage(landed); }
    // Footsteps: only when running (walk/crouch is silent)
    const hs = Math.hypot(v.x, v.z);
    if (this.onGround && hs > 3.2 && !this.walking && this.crouchAmt < 0.5) {
      this.stepAcc += hs * dt;
      if (this.stepAcc > 2.3) {
        this.stepAcc = 0;
        const fl = World.floorAt(this.pos.x, this.pos.z);
        Sound.footstep(this === G.player ? null : this.pos, '1234'.includes(fl) ? 'metal' : 'sand');
        Bots.noise(this, this.pos, 16);
      }
    }
  }
  accelerate(wx, wz, wishSpeed, accelAmt) {
    if (!wx && !wz) return;
    const cur = this.vel.x * wx + this.vel.z * wz, add = wishSpeed - cur;
    if (add <= 0) return;
    const a = Math.min(accelAmt, add);
    this.vel.x += a * wx; this.vel.z += a * wz;
  }
  fallDamage(speed) {
    const dmg = Math.round((speed - 11) * 9);
    if (dmg > 0) applyDamage(this, dmg, 'fall', null, null, null, true);
  }
  /** Animate the 3rd-person model. */
  updateModel(dt) {
    const m = this.model; if (!m) return;
    const u = m.userData;
    if (!this.alive) {
      this.deathT += dt;
      m.rotation.x = -Math.min(1, this.deathT * 3) * Math.PI / 2;
      m.position.y = this.pos.y + 0.15;
      return;
    }
    m.visible = !(this === G.player || (G.player && !G.player.alive && Game.specTarget === this));
    m.position.set(this.pos.x, this.pos.y, this.pos.z);
    m.rotation.y = this.yaw;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.animPhase = (this.animPhase || 0) + sp * dt * 2.4;
    const swing = Math.sin(this.animPhase) * Math.min(0.7, sp * 0.12);
    const c = this.crouchAmt;
    u.legL.rotation.x = swing - c * 0.9; u.legR.rotation.x = -swing - c * 0.9;
    u.legL.position.y = u.legR.position.y = 0.92 - c * 0.42;
    u.upper.position.y = 0.92 - c * 0.5;
    u.upper.rotation.x = this.pitch * 0.5;
  }
  /** Ray vs head sphere + body box. Returns {t, group} or null. */
  rayHit(o, d, maxT) {
    const eh = this.eyeH(), hx = this.pos.x, hy = this.pos.y + eh + 0.02, hz = this.pos.z;
    let best = null;
    // head sphere (r=0.15)
    const ox = o.x - hx, oy = o.y - hy, oz = o.z - hz;
    const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - 0.0225, disc = b * b - c;
    if (disc > 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) best = { t, group: 'head' }; }
    const top = this.pos.y + eh - 0.14;
    const h = rayBox(o, d, { x0: hx - 0.25, x1: hx + 0.25, z0: hz - 0.25, z1: hz + 0.25, y0: this.pos.y, y1: top });
    if (h && h.t < maxT && (!best || h.t < best.t)) {
      const y = o.y + d.y * h.t, f = (y - this.pos.y) / (top - this.pos.y);
      best = { t: h.t, group: f < 0.5 ? 'legs' : f < 0.7 ? 'stomach' : 'chest' };
    }
    return best;
  }
}

/* ============================== COMBAT ============================= */
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3();

/** Fire the agent's current gun once (bullets, recoil, effects). Called immediately on input for the player. */
function fireGun(a, now) {
  const gun = a.gun(), def = gun.def;
  if (now < gun.nextFire || now < a.drawEnd || gun.reloading || !a.alive) return false;
  if (def.type === 'knife') return knifeAttack(a, now);
  if (def.type === 'grenade') return false; // thrown on release (see Grenades)
  if (def.type === 'c4') return false;
  if (gun.mag <= 0) {
    gun.nextFire = now + 0.25;
    if (a === G.player) Sound.dry();
    if (gun.reserve > 0) startReload(a);
    return false;
  }
  gun.mag--; gun.lastShot = now; gun.nextFire = now + gun.interval;
  const inacc = inaccuracy(a, gun);
  const [px, py] = gun.punch();
  const baseYaw = a.yaw - px * DEG, basePitch = a.pitch + py * DEG;
  a.eye(_o);
  const pellets = def.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const cone = (pellets > 1 ? def.spread.pellet * Math.sqrt(Math.random()) : 0) + inacc * Math.sqrt(Math.random());
    const ang = Math.random() * Math.PI * 2;
    const yaw = baseYaw + Math.cos(ang) * cone * DEG, pitch = basePitch + Math.sin(ang) * cone * DEG;
    dirFromAngles(yaw, pitch, _d);
    traceBullet(a, _o, _d, def, i === 0);
  }
  gun.idx += 1;
  gun.sprayInacc = Math.min(def.spread.max || 3, gun.sprayInacc + def.spread.perShot);
  if (gun.scope && def.type === 'sniper') { gun.scope = 0; gun.rescope = true; }
  Sound.gun(def, a === G.player ? null : a.pos);
  Bots.noise(a, a.pos, gun.id === 'usp' ? 18 : 55);
  if (a === G.player) Viewmodel.kick(def);
  else FX.muzzle(a);
  a.spottedUntil = Math.max(a.spottedUntil, G.time + 1.2);
  if (gun.mag === 0 && gun.reserve > 0) setTimeout(() => { if (a.alive && a.gun() === gun && !gun.reloading) startReload(a); }, 200);
  return true;
}

function startReload(a) {
  const gun = a.gun(), def = gun.def;
  if (!def.mag || gun.reloading || gun.mag >= def.mag || gun.reserve <= 0) return;
  gun.reloading = true; gun.scope = 0;
  gun.reloadEnd = G.time + def.reload;
  if (a === G.player) { Sound.reload(def.reload); Viewmodel.reloadAnim(def.reload); }
}
function updateReload(a) {
  const gun = a.gun();
  if (!gun.reloading || G.time < gun.reloadEnd) return;
  if (gun.def.shellReload) {
    gun.mag++; gun.reserve--;
    if (a === G.player) Sound.reload(0.3);
    if (gun.mag < gun.def.mag && gun.reserve > 0) { gun.reloadEnd = G.time + gun.def.reload; return; }
  } else {
    const need = gun.def.mag - gun.mag, take = Math.min(need, gun.reserve);
    gun.mag += take; gun.reserve -= take;
  }
  gun.reloading = false; gun.idx = 0; gun.sprayInacc = 0;
}

/** Hitscan bullet with player hits, crate wall-bangs, falloff, smoke clearing and FX. */
function traceBullet(shooter, origin, dir, def, primary) {
  const o = _p.copy(origin);
  let dmg = def.dmg, power = def.pen || 0, traveled = 0;
  const hitSet = new Set(), maxRange = 300;
  let endT = maxRange;
  for (let seg = 0; seg < 5; seg++) {
    const wh = rayCast(o, dir, maxRange - traveled);
    const wallT = wh ? wh.t : maxRange - traveled;
    let best = null;
    for (const ag of G.agents) {
      if (!ag.alive || ag === shooter || hitSet.has(ag)) continue;
      const h = ag.rayHit(o, dir, wallT);
      if (h && (!best || h.t < best.t)) best = { ...h, ag };
    }
    Smokes.bulletThrough(o, dir, best ? best.t : wallT);
    if (best) {
      const hp = _e.copy(o).addScaledVector(dir, best.t);
      applyDamage(best.ag, dmg * Math.pow(def.rm || 1, (traveled + best.t) / 12.7), best.group, shooter, def, hp, false, dir);
      FX.blood(hp);
      hitSet.add(best.ag);
      if (power < 1.5) { endT = traveled + best.t; break; }
      dmg *= 0.6; power -= 1;
      o.addScaledVector(dir, best.t + 0.05); traveled += best.t + 0.05;
      continue;
    }
    if (!wh) { endT = maxRange; break; }
    const hitP = _e.copy(o).addScaledVector(dir, wh.t);
    FX.impact(hitP, wh, primary);
    endT = traveled + wh.t;
    if ((wh.ch === 'c' || wh.ch === 'C') && power > 0) {
      const thick = wh.tExit - wh.t, cost = thick * 0.6;
      if (cost < power) {
        power -= cost; dmg *= 1 - cost / (def.pen * 1.5);
        const exitP = _e.copy(o).addScaledVector(dir, wh.tExit);
        FX.impact(exitP, { nx: dir.x, ny: dir.y, nz: dir.z, ch: wh.ch }, false);
        o.addScaledVector(dir, wh.tExit + 0.02); traveled += wh.tExit + 0.02;
        continue;
      }
    }
    break;
  }
  if (primary) FX.tracer(shooter, origin, dir, endT);
}

function knifeAttack(a, now) {
  const gun = a.gun(); gun.nextFire = now + 0.5; gun.lastShot = now;
  a.eye(_o); dirFromAngles(a.yaw, a.pitch, _d);
  if (a === G.player) Viewmodel.kick(gun.def);
  const wh = rayCast(_o, _d, 2.0), maxT = wh ? wh.t : 2.0;
  let best = null;
  for (const ag of G.agents) {
    if (!ag.alive || ag === a) continue;
    const h = ag.rayHit(_o, _d, maxT);
    if (h && (!best || h.t < best.t)) best = { ...h, ag };
  }
  if (best) {
    // Backstab: attacker behind victim => lethal
    const back = Math.abs(wrapAngle(best.ag.yaw - a.yaw)) < 0.9;
    applyDamage(best.ag, back ? 180 : 40, 'chest', a, gun.def, _e.copy(_o).addScaledVector(_d, best.t), false, _d);
    Sound.hitFlesh(best.ag.pos);
  } else if (wh) { Sound.impact(_e.copy(_o).addScaledVector(_d, wh.t)); }
  return true;
}

/** Apply damage with hitgroup multipliers and armor. `raw` flags bypass multipliers (fall, grenades). */
function applyDamage(v, amount, group, attacker, def, point, raw, dir) {
  if (!v.alive || G.phase === 'over') return;
  if (attacker && attacker !== v && attacker.team === v.team) {
    // Friendly fire: bullets and knives only, at CS2's competitive reduction. Utility never hurts teammates.
    if (!def || def.type === 'grenade' || group === 'fire') return;
    amount *= TEAM_BULLET_DAMAGE;
  }
  let dmg = raw ? amount : amount * HITGROUP_MULT[group];
  const armored = v.armor > 0 && (group === 'head' ? v.helmet : (group !== 'legs' && group !== 'fall' && group !== 'fire'));
  if (armored && def) {
    const ratio = def.ap !== undefined ? def.ap : 0.5;
    let hpDmg = dmg * ratio, armorDmg = (dmg - hpDmg) * 0.5;
    if (armorDmg > v.armor) { hpDmg += (armorDmg - v.armor) * 2; armorDmg = v.armor; }
    v.armor = Math.max(0, Math.round(v.armor - armorDmg));
    dmg = hpDmg;
  }
  dmg = Math.max(1, Math.round(dmg));
  const dealt = Math.min(dmg, v.hp);
  v.hp -= dmg;
  if (attacker && attacker !== v && attacker.team !== v.team) {
    attacker.stats.dmg += dealt;
    v.dmgBy[attacker.id] = (v.dmgBy[attacker.id] || 0) + dealt;
    if (attacker === G.player && group !== 'fire') { UI.hitMarker(group === 'head' && v.hp <= 0 || group === 'head'); Sound.hitMarker(group === 'head'); }
  }
  if (v === G.player) {
    UI.hurt(dealt, attacker);
    if (group === 'head' && !v.helmet) Sound.hitMarker(true);
    Sound.hurt();
    Viewmodel.flinch(dealt);
    // Tagging: getting shot slows you down (CS "tagging")
    if (group !== 'fire' && group !== 'fall') { v.vel.x *= 0.45; v.vel.z *= 0.45; }
  } else if (v.isBot && attacker) Bots.onDamaged(v, attacker);
  if (v.hp <= 0) { v.hp = 0; Game.onKill(attacker, v, def, group === 'head'); }
}
