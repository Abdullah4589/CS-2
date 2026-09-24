
/* =============================== MAP =============================== */
/* Original Dust II-inspired layout on a 40x40 tile grid (3m tiles). Rows run north(0) -> south(39).
   Legend: # wall · . sand · T/S T & CT spawn (buy zones) · A/B bomb sites · u tunnel (roofed)
           c small crate (jumpable) · C big crate · 1-4 stairs/catwalk heights                      */
const TILE_TOP = { '#': WALL_H, 'c': 0.95, 'C': 2.1, '1': 0.35, '2': 0.7, '3': 1.05, '4': 1.4 };
const CRATE_INSET = { 'c': 0.3, 'C': 0.2 };

const MapGrid = (() => {
  const g = new Array(GRID_W * GRID_H).fill('#');
  const set = (c, r, ch) => { if (c >= 0 && r >= 0 && c < GRID_W && r < GRID_H) g[r * GRID_W + c] = ch; };
  const carve = (c0, r0, c1, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(c, r, ch); };

  carve(2, 2, 12, 12, 'B');          // B site
  carve(15, 2, 24, 8, 'S');          // CT spawn
  carve(13, 4, 14, 7, '.');          // CT -> B
  carve(25, 3, 26, 9, '.');          // CT -> A
  carve(27, 2, 37, 12, 'A');         // A site
  carve(18, 11, 21, 31, '.');        // Mid
  carve(19, 9, 20, 10, '.');         // Mid doors
  carve(13, 15, 17, 17, '.');        // Mid -> B connector
  carve(10, 13, 12, 17, '.');        // B window approach
  carve(22, 22, 22, 23, '1');        // Catwalk stairs up from mid
  carve(23, 22, 23, 23, '2');
  carve(24, 22, 24, 23, '3');
  carve(25, 13, 26, 23, '4');        // Catwalk / short A
  carve(25, 12, 26, 12, '3');        // Stairs down into A
  carve(25, 11, 26, 11, '2');
  carve(25, 10, 26, 10, '1');
  carve(34, 13, 37, 30, '.');        // Long A
  carve(28, 31, 37, 33, '.');        // Long doors corridor
  set(31, 31, '#'); set(31, 33, '#'); // Long doors (single gap)
  carve(12, 32, 28, 37, 'T');        // T spawn
  carve(4, 13, 6, 14, 'u');          // B tunnel exit
  carve(3, 15, 7, 26, 'u');          // Upper tunnels
  carve(8, 24, 11, 26, 'u');         // Tunnel stairs area
  carve(12, 25, 17, 26, 'u');        // Lower tunnels -> mid
  carve(8, 27, 11, 33, '.');         // Outside tunnels -> T spawn

  const crates = {
    C: [[5, 5], [6, 5], [9, 9], [31, 6], [32, 6], [35, 9], [20, 18], [34, 26], [13, 36]],
    c: [[5, 6], [10, 9], [3, 10], [11, 3], [31, 7], [36, 9], [35, 4], [29, 3], [20, 19], [17, 4], [22, 7],
        [36, 20], [15, 34], [25, 35], [5, 18], [7, 22]]
  };
  const siteOf = {};
  for (const k of ['C', 'c']) for (const [c, r] of crates[k]) { siteOf[r * GRID_W + c] = g[r * GRID_W + c]; set(c, r, k); }
  return { g, siteOf };
})();

const World = {
  g: MapGrid.g,
  under: MapGrid.siteOf, // original floor char under crates
  at(c, r) { return (c < 0 || r < 0 || c >= GRID_W || r >= GRID_H) ? '#' : this.g[r * GRID_W + c]; },
  tc(x) { return Math.floor(x / TILE + GRID_W / 2); },
  tr(z) { return Math.floor(z / TILE + GRID_H / 2); },
  cx(c) { return (c - GRID_W / 2) * TILE + TILE / 2; },
  cz(r) { return (r - GRID_H / 2) * TILE + TILE / 2; },
  charAt(x, z) { return this.at(this.tc(x), this.tr(z)); },
  /** Floor char at world pos, looking through crates. */
  floorAt(x, z) { const c = this.tc(x), r = this.tr(z), ch = this.at(c, r); return (ch === 'c' || ch === 'C') ? (this.under[r * GRID_W + c] || '.') : ch; },
  top(c, r) { return TILE_TOP[this.at(c, r)] || 0; },
  walkable(c, r) { const ch = this.at(c, r); return ch !== '#' && ch !== 'c' && ch !== 'C'; },
  /** Collision box of a tile (or null for flat floor). Tunnels return their ceiling slab. */
  box(c, r) {
    const ch = this.at(c, r);
    const x0 = (c - GRID_W / 2) * TILE, z0 = (r - GRID_H / 2) * TILE;
    if (ch === 'u') return { x0, x1: x0 + TILE, z0, z1: z0 + TILE, y0: TUNNEL_CEIL, y1: TUNNEL_CEIL + 0.35, ch };
    const top = TILE_TOP[ch];
    if (!top) return null;
    const i = CRATE_INSET[ch] || 0;
    return { x0: x0 + i, x1: x0 + TILE - i, z0: z0 + i, z1: z0 + TILE - i, y0: 0, y1: top, ch };
  },
  /** World-space centre of a tile, standing height. */
  spot(c, r) { return new THREE.Vector3(this.cx(c), this.top(c, r), this.cz(r)); }
};

/* ---------- Named locations used by bots, spawns and radar ---------- */
const SPOTS = {
  T_SPAWN: [[16, 34], [18, 35], [20, 34], [22, 35], [24, 34], [17, 36], [21, 36], [23, 36], [19, 33], [26, 33]],
  CT_SPAWN: [[17, 3], [19, 3], [21, 3], [23, 3], [18, 5], [20, 5], [22, 5], [16, 6], [23, 6], [20, 7]],
  PLANT: { A: [[32, 9], [33, 8], [30, 9], [34, 7]], B: [[7, 8], [8, 6], [4, 8], [8, 10]] },
  CENTER: { A: [32, 8], B: [7, 7] },
  CT_HOLD: {
    A: [{ p: [33, 4], l: [35, 14] }, { p: [29, 9], l: [25, 16] }, { p: [36, 11], l: [36, 22] }, { p: [28, 4], l: [34, 12] }],
    B: [{ p: [9, 4], l: [5, 14] }, { p: [3, 4], l: [5, 14] }, { p: [11, 10], l: [11, 17] }, { p: [8, 11], l: [5, 15] }],
    MID: [{ p: [19, 7], l: [19, 24] }, { p: [16, 5], l: [11, 16] }]
  },
  T_HOLD: {
    A: [{ p: [33, 4], l: [25, 5] }, { p: [36, 11], l: [36, 22] }, { p: [29, 11], l: [26, 5] }, { p: [30, 3], l: [25, 6] }],
    B: [{ p: [4, 4], l: [13, 5] }, { p: [10, 11], l: [12, 16] }, { p: [3, 11], l: [13, 5] }, { p: [9, 3], l: [14, 5] }]
  },
  ROUTES: {
    A: [[[31, 32], [35, 22], [35, 13]], [[19, 26], [23, 22], [25, 16], [26, 11]]],
    B: [[[10, 30], [5, 20], [5, 13]], [[19, 25], [15, 16], [11, 14]]]
  },
  /** Entry chokepoints T bots throw utility at when executing a site. */
  UTIL: { A: [[35, 13], [26, 11], [31, 10]], B: [[5, 13], [11, 13], [8, 8]] },
  CALLOUTS: [
    ['A Site', 27, 2, 37, 12], ['B Site', 2, 2, 12, 12], ['CT Spawn', 13, 2, 26, 9], ['Mid', 18, 9, 21, 31],
    ['Long A', 28, 13, 37, 33], ['Catwalk', 22, 13, 26, 23], ['Tunnels', 3, 13, 17, 30], ['T Spawn', 8, 31, 28, 38], ['B Window', 10, 13, 17, 17]
  ]
};
function calloutAt(x, z) {
  const c = World.tc(x), r = World.tr(z);
  for (const [n, c0, r0, c1, r1] of SPOTS.CALLOUTS) if (c >= c0 && c <= c1 && r >= r0 && r <= r1) return n;
  return '';
}

/* ------------------------- Map rendering -------------------------- */
function buildWorld(scene) {
  const mats = {
    sand: new THREE.MeshLambertMaterial({ map: Tex.sand }),
    site: new THREE.MeshLambertMaterial({ map: Tex.site }),
    wall: new THREE.MeshLambertMaterial({ map: Tex.wall }),
    tunnelWall: new THREE.MeshLambertMaterial({ map: Tex.tunnel }),
    concrete: new THREE.MeshLambertMaterial({ map: Tex.concrete }),
    crate: new THREE.MeshLambertMaterial({ map: Tex.crate }),
  };
  const buckets = {}; // key -> {geo, mat, list:[matrix]}
  const m4 = new THREE.Matrix4();
  const add = (key, geo, mat, x, y, z, shadow = true) => {
    if (!buckets[key]) buckets[key] = { geo, mat, list: [], shadow };
    buckets[key].list.push(new THREE.Matrix4().makeTranslation(x, y, z));
  };
  const floorGeo = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
  const wallGeo = tileBoxUV(new THREE.BoxGeometry(TILE, WALL_H, TILE), TILE, WALL_H, TILE, 3);
  const ceilGeo = tileBoxUV(new THREE.BoxGeometry(TILE, 0.35, TILE), TILE, 0.35, TILE, 3);
  const stairGeo = {};
  ['1', '2', '3', '4'].forEach(k => { const h = TILE_TOP[k]; stairGeo[k] = tileBoxUV(new THREE.BoxGeometry(TILE, h, TILE), TILE, h, TILE, 3); });
  const crateGeo = {
    c: tileBoxUV(new THREE.BoxGeometry(TILE - 0.6, 0.95, TILE - 0.6), 1, 1, 1, 1),
    C: new THREE.BoxGeometry(TILE - 0.4, 2.1, TILE - 0.4)
  };
  const nearTunnel = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (World.at(c + dc, r + dr) === 'u') return true; return false; };
  const exposed = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const n = World.at(c + dc, r + dr); if (n !== '#' && !(c + dc < 0 || r + dr < 0 || c + dc >= GRID_W || r + dr >= GRID_H)) return true; } return false; };

  for (let r = 0; r < GRID_H; r++) for (let c = 0; c < GRID_W; c++) {
    const ch = World.at(c, r), x = World.cx(c), z = World.cz(r);
    if (ch === '#') {
      if (exposed(c, r)) add(nearTunnel(c, r) ? 'twall' : 'wall', wallGeo, nearTunnel(c, r) ? mats.tunnelWall : mats.wall, x, WALL_H / 2, z);
      continue;
    }
    const floorCh = (ch === 'c' || ch === 'C') ? (World.under[r * GRID_W + c] || '.') : ch;
    if (TILE_TOP[ch] && '1234'.includes(ch)) add('st' + ch, stairGeo[ch], mats.concrete, x, TILE_TOP[ch] / 2, z);
    else if (floorCh === 'A' || floorCh === 'B') add('site', floorGeo, mats.site, x, 0, z, false);
    else if (floorCh === 'u') add('tfloor', floorGeo, mats.concrete, x, 0, z, false);
    else add('sand', floorGeo, mats.sand, x, 0, z, false);
    if (ch === 'u') add('ceil', ceilGeo, mats.tunnelWall, x, TUNNEL_CEIL + 0.175, z);
    if (ch === 'c' || ch === 'C') add('crate' + ch, crateGeo[ch], mats.crate, x, TILE_TOP[ch] / 2, z);
  }
  for (const k in buckets) {
    const b = buckets[k];
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
    b.list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = b.shadow; mesh.receiveShadow = true;
    mesh.userData.world = true;
    scene.add(mesh);
  }
  // Painted site letters on the north walls
  [['A', 32, '#c0392b'], ['B', 7, '#c0392b']].forEach(([L, c, col]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshLambertMaterial({ map: Tex.letter(L, col), transparent: true }));
    m.position.set(World.cx(c), 3.2, (2 - GRID_H / 2) * TILE + 0.03);
    scene.add(m);
  });
  // Sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.MeshBasicMaterial({ map: Tex.sky, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  // Ground plane beyond the map so the horizon isn't void
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xb09066 }));
  outer.position.y = -0.02; scene.add(outer);
}

/* ============================= PHYSICS ============================= */
/** Visit every tile overlapped by an XZ rectangle. */
function forTilesIn(x0, x1, z0, z1, fn) {
  const c0 = World.tc(x0), c1 = World.tc(x1), r0 = World.tr(z0), r1 = World.tr(z1);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(c, r);
}
/** First tile box blocking a hull at (x,z), or null. Boxes low enough to step onto don't block. */
function hullBlocked(e, x, z) {
  const R = HULL_R, feet = e.pos.y, head = feet + e.height, step = e.onGround ? STEP_H : 0.02;
  let hit = null;
  forTilesIn(x - R, x + R, z - R, z + R, (c, r) => {
    if (hit) return;
    const b = World.box(c, r);
    if (!b) return;
    if (x + R <= b.x0 || x - R >= b.x1 || z + R <= b.z0 || z - R >= b.z1) return;
    if (b.y1 <= feet + step || b.y0 >= head) return;
    hit = b;
  });
  return hit;
}
/** Ground height and ceiling above a hull at its current position. */
function hullSupport(e) {
  const R = HULL_R - 0.02, x = e.pos.x, z = e.pos.z, feet = e.pos.y;
  let ground = 0, ceil = Infinity;
  forTilesIn(x - R, x + R, z - R, z + R, (c, r) => {
    const b = World.box(c, r);
    if (!b || x + R <= b.x0 || x - R >= b.x1 || z + R <= b.z0 || z - R >= b.z1) return;
    if (b.y0 >= feet + STEP_H) ceil = Math.min(ceil, b.y0);
    else if (b.y1 <= feet + STEP_H + 0.01) ground = Math.max(ground, b.y1);
  });
  return { ground, ceil };
}
/** Integrate velocity with per-axis AABB resolution, step-up, gravity and ceilings. Returns landing speed (0 if none). */
function moveAndCollide(e, dt) {
  const R = HULL_R;
  for (const axis of ['x', 'z']) {
    const d = e.vel[axis] * dt;
    if (!d) continue;
    let nx = axis === 'x' ? e.pos.x + d : e.pos.x, nz = axis === 'z' ? e.pos.z + d : e.pos.z;
    const b = hullBlocked(e, nx, nz);
    if (b) {
      if (axis === 'x') nx = d > 0 ? b.x0 - R - 1e-3 : b.x1 + R + 1e-3;
      else nz = d > 0 ? b.z0 - R - 1e-3 : b.z1 + R + 1e-3;
      if (hullBlocked(e, nx, nz)) { nx = e.pos.x; nz = e.pos.z; }
      e.vel[axis] = 0;
    }
    e.pos.x = nx; e.pos.z = nz;
  }
  let { ground, ceil } = hullSupport(e);
  if (e.onGround && ground > e.pos.y && ground - e.pos.y <= STEP_H + 0.01) e.pos.y = ground;
  e.vel.y -= GRAVITY * dt;
  e.pos.y += e.vel.y * dt;
  let landed = 0;
  if (e.pos.y <= ground) {
    if (!e.onGround) landed = -e.vel.y;
    e.pos.y = ground; e.vel.y = 0; e.onGround = true;
  } else if (e.onGround && e.vel.y <= 0 && e.pos.y - ground < STEP_H) {
    e.pos.y = ground; e.vel.y = 0;
  } else e.onGround = false;
  if (e.pos.y + e.height > ceil) { e.pos.y = Math.max(ground, ceil - e.height); if (e.vel.y > 0) e.vel.y = 0; }
  return landed;
}

/* ---------------------------- Raycasting --------------------------- */
/** Slab test of a ray against a tile box. Returns {t, tExit, nx,ny,nz} for rays starting outside. */
function rayBox(o, d, b) {
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0, nz = 0;
  const axes = [['x', b.x0, b.x1], ['y', b.y0, b.y1], ['z', b.z0, b.z1]];
  for (const [a, lo, hi] of axes) {
    const oa = o[a], da = d[a];
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    let t1 = (lo - oa) / da, t2 = (hi - oa) / da, sign = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
    if (t1 > tmin) { tmin = t1; nx = ny = nz = 0; if (a === 'x') nx = sign; else if (a === 'y') ny = sign; else nz = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null;
  return { t: tmin, tExit: tmax, nx, ny, nz };
}
/** Grid DDA raycast against walls/crates/stairs/ceilings and the ground plane. */
function rayCast(o, d, maxT) {
  let c = World.tc(o.x), r = World.tr(o.z);
  const stepC = d.x > 0 ? 1 : -1, stepR = d.z > 0 ? 1 : -1;
  const x0 = (c - GRID_W / 2) * TILE, z0 = (r - GRID_H / 2) * TILE;
  const tdx = d.x !== 0 ? Math.abs(TILE / d.x) : Infinity, tdz = d.z !== 0 ? Math.abs(TILE / d.z) : Infinity;
  let tmx = d.x > 0 ? (x0 + TILE - o.x) / d.x : d.x < 0 ? (x0 - o.x) / d.x : Infinity;
  let tmz = d.z > 0 ? (z0 + TILE - o.z) / d.z : d.z < 0 ? (z0 - o.z) / d.z : Infinity;
  const tg = d.y < 0 ? -o.y / d.y : Infinity;
  let tEnter = 0;
  for (let i = 0; i < 200 && tEnter <= maxT; i++) {
    const b = World.box(c, r);
    if (b) {
      const h = rayBox(o, d, b);
      if (h && h.t <= maxT && h.t < tg) return { t: h.t, tExit: h.tExit, nx: h.nx, ny: h.ny, nz: h.nz, ch: b.ch, c, r };
    }
    const tExit = Math.min(tmx, tmz);
    if (tg >= tEnter && tg <= tExit && tg <= maxT) return { t: tg, tExit: tg, nx: 0, ny: 1, nz: 0, ch: 'ground', c, r };
    if (c < 0 || r < 0 || c >= GRID_W || r >= GRID_H) break;
    tEnter = tExit;
    if (tmx < tmz) { tmx += tdx; c += stepC; } else { tmz += tdz; r += stepR; }
  }
  return null;
}
const _losD = new THREE.Vector3();
/** True if nothing solid lies between points a and b. */
function losClear(a, b) {
  _losD.subVectors(b, a); const len = _losD.length();
  if (len < 1e-4) return true;
  _losD.divideScalar(len);
  const h = rayCast(a, _losD, len);
  return !h || h.t >= len - 0.05;
}

/* ------------------------ Navigation (A*) ------------------------- */
/** 8-connected A* over walkable tiles, respecting step heights. Returns tile list [[c,r],...]. */
function findPath(c0, r0, c1, r1) {
  if (!World.walkable(c1, r1)) return null;
  const N = GRID_W * GRID_H, start = r0 * GRID_W + c0, goal = r1 * GRID_W + c1;
  const gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [start]; gS[start] = 0;
  const h = i => { const dc = Math.abs(i % GRID_W - c1), dr = Math.abs(((i / GRID_W) | 0) - r1); return Math.max(dc, dr) + 0.41 * Math.min(dc, dr); };
  const fS = new Float32Array(N).fill(Infinity); fS[start] = h(start);
  const canStep = (a, ca, ra, cb, rb) => World.walkable(cb, rb) && World.top(cb, rb) - World.top(ca, ra) <= STEP_H + 0.01;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (fS[open[i]] < fS[open[bi]]) bi = i;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) {
      const path = []; let p = cur;
      while (p !== -1) { path.push([p % GRID_W, (p / GRID_W) | 0]); p = from[p]; }
      return path.reverse();
    }
    closed[cur] = 1;
    const cc = cur % GRID_W, cr = (cur / GRID_W) | 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nc = cc + dc, nr = cr + dr, ni = nr * GRID_W + nc;
      if (nc < 0 || nr < 0 || nc >= GRID_W || nr >= GRID_H || closed[ni]) continue;
      if (!canStep(cur, cc, cr, nc, nr)) continue;
      if (dc && dr && (!canStep(cur, cc, cr, nc, cr) || !canStep(cur, cc, cr, cc, nr))) continue;
      const ng = gS[cur] + (dc && dr ? 1.414 : 1);
      if (ng < gS[ni]) {
        if (gS[ni] === Infinity) open.push(ni);
        gS[ni] = ng; from[ni] = cur; fS[ni] = ng + h(ni);
      }
    }
  }
  return null;
}
