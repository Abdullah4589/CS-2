
/* =============================== BOTS ============================== */
/* Goal-driven state machine: buy -> travel (A* over tiles) -> hold / plant / defuse,
   with a combat layer (vision + reaction + aim error + recoil control) and hearing. */
const BOT_NAMES = [['Viper', 'Rook', 'Jackal', 'Sable'], ['Falcon', 'Bishop', 'Maverick', 'Sentry', 'Hawk']];

const Bots = (() => {
  const B = {};
  const eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3(), tmp = new THREE.Vector3();
  const diff = () => DIFFICULTY[G.difficulty];

  B.init = bot => {
    bot.brain = { path: null, pi: 0, goalKey: '', goal: null, target: null, reactT: 0, errY: 0, errP: 0, aimHead: false,
      lastSeen: null, lastSeenT: -99, heard: null, thinkT: 0, visT: 0, stuckT: 0, lastPos: new THREE.Vector3(),
      strafe: 1, strafeT: 0, burst: 0, pauseT: 0, wp: [], wpi: 0, hold: null, delay: 0, role: '', utilDone: false, nadeCd: 0, trigger: false };
  };

  /* ------------------------------ Buying ------------------------------ */
  B.buy = (bot, teamEco) => {
    const T = bot.team === 'T', pistolRound = G.roundInHalf === 1;
    const tryBuy = id => buyItem(bot, id) === '';
    if (pistolRound) {
      if (Math.random() < 0.5) tryBuy('vest'); else { tryBuy('flash'); tryBuy(T ? 'he' : 'smoke'); }
      if (!T && Math.random() < 0.3) tryBuy('kit');
      return;
    }
    if (teamEco && bot.money < 4600) { if (bot.money > 1500 && Math.random() < 0.4) tryBuy('deagle'); return; }
    if (!bot.slots[1]) {
      const rifle = T ? 'ak47' : 'm4a4', cheap = T ? 'galil' : 'famas', smg = T ? 'mac10' : 'mp9';
      const teamHasAwp = G.agents.some(a => a.team === bot.team && a.slots[1] && a.slots[1].id === 'awp');
      if (bot.money >= 5750 && !teamHasAwp && Math.random() < 0.3) tryBuy('awp');
      else if (bot.money >= WEAPONS[rifle].price + 1000) tryBuy(rifle);
      else if (bot.money >= WEAPONS[cheap].price + 650) tryBuy(cheap);
      else if (bot.money >= 1700) tryBuy(Math.random() < 0.7 ? smg : 'nova');
    }
    if (bot.money >= 1000) tryBuy('vesthelm'); else if (bot.money >= 650 && bot.armor < 50) tryBuy('vest');
    if (!T && bot.money >= 400 && Math.random() < 0.7) tryBuy('kit');
    const nades = T ? ['smoke', 'flash', 'molotov', 'he'] : ['smoke', 'flash', 'incgrenade', 'he'];
    for (const n of nades) if (bot.money >= 900 && Math.random() < 0.6) tryBuy(n);
  };

  /* --------------------------- Round planning -------------------------- */
  B.roundStart = () => {
    const site = Math.random() < 0.5 ? 'A' : 'B';
    G.tPlan = { site, route: randi(0, SPOTS.ROUTES[site].length - 1) };
    G.intel = { A: -99, B: -99 };
    const cts = G.agents.filter(a => a.team === 'CT');
    const roles = ['A', 'B', 'A', 'B', 'MID'];
    // shuffle so the human's slot is random-ish
    cts.forEach((a, i) => { if (a.isBot) a.brain.role = roles[(i + G.round) % roles.length]; });
    const holdCount = { A: 0, B: 0, MID: 0 };
    for (const a of G.agents) {
      if (!a.isBot) continue;
      const br = a.brain;
      Object.assign(br, { path: null, pi: 0, goalKey: '', target: null, lastSeen: null, heard: null, wp: [], wpi: 0, hold: null,
        delay: rand(0, 3.5), utilDone: false, nadeCd: rand(5, 15), trigger: false, stuckT: 0 });
      if (a.team === 'CT') {
        const list = SPOTS.CT_HOLD[br.role];
        br.hold = list[holdCount[br.role]++ % list.length];
      } else {
        const route = SPOTS.ROUTES[site][Math.random() < 0.75 ? G.tPlan.route : randi(0, SPOTS.ROUTES[site].length - 1)];
        br.wp = route.slice();
        br.hold = choice(SPOTS.T_HOLD[site]);
      }
    }
  };

  /* ------------------------------ Hearing ------------------------------ */
  B.noise = (src, pos, radius) => {
    if (G.phase === 'freeze' || !G.agents) return;
    for (const b of G.agents) {
      if (!b.isBot || !b.alive || b.team === src.team) continue;
      const d = dist2D(b.pos.x, b.pos.z, pos.x, pos.z);
      if (d < radius * diff().hear && (!b.brain.target || !b.brain.visible)) {
        b.brain.heard = { x: pos.x, y: pos.y + 1.2, z: pos.z, t: G.time };
        if (b.team === 'CT') { const s = siteNear(pos); if (s) G.intel[s] = G.time; }
      }
    }
  };
  B.onDamaged = (bot, attacker) => {
    if (attacker.team === bot.team) return; // stray teammate shots aren't a threat to investigate
    const br = bot.brain;
    if (!br.visible) { br.heard = { x: attacker.pos.x, y: attacker.pos.y + 1.4, z: attacker.pos.z, t: G.time }; br.reactT = Math.max(br.reactT, 0.1); }
  };
  function siteNear(p) {
    const n = calloutAt(p.x, p.z);
    return n === 'A Site' || n === 'Long A' || n === 'Catwalk' ? 'A' : n === 'B Site' || n === 'Tunnels' || n === 'B Window' ? 'B' : '';
  }

  /* ------------------------------ Vision ------------------------------- */
  function canSee(bot, enemy) {
    if (bot.flashT > 0.4) return false;
    bot.eye(eyeA);
    const d = dist2D(bot.pos.x, bot.pos.z, enemy.pos.x, enemy.pos.z);
    if (d > 110) return false;
    const a = anglesTo(eyeA.x, eyeA.y, eyeA.z, enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z);
    const fov = bot.brain.target === enemy ? 1.6 : 1.05; // wider when already tracking
    if (Math.abs(wrapAngle(a.yaw - bot.yaw)) > fov && d > 2.5) return false;
    // check head then chest
    for (const h of [enemy.eyeH(), enemy.eyeH() * 0.7]) {
      eyeB.set(enemy.pos.x, enemy.pos.y + h, enemy.pos.z);
      if (losClear(eyeA, eyeB) && !Smokes.blocks(eyeA, eyeB)) return true;
    }
    return false;
  }

  const RANGE = { pistol: 32, smg: 38, shotgun: 16, rifle: 75, sniper: 120 };
  const effectiveRange = def => RANGE[def.type] || 3;

  /* ---------------------------- Navigation ----------------------------- */
  function setGoal(bot, c, r, key) {
    const br = bot.brain;
    if (br.goalKey === key && br.path) return;
    br.goalKey = key; br.goal = { c, r };
    const sc = World.tc(bot.pos.x), sr = World.tr(bot.pos.z);
    br.path = findPath(World.walkable(sc, sr) ? sc : clamp(sc, 0, GRID_W - 1), sr, c, r) || null;
    br.pi = 1;
  }
  /** Direction to walk along the current path (with look-ahead smoothing). */
  function pathDir(bot) {
    const br = bot.brain, p = br.path;
    if (!p || br.pi >= p.length) return null;
    // skip ahead while the next-next node is directly reachable
    while (br.pi + 1 < p.length && straightWalkable(bot.pos, p[br.pi + 1])) br.pi++;
    const [c, r] = p[br.pi];
    const tx = World.cx(c), tz = World.cz(r);
    const d = dist2D(bot.pos.x, bot.pos.z, tx, tz);
    if (d < (br.pi === p.length - 1 ? 0.6 : 1.3)) { br.pi++; return pathDir(bot); }
    return { x: (tx - bot.pos.x) / d, z: (tz - bot.pos.z) / d, d };
  }
  function straightWalkable(pos, node) {
    const tx = World.cx(node[0]), tz = World.cz(node[1]);
    const len = dist2D(pos.x, pos.z, tx, tz), n = Math.ceil(len / 0.7);
    if (len > 14) return false;
    let prevTop = World.top(World.tc(pos.x), World.tr(pos.z));
    for (let i = 1; i <= n; i++) {
      const x = lerp(pos.x, tx, i / n), z = lerp(pos.z, tz, i / n);
      for (const [ox, oz] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) {
        const c = World.tc(x + ox), r = World.tr(z + oz);
        if (!World.walkable(c, r)) return false;
        if (World.top(c, r) - prevTop > STEP_H) return false;
      }
      prevTop = World.top(World.tc(x), World.tr(z));
    }
    return true;
  }
  const atTile = (bot, c, r, rad = 1.2) => dist2D(bot.pos.x, bot.pos.z, World.cx(c), World.cz(r)) < rad;

  /* ----------------------------- Decisions ----------------------------- */
  /** Returns {c, r, key, look, act} describing what the bot wants to do this moment. */
  function decide(bot) {
    const br = bot.brain, bomb = G.bomb;
    if (bot.team === 'T') {
      if (bomb.state === 'planted') {
        const spot = br.postHold || (br.postHold = choice(SPOTS.T_HOLD[bomb.site]));
        return { c: spot.p[0], r: spot.p[1], key: 'post', look: spot.l };
      }
      if (bomb.state === 'dropped') {
        const nearest = G.agents.filter(a => a.alive && a.team === 'T').sort((a, b) => a.pos.distanceTo(bomb.pos) - b.pos.distanceTo(bomb.pos))[0];
        if (nearest === bot) return { c: World.tc(bomb.pos.x), r: World.tr(bomb.pos.z), key: 'bomb' + Math.round(bomb.pos.x), look: null, act: 'pickup' };
      }
      if (br.wpi < br.wp.length) {
        const [c, r] = br.wp[br.wpi];
        if (atTile(bot, c, r, 2.2)) { br.wpi++; return decide(bot); }
        return { c, r, key: 'wp' + br.wpi, look: null };
      }
      if (bot.hasBomb()) {
        const site = G.tPlan.site;
        const ps = br.plantSpot || (br.plantSpot = choice(SPOTS.PLANT[site]));
        return { c: ps[0], r: ps[1], key: 'plant', look: null, act: 'plant' };
      }
      return { c: br.hold.p[0], r: br.hold.p[1], key: 'hold', look: br.hold.l };
    }
    // CT
    if (bomb.state === 'planted') {
      const defuser = G.agents.filter(a => a.alive && a.team === 'CT' && a.isBot)
        .sort((a, b) => a.pos.distanceTo(bomb.pos) - b.pos.distanceTo(bomb.pos))[0];
      if (defuser === bot) return { c: World.tc(bomb.pos.x), r: World.tr(bomb.pos.z), key: 'defuse', look: null, act: 'defuse' };
      const list = SPOTS.CT_HOLD[bomb.site];
      const h = br.retake || (br.retake = choice(list));
      return { c: h.p[0], r: h.p[1], key: 'retake', look: h.l };
    }
    // rotate when a site has fresh contact and we're the flexible role
    if (br.role === 'MID') for (const s of ['A', 'B']) if (G.time - G.intel[s] < 8) {
      const h = br.rot || (br.rot = choice(SPOTS.CT_HOLD[s]));
      return { c: h.p[0], r: h.p[1], key: 'rot' + s, look: h.l };
    }
    return { c: br.hold.p[0], r: br.hold.p[1], key: 'hold', look: br.hold.l };
  }

  /* ------------------------------ Update ------------------------------- */
  B.update = (bot, dt) => {
    const br = bot.brain, d = diff();
    bot.walking = false; bot.crouching = false;
    let wish = null, jump = false;
    if (G.phase === 'freeze' || G.phase === 'over') { bot.move(dt, 0, 0, false); return; }

    // --- perception (throttled) ---
    br.visT -= dt;
    if (br.visT <= 0) {
      br.visT = 0.12;
      let best = null, bestD = 1e9;
      for (const e of G.agents) {
        if (!e.alive || e.team === bot.team) continue;
        if (!canSee(bot, e)) continue;
        e.spottedBy = e.spottedBy || {}; e.spottedBy[bot.team] = G.time + 1.5;
        // only engage within the current weapon's effective range; farther enemies are just called out
        if (bot.pos.distanceTo(e.pos) > effectiveRange(bot.gun().def)) continue;
        const dd = bot.pos.distanceTo(e.pos) - (e === br.target ? 5 : 0);
        if (dd < bestD) { bestD = dd; best = e; }
      }
      if (best && best !== br.target) {
        const wasTracking = br.target && G.time - br.lastSeenT < 1;
        br.target = best;
        br.reactT = wasTracking ? d.react * 0.4 : d.react * rand(0.8, 1.35) + (bot.flashT > 0 ? 0.3 : 0);
        br.errY = (Math.random() - 0.5) * 2 * d.aimErr * DEG * 2.2;
        br.errP = (Math.random() - 0.5) * 2 * d.aimErr * DEG * 1.4 + d.aimErr * DEG * 0.8;
        br.aimHead = Math.random() < d.hsChance;
        br.burst = 0;
      }
      br.visible = !!best;
      if (!best && br.target && !br.target.alive) br.target = null;
      if (best) { br.lastSeen = best.pos.clone(); br.lastSeenT = G.time; if (bot.team === 'CT') { const s = siteNear(best.pos); if (s) G.intel[s] = G.time; } }
      else if (br.target && G.time - br.lastSeenT > 3) br.target = null;
    }
    br.reactT -= dt;
    const gun = bot.gun();

    // --- weapon management ---
    if (bot.cur === 4 || bot.cur === 5 || bot.cur === 3) { if (!bot.switchTo(bot.slots[1] ? 1 : 2)) {} }
    if (!br.visible && gun.def.mag && gun.mag < gun.def.mag * 0.35 && gun.reserve > 0) startReload(bot);
    if (bot.slots[1] && bot.cur === 2 && !br.visible) bot.switchTo(1);
    if (gun.def.mag && gun.mag === 0 && gun.reserve === 0 && bot.cur === 1) bot.switchTo(2);

    // --- combat ---
    if (br.visible && br.target && br.target.alive) {
      const t = br.target;
      bot.eye(eyeA);
      const aimY = t.pos.y + (br.aimHead ? t.eyeH() + 0.02 : t.eyeH() * 0.72);
      const a = anglesTo(eyeA.x, eyeA.y, eyeA.z, t.pos.x, aimY, t.pos.z);
      br.errY *= Math.exp(-dt * 1.6); br.errP *= Math.exp(-dt * 1.6);
      const [px, py] = gun.punch();
      const wantYaw = a.yaw + br.errY + px * DEG * d.spray;
      const wantPitch = a.pitch + br.errP - py * DEG * d.spray;
      const k = Math.min(1, dt * d.turn * (bot.flashT > 0 ? 0.3 : 1));
      bot.yaw = wrapAngle(bot.yaw + wrapAngle(wantYaw - bot.yaw) * k);
      bot.pitch += (wantPitch - bot.pitch) * k;
      const dist = bot.pos.distanceTo(t.pos);
      const err = Math.hypot(wrapAngle(wantYaw - bot.yaw), wantPitch - bot.pitch);
      const tol = Math.atan2(0.35, dist) + 0.01;
      // AWP: scope up when target is far
      if (gun.def.scope) gun.scope = dist > 8 ? 1 : 0;
      // movement while fighting: stop at range for accuracy, strafe up close / with pistols
      const closeFight = dist < 9 || gun.def.type === 'pistol' || gun.def.type === 'smg';
      // alternate strafe / counter-strafe-and-shoot phases
      br.strafeT -= dt;
      if (br.strafeT <= 0) {
        br.strafing = !br.strafing;
        if (br.strafing) br.strafe = -br.strafe;
        br.strafeT = br.strafing ? rand(0.3, 0.6) : rand(0.3, 0.6);
      }
      if (closeFight && br.strafing) wish = { x: Math.cos(bot.yaw) * br.strafe, z: -Math.sin(bot.yaw) * br.strafe };
      if (!closeFight && G.difficulty === 'hard' && br.burst > 2 && gun.def.auto) bot.crouching = true;
      if (br.pauseT > 0) br.pauseT -= dt;
      const moving = Math.hypot(bot.vel.x, bot.vel.z) > bot.maxSpeed() * 0.4;
      const burstLimit = dist > 25 ? 3 : dist > 14 ? Math.max(4, d.burst - 3) : d.burst + 10;
      const blocked = teammateInLine(bot, dist);
      // Hold fire and side-step to clear the line instead of shooting through a teammate
      if (blocked) wish = { x: Math.cos(bot.yaw) * br.strafe, z: -Math.sin(bot.yaw) * br.strafe };
      if (!blocked && br.reactT <= 0 && err < tol * (gun.def.type === 'sniper' ? 1 : 2.2) && br.pauseT <= 0 && !gun.reloading) {
        const moveOk = gun.def.type === 'pistol' || gun.def.type === 'smg' || gun.def.type === 'shotgun';
        if (!moving || moveOk) {
          if (fireGun(bot, G.time)) {
            br.burst++;
            if (!gun.def.auto) br.pauseT = gun.def.type === 'sniper' ? 0.5 : rand(0.12, 0.3);
            if (br.burst >= burstLimit) { br.burst = 0; br.pauseT = rand(0.25, 0.5); }
          }
        } else if (wish) { /* stop to shoot next tick */ wish = null; }
      }
      bot.move(dt, wish ? wish.x : 0, wish ? wish.z : 0, false);
      return;
    }
    br.burst = 0;
    if (gun.scope && !br.visible) gun.scope = 0;

    // --- utility usage ---
    br.nadeCd -= dt;
    if (bot.nades.length && br.nadeCd <= 0) tryUtility(bot);

    // --- objectives & travel ---
    br.thinkT -= dt;
    if (G.time - G.liveStart < br.delay && bot.team === 'T') { idleLook(bot, dt, null); bot.move(dt, 0, 0, false); return; }
    const goal = decide(bot);
    setGoal(bot, goal.c, goal.r, goal.key);
    const pd = pathDir(bot);
    const heardRecent = br.heard && G.time - br.heard.t < 4;
    const lastSeenRecent = br.lastSeen && G.time - br.lastSeenT < 4;

    if (pd) {
      wish = pd;
      // walk silently when close to enemies we heard
      if (heardRecent && dist2D(bot.pos.x, bot.pos.z, br.heard.x, br.heard.z) < 18) bot.walking = true;
      const lookAt = lastSeenRecent ? br.lastSeen : heardRecent ? br.heard : null;
      if (lookAt) faceTowards(bot, lookAt.x, (lookAt.y || 1.4), lookAt.z, dt, 5);
      else faceTowards(bot, bot.pos.x + pd.x * 5, bot.pos.y + bot.eyeH(), bot.pos.z + pd.z * 5, dt, 6);
      // stuck detection
      br.stuckT += dt;
      if (br.stuckT > 0.8) {
        if (br.lastPos.distanceTo(bot.pos) < 0.35) { jump = true; br.goalKey = ''; }
        br.lastPos.copy(bot.pos); br.stuckT = 0;
      }
    } else {
      // arrived: act on objective or hold an angle
      if (goal.act === 'plant' && bot.hasBomb()) { Game.holdPlant(bot, dt); }
      else if (goal.act === 'pickup') wish = dirTo(bot, G.bomb.pos);
      else if (goal.act === 'defuse' && G.bomb.state === 'planted') {
        if (bot.pos.distanceTo(G.bomb.pos) < 1.6) Game.holdDefuse(bot, dt);
        else wish = dirTo(bot, G.bomb.pos);
      }
      const look = heardRecent ? br.heard : lastSeenRecent ? br.lastSeen : goal.look ? { x: World.cx(goal.look[0]), y: 1.5, z: World.cz(goal.look[1]) } : null;
      idleLook(bot, dt, look);
      if (!goal.act && heardRecent && bot.team === 'T' && G.bomb.state !== 'planted' && Math.random() < 0.002) br.goalKey = '';
    }
    bot.move(dt, wish ? wish.x : 0, wish ? wish.z : 0, jump);
  };

  /** Would a shot along the bot's current aim hit a teammate before reaching `maxDist`? */
  function teammateInLine(bot, maxDist) {
    const hx = -Math.sin(bot.yaw), hz = -Math.cos(bot.yaw); // horizontal aim direction
    return G.agents.some(m => {
      if (m === bot || !m.alive || m.team !== bot.team) return false;
      const t = (m.pos.x - bot.pos.x) * hx + (m.pos.z - bot.pos.z) * hz; // distance along the aim line
      if (t <= 0 || t >= maxDist) return false;
      // 0.6m lateral margin covers the teammate's body width plus spray
      return dist2D(m.pos.x, m.pos.z, bot.pos.x + hx * t, bot.pos.z + hz * t) < 0.6;
    });
  }
  function dirTo(bot, p) {
    const x = p.x - bot.pos.x, z = p.z - bot.pos.z, l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l };
  }
  function faceTowards(bot, x, y, z, dt, speed) {
    bot.eye(eyeA);
    const a = anglesTo(eyeA.x, eyeA.y, eyeA.z, x, y, z);
    const k = Math.min(1, dt * speed);
    bot.yaw = wrapAngle(bot.yaw + wrapAngle(a.yaw - bot.yaw) * k);
    bot.pitch += (clamp(a.pitch, -0.6, 0.6) - bot.pitch) * k;
  }
  function idleLook(bot, dt, look) {
    if (look) faceTowards(bot, look.x, look.y || 1.5, look.z, dt, 4);
    else { bot.pitch *= 0.95; bot.yaw = wrapAngle(bot.yaw + Math.sin(G.time * 0.7 + bot.id) * dt * 0.3); }
  }

  /** Throw utility: T bots at site entrances when executing, CTs at heard enemies. */
  function tryUtility(bot) {
    const br = bot.brain;
    let target = null;
    if (bot.team === 'T' && !br.utilDone && G.bomb.state !== 'planted' && br.wpi >= br.wp.length - 1) {
      const site = G.tPlan.site;
      const u = choice(SPOTS.UTIL[site]);
      const p = World.spot(u[0], u[1]);
      if (dist2D(bot.pos.x, bot.pos.z, p.x, p.z) < 26) { target = p; br.utilDone = true; }
    } else if (bot.team === 'CT' && br.heard && G.time - br.heard.t < 2) {
      const dd = dist2D(bot.pos.x, bot.pos.z, br.heard.x, br.heard.z);
      if (dd > 7 && dd < 26) target = new THREE.Vector3(br.heard.x, 0, br.heard.z);
    }
    if (!target) return;
    bot.eye(eyeA);
    tmp.set(target.x, 1.5, target.z);
    if (!losClear(eyeA, tmp)) { br.nadeCd = 2; return; }
    const pref = bot.team === 'T' ? ['smoke', 'flash', 'molotov', 'he'] : ['incgrenade', 'he', 'flash', 'smoke'];
    const id = pref.find(n => bot.nades.includes(n));
    if (!id) return;
    const dd = dist2D(bot.pos.x, bot.pos.z, target.x, target.z);
    bot.yaw = anglesTo(bot.pos.x, 0, bot.pos.z, target.x, 0, target.z).yaw;
    bot.pitch = clamp(0.08 + dd * 0.011, 0.1, 0.55);
    Grenades.throwFrom(bot, id, 1);
    br.nadeCd = rand(8, 16);
  }
  return B;
})();
