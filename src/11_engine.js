
/* =============================== INPUT ============================= */
/* Mouse look and trigger presses are processed inside the DOM events themselves ("sub-tick"):
   a click fires immediately with the exact current view angles and a sub-frame timestamp. */
const Input = (() => {
  const I = { keys: {}, mouseL: false, locked: false, expectUnlock: false, jumpQueued: false };
  const inGame = () => G.state === 'playing' && !G.paused;

  function onKeyDown(e) {
    if (G.state !== 'playing') return;
    const k = e.code;
    if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'KeyB'].includes(k) || (e.ctrlKey && k !== 'KeyR')) e.preventDefault();
    if (k === 'Escape' && UI.isOpen('buymenu')) { closeBuy(); return; }
    if (G.paused || G.phase === 'over') return;
    if (e.repeat && k !== 'KeyE') return;
    I.keys[k] = true;
    const p = G.player;
    if (k === 'Tab') { UI.scoreboard(true); return; }
    if (k === 'KeyB') { UI.isOpen('buymenu') ? closeBuy() : openBuy(); return; }
    if (!p.alive) { if (k === 'Space') Game.nextSpec(); return; }
    if (k === 'Space') I.jumpQueued = true;
    else if (k === 'KeyR') startReload(p);
    else if (k >= 'Digit1' && k <= 'Digit5') { if (p.switchTo(+k.slice(5))) UI.refreshSlots(); }
    else if (k === 'KeyQ') { if (p.slots[p.prev] || p.prev === 4 || p.prev === 3) p.switchTo(p.prev); }
    else if (k === 'KeyG') Game.dropCurrent(p);
    else if (k === 'KeyE' && p.hasBomb() && p.cur !== 5 && Game.onSite(p)) p.switchTo(5);
  }
  function onKeyUp(e) {
    I.keys[e.code] = false;
    if (e.code === 'Tab') { e.preventDefault(); UI.scoreboard(false); }
  }
  function onMouseMove(e) {
    if (!I.locked || !inGame()) return;
    const p = G.player; if (!p.alive) return;
    const g = p.gun(), zoom = g.scope ? g.def.scope[g.scope - 1] / Settings.fov : 1;
    const k = 0.022 * Settings.sens * DEG * zoom;
    p.yaw = wrapAngle(p.yaw - e.movementX * k);
    p.pitch = clamp(p.pitch - e.movementY * k, -89 * DEG, 89 * DEG);
    Viewmodel.sway(e.movementX, e.movementY);
  }
  function onMouseDown(e) {
    if (G.state !== 'playing') return;
    if (e.target.closest && e.target.closest('.overlay:not(#scoreboard), #lock-prompt')) return;
    Sound.resume();
    if (!I.locked) { if (!G.paused && !UI.isOpen('buymenu')) Engine.lock(); return; }
    if (!inGame()) return;
    const p = G.player;
    if (!p.alive) { Game.nextSpec(); return; }
    const g = p.gun();
    if (e.button === 0) {
      I.mouseL = true;
      if (g.def.type !== 'grenade' && G.phase !== 'freeze') fireGun(p, Engine.now());
    } else if (e.button === 2) {
      if (g.def.scope && !g.reloading) { g.scope = (g.scope + 1) % 3; g.rescope = false; Sound.deploy(); Engine.applyFov(); }
    }
  }
  function onMouseUp(e) {
    const p = G.player;
    if (e.button === 0) I.mouseL = false;
    if (!inGame() || !p || !p.alive) return;
    const g = p.gun();
    if (g.def.type === 'grenade' && (e.button === 0 || e.button === 2) && G.phase !== 'freeze' && G.time >= p.drawEnd) {
      Grenades.throwFrom(p, g.id, e.button === 0 ? 1 : 0.4); UI.refreshSlots();
    }
  }
  function openBuy() {
    if (!Game.buyAllowed(G.player)) { UI.center('', G.player.alive ? 'You can only buy in your spawn during buy time' : 'You are dead', 1500); Sound.error(); return; }
    UI.buildBuyMenu(); UI.show('buymenu', true);
    I.expectUnlock = true; Engine.releaseLock();
  }
  function closeBuy() { UI.show('buymenu', false); if (G.state === 'playing' && !G.paused) UI.show('lock-prompt', true); }
  I.closeBuy = closeBuy;

  function onLockChange() {
    I.locked = document.pointerLockElement === G.renderer.domElement;
    if (I.locked) { UI.show('lock-prompt', false); I.expectUnlock = false; return; }
    I.keys = {}; I.mouseL = false;
    if (I.expectUnlock) { I.expectUnlock = false; return; }
    if (G.state === 'playing' && G.phase !== 'over') Engine.pause(true);
  }

  /** Per-frame player controller: movement, auto-fire at exact fire-rate times, plant/defuse. */
  I.updatePlayer = dt => {
    const p = G.player;
    if (!p.alive) return;
    const K = I.keys;
    const f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), s = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0);
    let wx = -Math.sin(p.yaw) * f + Math.cos(p.yaw) * s, wz = -Math.cos(p.yaw) * f - Math.sin(p.yaw) * s;
    const l = Math.hypot(wx, wz); if (l > 0) { wx /= l; wz /= l; }
    p.walking = !!(K.ShiftLeft || K.ShiftRight);
    p.crouching = !!(K.ControlLeft || K.ControlRight || K.KeyC);
    let jump = I.jumpQueued; I.jumpQueued = false;
    if (G.phase === 'freeze') { wx = wz = 0; jump = false; }
    if (K.KeyE) {
      if (p.hasBomb() && p.cur === 5) Game.holdPlant(p, dt);
      else if (p.team === 'CT') Game.holdDefuse(p, dt);
    }
    if (p.planting || p.defusing) { wx = wz = 0; jump = false; }
    p.move(dt, wx, wz, jump && p.onGround);
    const g = p.gun();
    if (I.mouseL && g.def.auto && G.phase !== 'freeze' && I.locked) {
      if (g.nextFire < G.time - dt) g.nextFire = G.time - dt;
      let n = 0;
      while (g.nextFire <= G.time && n++ < 4 && g.mag > 0 && !g.reloading) if (!fireGun(p, g.nextFire)) break;
      if (g.mag === 0 && n > 0) I.mouseL = false;
    }
    if (g.rescope && G.time >= g.nextFire - 0.15) { g.rescope = false; if (I.mouseL === false && g.mag > 0) { g.scope = 1; Engine.applyFov(); } }
    updateReload(p);
    for (const s2 of [1, 2]) if (p.slots[s2]) p.slots[s2].update(dt, G.time);
    if (UI.isOpen('buymenu') && !Game.buyAllowed(p)) closeBuy();
  };

  I.init = () => {
    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
    addEventListener('mousemove', onMouseMove);
    addEventListener('mousedown', onMouseDown);
    addEventListener('mouseup', onMouseUp);
    addEventListener('contextmenu', e => { if (G.state === 'playing') e.preventDefault(); });
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing' && G.phase !== 'over') Engine.pause(true); });
    addEventListener('blur', () => { I.keys = {}; I.mouseL = false; });
  };
  return I;
})();

/* =============================== ENGINE ============================ */
const Engine = (() => {
  const E = {};
  let renderer, scene, camera, last = performance.now(), frameStamp = performance.now(), fpsAcc = 0, fpsN = 0, menuT = 0;
  const eye = new THREE.Vector3();

  E.init = () => {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    $('view').appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd9cdb4);
    scene.fog = new THREE.Fog(0xd9cdb4, 80, 260);
    camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 900);
    camera.rotation.order = 'YXZ';
    scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x8a6d45, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sun = new THREE.DirectionalLight(0xfff0d2, 0.85);
    sun.position.set(38, 80, 22); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 200 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    G.scene = scene; G.camera = camera; G.renderer = renderer;
    buildWorld(scene); FX.init(scene); Viewmodel.init();
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight; E.applyFov(); Viewmodel.resize();
    });
    E.applyFov();
    requestAnimationFrame(frame);
  };
  /** CS-style horizontal FOV (4:3 reference) -> vertical camera FOV. Scoped weapons override. */
  E.applyFov = () => {
    const p = G.player, g = p && p.alive ? p.gun() : null;
    const h = g && g.scope ? g.def.scope[g.scope - 1] : Settings.fov;
    camera.fov = 2 * Math.atan(Math.tan(h * DEG / 2) * 0.75) / DEG;
    camera.updateProjectionMatrix();
  };
  /** Sub-frame game time for input handled between frames. */
  E.now = () => G.time + Math.min(0.05, (performance.now() - frameStamp) / 1000);
  E.lock = () => { try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(err => console.warn('Pointer lock refused:', err.message)); } catch (err) { console.warn('Pointer lock error:', err.message); } };
  E.releaseLock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  E.pause = on => {
    G.paused = on;
    UI.show('pausemenu', on); UI.show('lock-prompt', false);
    if (on) { UI.show('buymenu', false); UI.scoreboard(false); E.releaseLock(); }
    else E.lock();
  };

  function step(dt) {
    G.time += dt;
    Input.updatePlayer(dt);
    for (const a of G.agents) {
      if (!a.isBot || !a.alive) continue;
      Bots.update(a, dt);
      updateReload(a);
      const g = a.gun(); g.update(dt, G.time);
    }
    Grenades.update(dt); Smokes.update(dt); Fires.update(dt); FX.update(dt);
    Game.update(dt);
    for (const a of G.agents) a.updateModel(dt);
  }
  function updateCamera(dt) {
    const p = G.player;
    let yaw, pitch;
    const view = p.alive ? p : Game.specTarget;
    if (view) {
      view.eye(eye); camera.position.copy(eye);
      yaw = view.yaw; pitch = view.pitch;
      const g = view.gun(), [px, py] = g.punch();
      yaw -= px * DEG * 0.45; pitch += py * DEG * 0.45;
    } else {
      camera.position.set(p.pos.x, p.pos.y + 8, p.pos.z + 6); yaw = p.yaw; pitch = -0.8;
    }
    G.shake = Math.max(0, G.shake - dt * 2.5);
    const sh = G.shake * G.shake * 0.08;
    camera.rotation.set(pitch + (Math.random() - 0.5) * sh, yaw + (Math.random() - 0.5) * sh, 0);
    Sound.listener(camera.position, yaw);
    if (camera.userData.lastScope !== (p.alive && p.gun().scope)) { camera.userData.lastScope = p.alive && p.gun().scope; E.applyFov(); }
  }
  function menuCamera(dt) {
    menuT += dt * 0.05;
    camera.position.set(Math.sin(menuT) * 55, 38, Math.cos(menuT) * 55);
    camera.lookAt(0, 0, 0);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frameStamp = performance.now();
    if (G.state === 'playing') {
      if (!G.paused && G.phase !== 'over') {
        // two sub-steps when the frame is long keeps collisions stable
        if (dt > 1 / 45) { step(dt / 2); step(dt / 2); } else step(dt);
      }
      updateCamera(dt);
      const p = G.player;
      Viewmodel.update(dt, Math.hypot(p.vel.x, p.vel.z));
      UI.update(dt);
    } else menuCamera(dt);
    renderer.clear();
    renderer.render(scene, camera);
    if (G.state === 'playing' && G.player.alive) Viewmodel.render(renderer);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
  }
  return E;
})();

/* ================================ MENUS ============================ */
(function initMenus() {
  const seg = (id, cb) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    [...$(id).children].forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset.v);
  });
  let team = 'CT', diff = 'normal', returnTo = 'mainmenu';
  seg('seg-team', v => team = v);
  seg('seg-diff', v => diff = v);
  const open = (id, from) => { returnTo = from; UI.show(from, false); UI.show(id, true); };
  const back = id => { UI.show(id, false); UI.show(returnTo, true); };

  $('btn-play').onclick = () => {
    Sound.init(); Sound.resume();
    UI.show('mainmenu', false); UI.show('menu-bg', false); UI.show('hud', true);
    G.state = 'playing'; G.paused = false; G.phase = 'freeze';
    Game.newMatch(team, diff);
    Engine.applyFov();
    Engine.lock();
  };
  $('btn-settings').onclick = () => open('settings', 'mainmenu');
  $('btn-controls').onclick = () => open('controls-screen', 'mainmenu');
  $('btn-p-settings').onclick = () => open('settings', 'pausemenu');
  $('btn-p-controls').onclick = () => open('controls-screen', 'pausemenu');
  $('btn-set-back').onclick = () => back('settings');
  $('btn-ctl-back').onclick = () => back('controls-screen');
  $('btn-resume').onclick = () => Engine.pause(false);
  const toMenu = () => {
    G.state = 'menu'; G.paused = false;
    ['pausemenu', 'hud', 'endscreen', 'buymenu', 'scoreboard', 'lock-prompt', 'scope'].forEach(id => UI.show(id, false));
    UI.show('mainmenu', true); UI.show('menu-bg', true);
    Engine.releaseLock();
    $('flash').style.opacity = 0; $('hurt').style.opacity = 0;
    try { speechSynthesis.cancel(); } catch (e) { /* speech not supported */ }
  };
  $('btn-quit').onclick = toMenu;
  $('btn-end-menu').onclick = toMenu;
  $('lock-prompt').onclick = () => Engine.lock();
  $('buy-cols').addEventListener('click', e => { const it = e.target.closest('[data-buy]'); if (it) UI.buyClick(it.dataset.buy); });
})();

/* ================================ BOOT ============================= */
(function boot() {
  if (!window.THREE) { document.body.innerHTML = '<p style="padding:40px;font:16px sans-serif;color:#fff">Could not load Three.js from the CDN. Check your connection and reload.</p>'; return; }
  UI.initSettings();
  UI.initTooltips();
  Input.init();
  Engine.init();
})();
