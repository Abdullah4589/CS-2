'use strict';
/* =====================================================================
   COUNTER-STRIKE WEB: TACTICAL
   Sections: CORE/UTIL · SETTINGS · AUDIO · TEXTURES · MAP · PHYSICS ·
             WEAPONS · ECONOMY · AGENTS · COMBAT · BOTS · GRENADES/FX ·
             GAME/ROUNDS · UI · INPUT · ENGINE LOOP
   ===================================================================== */

/* =========================== CORE / UTIL =========================== */
const TILE = 3;               // metres per map tile
const GRID_W = 40, GRID_H = 40;
const WALL_H = 7;
const TUNNEL_CEIL = 3.4;
const U2M = 0.0254;           // Source units -> metres
const GRAVITY = 20.3;         // 800 u/s^2
const STEP_H = 0.46;          // max auto step-up height
const JUMP_V = 4.8;           // ~0.57m jump
const EYE_STAND = 1.62, EYE_CROUCH = 1.12;
const HULL_R = 0.4, HULL_STAND = 1.8, HULL_CROUCH = 1.3;
const DEG = Math.PI / 180;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const $ = id => document.getElementById(id);

/** Direction vector from yaw/pitch (yaw 0 looks toward -Z, like the camera). */
function dirFromAngles(yaw, pitch, out) {
  out = out || new THREE.Vector3();
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}
/** Yaw/pitch that look from a to b. */
function anglesTo(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
/** Deterministic PRNG so spray patterns are identical every time (learnable). */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ============================ SETTINGS ============================= */
const Settings = {
  sens: 1.2, fov: 90, volume: 0.7,
  ch: { color: '#4dff7a', size: 6, gap: 3, thick: 2, dot: false },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem('csweb_settings') || 'null');
      if (d) { Object.assign(this, { sens: d.sens, fov: d.fov, volume: d.volume }); Object.assign(this.ch, d.ch || {}); }
    } catch (e) { console.warn('Settings not loaded:', e.message); }
  },
  save() {
    try { localStorage.setItem('csweb_settings', JSON.stringify({ sens: this.sens, fov: this.fov, volume: this.volume, ch: this.ch })); }
    catch (e) { console.warn('Settings not saved:', e.message); }
  }
};
Settings.load();

const DIFFICULTY = {
  easy:   { react: 0.60, aimErr: 3.2, turn: 3.5, hsChance: 0.08, spray: 0.35, burst: 4,  hear: 0.6 },
  normal: { react: 0.34, aimErr: 1.7, turn: 6.5, hsChance: 0.22, spray: 0.6,  burst: 7,  hear: 0.85 },
  hard:   { react: 0.19, aimErr: 0.8, turn: 11,  hsChance: 0.42, spray: 0.85, burst: 12, hear: 1 }
};

/* ============================== AUDIO ============================== */
/** Fully procedural sound using Web Audio: noise bursts + oscillators, spatialised with PannerNodes. */
const Sound = (() => {
  let ctx = null, master = null, muffle = null, noiseBuf = null;
  const S = {};

  S.init = () => {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { console.warn('Web Audio unavailable:', e.message); return; }
    master = ctx.createGain();
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    master.connect(muffle); muffle.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    S.setVolume(Settings.volume);
  };
  S.resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  S.setVolume = v => { if (master) master.gain.value = v * 0.9; };
  S.ready = () => !!ctx;

  S.listener = (pos, yaw) => {
    if (!ctx) return;
    const L = ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  };

  /** Destination node: null pos => non-spatial (the local player). */
  function out(pos, gain = 1) {
    const g = ctx.createGain(); g.gain.value = gain;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = 4; p.rolloffFactor = 1.1; p.maxDistance = 250;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(master);
    } else g.connect(master);
    return g;
  }
  function noise(dest, t0, dur, type, freq, q, gain, freqEnd, attack = 0.002) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }
  function tone(dest, t0, dur, freq, type, gain, freqEnd, attack = 0.003) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  S.gun = (w, pos) => {
    if (!ctx) return;
    const t = ctx.currentTime, s = w.snd, d = out(pos, pos ? 1.6 : 0.55);
    noise(d, t, s.dur, 'bandpass', s.f, 0.8, s.g, s.f * 0.35);
    noise(d, t, s.dur * 0.35, 'highpass', 2500, 0.5, s.g * 0.5);
    if (s.body) tone(d, t, s.dur * 0.8, s.body, 'sine', s.g * 0.9, s.body * 0.5);
  };
  S.dry = () => { if (!ctx) return; const t = ctx.currentTime; noise(out(null, 0.4), t, 0.04, 'highpass', 3000, 1, 0.5); };
  S.reload = (dur) => {
    if (!ctx) return;
    const t = ctx.currentTime, d = out(null, 0.35);
    noise(d, t + 0.15, 0.06, 'bandpass', 1800, 3, 0.8);
    noise(d, t + dur * 0.55, 0.07, 'bandpass', 1200, 3, 0.9);
    noise(d, t + dur * 0.9, 0.05, 'bandpass', 2400, 4, 1);
  };
  S.deploy = () => { if (!ctx) return; noise(out(null, 0.25), ctx.currentTime, 0.08, 'bandpass', 2000, 2, 0.7); };
  S.footstep = (pos, surface) => {
    if (!ctx) return;
    const t = ctx.currentTime, d = out(pos, pos ? 1.3 : 0.28);
    const f = surface === 'metal' ? 1400 : surface === 'wood' ? 500 : 750;
    noise(d, t, 0.07, 'bandpass', f * rand(0.8, 1.2), 1.5, 0.9);
    noise(d, t + 0.02, 0.05, 'lowpass', 300, 1, 0.6);
  };
  S.land = pos => { if (!ctx) return; noise(out(pos, pos ? 1.2 : 0.35), ctx.currentTime, 0.12, 'lowpass', 400, 1, 1); };
  S.hitFlesh = (pos) => { if (!ctx) return; noise(out(pos, 0.8), ctx.currentTime, 0.08, 'lowpass', 900, 1, 0.9); };
  S.hitMarker = (hs) => {
    if (!ctx) return;
    const t = ctx.currentTime, d = out(null, 0.3);
    if (hs) { tone(d, t, 0.25, 2600, 'triangle', 0.7, 2400); tone(d, t, 0.2, 5200, 'sine', 0.25); }
    else tone(d, t, 0.05, 1600, 'square', 0.25);
  };
  S.hurt = () => { if (!ctx) return; noise(out(null, 0.5), ctx.currentTime, 0.15, 'lowpass', 500, 1, 1); };
  S.impact = (pos) => { if (!ctx) return; noise(out(pos, 0.5), ctx.currentTime, 0.05, 'bandpass', 2500, 2, 0.6); };
  S.beep = (pos) => { if (!ctx) return; tone(out(pos, 1.2), ctx.currentTime, 0.09, 2650, 'sine', 0.7); };
  S.plantTick = () => { if (!ctx) return; tone(out(null, 0.25), ctx.currentTime, 0.04, 900 + Math.random() * 600, 'square', 0.5); };
  S.defuseTick = (pos) => { if (!ctx) return; noise(out(pos, 0.7), ctx.currentTime, 0.04, 'bandpass', 3200, 5, 0.9); };
  S.explosion = (pos, big) => {
    if (!ctx) return;
    const t = ctx.currentTime, d = out(pos, big ? 4 : 2.2);
    noise(d, t, big ? 2.2 : 1.1, 'lowpass', 2500, 0.7, 1, 60, 0.005);
    tone(d, t, big ? 1.4 : 0.7, 70, 'sine', 1, 25);
  };
  S.flashPop = pos => { if (!ctx) return; const t = ctx.currentTime, d = out(pos, 2); noise(d, t, 0.4, 'highpass', 1500, 0.7, 1); tone(d, t, 0.2, 180, 'square', 0.4, 60); };
  S.smokePop = pos => { if (!ctx) return; noise(out(pos, 1.3), ctx.currentTime, 2.5, 'bandpass', 1400, 0.4, 0.5, 400, 0.05); };
  S.fireBurst = pos => { if (!ctx) return; noise(out(pos, 0.9), ctx.currentTime, 0.4, 'bandpass', rand(500, 1200), 0.8, 0.5, null, 0.02); };
  S.bounce = pos => { if (!ctx) return; tone(out(pos, 0.5), ctx.currentTime, 0.06, rand(900, 1300), 'triangle', 0.5); };
  S.throwS = () => { if (!ctx) return; noise(out(null, 0.3), ctx.currentTime, 0.18, 'bandpass', 900, 1, 0.6, 400, 0.03); };
  S.buy = () => { if (!ctx) return; const t = ctx.currentTime, d = out(null, 0.3); tone(d, t, 0.08, 1200, 'sine', 0.6); tone(d, t + 0.07, 0.12, 1800, 'sine', 0.6); };
  S.error = () => { if (!ctx) return; tone(out(null, 0.25), ctx.currentTime, 0.15, 200, 'square', 0.5); };
  S.chime = (up) => {
    if (!ctx) return;
    const t = ctx.currentTime, d = out(null, 0.3), notes = up ? [523, 659, 784] : [523, 440, 349];
    notes.forEach((n, i) => tone(d, t + i * 0.12, 0.35, n, 'triangle', 0.6));
  };
  /** Flashbang tinnitus: sine whine + muffled mix that recovers over `dur`. */
  S.ring = (dur) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(out(null, 0.12 * Math.min(1, dur / 2)), t, dur, 3900, 'sine', 1, 3700, 0.02);
    muffle.frequency.cancelScheduledValues(t);
    muffle.frequency.setValueAtTime(500, t);
    muffle.frequency.exponentialRampToValueAtTime(20000, t + dur);
  };
  /** Announcer-style voice cue (Speech Synthesis if the browser has it). */
  S.announce = (text) => {
    try {
      if (!('speechSynthesis' in window) || Settings.volume <= 0) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 0.7; u.volume = Settings.volume;
      speechSynthesis.speak(u);
    } catch (e) { console.warn('Announcer unavailable:', e.message); }
  };
  return S;
})();

/* ============================= TEXTURES ============================ */
/** Procedural canvas textures (no image assets). */
const Tex = (() => {
  function make(size, draw, rep = 1) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
    t.anisotropy = 4;
    return t;
  }
  function speckle(g, s, n, colors, rmax = 2) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = choice(colors); g.globalAlpha = rand(0.05, 0.35);
      const r = rand(0.5, rmax); g.fillRect(Math.random() * s, Math.random() * s, r, r);
    }
    g.globalAlpha = 1;
  }
  function blotches(g, s, n, color, rmin, rmax, a) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = rand(rmin, rmax);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }
  const T = {};
  T.sand = make(256, (g, s) => {
    g.fillStyle = '#c9a877'; g.fillRect(0, 0, s, s);
    blotches(g, s, 18, '#b48f5c', 20, 60, 0.35); blotches(g, s, 12, '#dcc198', 15, 50, 0.3);
    speckle(g, s, 3500, ['#8a6a40', '#e6d2ae', '#a4845a']);
  });
  T.wall = make(256, (g, s) => {
    g.fillStyle = '#d6bb8e'; g.fillRect(0, 0, s, s);
    blotches(g, s, 14, '#c2a070', 20, 70, 0.4);
    g.strokeStyle = 'rgba(110,80,45,.35)'; g.lineWidth = 2;
    const rows = 6, h = s / rows;
    for (let r = 0; r < rows; r++) {
      g.beginPath(); g.moveTo(0, r * h); g.lineTo(s, r * h); g.stroke();
      const off = (r % 2) * (s / 4);
      for (let x = off; x < s + 1; x += s / 2) { g.beginPath(); g.moveTo(x, r * h); g.lineTo(x, r * h + h); g.stroke(); }
    }
    speckle(g, s, 2500, ['#7f5d35', '#efdcb8']);
  });
  T.tunnel = make(256, (g, s) => {
    g.fillStyle = '#8c7a62'; g.fillRect(0, 0, s, s);
    blotches(g, s, 20, '#5f5140', 15, 60, 0.45);
    g.strokeStyle = 'rgba(40,30,20,.45)'; g.lineWidth = 3;
    for (let y = 0; y < s; y += s / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    speckle(g, s, 3000, ['#3d3226', '#b6a58a']);
  });
  T.crate = make(256, (g, s) => {
    g.fillStyle = '#8b6232'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#94693a' : '#7f582b'; g.fillRect(0, i * s / 8, s, s / 8 - 2); }
    speckle(g, s, 1500, ['#4e3417', '#b58b55']);
    g.strokeStyle = '#5a3b18'; g.lineWidth = 22; g.strokeRect(11, 11, s - 22, s - 22);
    g.lineWidth = 18; g.beginPath(); g.moveTo(16, 16); g.lineTo(s - 16, s - 16); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.25)'; [[18, 18], [s - 18, 18], [18, s - 18], [s - 18, s - 18]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); });
  });
  T.concrete = make(256, (g, s) => {
    g.fillStyle = '#9a958c'; g.fillRect(0, 0, s, s);
    blotches(g, s, 16, '#7d786f', 20, 60, 0.4);
    speckle(g, s, 3000, ['#5d5a54', '#c4c0b8']);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
  });
  T.site = make(256, (g, s) => {
    g.fillStyle = '#b89c70'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(90,65,35,.4)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    blotches(g, s, 10, '#8f7550', 20, 50, 0.3);
    speckle(g, s, 2500, ['#6e5433', '#e0caa4']);
  });
  T.sky = (() => {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5d8fc9'); gr.addColorStop(0.55, '#a9c7e3'); gr.addColorStop(1, '#e8dcc4');
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(c);
  })();
  /** Soft round sprite used for smoke, fire, muzzle flash, sparks. */
  T.soft = make(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  T.decal = make(32, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.35, 'rgba(25,20,15,.9)'); gr.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  /** Big painted site letter for walls. */
  T.letter = (ch, color) => make(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.font = 'bold 200px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.85; g.fillStyle = color; g.fillText(ch, s / 2, s / 2 + 10);
  });
  return T;
})();

/** Rescale BoxGeometry UVs so textures tile at `unit` metres instead of stretching per face. */
function tileBoxUV(geo, w, h, d, unit) {
  const uv = geo.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / unit, uv.getY(i) * dims[f][1] / unit);
  }
  uv.needsUpdate = true;
  return geo;
}
