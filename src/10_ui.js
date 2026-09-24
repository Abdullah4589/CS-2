
/* ================================ UI =============================== */
const UI = (() => {
  const U = {};
  const cache = {};
  const set = (id, prop, val) => { const k = id + prop; if (cache[k] === val) return; cache[k] = val; const el = $(id); if (prop === 'text') el.textContent = val; else if (prop === 'html') el.innerHTML = val; else el.style[prop] = val; };
  const toggle = (id, show) => { const k = id + 'vis'; if (cache[k] === show) return; cache[k] = show; $(id).classList.toggle('hidden', !show); };
  let centerTimer = 0, hitT = 0, hurtT = 0, radarBg = null;
  const RADAR_SCALE = 3; // px per metre in the pre-rendered map
  U.crossSpread = 0;

  U.show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  U.isOpen = id => !$(id).classList.contains('hidden');

  /* ----------------------------- Crosshair ----------------------------- */
  U.drawCrosshair = (cv, ch, spread = 0) => {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    g.clearRect(0, 0, W, H);
    const t = ch.thick, s = ch.size, gap = ch.gap + spread;
    const rects = [[cx - t / 2, cy - gap - s, t, s], [cx - t / 2, cy + gap, t, s], [cx - gap - s, cy - t / 2, s, t], [cx + gap, cy - t / 2, s, t]];
    if (ch.dot) rects.push([cx - t / 2, cy - t / 2, t, t]);
    g.fillStyle = 'rgba(0,0,0,.8)';
    rects.forEach(([x, y, w, h]) => g.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, h + 2));
    g.fillStyle = ch.color;
    rects.forEach(([x, y, w, h]) => g.fillRect(Math.round(x), Math.round(y), w, h));
  };

  /* ------------------------------ Radar ------------------------------- */
  function buildRadarBg() {
    const W = GRID_W * TILE * RADAR_SCALE, c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d'), ts = TILE * RADAR_SCALE;
    for (let r = 0; r < GRID_H; r++) for (let col = 0; col < GRID_W; col++) {
      const ch = World.at(col, r); if (ch === '#') continue;
      const f = (ch === 'c' || ch === 'C') ? (World.under[r * GRID_W + col] || '.') : ch;
      g.fillStyle = ch === 'c' || ch === 'C' ? '#4a3d2c' : f === 'A' || f === 'B' ? '#7a5a4a' : f === 'u' ? '#4f4a42' : '1234'.includes(ch) ? '#8a8578' : '#6f6552';
      g.fillRect(col * ts, r * ts, ts + 0.5, ts + 0.5);
    }
    g.font = 'bold 40px Segoe UI, sans-serif'; g.fillStyle = 'rgba(255,90,80,.8)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of ['A', 'B']) { const [c0, r0] = SPOTS.CENTER[s]; g.fillText(s, (c0 + 0.5) * ts, (r0 + 0.5) * ts); }
    return c;
  }
  const rx = x => (x + GRID_W * TILE / 2) * RADAR_SCALE, rz = z => (z + GRID_H * TILE / 2) * RADAR_SCALE;
  function drawRadar() {
    const cv = $('radar'), g = cv.getContext('2d'), W = cv.width, R = W / 2;
    const me = G.player.alive ? G.player : (Game.specTarget || G.player);
    if (!radarBg) radarBg = buildRadarBg();
    g.clearRect(0, 0, W, W);
    g.save(); g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.clip();
    g.fillStyle = 'rgba(10,12,16,.65)'; g.fillRect(0, 0, W, W);
    g.translate(R, R); g.rotate(me.yaw); g.scale(0.9, 0.9);
    g.translate(-rx(me.pos.x), -rz(me.pos.z));
    g.globalAlpha = 0.9; g.drawImage(radarBg, 0, 0); g.globalAlpha = 1;
    const dot = (x, z, col, r = 7, ring) => {
      g.beginPath(); g.arc(rx(x), rz(z), r, 0, 7); g.fillStyle = col; g.fill();
      g.lineWidth = 2; g.strokeStyle = ring || 'rgba(0,0,0,.8)'; g.stroke();
    };
    const myTeam = G.player.team;
    // bomb
    const b = G.bomb;
    if (b.state === 'planted' || (b.state === 'dropped' && myTeam === 'T')) {
      g.fillStyle = b.state === 'planted' && Math.floor(G.time * 3) % 2 ? '#ff2a2a' : '#ff7b2a';
      g.fillRect(rx(b.pos.x) - 8, rz(b.pos.z) - 6, 16, 12);
    }
    for (const a of G.agents) {
      if (!a.alive || a === me) continue;
      if (a.team === myTeam) dot(a.pos.x, a.pos.z, a.team === 'T' ? '#e2a94f' : '#5da2f0', 7, a.hasBomb() ? '#ff3030' : null);
      else if ((a.spottedBy && a.spottedBy[myTeam] > G.time) || a.spottedUntil > G.time) dot(a.pos.x, a.pos.z, '#e5484d', 7);
    }
    g.restore();
    // self arrow (always centre, pointing up)
    g.save(); g.translate(R, R);
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '11px Segoe UI'; g.textAlign = 'center';
    g.fillText(calloutAt(me.pos.x, me.pos.z), R, W - 14);
  }

  /* -------------------------------- HUD -------------------------------- */
  U.roundStart = () => {
    U.center(`ROUND ${G.round}`, G.roundInHalf === 1 ? 'Pistol round — buy phase (B)' : 'Buy phase — press B to open the buy menu', 3000);
    U.refreshSlots();
  };
  U.center = (big, small, ms = 2500, color = '#fff') => {
    $('cm-big').textContent = big; $('cm-small').textContent = small; $('cm-big').style.color = color;
    $('center-msg').style.opacity = 1;
    clearTimeout(centerTimer); centerTimer = setTimeout(() => $('center-msg').style.opacity = 0, ms);
  };
  U.moneyFlash = amt => {
    const el = $('money'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };
  U.hitMarker = hs => { const h = $('hitmarker'); h.classList.toggle('hs', !!hs); h.style.opacity = 1; hitT = 0.18; };
  U.hurt = (dmg, attacker) => {
    hurtT = Math.min(0.7, 0.2 + dmg / 60);
    G.shake = Math.max(G.shake, Math.min(0.15, dmg / 300));
    if (!attacker || attacker === G.player) return;
    const p = G.player, a = anglesTo(p.pos.x, 0, p.pos.z, attacker.pos.x, 0, attacker.pos.z).yaw - p.yaw;
    const el = document.createElement('div'); el.className = 'dmgarc';
    el.style.transform = `rotate(${-a}rad)`;
    $('dmgind').appendChild(el);
    setTimeout(() => el.style.opacity = 0, 600); setTimeout(() => el.remove(), 1600);
  };
  U.flash = () => { /* overlay intensity is driven from player.flashT each frame */ };
  U.killfeed = (att, vic, weapon, hs) => {
    const el = document.createElement('div'); el.className = 'kf';
    const col = a => a.team === 'T' ? 'var(--t)' : 'var(--ct)';
    if (att === G.player || vic === G.player) el.classList.add('mine');
    el.innerHTML = (att && att !== vic ? `<span style="color:${col(att)}">${att.name}</span>` : '') +
      `<span class="w">${weapon}</span>` + (hs ? '<span class="hs">◉ HS</span>' : '') + `<span style="color:${col(vic)}">${vic.name}</span>`;
    const kf = $('killfeed'); kf.appendChild(el);
    while (kf.children.length > 6) kf.firstChild.remove();
    setTimeout(() => el.remove(), 7000);
  };
  U.killfeedClear = () => { $('killfeed').innerHTML = ''; };
  U.refreshSlots = () => { cache.slotsKey = null; };

  function aliveBars(team) {
    return G.agents.filter(a => a.team === team).map(a => `<i class="${a.alive ? '' : 'dead'}"></i>`).join('');
  }
  U.update = dt => {
    const p = G.player, view = p.alive ? p : (Game.specTarget || p);
    const g = view.gun();
    set('hp-val', 'text', String(Math.max(0, Math.round(view.hp))));
    $('hp-val').classList.toggle('low', view.hp > 0 && view.hp <= 25);
    set('armor-val', 'text', String(view.armor));
    set('armor-helm', 'text', view.helmet ? 'HELMET' : '');
    set('money', 'text', '$' + p.money);
    set('weapon-name', 'text', g.def.name + (g.reloading ? ' · RELOADING' : ''));
    set('ammo-mag', 'text', g.def.mag ? String(g.mag) : g.def.type === 'grenade' ? String(view.nades.filter(n => n === g.id).length) : '—');
    set('ammo-res', 'text', g.def.mag ? '/ ' + g.reserve : '');
    $('ammo-mag').style.color = g.def.mag && g.mag <= g.def.mag * 0.2 ? '#e5484d' : '';
    // weapon slots list
    const key = [1, 2, 3, 4, 5].map(s => s === 4 ? view.nades.join(',') : (view.slots[s] ? view.slots[s].id : '')).join('|') + view.cur + view.nadeIdx;
    if (cache.slotsKey !== key) {
      cache.slotsKey = key;
      const rows = [];
      if (view.slots[1]) rows.push([1, view.slots[1].def.name]);
      if (view.slots[2]) rows.push([2, view.slots[2].def.name]);
      rows.push([3, 'Knife']);
      if (view.nades.length) rows.push([4, view.nades.map(n => WEAPONS[n].name.split(' ')[0]).join(' · ')]);
      if (view.slots[5]) rows.push([5, 'C4']);
      $('slots').innerHTML = rows.map(([s, n]) => `<div class="${view.cur === s ? 'on' : ''}">${s} ${n}</div>`).join('');
    }
    // score / timer (left = T, right = CT)
    const tSquad = G.agents.find(a => a.team === 'T').squad;
    set('score-left', 'text', String(G.score[tSquad])); set('score-right', 'text', String(G.score[1 - tSquad]));
    set('alive-left', 'html', aliveBars('T')); set('alive-right', 'html', aliveBars('CT'));
    set('roundnum', 'text', `ROUND ${G.round}/${MAX_ROUNDS}`);
    const planted = G.bomb.state === 'planted';
    toggle('bomb-planted', planted); toggle('timer', !planted);
    set('timer', 'text', G.phase === 'post' || G.phase === 'over' ? '0:00' : fmtTime(G.phaseT));
    $('timer').classList.toggle('red', G.phase === 'freeze' || (G.phase === 'live' && G.phaseT < 10));
    toggle('bomb-carry', p.alive && p.hasBomb());
    toggle('buyzone-ico', Game.buyAllowed(p));
    // hints & progress
    let hint = '';
    if (p.alive) {
      if (p.hasBomb() && Game.onSite(p) && G.phase === 'live') hint = 'Hold <b>E</b> to plant the bomb (switch to C4: <b>5</b>)';
      else if (p.team === 'CT' && planted && p.pos.distanceTo(G.bomb.pos) < 1.8) hint = `Hold <b>E</b> to defuse${p.kit ? ' (kit: 5s)' : ' (10s — no kit)'}`;
    }
    toggle('hint', !!hint); if (hint) set('hint', 'html', hint);
    const prog = p.planting ? p.plantProg / TIMES.plant : p.defusing ? p.defuseProg / (p.kit ? TIMES.defuseKit : TIMES.defuse) : 0;
    toggle('progress', prog > 0);
    if (prog > 0) { set('progress-label', 'text', p.planting ? 'PLANTING BOMB' : 'DEFUSING BOMB'); $('progress-bar').style.width = (prog * 100).toFixed(1) + '%'; }
    // spectating
    toggle('spectate', !p.alive && !!Game.specTarget);
    if (!p.alive && Game.specTarget) set('spectate', 'html', `Spectating <b>${Game.specTarget.name}</b> · ${Game.specTarget.hp} HP · click to switch`);
    // overlays
    const fl = p.alive ? clamp(p.flashT / 1.6, 0, 1) : 0;
    $('flash').style.opacity = fl.toFixed(3);
    hurtT = Math.max(0, hurtT - dt); $('hurt').style.opacity = (hurtT * 1.4).toFixed(3);
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hitmarker').style.opacity = 0; }
    toggle('scope', p.alive && !!g.scope);
    // dynamic crosshair gap from current inaccuracy
    const spread = p.alive ? Math.min(14, inaccuracy(p, p.gun()) * 3.5) : 0;
    if (Math.abs(spread - U.crossSpread) > 0.4 || cache.chDirty) {
      U.crossSpread = spread; cache.chDirty = false;
      U.drawCrosshair($('crosshair'), Settings.ch, g.def.type === 'sniper' || g.def.type === 'grenade' || g.def.type === 'knife' ? 0 : Math.round(spread));
    }
    $('crosshair').style.display = p.alive && !g.scope && g.def.type !== 'sniper' ? '' : 'none';
    drawRadar();
  };
  U.markCrosshairDirty = () => { cache.chDirty = true; };

  /* ------------------------------ Buy menu ----------------------------- */
  function tipFor(id) {
    const d = WEAPONS[id];
    if (!d) return `<b>${EQUIPMENT[id].name}</b><div class="st"><span>Price</span><b>$${EQUIPMENT[id].price}</b></div>`;
    if (d.type === 'grenade') {
      const info = { he: 'Up to 98 damage in an 11m radius.', flash: 'Blinds anyone looking at it. Max 2.', smoke: 'Blocks vision for 18s. Bullets thin it briefly.', molotov: 'Burns an area for 7s.', incgrenade: 'Burns an area for 7s.' };
      return `<b>${d.name}</b><br>${info[id]}<div class="st"><span>Price</span><b>$${d.price}</b><span>Kill reward</span><b>$${d.reward}</b></div>`;
    }
    return `<b>${d.name}</b><div class="st">
      <span>Damage</span><b>${d.dmg}${d.pellets ? ' ×' + d.pellets : ''} (HS ${Math.round(d.dmg * 4)})</b>
      <span>Fire rate</span><b>${d.rpm} RPM</b><span>Magazine</span><b>${d.mag} / ${d.reserve}</b>
      <span>Armor pen.</span><b>${Math.round(d.ap * 100)}%</b><span>Move speed</span><b>${d.speed}</b>
      <span>Kill reward</span><b>$${d.reward}</b><span>Wall-bang</span><b>${d.pen >= 1.8 ? 'Good' : d.pen >= 1 ? 'Some' : 'Poor'}</b></div>`;
  }
  U.buildBuyMenu = () => {
    const p = G.player, T = p.team === 'T';
    const cols = [
      ['Pistols', [T ? 'glock' : 'usp', 'deagle']],
      ['SMG / Heavy', [T ? 'mac10' : 'mp9', 'nova']],
      ['Rifles', [T ? 'galil' : 'famas', T ? 'ak47' : 'm4a4', 'awp']],
      ['Grenades', ['flash', 'smoke', 'he', T ? 'molotov' : 'incgrenade']],
      ['Equipment', T ? ['vest', 'vesthelm'] : ['vest', 'vesthelm', 'kit']]
    ];
    $('buy-cols').innerHTML = cols.map(([title, items]) => `<div class="bcol"><h3>${title}</h3>${items.map(id => {
      const d = WEAPONS[id] || EQUIPMENT[id], why = buyCheck(p, id);
      const owned = why === 'Already owned' || why === 'Already equipped' || why === 'Carrying max';
      return `<div class="bitem ${why && !owned ? 'no' : ''} ${owned ? 'owned' : ''}" data-buy="${id}" data-tiphtml="${encodeURIComponent(tipFor(id))}">
        <div class="n">${d.name}</div><div class="p">${owned ? '✓ Owned' : '$' + itemPrice(p, id)}</div></div>`;
    }).join('')}</div>`).join('');
    $('buy-money').textContent = '$' + p.money;
    const left = G.phase === 'freeze' ? G.phaseT + ECON.buyTime : ECON.buyTime - (G.time - G.liveStart);
    $('buy-time').textContent = `Buy time left: ${Math.max(0, Math.ceil(left))}s`;
  };
  U.buyClick = id => {
    const p = G.player;
    if (!Game.buyAllowed(p)) { Sound.error(); U.center('', 'Buy time is over or you left the buy zone', 1500); return; }
    const why = buyItem(p, id);
    if (why) { Sound.error(); U.center('', why, 1200); }
    else { Sound.buy(); Viewmodel.rebuild(); U.refreshSlots(); }
    U.buildBuyMenu();
  };

  /* ----------------------------- Scoreboard ---------------------------- */
  function table(team, showMoney) {
    const rounds = Math.max(1, G.score[0] + G.score[1]);
    const rows = G.agents.filter(a => a.team === team).sort((a, b) => b.stats.score - a.stats.score);
    return `<table class="sb"><tr><th>Player</th>${showMoney ? '<th>Money</th>' : ''}<th>K</th><th>A</th><th>D</th><th>HS%</th><th>ADR</th><th>MVP</th><th>Score</th></tr>` +
      rows.map(a => `<tr class="${a === G.player ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${a.name}${a.hasBomb() && G.player.team === 'T' ? ' 💣' : ''}${a.kit ? ' ✂' : ''}</td>
        ${showMoney ? `<td>$${a.money}</td>` : ''}<td>${a.stats.k}</td><td>${a.stats.a}</td><td>${a.stats.d}</td>
        <td>${a.stats.k > 0 ? Math.round(a.stats.hs / a.stats.k * 100) : 0}%</td><td>${Math.round(a.stats.dmg / rounds)}</td>
        <td class="mvp">${a.stats.mvp ? '★' + a.stats.mvp : ''}</td><td>${a.stats.score}</td></tr>`).join('') + '</table>';
  }
  U.scoreboardHTML = (end) => {
    const my = G.player.team, other = my === 'T' ? 'CT' : 'T';
    const tSquad = G.agents.find(a => a.team === 'T').squad;
    const sc = t => t === 'T' ? G.score[tSquad] : G.score[1 - tSquad];
    const head = t => `<div class="sbhead ${t === 'T' ? 'tcol' : 'ctcol'}"><span>${TEAM_NAME[t].toUpperCase()}</span><span>${sc(t)}</span></div>`;
    return (end ? '' : `<div style="text-align:center;color:var(--dim);font-size:12px;letter-spacing:2px;margin-bottom:6px">ROUND ${G.round} · ${G.difficulty.toUpperCase()} BOTS</div>`) +
      head(my) + table(my, !end) + head(other) + table(other, false);
  };
  U.scoreboard = on => { if (on) $('sb-inner').innerHTML = U.scoreboardHTML(false); U.show('scoreboard', on); };
  U.endScreen = () => {
    const my = G.score[0], th = G.score[1];
    $('end-title').textContent = my > th ? 'VICTORY' : my < th ? 'DEFEAT' : 'DRAW';
    $('end-title').style.color = my > th ? 'var(--green)' : my < th ? 'var(--red)' : 'var(--acc)';
    $('end-score').textContent = `${my} — ${th}`;
    const mvp = G.agents.slice().sort((a, b) => (b.stats.mvp * 3 + b.stats.score) - (a.stats.mvp * 3 + a.stats.score))[0];
    $('end-table').innerHTML = `<div style="text-align:center;margin-bottom:10px" class="mvp">★ Match MVP: ${mvp.name} (${mvp.stats.k} kills, ${mvp.stats.mvp} MVPs)</div>` + U.scoreboardHTML(true);
    Engine.releaseLock();
    U.show('hud', false); U.show('endscreen', true);
    Sound.announce(my > th ? 'Victory' : my < th ? 'Defeat' : 'Draw');
  };

  /* ------------------------------ Settings ----------------------------- */
  const COLORS = ['#4dff7a', '#00e5ff', '#ffe14d', '#ff4dd2', '#ff3b3b', '#ffffff'];
  U.initSettings = () => {
    const bind = (id, key, fmt, apply) => {
      const el = $(id), out = $(id + '-v');
      const get = () => key.startsWith('ch.') ? Settings.ch[key.slice(3)] : Settings[key];
      el.value = get(); out.textContent = fmt(get());
      el.oninput = () => {
        const v = parseFloat(el.value);
        if (key.startsWith('ch.')) Settings.ch[key.slice(3)] = v; else Settings[key] = v;
        out.textContent = fmt(v); apply && apply(v); drawPreview(); Settings.save();
      };
    };
    bind('s-sens', 'sens', v => v.toFixed(2));
    bind('s-fov', 'fov', v => v + '°', () => Engine.applyFov());
    bind('s-vol', 'volume', v => Math.round(v * 100) + '%', v => Sound.setVolume(v));
    bind('s-chs', 'ch.size', v => v); bind('s-chg', 'ch.gap', v => v); bind('s-cht', 'ch.thick', v => v);
    $('s-chd').checked = Settings.ch.dot;
    $('s-chd').onchange = () => { Settings.ch.dot = $('s-chd').checked; drawPreview(); Settings.save(); };
    const sw = $('s-chc');
    sw.innerHTML = COLORS.map(c => `<b data-c="${c}" style="background:${c}" class="${c === Settings.ch.color ? 'on' : ''}"></b>`).join('');
    sw.onclick = e => {
      const c = e.target.dataset.c; if (!c) return;
      Settings.ch.color = c; [...sw.children].forEach(b => b.classList.toggle('on', b.dataset.c === c)); drawPreview(); Settings.save();
    };
    drawPreview();
  };
  function drawPreview() { U.drawCrosshair($('ch-preview'), Settings.ch, 0); U.markCrosshairDirty(); }

  /* ------------------------------ Tooltips ----------------------------- */
  U.initTooltips = () => {
    const tip = $('tooltip');
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-tip],[data-tiphtml]');
      if (!t) { tip.classList.add('hidden'); return; }
      tip.innerHTML = t.dataset.tiphtml ? decodeURIComponent(t.dataset.tiphtml) : t.dataset.tip.replace(/</g, '&lt;');
      tip.classList.remove('hidden');
    });
    document.addEventListener('mousemove', e => {
      if (tip.classList.contains('hidden')) return;
      tip.style.left = Math.min(innerWidth - 270, e.clientX + 14) + 'px';
      tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 14) + 'px';
    });
  };
  return U;
})();
