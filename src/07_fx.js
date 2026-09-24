
/* ============================ EFFECTS (FX) ========================= */
const FX = (() => {
  const F = {};
  let scene, light, lightT = 0;
  const parts = [], pools = { n: [], a: [] };
  const decals = [], tracers = [];
  let decalI = 0, tracerI = 0;
  const up = new THREE.Vector3(0, 1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

  F.init = s => {
    scene = s;
    light = new THREE.PointLight(0xffc070, 0, 12, 2); scene.add(light);
    const dmat = new THREE.MeshBasicMaterial({ map: Tex.decal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const dgeo = new THREE.PlaneGeometry(0.13, 0.13);
    for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(dgeo, dmat); m.visible = false; scene.add(m); decals.push(m); }
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.frustumCulled = false; l.userData.t = 0; scene.add(l); tracers.push(l);
    }
  };
  /** Generic billboard particle. */
  F.spawn = (pos, o) => {
    const pool = o.add ? pools.a : pools.n;
    let s = pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft, transparent: true, depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.userData.add = !!o.add;
    }
    s.material.color.set(o.color || 0xffffff);
    s.position.copy(pos); s.visible = true; scene.add(s);
    const p = { s, vel: o.vel ? o.vel.clone() : new THREE.Vector3(), life: o.life || 0.5, age: 0, size: o.size || 0.3, grow: o.grow || 0,
      op: o.opacity === undefined ? 1 : o.opacity, grav: o.grav || 0, drag: o.drag || 0 };
    s.scale.set(p.size, p.size, 1); s.material.opacity = p.op;
    parts.push(p);
    return p;
  };
  F.update = dt => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt;
      if (p.age >= p.life) { scene.remove(p.s); (p.s.userData.add ? pools.a : pools.n).push(p.s); parts.splice(i, 1); continue; }
      p.vel.y -= p.grav * dt; if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.age / p.life, sz = p.size + p.grow * p.age;
      p.s.scale.set(sz, sz, 1); p.s.material.opacity = p.op * (1 - k);
    }
    for (const l of tracers) if (l.userData.t > 0) { l.userData.t -= dt; l.material.opacity = Math.max(0, l.userData.t / 0.07) * 0.8; }
    if (lightT > 0) { lightT -= dt; if (lightT <= 0) light.intensity = 0; }
  };
  F.flashLight = (pos, intensity, dur, color = 0xffc070) => { light.position.copy(pos); light.intensity = intensity; light.color.set(color); lightT = dur; };
  F.muzzle = a => {
    a.eye(v1); dirFromAngles(a.yaw, a.pitch, v2);
    v1.addScaledVector(v2, 0.8); v1.x += Math.cos(a.yaw) * 0.12; v1.z -= Math.sin(a.yaw) * 0.12; v1.y -= 0.25;
    F.spawn(v1, { color: 0xffb040, size: 0.45, life: 0.05, add: true });
    F.flashLight(v1, 2, 0.05);
  };
  F.tracer = (shooter, origin, dir, len) => {
    if (shooter === G.player && Math.random() > 0.5) return;
    const l = tracers[tracerI++ % tracers.length];
    const start = shooter === G.player ? Viewmodel.muzzleWorld(v1) : v1.copy(origin).addScaledVector(dir, 0.8);
    const endLen = Math.min(len, 120);
    const a = l.geometry.attributes.position.array;
    const s = Math.random() * 0.3;
    const st = v2.copy(start).lerp(v2.copy(origin).addScaledVector(dir, endLen), s);
    a[0] = st.x; a[1] = st.y; a[2] = st.z;
    a[3] = origin.x + dir.x * endLen; a[4] = origin.y + dir.y * endLen; a[5] = origin.z + dir.z * endLen;
    l.geometry.attributes.position.needsUpdate = true; l.userData.t = 0.07; l.material.opacity = 0.8;
  };
  F.impact = (p, hit, primary) => {
    const d = decals[decalI++ % decals.length];
    d.position.set(p.x + hit.nx * 0.01, p.y + hit.ny * 0.01, p.z + hit.nz * 0.01);
    d.lookAt(v1.set(p.x + hit.nx, p.y + hit.ny, p.z + hit.nz)); d.rotation.z = Math.random() * 6;
    d.visible = true;
    const col = hit.ch === 'c' || hit.ch === 'C' ? 0x8a6a40 : hit.ch === 'ground' ? 0xc4a878 : 0xcfb58a;
    for (let i = 0; i < 3; i++) F.spawn(p, { color: col, size: 0.15, grow: 0.9, life: 0.6, opacity: 0.7,
      vel: new THREE.Vector3(hit.nx + rand(-0.6, 0.6), hit.ny + rand(0, 0.8), hit.nz + rand(-0.6, 0.6)).multiplyScalar(1.4), grav: 1 });
    if (primary && Math.random() < 0.4) F.spawn(p, { color: 0xffdd88, size: 0.08, life: 0.08, add: true });
    if (primary && Math.random() < 0.3) Sound.impact(p);
  };
  F.clearDecals = () => decals.forEach(d => d.visible = false);
  F.blood = p => {
    for (let i = 0; i < 4; i++) F.spawn(p, { color: 0x8a0e0e, size: 0.12, grow: 0.6, life: 0.4, opacity: 0.85,
      vel: new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)), grav: 4 });
  };
  F.shell = (pos, right) => {
    F.spawn(pos, { color: 0xd4a640, size: 0.035, life: 0.6, vel: right.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 2, 0)), grav: 12 });
  };
  F.explosion = pos => {
    F.flashLight(v1.copy(pos).setY(pos.y + 1), 6, 0.25, 0xffa040);
    F.spawn(v1, { color: 0xffc060, size: 2, grow: 10, life: 0.25, add: true });
    for (let i = 0; i < 16; i++) F.spawn(v1, { color: choice([0x6b5a44, 0x4a4036, 0x8c7a60]), size: 1, grow: 2.5, life: rand(1, 2), opacity: 0.8,
      vel: new THREE.Vector3(rand(-6, 6), rand(1, 7), rand(-6, 6)), drag: 2.5, grav: -0.3 });
    for (let i = 0; i < 14; i++) F.spawn(v1, { color: 0xffaa33, size: 0.12, life: 0.5, add: true, vel: new THREE.Vector3(rand(-12, 12), rand(2, 12), rand(-12, 12)), grav: 15 });
    const dd = G.player ? G.player.pos.distanceTo(pos) : 99;
    if (dd < 25) G.shake = Math.max(G.shake, (1 - dd / 25) * 0.6);
  };
  F.bigExplosion = pos => {
    F.explosion(pos);
    for (let i = 0; i < 30; i++) F.spawn(v1.copy(pos).setY(1), { color: choice([0xff8a30, 0xffcf60, 0x777066]), size: 2, grow: 6, life: rand(1, 2.5), opacity: 0.9,
      vel: new THREE.Vector3(rand(-14, 14), rand(2, 16), rand(-14, 14)), drag: 1.8, add: i < 12 });
    G.shake = 1.2;
  };
  return F;
})();

/* =============================== SMOKES ============================ */
/* Volumetric-style smoke: a cloud of soft billboards filling an ellipsoid. Bullets passing through
   thin nearby puffs for ~1.5s; bots' line of sight is blocked unless the path has been cleared. */
const Smokes = (() => {
  const S = { list: [] };
  const RAD = 3.8, V = 2.4, v = new THREE.Vector3(), w = new THREE.Vector3();
  S.deploy = (pos) => {
    const center = pos.clone(); center.y = Math.max(pos.y, 0) + 1.6;
    const puffs = [];
    for (let i = 0; i < 56; i++) {
      const th = Math.random() * 6.283, ph = Math.acos(rand(-1, 1)), rr = Math.cbrt(Math.random());
      const off = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * RAD * rr, Math.cos(ph) * V * rr, Math.sin(ph) * Math.sin(th) * RAD * rr);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft, color: new THREE.Color().setHSL(0, 0, rand(0.62, 0.78)), transparent: true, depthWrite: false, opacity: 0 }));
      s.position.copy(center).add(off); s.scale.setScalar(rand(2.6, 3.6)); s.material.rotation = Math.random() * 6;
      G.scene.add(s);
      puffs.push({ s, off, clear: 0, base: rand(0.8, 0.97) });
    }
    S.list.push({ center, t: 0, life: 18, puffs });
    Sound.smokePop(center);
    Fires.extinguish(center, RAD + 1);
  };
  S.update = dt => {
    for (let i = S.list.length - 1; i >= 0; i--) {
      const sm = S.list[i]; sm.t += dt;
      const grow = Math.min(1, sm.t / 1.5), fade = sm.t > sm.life - 2.5 ? Math.max(0, (sm.life - sm.t) / 2.5) : 1;
      for (const p of sm.puffs) {
        p.clear = Math.max(0, p.clear - dt / 1.6);
        p.s.material.opacity = p.base * grow * fade * (1 - p.clear * 0.9);
        p.s.position.set(sm.center.x + p.off.x * (0.4 + 0.6 * grow), sm.center.y + p.off.y * (0.4 + 0.6 * grow), sm.center.z + p.off.z * (0.4 + 0.6 * grow));
        p.s.position.y += Math.sin(sm.t * 0.5 + p.base * 10) * 0.08;
      }
      if (sm.t >= sm.life) { sm.puffs.forEach(p => { G.scene.remove(p.s); p.s.material.dispose(); }); S.list.splice(i, 1); }
    }
  };
  S.clearAll = () => { S.list.forEach(sm => sm.puffs.forEach(p => { G.scene.remove(p.s); p.s.material.dispose(); })); S.list.length = 0; };
  /** Distance from point to ray segment. */
  function segDist(p, o, d, t) {
    w.subVectors(p, o); const k = clamp(w.dot(d), 0, t);
    return v.copy(o).addScaledVector(d, k).distanceTo(p);
  }
  S.bulletThrough = (o, d, t) => {
    for (const sm of S.list) {
      if (segDist(sm.center, o, d, t) > RAD + 1) continue;
      for (const p of sm.puffs) if (segDist(p.s.position, o, d, t) < 1.0) p.clear = 1;
    }
  };
  /** Does dense smoke sit between a and b? */
  S.blocks = (a, b) => {
    const len = a.distanceTo(b); if (len < 0.01) return false;
    const d = w.clone().subVectors(b, a).divideScalar(len);
    for (const sm of S.list) {
      if (sm.t < 0.8 || sm.t > sm.life - 1.2) continue;
      if (segDist(sm.center, a, d, len) > RAD * 0.85) continue;
      let near = 0, dense = 0;
      for (const p of sm.puffs) if (segDist(p.s.position, a, d, len) < 1.3) { near++; if (p.clear < 0.4) dense++; }
      if (dense >= 2 || (near > 0 && dense / near > 0.35)) return true;
    }
    return false;
  };
  S.inside = (p) => S.list.some(sm => sm.t > 0.5 && sm.center.distanceTo(p) < RAD * 0.8);
  return S;
})();

/* ============================ FIRES (molotov) ====================== */
const Fires = (() => {
  const F = { list: [] };
  F.spawn = (pos, owner) => {
    if (Smokes.inside(v3(pos.x, 1.2, pos.z))) { Sound.fireBurst(pos); return; }
    F.list.push({ pos: pos.clone().setY(Math.max(0, pos.y)), owner, t: 0, life: 7, r: 3.2, tick: 0, sfx: 0 });
    Sound.fireBurst(pos);
  };
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  F.update = dt => {
    for (let i = F.list.length - 1; i >= 0; i--) {
      const f = F.list[i]; f.t += dt; f.tick -= dt; f.sfx -= dt;
      if (Math.random() < dt * 45) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * f.r;
        FX.spawn(v3(f.pos.x + Math.cos(a) * r, f.pos.y + 0.2, f.pos.z + Math.sin(a) * r),
          { color: choice([0xff7a1a, 0xffb040, 0xff5010]), size: rand(0.5, 1.1), grow: 0.4, life: rand(0.35, 0.7), add: true, vel: v3(0, rand(1.5, 3), 0) });
        if (Math.random() < 0.15) FX.spawn(v3(f.pos.x + Math.cos(a) * r, f.pos.y + 1.2, f.pos.z + Math.sin(a) * r), { color: 0x333333, size: 0.8, grow: 1.5, life: 1.5, opacity: 0.35, vel: v3(0, 1.5, 0) });
      }
      if (f.sfx <= 0) { Sound.fireBurst(f.pos); f.sfx = 0.45; }
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const a of G.agents) if (a.alive && dist2D(a.pos.x, a.pos.z, f.pos.x, f.pos.z) < f.r && Math.abs(a.pos.y - f.pos.y) < 1.2)
          applyDamage(a, 10, 'fire', f.owner, WEAPONS.molotov, null, true);
      }
      if (f.t >= f.life) F.list.splice(i, 1);
    }
  };
  F.extinguish = (p, r) => { F.list = F.list.filter(f => dist2D(f.pos.x, f.pos.z, p.x, p.z) > r); };
  F.clearAll = () => { F.list.length = 0; };
  return F;
})();

/* ============================= GRENADES ============================ */
const Grenades = (() => {
  const N = { list: [] };
  const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8);
  const mats = { he: 0x3d5a2a, flash: 0x9aa0a6, smoke: 0x6f7c86, molotov: 0x7a4d1c, incgrenade: 0x8b3a2a };
  const v = new THREE.Vector3(), eye = new THREE.Vector3(), dir = new THREE.Vector3();
  N.throwFrom = (a, id, strength) => {
    const i = a.nades.indexOf(id); if (i < 0) return;
    a.nades.splice(i, 1);
    a.eye(eye); dirFromAngles(a.yaw, a.pitch + 0.05, dir);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: mats[id] }));
    m.position.copy(eye).addScaledVector(dir, 0.4); G.scene.add(m);
    const vel = dir.clone().multiplyScalar(lerp(6, 17, strength)).add(new THREE.Vector3(a.vel.x, a.vel.y * 0.5 + 1.2, a.vel.z));
    N.list.push({ id, owner: a, mesh: m, vel, t: 0, rest: 0 });
    if (a === G.player) Sound.throwS();
    if (a.cur === 4) {
      if (a.nades.length) a.nadeIdx = Math.min(a.nadeIdx, a.nades.length - 1), a === G.player && Viewmodel.rebuild();
      else a.switchTo(a.slots[1] ? 1 : 2, true);
    }
  };
  N.update = dt => {
    for (let i = N.list.length - 1; i >= 0; i--) {
      const g = N.list[i]; g.t += dt;
      const p = g.mesh.position;
      g.vel.y -= GRAVITY * 0.8 * dt;
      const sp = g.vel.length();
      if (sp > 1e-3) {
        dir.copy(g.vel).divideScalar(sp);
        const h = rayCast(p, dir, sp * dt + 0.05);
        if (h) {
          p.addScaledVector(dir, Math.max(0, h.t - 0.05));
          const dot = g.vel.x * h.nx + g.vel.y * h.ny + g.vel.z * h.nz;
          g.vel.x -= 2 * dot * h.nx; g.vel.y -= 2 * dot * h.ny; g.vel.z -= 2 * dot * h.nz;
          g.vel.multiplyScalar(h.ny > 0.7 ? 0.4 : 0.55);
          if (sp > 2) Sound.bounce(p);
          if ((g.id === 'molotov' || g.id === 'incgrenade') && h.ny > 0.7) { detonate(g); N.list.splice(i, 1); continue; }
        } else p.addScaledVector(g.vel, dt);
      }
      g.mesh.rotation.x += dt * sp * 2;
      if (sp < 0.6) g.rest += dt; else g.rest = 0;
      const fuse = g.id === 'smoke' ? (g.rest > 0.4 || g.t > 4) : (g.id === 'molotov' || g.id === 'incgrenade') ? g.t > 2.2 : g.t > 1.6;
      if (fuse) { detonate(g); N.list.splice(i, 1); }
    }
  };
  function detonate(g) {
    const p = g.mesh.position.clone();
    G.scene.remove(g.mesh); g.mesh.material.dispose();
    if (g.id === 'he') heBlast(p, g.owner);
    else if (g.id === 'flash') flashBang(p);
    else if (g.id === 'smoke') Smokes.deploy(p);
    else {
      // molotov: burns if it landed (or airburst near floor), otherwise fizzles
      const groundY = World.top(World.tc(p.x), World.tr(p.z));
      if (p.y - groundY < 1.5) Fires.spawn(new THREE.Vector3(p.x, groundY, p.z), g.owner);
      else FX.spawn(p, { color: 0xff8030, size: 1.5, grow: 2, life: 0.3, add: true });
    }
  }
  function heBlast(p, owner) {
    Sound.explosion(p); FX.explosion(p);
    for (const a of G.agents) {
      if (!a.alive) continue;
      const c = v.set(a.pos.x, a.pos.y + 1, a.pos.z), d = c.distanceTo(p);
      if (d > 11) continue;
      const lifted = p.clone(); lifted.y += 0.3;
      if (!losClear(lifted, c)) continue;
      const dmg = 98 * Math.pow(1 - d / 11, 1.3);
      if (dmg >= 1) applyDamage(a, dmg, 'chest', owner && owner.team !== a.team ? owner : (owner === a ? null : owner), WEAPONS.he, null, true);
    }
  }
  function flashBang(p) {
    Sound.flashPop(p);
    FX.flashLight(p, 12, 0.12, 0xffffff);
    FX.spawn(p, { color: 0xffffff, size: 3, grow: 6, life: 0.15, add: true });
    for (const a of G.agents) {
      if (!a.alive) continue;
      a.eye(eye);
      const d = eye.distanceTo(p);
      if (d > 35 || !losClear(p, eye) || Smokes.blocks(p, eye)) continue;
      dirFromAngles(a.yaw, a.pitch, dir);
      const to = v.subVectors(p, eye).normalize(), dot = dir.dot(to);
      const facing = dot > 0.6 ? 1 : dot > 0 ? 0.6 : 0.2;
      const dur = 5 * facing * clamp(1.15 - d / 30, 0, 1);
      if (dur < 0.2) continue;
      a.flashT = Math.max(a.flashT, dur); a.flashMax = Math.max(a.flashT, 0.1);
      if (a === G.player) { UI.flash(); if (dur > 0.8) Sound.ring(dur); }
    }
  }
  N.clearAll = () => { N.list.forEach(g => G.scene.remove(g.mesh)); N.list.length = 0; };
  return N;
})();
