
/* ============================= VIEWMODEL =========================== */
/* First-person weapon rendered in its own scene/pass so it never clips into walls. */
const Viewmodel = (() => {
  const V = {};
  let scene, cam, root, gunGroup, muzzle, muzzleT = 0, ejectPt;
  const st = { kick: 0, kickRot: 0, swayX: 0, swayY: 0, bob: 0, reloadT: 0, reloadDur: 1, drawT: 0, flinch: 0 };
  const mats = {};
  const tmp = new THREE.Vector3();

  V.init = () => {
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.01, 10);
    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x6b5537, 0.9));
    const dl = new THREE.DirectionalLight(0xfff1d6, 0.7); dl.position.set(1, 2, 1); scene.add(dl);
    root = new THREE.Group(); scene.add(root);
    Object.assign(mats, {
      skin: new THREE.MeshLambertMaterial({ color: 0xc49a74 }), gloveT: new THREE.MeshLambertMaterial({ color: 0x4a3b28 }),
      gloveCT: new THREE.MeshLambertMaterial({ color: 0x222831 }), metal: new THREE.MeshLambertMaterial({ color: 0x2b2b2b }),
      steel: new THREE.MeshLambertMaterial({ color: 0xb8bcc2 }), wood: new THREE.MeshLambertMaterial({ color: 0x6b4423 })
    });
    muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft, color: 0xffc060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    muzzle.scale.set(0.22, 0.22, 1); muzzle.visible = false;
  };
  V.resize = () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };

  const bx = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
  /** Build a stylised gun from boxes based on the weapon's viewmodel params. */
  V.rebuild = () => {
    const p = G.player; if (!p) return;
    if (gunGroup) { root.remove(gunGroup); gunGroup.traverse(o => o.geometry && o.geometry.dispose()); }
    gunGroup = new THREE.Group(); root.add(gunGroup);
    const def = p.gun().def, glove = p.team === 'T' ? mats.gloveT : mats.gloveCT;
    const vm = def.vm || {};
    const body = new THREE.MeshLambertMaterial({ color: vm.col || 0x2b2b2b });
    let tip = new THREE.Vector3(0, 0.03, -0.5);
    ejectPt = new THREE.Vector3(0.03, 0.04, -0.15);
    if (def.type === 'knife') {
      gunGroup.add(bx(0.03, 0.035, 0.12, mats.metal, 0, 0, 0));
      const blade = bx(0.008, 0.04, 0.2, mats.steel, 0, 0.005, -0.16); gunGroup.add(blade);
      gunGroup.add(bx(0.07, 0.08, 0.1, glove, 0, -0.03, 0.03));
      gunGroup.rotation.set(0.3, 0.2, -0.4);
    } else if (def.type === 'grenade') {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshLambertMaterial({ color: { he: 0x3d5a2a, flash: 0x9aa0a6, smoke: 0x6f7c86 }[def.id] || 0x7a4d1c }));
      g.position.set(0, 0.03, -0.08); gunGroup.add(g, bx(0.08, 0.08, 0.11, glove, 0, -0.02, 0));
    } else if (def.type === 'c4') {
      gunGroup.add(bx(0.16, 0.06, 0.1, new THREE.MeshLambertMaterial({ color: 0x6b6b3b }), 0, 0, -0.1));
      gunGroup.add(bx(0.08, 0.02, 0.05, new THREE.MeshLambertMaterial({ color: 0x1a1a1a }), 0, 0.04, -0.1));
      gunGroup.add(bx(0.08, 0.08, 0.1, glove, 0.06, -0.04, 0));
    } else {
      const L = vm.len || 0.3, pistol = def.type === 'pistol';
      gunGroup.add(bx(0.045, 0.07, L * 0.55, body, 0, 0.02, -L * 0.3));                      // receiver
      gunGroup.add(bx(0.022, 0.022, L * 0.5, mats.metal, 0, 0.035, -L * 0.75));               // barrel
      if (vm.silencer) gunGroup.add(bx(0.03, 0.03, 0.13, mats.metal, 0, 0.035, -L - 0.05));
      gunGroup.add(bx(0.035, pistol ? 0.09 : 0.1, 0.04, vm.wood ? mats.wood : mats.metal, 0, -0.045, -0.05)); // grip
      if (!pistol) {
        gunGroup.add(bx(0.03, 0.1, 0.05, mats.metal, 0, -0.05, -L * 0.35).rotateX(def.id === 'ak47' ? 0.35 : 0.15)); // mag
        gunGroup.add(bx(0.04, 0.06, 0.18, vm.wood ? mats.wood : body, 0, 0.0, 0.1));          // stock
        gunGroup.add(bx(0.05, 0.05, L * 0.3, vm.wood ? mats.wood : body, 0, 0.01, -L * 0.62)); // handguard
      }
      if (vm.scopeMesh) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10).rotateX(Math.PI / 2), mats.metal); s.position.set(0, 0.085, -0.3); gunGroup.add(s); }
      gunGroup.add(bx(0.07, 0.07, 0.1, glove, 0, -0.05, 0.02));                                // right hand
      if (!pistol) gunGroup.add(bx(0.07, 0.06, 0.1, glove, -0.01, -0.02, -L * 0.6));            // left hand
      else gunGroup.add(bx(0.06, 0.06, 0.08, glove, -0.035, -0.05, 0.0));
      gunGroup.add(bx(0.06, 0.06, 0.3, p.team === 'T' ? mats.gloveT : mats.gloveCT, 0.02, -0.08, 0.2)); // forearm
      tip = new THREE.Vector3(0, 0.035, -L - (vm.silencer ? 0.12 : 0.02));
    }
    muzzle.position.copy(tip); gunGroup.add(muzzle);
    gunGroup.userData.tip = tip;
    st.drawT = 1;
  };
  V.kick = def => {
    if (def.type === 'knife') { st.kick = 0.5; st.kickRot = -0.6; return; }
    st.kick = Math.min(1, st.kick + (def.type === 'sniper' ? 1 : def.type === 'shotgun' ? 0.9 : def.type === 'pistol' ? 0.5 : 0.35));
    st.kickRot = 0.1 + (def.type === 'sniper' ? 0.25 : 0.06);
    if (def.id !== 'usp') { muzzle.visible = true; muzzleT = 0.04; muzzle.material.rotation = Math.random() * 6; }
    const pl = G.player; pl.eye(tmp);
    FX.flashLight(tmp, def.id === 'usp' ? 0.3 : 1.4, 0.05);
    if (def.type !== 'shotgun') {
      // shell ejects to the right of the gun, in world space
      const right = new THREE.Vector3(Math.cos(pl.yaw), 0, -Math.sin(pl.yaw));
      FX.shell(tmp.clone().addScaledVector(right, 0.18).add(dirFromAngles(pl.yaw, pl.pitch).multiplyScalar(0.35)).setY(tmp.y - 0.12), right);
    }
    G.shake = Math.max(G.shake, def.type === 'sniper' ? 0.12 : 0.03);
  };
  V.reloadAnim = dur => { st.reloadT = dur; st.reloadDur = dur; };
  V.flinch = dmg => { st.flinch = Math.min(1, dmg / 40); };
  V.sway = (dx, dy) => { st.swayX = clamp(st.swayX - dx * 0.0004, -0.04, 0.04); st.swayY = clamp(st.swayY + dy * 0.0004, -0.04, 0.04); };
  /** World-space muzzle position (for tracers), approximated from the player's eye. */
  V.muzzleWorld = out => {
    const p = G.player; p.eye(out);
    const f = dirFromAngles(p.yaw, p.pitch);
    out.addScaledVector(f, 0.6); out.x += Math.cos(p.yaw) * 0.14; out.z -= Math.sin(p.yaw) * 0.14; out.y -= 0.14;
    return out;
  };
  V.update = (dt, speed) => {
    const p = G.player;
    st.kick *= Math.exp(-dt * 14); st.kickRot *= Math.exp(-dt * 12); st.flinch *= Math.exp(-dt * 6);
    st.swayX *= Math.exp(-dt * 8); st.swayY *= Math.exp(-dt * 8);
    if (muzzleT > 0) { muzzleT -= dt; if (muzzleT <= 0) muzzle.visible = false; }
    if (st.reloadT > 0) st.reloadT -= dt;
    if (st.drawT > 0) st.drawT = Math.max(0, st.drawT - dt / 0.45);
    st.bob += dt * speed * 1.6;
    const bobAmt = p.onGround ? Math.min(1, speed / 6) : 0;
    const rl = st.reloadT > 0 ? Math.sin(Math.PI * (1 - st.reloadT / st.reloadDur)) : 0;
    root.position.set(0.2 + st.swayX + Math.cos(st.bob) * 0.012 * bobAmt, -0.2 + st.swayY - Math.abs(Math.sin(st.bob)) * 0.012 * bobAmt - rl * 0.12 - st.drawT * 0.25 - p.crouchAmt * 0.01,
      -0.38 + st.kick * 0.05);
    root.rotation.set(st.kickRot + rl * 0.5 + st.drawT * 0.6 - st.flinch * 0.1, 0, rl * 0.6);
    root.visible = p.alive && !p.gun().scope;
  };
  V.render = renderer => { renderer.clearDepth(); renderer.render(scene, cam); };
  return V;
})();
