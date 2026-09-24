
/* ============================= WEAPONS ============================= */
/* Stats follow CS2 values where practical. spread = inaccuracy half-angle in degrees.
   rm = range modifier per 500 units (12.7m). ap = armor penetration ratio. pen = wall-bang power.
   recoil: deterministic pattern parameters (rise per shot, climb shots, horizontal sway).        */
const WEAPONS = {
  knife: { name: 'Knife', slot: 3, type: 'knife', dmg: 40, rpm: 100, range: 2.0, ap: 0.85, speed: 250, reward: 1500, price: 0 },
  glock: { name: 'Glock-18', slot: 2, type: 'pistol', team: 'T', dmg: 30, rpm: 400, mag: 20, reserve: 120, ap: 0.47, rm: 0.85, price: 200, speed: 240, reward: 300, pen: 0.8, reload: 2.2, rec: 9,
    spread: { stand: 0.35, crouch: 0.28, move: 2.6, air: 6, perShot: 0.8, max: 4 }, recoil: { rise: 1.1, climb: 4, max: 4, sway: 0.5, freq: 1.1, seed: 11 },
    snd: { f: 1900, dur: 0.14, g: 0.8, body: 170 }, vm: { len: 0.2, col: 0x2a2a2a } },
  usp: { name: 'USP-S', slot: 2, type: 'pistol', team: 'CT', dmg: 35, rpm: 352, mag: 12, reserve: 24, ap: 0.505, rm: 0.91, price: 200, speed: 240, reward: 300, pen: 0.8, reload: 2.2, rec: 9,
    spread: { stand: 0.22, crouch: 0.18, move: 2.4, air: 6, perShot: 0.9, max: 4 }, recoil: { rise: 1.3, climb: 4, max: 4.5, sway: 0.5, freq: 1.2, seed: 12 },
    snd: { f: 3200, dur: 0.08, g: 0.45, body: 0 }, vm: { len: 0.3, col: 0x3a3d40, silencer: true } },
  deagle: { name: 'Desert Eagle', slot: 2, type: 'pistol', dmg: 53, rpm: 267, mag: 7, reserve: 35, ap: 0.93, rm: 0.85, price: 700, speed: 230, reward: 300, pen: 1.6, reload: 2.2, rec: 5,
    spread: { stand: 0.45, crouch: 0.38, move: 5, air: 8, perShot: 3.2, max: 6 }, recoil: { rise: 3.2, climb: 3, max: 8, sway: 1.2, freq: 1.4, seed: 13 },
    snd: { f: 1100, dur: 0.3, g: 1, body: 110 }, vm: { len: 0.26, col: 0x9a9a9a } },
  mac10: { name: 'MAC-10', slot: 1, type: 'smg', team: 'T', dmg: 29, rpm: 800, mag: 30, reserve: 100, ap: 0.575, rm: 0.8, price: 1050, speed: 240, reward: 600, pen: 1.0, reload: 2.6, auto: true, rec: 14,
    spread: { stand: 0.7, crouch: 0.55, move: 2.2, air: 6, perShot: 0.25, max: 3.5 }, recoil: { rise: 0.7, climb: 8, max: 6, sway: 1.8, freq: 0.5, seed: 21 },
    snd: { f: 1700, dur: 0.1, g: 0.7, body: 140 }, vm: { len: 0.3, col: 0x303030 } },
  mp9: { name: 'MP9', slot: 1, type: 'smg', team: 'CT', dmg: 26, rpm: 857, mag: 30, reserve: 120, ap: 0.6, rm: 0.87, price: 1250, speed: 240, reward: 600, pen: 1.0, reload: 2.1, auto: true, rec: 14,
    spread: { stand: 0.6, crouch: 0.48, move: 2.0, air: 6, perShot: 0.22, max: 3.2 }, recoil: { rise: 0.65, climb: 9, max: 6, sway: 1.5, freq: 0.55, seed: 22 },
    snd: { f: 1800, dur: 0.1, g: 0.7, body: 140 }, vm: { len: 0.34, col: 0x2d3032 } },
  nova: { name: 'Nova', slot: 1, type: 'shotgun', dmg: 26, pellets: 9, rpm: 68, mag: 8, reserve: 32, ap: 0.5, rm: 0.7, price: 1050, speed: 220, reward: 900, pen: 0.5, reload: 0.5, shellReload: true, rec: 3,
    spread: { stand: 3.0, crouch: 2.8, move: 4, air: 6, perShot: 0, max: 4, pellet: 3.6 }, recoil: { rise: 4, climb: 2, max: 6, sway: 0.5, freq: 1, seed: 31 },
    snd: { f: 800, dur: 0.35, g: 1, body: 90 }, vm: { len: 0.6, col: 0x3b2a1c } },
  galil: { name: 'Galil AR', slot: 1, type: 'rifle', team: 'T', dmg: 30, rpm: 666, mag: 35, reserve: 90, ap: 0.775, rm: 0.98, price: 1800, speed: 215, reward: 300, pen: 1.8, reload: 3.0, auto: true, rec: 12,
    spread: { stand: 0.3, crouch: 0.22, move: 5, air: 9, perShot: 0.3, max: 3.5 }, recoil: { rise: 1.1, climb: 9, max: 9, sway: 2.2, freq: 0.38, seed: 41 },
    snd: { f: 1300, dur: 0.18, g: 0.9, body: 120 }, vm: { len: 0.62, col: 0x4a4436 } },
  famas: { name: 'FAMAS', slot: 1, type: 'rifle', team: 'CT', dmg: 30, rpm: 666, mag: 25, reserve: 90, ap: 0.7, rm: 0.96, price: 2050, speed: 220, reward: 300, pen: 1.8, reload: 3.3, auto: true, rec: 12,
    spread: { stand: 0.28, crouch: 0.2, move: 5, air: 9, perShot: 0.3, max: 3.5 }, recoil: { rise: 1.05, climb: 9, max: 8.5, sway: 2.0, freq: 0.4, seed: 42 },
    snd: { f: 1500, dur: 0.16, g: 0.85, body: 130 }, vm: { len: 0.55, col: 0x33373a } },
  ak47: { name: 'AK-47', slot: 1, type: 'rifle', team: 'T', dmg: 36, rpm: 600, mag: 30, reserve: 90, ap: 0.775, rm: 0.98, price: 2700, speed: 215, reward: 300, pen: 2.2, reload: 2.5, auto: true, rec: 12,
    spread: { stand: 0.22, crouch: 0.16, move: 5.5, air: 9, perShot: 0.35, max: 3.8 }, recoil: { rise: 1.35, climb: 9, max: 11, sway: -2.8, freq: 0.36, seed: 47 },
    snd: { f: 1150, dur: 0.22, g: 1, body: 105 }, vm: { len: 0.7, col: 0x5b3a1f, wood: true } },
  m4a4: { name: 'M4A4', slot: 1, type: 'rifle', team: 'CT', dmg: 33, rpm: 666, mag: 30, reserve: 90, ap: 0.7, rm: 0.97, price: 3100, speed: 225, reward: 300, pen: 2.0, reload: 3.1, auto: true, rec: 12,
    spread: { stand: 0.2, crouch: 0.15, move: 5, air: 9, perShot: 0.3, max: 3.5 }, recoil: { rise: 1.15, climb: 10, max: 9.5, sway: 2.3, freq: 0.4, seed: 48 },
    snd: { f: 1400, dur: 0.18, g: 0.95, body: 120 }, vm: { len: 0.66, col: 0x2e3134 } },
  awp: { name: 'AWP', slot: 1, type: 'sniper', dmg: 115, rpm: 41, mag: 5, reserve: 30, ap: 0.975, rm: 0.99, price: 4750, speed: 200, speedScoped: 100, reward: 100, pen: 2.8, reload: 3.6, rec: 3,
    scope: [40, 15], spread: { stand: 4.5, crouch: 4.2, scoped: 0.03, move: 9, air: 14, perShot: 0, max: 14 }, recoil: { rise: 3, climb: 1, max: 3, sway: 0, freq: 1, seed: 51 },
    snd: { f: 700, dur: 0.55, g: 1.2, body: 70 }, vm: { len: 0.85, col: 0x3d5a36, scopeMesh: true } },
  he: { name: 'HE Grenade', slot: 4, type: 'grenade', price: 300, reward: 300, speed: 245, max: 1 },
  flash: { name: 'Flashbang', slot: 4, type: 'grenade', price: 200, reward: 300, speed: 245, max: 2 },
  smoke: { name: 'Smoke Grenade', slot: 4, type: 'grenade', price: 300, reward: 300, speed: 245, max: 1 },
  molotov: { name: 'Molotov', slot: 4, type: 'grenade', team: 'T', price: 400, reward: 300, speed: 245, max: 1 },
  incgrenade: { name: 'Incendiary', slot: 4, type: 'grenade', team: 'CT', price: 500, reward: 300, speed: 245, max: 1 },
  c4: { name: 'C4 Explosive', slot: 5, type: 'c4', speed: 250 }
};
const EQUIPMENT = {
  vest: { name: 'Kevlar Vest', price: 650 },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000 },
  kit: { name: 'Defuse Kit', price: 400, team: 'CT' }
};

/** Deterministic spray pattern: returns [[x,y] deg] cumulative offsets (x>0 = right, y>0 = up). */
function makePattern(r, n) {
  const rnd = seeded(r.seed), pts = [[0, 0]];
  let x = 0, y = 0, xClimb = 0;
  for (let i = 1; i < n; i++) {
    if (i <= r.climb) {
      y += r.rise * (1 - i / (r.climb * 2.4));
      x += (rnd() - 0.5) * r.rise * 0.3;
      xClimb = x;
    } else {
      const k = i - r.climb;
      y += (rnd() - 0.35) * r.rise * 0.18;
      x = xClimb + r.sway * Math.sin(k * r.freq) * (1 + k * 0.015) + (rnd() - 0.5) * 0.15;
    }
    y = Math.min(y, r.max);
    pts.push([x, y]);
  }
  return pts;
}
for (const id in WEAPONS) {
  const w = WEAPONS[id]; w.id = id;
  if (w.recoil) w.pattern = makePattern(w.recoil, (w.mag || 1) + 1);
}

/** Runtime state for one weapon instance an agent carries. */
class Gun {
  constructor(id) {
    this.id = id; this.def = WEAPONS[id];
    this.mag = this.def.mag || 0; this.reserve = this.def.reserve || 0;
    this.nextFire = 0; this.reloadEnd = 0; this.reloading = false;
    this.idx = 0;            // spray pattern position (float, recovers when idle)
    this.sprayInacc = 0;     // additional inaccuracy from sustained fire
    this.lastShot = -99; this.scope = 0; this.triggerHeld = false;
  }
  get interval() { return 60 / this.def.rpm; }
  /** Current recoil punch in degrees, interpolated along the pattern. */
  punch() {
    const p = this.def.pattern; if (!p) return [0, 0];
    const i = Math.min(this.idx, p.length - 1.001), a = Math.floor(i), f = i - a, b = Math.min(a + 1, p.length - 1);
    return [lerp(p[a][0], p[b][0], f), lerp(p[a][1], p[b][1], f)];
  }
  update(dt, now) {
    if (now - this.lastShot > this.interval * 1.15) {
      this.idx = Math.max(0, this.idx - dt * (this.def.rec || 10));
      this.sprayInacc = Math.max(0, this.sprayInacc - dt * (this.def.rec || 10) * (this.def.spread ? this.def.spread.perShot : 0) * 1.2);
    }
  }
}

/** Inaccuracy (deg) for an agent firing its gun right now. */
function inaccuracy(agent, gun) {
  const s = gun.def.spread; if (!s) return 0;
  let base = agent.crouching ? s.crouch : s.stand;
  if (gun.scope && s.scoped !== undefined) base = s.scoped;
  const maxSpd = agent.maxSpeed();
  const spd = Math.hypot(agent.vel.x, agent.vel.z) / Math.max(0.1, maxSpd);
  let inacc = base;
  if (spd > 0.3) inacc += s.move * clamp((spd - 0.3) / 0.7, 0, 1);
  if (!agent.onGround) inacc += s.air;
  inacc += gun.sprayInacc;
  return Math.min(inacc, s.move + s.air + (s.max || 0));
}

/* ============================= ECONOMY ============================= */
const ECON = {
  start: 800, max: 16000,
  win: { elim: 3250, time: 3250, bomb: 3500, defuse: 3500 },
  lossBase: 1400, lossStep: 500, lossMax: 3400,
  plantTeamBonus: 800, plantBonus: 300, defuseBonus: 300,
  buyTime: 20 // seconds after freeze time ends
};
function addMoney(agent, amt, silent) {
  agent.money = clamp(agent.money + amt, 0, ECON.max);
  if (agent === G.player && !silent && amt > 0) UI.moneyFlash(amt);
}
function lossBonus(streak) { return Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * Math.max(0, streak - 1)); }

/** Can this item be bought by this agent right now? Returns '' if yes, else a reason. */
function buyCheck(a, id) {
  const def = WEAPONS[id] || EQUIPMENT[id];
  if (!def) return 'Unknown item';
  if (def.team && def.team !== a.team) return 'Wrong team';
  let price = def.price;
  if (id === 'vesthelm' && a.armor >= 100 && !a.helmet) price = 350;
  if (id === 'vest' && a.armor >= 100) return 'Already equipped';
  if (id === 'vesthelm' && a.armor >= 100 && a.helmet) return 'Already equipped';
  if (id === 'kit' && a.kit) return 'Already equipped';
  if (WEAPONS[id]) {
    if (def.type === 'grenade') {
      const count = a.nades.filter(n => n === id).length;
      if (count >= def.max) return 'Carrying max';
      if (a.nades.length >= 4) return 'Grenade limit';
    } else if (a.slots[def.slot] && a.slots[def.slot].id === id) return 'Already owned';
  }
  if (a.money < price) return 'Not enough money';
  return '';
}
function itemPrice(a, id) {
  if (id === 'vesthelm' && a.armor >= 100 && !a.helmet) return 350;
  return (WEAPONS[id] || EQUIPMENT[id]).price;
}
/** Purchase an item. Replaced guns are dropped on the ground like in CS. */
function buyItem(a, id) {
  const why = buyCheck(a, id);
  if (why) return why;
  addMoney(a, -itemPrice(a, id), true);
  if (id === 'vest') a.armor = 100;
  else if (id === 'vesthelm') { a.armor = 100; a.helmet = true; }
  else if (id === 'kit') a.kit = true;
  else {
    const def = WEAPONS[id];
    if (def.type === 'grenade') a.nades.push(id);
    else {
      const old = a.slots[def.slot];
      if (old) Game.dropGun(a, old);
      a.slots[def.slot] = new Gun(id);
      a.switchTo(def.slot, true);
    }
  }
  return '';
}
