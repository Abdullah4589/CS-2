
/* ============================ GAME / ROUNDS ======================== */
const TIMES = { freeze: 15, round: 115, bomb: 40, post: 5, plant: 3.5, defuse: 10, defuseKit: 5 };
const MAX_ROUNDS = 30, HALF = 15, WIN_AT = 16;
const TEAM_NAME = { T: 'Terrorists', CT: 'Counter-Terrorists' };

const G = {
  state: 'menu', paused: false, phase: 'freeze', phaseT: 0, time: 0, frame: 0,
  round: 1, roundInHalf: 1, score: [0, 0], lossStreak: [0, 0], agents: [], player: null,
  bomb: { state: 'none' }, drops: [], shake: 0, difficulty: 'normal', playerTeam: 'CT', liveStart: 0,
  tPlan: { site: 'A', route: 0 }, intel: { A: -99, B: -99 }, scene: null, camera: null, renderer: null
};

const Game = (() => {
  const M = {};
  let bombMesh = null, bombLight = null;
  const v = new THREE.Vector3(), eyeP = new THREE.Vector3(), eyeE = new THREE.Vector3();
  M.specTarget = null;

  M.newMatch = (team, difficulty) => {
    G.agents.forEach(a => a.model && G.scene.remove(a.model));
    G.difficulty = difficulty; G.playerTeam = team;
    G.score = [0, 0]; G.lossStreak = [0, 0]; G.round = 1; G.roundInHalf = 1; G.time = 0;
    const other = team === 'T' ? 'CT' : 'T';
    const p = new Agent('You', 0, team, false);
    G.player = p;
    G.agents = [p];
    BOT_NAMES[0].forEach(n => G.agents.push(new Agent(n, 0, team, true)));
    BOT_NAMES[1].forEach(n => G.agents.push(new Agent(n, 1, other, true)));
    G.agents.forEach(a => { a.buildModel(G.scene); if (a.isBot) Bots.init(a); });
    UI.killfeedClear();
    M.startRound();
  };

  M.clearRoundObjects = () => {
    Smokes.clearAll(); Fires.clearAll(); Grenades.clearAll(); FX.clearDecals();
    G.drops.forEach(d => G.scene.remove(d.mesh)); G.drops = [];
    if (bombMesh) bombMesh.visible = false;
  };

  M.startRound = () => {
    M.clearRoundObjects();
    const spawnT = SPOTS.T_SPAWN.slice().sort(() => Math.random() - 0.5), spawnCT = SPOTS.CT_SPAWN.slice().sort(() => Math.random() - 0.5);
    let ti = 0, ci = 0;
    for (const a of G.agents) {
      const s = a.team === 'T' ? spawnT[ti++] : spawnCT[ci++];
      a.spawn(s[0], s[1]);
    }
    // Bomb goes to a random terrorist
    const ts = G.agents.filter(a => a.team === 'T');
    const carrier = choice(ts);
    carrier.slots[5] = new Gun('c4');
    G.bomb = { state: 'carried', carrier, pos: new THREE.Vector3(), site: '', timer: 0, beepT: 0, planter: null };
    // Team eco decision: save if the average bank can't afford a buy
    for (const team of ['T', 'CT']) {
      const mates = G.agents.filter(a => a.team === team);
      const avg = mates.reduce((s, a) => s + a.money, 0) / mates.length;
      const eco = G.roundInHalf > 1 && avg < 2600 && G.roundInHalf !== HALF;
      mates.forEach(a => { if (a.isBot) Bots.buy(a, eco); });
    }
    Bots.roundStart();
    G.phase = 'freeze'; G.phaseT = TIMES.freeze;
    M.specTarget = null;
    Viewmodel.rebuild();
    UI.roundStart();
    Sound.chime(true);
  };

  /* ------------------------------ Bomb ------------------------------ */
  function ensureBombMesh() {
    if (bombMesh) return;
    bombMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.22), new THREE.MeshLambertMaterial({ color: 0x5f6036 }));
    body.position.y = 0.05; body.castShadow = true;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.1), new THREE.MeshLambertMaterial({ color: 0x151515 }));
    pad.position.set(0.05, 0.11, 0);
    bombLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft, color: 0xff2020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    bombLight.position.set(-0.1, 0.14, 0); bombLight.scale.set(0.25, 0.25, 1);
    bombMesh.add(body, pad, bombLight);
    G.scene.add(bombMesh);
  }
  M.onSite = a => { const f = World.floorAt(a.pos.x, a.pos.z); return f === 'A' || f === 'B' ? f : ''; };
  /** Called every frame while an agent holds the plant key. */
  M.holdPlant = (a, dt) => {
    if (G.phase !== 'live' || !a.hasBomb() || !a.onGround || !M.onSite(a)) return false;
    a.planting = true; a._plantFrame = G.frame;
    if (Math.floor(a.plantProg * 4) !== Math.floor((a.plantProg + dt) * 4) && a === G.player) Sound.plantTick();
    a.plantProg += dt;
    if (a.plantProg >= TIMES.plant) plant(a);
    return true;
  };
  function plant(a) {
    ensureBombMesh();
    const b = G.bomb;
    b.state = 'planted'; b.pos.copy(a.pos); b.site = M.onSite(a); b.timer = TIMES.bomb; b.beepT = 0; b.planter = a;
    a.slots[5] = null; a.planting = false; a.plantProg = 0;
    if (a.cur === 5) a.switchTo(a.slots[1] ? 1 : 2, true);
    bombMesh.position.copy(b.pos); bombMesh.visible = true;
    addMoney(a, ECON.plantBonus); a.stats.score += 2;
    G.phase = 'planted'; G.phaseT = TIMES.bomb;
    UI.center('BOMB PLANTED', `Site ${b.site}`, 2500, '#e5484d');
    Sound.announce('Bomb has been planted');
    G.intel[b.site] = G.time;
  }
  M.holdDefuse = (a, dt) => {
    const b = G.bomb;
    if (G.phase !== 'planted' || a.team !== 'CT' || !a.onGround || a.pos.distanceTo(b.pos) > 1.8) return false;
    a.defusing = true; a._defuseFrame = G.frame;
    if (a.defuseProg === 0) b.defuser = a;
    a.defuseProg += dt;
    if (Math.floor(a.defuseProg * 3) !== Math.floor((a.defuseProg - dt) * 3)) Sound.defuseTick(a === G.player ? null : b.pos);
    if (a.defuseProg >= (a.kit ? TIMES.defuseKit : TIMES.defuse)) {
      b.state = 'defused'; a.defusing = false;
      addMoney(a, ECON.defuseBonus); a.stats.score += 2;
      endRound('CT', 'defuse', a);
    }
    return true;
  };
  M.dropBomb = a => {
    if (!a.hasBomb()) return;
    ensureBombMesh();
    a.slots[5] = null;
    if (a.cur === 5) a.switchTo(a.slots[1] ? 1 : 2, true);
    const b = G.bomb; b.state = 'dropped'; b.carrier = null;
    dirFromAngles(a.yaw, 0, v);
    b.pos.set(a.pos.x, World.top(World.tc(a.pos.x), World.tr(a.pos.z)), a.pos.z);
    if (a.alive) { const tx = a.pos.x + v.x * 1.5, tz = a.pos.z + v.z * 1.5; if (World.walkable(World.tc(tx), World.tr(tz))) { b.pos.x = tx; b.pos.z = tz; } }
    b.pos.y = World.top(World.tc(b.pos.x), World.tr(b.pos.z));
    b.dropT = G.time;
    bombMesh.position.copy(b.pos); bombMesh.visible = true;
  };
  function updateBomb(dt) {
    const b = G.bomb;
    if (b.state === 'dropped') {
      for (const a of G.agents) if (a.alive && a.team === 'T' && a.pos.distanceTo(b.pos) < 1.2 && (a !== G.player || G.time - b.dropT > 1)) {
        a.slots[5] = new Gun('c4'); b.state = 'carried'; b.carrier = a; bombMesh.visible = false;
        if (a === G.player) UI.center('', 'You picked up the bomb', 1500);
        break;
      }
    }
    if (b.state !== 'planted') return;
    b.timer -= dt;
    b.beepT -= dt;
    if (b.beepT <= 0) {
      b.beepT = b.timer > 10 ? 1 : b.timer > 5 ? 0.5 : b.timer > 2 ? 0.25 : 0.12;
      Sound.beep(b.pos);
      bombLight.material.opacity = 1;
    }
    bombLight.material.opacity *= Math.exp(-dt * 10);
    if (b.timer <= 0) {
      b.state = 'exploded'; bombMesh.visible = false;
      Sound.explosion(b.pos, true); FX.bigExplosion(b.pos);
      for (const a of G.agents) {
        if (!a.alive) continue;
        const d = a.pos.distanceTo(b.pos);
        if (d < 24) applyDamage(a, 300 * Math.pow(1 - d / 24, 1.4) + (d < 10 ? 100 : 0), 'chest', null, { ap: 0.5 }, null, true);
      }
      if (G.phase !== 'post') endRound('T', 'bomb', b.planter);
    }
  }

  /* --------------------------- Drops / pickups --------------------------- */
  M.dropGun = (a, gun) => {
    if (!gun || gun.def.type === 'knife') return;
    const len = (gun.def.vm && gun.def.vm.len) || 0.3;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, len + 0.15), new THREE.MeshLambertMaterial({ color: (gun.def.vm && gun.def.vm.col) || 0x333333 }));
    a.eye(eyeP); dirFromAngles(a.yaw, a.pitch, v);
    mesh.position.copy(eyeP).addScaledVector(v, 0.5); mesh.castShadow = true;
    G.scene.add(mesh);
    G.drops.push({ gun, mesh, vel: v.clone().multiplyScalar(a.alive ? 4 : 1).add(new THREE.Vector3(0, 1.5, 0)), t: G.time, owner: a, rest: false });
  };
  M.dropCurrent = a => {
    const g = a.gun();
    if (a.cur === 5) { M.dropBomb(a); return; }
    if (a.cur !== 1 && a.cur !== 2) return;
    a.slots[a.cur] = null;
    M.dropGun(a, g);
    a.switchTo(a.slots[1] ? 1 : a.slots[2] ? 2 : 3, true);
    if (a === G.player) Viewmodel.rebuild();
  };
  function updateDrops(dt) {
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const d = G.drops[i], m = d.mesh;
      if (!d.rest) {
        d.vel.y -= GRAVITY * dt;
        m.position.addScaledVector(d.vel, dt);
        const c = World.tc(m.position.x), r = World.tr(m.position.z);
        if (!World.walkable(c, r) && World.at(c, r) === '#') { m.position.addScaledVector(d.vel, -dt); d.vel.x = d.vel.z = 0; }
        const floor = World.top(c, r) + 0.05;
        if (m.position.y <= floor) { m.position.y = floor; d.rest = true; m.rotation.set(0, Math.random() * 6, Math.PI / 2); }
      }
      if (G.time - d.t < 0.8) continue;
      for (const a of G.agents) {
        if (!a.alive || a.slots[d.gun.def.slot] || a.pos.distanceTo(m.position) > 1.3) continue;
        a.slots[d.gun.def.slot] = d.gun;
        if (a === G.player) { Sound.deploy(); UI.center('', 'Picked up ' + d.gun.def.name, 1200); UI.refreshSlots(); }
        else if (d.gun.def.slot === 1) a.switchTo(1, true);
        G.scene.remove(m); G.drops.splice(i, 1);
        break;
      }
    }
  }

  /* ------------------------------ Kills ------------------------------ */
  M.onKill = (attacker, victim, def, hs) => {
    if (!victim.alive) return;
    victim.alive = false; victim.stats.d++; victim.deathT = 0;
    victim.planting = victim.defusing = false;
    if (attacker && attacker !== victim) {
      if (attacker.team !== victim.team) {
        attacker.stats.k++; attacker.stats.score += 2; attacker.roundKills++;
        if (hs) attacker.stats.hs++;
        addMoney(attacker, def && def.reward !== undefined ? def.reward : 300);
      } else { attacker.stats.k--; addMoney(attacker, -300); }
    }
    for (const id in victim.dmgBy) {
      const helper = G.agents.find(a => a.id === +id);
      if (helper && helper !== attacker && victim.dmgBy[id] >= 41) { helper.stats.a++; helper.stats.score += 1; }
    }
    UI.killfeed(attacker, victim, def ? def.name : (G.bomb.state === 'exploded' ? 'C4' : 'World'), hs);
    // Drop best gun and the bomb
    if (victim.hasBomb()) M.dropBomb(victim);
    const best = victim.slots[1] || victim.slots[2];
    if (best) { victim.slots[best.def.slot] = null; M.dropGun(victim, best); }
    victim.slots[1] = null; victim.slots[2] = null; victim.nades = []; victim.kit = false; victim.armor = 0; victim.helmet = false;
    if (victim === G.player) {
      G.player.gun().scope = 0;
      UI.center('YOU DIED', attacker && attacker !== victim ? `Killed by ${attacker.name} (${def ? def.name : ''})` : '', 2500, '#e5484d');
      setTimeout(() => { if (!G.player.alive) M.nextSpec(); }, 1500);
    }
    if (M.specTarget === victim) setTimeout(() => M.nextSpec(), 1200);
    checkElimination();
  };
  function checkElimination() {
    if (G.phase === 'post' || G.phase === 'over') return;
    const tAlive = G.agents.some(a => a.alive && a.team === 'T'), ctAlive = G.agents.some(a => a.alive && a.team === 'CT');
    if (!ctAlive) endRound('T', 'elim');
    else if (!tAlive && G.bomb.state !== 'planted') endRound('CT', 'elim');
  }

  /* ---------------------------- Round end ---------------------------- */
  function endRound(winner, reason, hero) {
    if (G.phase === 'post' || G.phase === 'over') return;
    const loser = winner === 'T' ? 'CT' : 'T';
    const wSquad = G.agents.find(a => a.team === winner).squad, lSquad = 1 - wSquad;
    G.score[wSquad]++;
    G.lossStreak[wSquad] = Math.max(0, G.lossStreak[wSquad] - 1);
    G.lossStreak[lSquad] = Math.min(5, G.lossStreak[lSquad] + 1);
    const winMoney = ECON.win[reason] || 3250, lossMoney = lossBonus(G.lossStreak[lSquad]);
    for (const a of G.agents) {
      if (a.team === winner) addMoney(a, winMoney, a !== G.player);
      else {
        // Terrorists that survive a time-out loss get no loss bonus
        if (reason === 'time' && a.team === 'T' && a.alive) continue;
        // Terrorists who planted but lost the round still earn the plant bonus
        const plantBonus = a.team === 'T' && G.bomb.state === 'defused' ? ECON.plantTeamBonus : 0;
        addMoney(a, lossMoney + plantBonus, a !== G.player);
      }
    }
    // MVP: objective hero, else most kills on the winning team
    const mvp = hero && hero.team === winner ? hero : G.agents.filter(a => a.team === winner).sort((a, b) => b.roundKills - a.roundKills)[0];
    if (mvp) mvp.stats.mvp++;
    const reasons = { elim: 'All enemies eliminated', time: 'Time ran out — target saved', bomb: 'The bomb exploded', defuse: 'The bomb has been defused' };
    UI.center(TEAM_NAME[winner].toUpperCase() + ' WIN', reasons[reason] + (mvp ? `  ·  MVP: ${mvp.name}` : ''), 4500, winner === 'T' ? '#e2a94f' : '#5da2f0');
    Sound.announce(TEAM_NAME[winner] + ' win');
    Sound.chime(winner === G.player.team);
    G.phase = 'post'; G.phaseT = TIMES.post;
    G.agents.forEach(a => { a.planting = a.defusing = false; });
    const matchOver = G.score[0] >= WIN_AT || G.score[1] >= WIN_AT || G.round >= MAX_ROUNDS;
    if (matchOver) { G.matchOver = true; G.phaseT = 4; }
    else if (G.round === HALF) { G.halftime = true; G.phaseT = 6; setTimeout(() => UI.center('HALFTIME', 'Switching sides…', 3000), 2000); }
  }

  function afterPost() {
    if (G.matchOver) { G.matchOver = false; G.phase = 'over'; UI.endScreen(); return; }
    if (G.halftime) {
      G.halftime = false;
      for (const a of G.agents) {
        a.team = a.team === 'T' ? 'CT' : 'T';
        a.alive = false; a.money = ECON.start; a.buildModel(G.scene);
        if (a.isBot) a.brain.role = '';
      }
      G.lossStreak = [0, 0]; G.roundInHalf = 0; G.playerTeam = G.player.team;
      UI.killfeedClear();
    }
    G.round++; G.roundInHalf++;
    M.startRound();
  }

  /* ------------------------------ Update ----------------------------- */
  M.update = dt => {
    G.phaseT -= dt;
    if (G.phase === 'freeze' && G.phaseT <= 0) {
      G.phase = 'live'; G.phaseT = TIMES.round; G.liveStart = G.time;
      UI.center('', 'GO!', 900);
    } else if (G.phase === 'live' && G.phaseT <= 0) endRound('CT', 'time');
    else if (G.phase === 'post' && G.phaseT <= 0) { afterPost(); G.frame++; return; }
    updateBomb(dt);
    updateDrops(dt);
    // Reset plant/defuse progress for anyone who let go this frame
    for (const a of G.agents) {
      if (a._plantFrame !== G.frame) { a.planting = false; a.plantProg = 0; }
      if (a._defuseFrame !== G.frame) { a.defusing = false; a.defuseProg = 0; }
      if (a.flashT > 0) a.flashT = Math.max(0, a.flashT - dt);
    }
    separateAgents(dt);
    if (G.frame % 10 === 0) playerSpotting();
    G.frame++; // after the hold checks: holds registered this frame used the old value
  };
  /** Keep agents from overlapping (soft push). */
  function separateAgents(dt) {
    const A = G.agents;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const a = A[i], b = A[j];
      if (!a.alive || !b.alive || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-4) {
        const push = (0.75 - d) * 6 / d;
        a.vel.x -= dx * push * dt * 10; a.vel.z -= dz * push * dt * 10;
        b.vel.x += dx * push * dt * 10; b.vel.z += dz * push * dt * 10;
      }
    }
  }
  /** Enemies the human can see are revealed on the team radar. */
  function playerSpotting() {
    const p = G.player; if (!p.alive) return;
    p.eye(eyeP); dirFromAngles(p.yaw, p.pitch, v);
    for (const e of G.agents) {
      if (!e.alive || e.team === p.team) continue;
      e.eye(eyeE); eyeE.y -= 0.3;
      const to = eyeE.clone().sub(eyeP), d = to.length(); to.divideScalar(d);
      if (to.dot(v) < 0.55 || d > 120) continue;
      if (losClear(eyeP, eyeE) && !Smokes.blocks(eyeP, eyeE)) { e.spottedBy = e.spottedBy || {}; e.spottedBy[p.team] = G.time + 1.5; }
    }
  }

  /* ----------------------------- Spectating ---------------------------- */
  M.nextSpec = () => {
    const list = G.agents.filter(a => a.alive && a.team === G.player.team && a !== G.player);
    const pool = list.length ? list : G.agents.filter(a => a.alive);
    if (!pool.length) { M.specTarget = null; return; }
    const i = pool.indexOf(M.specTarget);
    M.specTarget = pool[(i + 1) % pool.length];
  };
  M.buyAllowed = a => {
    if (!a.alive) return false;
    const inTime = G.phase === 'freeze' || (G.phase === 'live' && G.time - G.liveStart < ECON.buyTime);
    const f = World.charAt(a.pos.x, a.pos.z), zone = a.team === 'T' ? 'T' : 'S';
    return inTime && f === zone;
  };
  return M;
})();
