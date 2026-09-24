// @ts-check
const { test: base, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const GAME_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

/** Loads the game and fails the test on any uncaught page error. */
const test = base.extend({
  game: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Headless Chrome may grant pointer lock and then drop it, which (correctly) pauses the game.
    // Stub it so tests stay deterministic; pausing is covered explicitly below.
    await page.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(GAME_URL);
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
  }
});

async function startMatch(page, side = 'Counter-Terrorists') {
  await page.getByRole('button', { name: side, exact: true }).click();
  await page.getByRole('button', { name: /play/i }).click();
  await expect(page.locator('#hud')).toBeVisible();
}

/** Stops real-time stepping and makes bots stand still so objective tests are deterministic. */
async function freezeBots(page, extra = '') {
  await page.evaluate(extra => {
    G.paused = true;
    Bots.update = (b, dt) => {
      if (extra === 'plant' && b.hasBomb()) Game.holdPlant(b, dt);
      b.move(dt, 0, 0, false);
    };
    G.phaseT = 0;
    Engine.simulate(0.1); // freeze time -> live
  }, extra);
}

test.describe('menus', () => {
  test('main menu shows side and difficulty choices', async ({ game: page }) => {
    await expect(page.getByText('COUNTER-STRIKE')).toBeVisible();
    const hard = page.getByRole('button', { name: 'Hard', exact: true });
    await hard.click();
    await expect(hard).toHaveClass(/on/);
    await expect(page.getByRole('button', { name: 'Normal', exact: true })).not.toHaveClass(/on/);
  });

  test('controls screen opens and closes', async ({ game: page }) => {
    await page.getByRole('button', { name: /controls/i }).click();
    await expect(page.getByRole('heading', { name: /controls & help/i })).toBeVisible();
    await page.getByRole('button', { name: /got it/i }).click();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  });

  test('settings persist across reloads', async ({ game: page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByLabel('Field of view').fill('100');
    await expect(page.locator('#s-fov-v')).toHaveText('100°');
    await page.getByLabel('Crosshair center dot').check();
    await page.getByRole('button', { name: /done/i }).click();
    await page.reload();
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByLabel('Field of view')).toHaveValue('100');
    await expect(page.getByLabel('Crosshair center dot')).toBeChecked();
  });
});

test.describe('match', () => {
  test('starting a match shows the round 1 HUD', async ({ game: page }) => {
    await startMatch(page);
    await expect(page.locator('#hp-val')).toHaveText('100');
    await expect(page.locator('#money')).toHaveText('$800');
    await expect(page.locator('#roundnum')).toHaveText('ROUND 1/30');
    await expect(page.locator('#weapon-name')).toHaveText('USP-S');
    await expect(page.locator('#alive-right i')).toHaveCount(5);
  });

  test('buy menu buys a Desert Eagle during freeze time', async ({ game: page }) => {
    await startMatch(page);
    await page.evaluate(() => { G.phaseT = 999; }); // keep freeze (buy) time from running out
    await page.keyboard.press('b');
    await expect(page.getByRole('heading', { name: 'Buy Menu' })).toBeVisible();
    await expect(page.getByText('AK-47')).toHaveCount(0); // T-only rifle hidden for CT
    await page.getByText('Desert Eagle', { exact: true }).click();
    await expect(page.locator('#buy-money')).toHaveText('$100');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Buy Menu' })).toBeHidden();
    await expect(page.locator('#slots')).toContainText('Desert Eagle');
  });

  test('scoreboard shows while Tab is held', async ({ game: page }) => {
    await startMatch(page);
    await page.keyboard.down('Tab');
    await expect(page.locator('#scoreboard')).toBeVisible();
    await expect(page.locator('#scoreboard')).toContainText('COUNTER-TERRORISTS');
    await expect(page.locator('#scoreboard')).toContainText('TERRORISTS');
    await page.keyboard.up('Tab');
    await expect(page.locator('#scoreboard')).toBeHidden();
  });

  test('hiding the tab pauses; resume and quit work', async ({ game: page }) => {
    await startMatch(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: /resume/i }).click();
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeHidden();
    await page.evaluate(() => Engine.pause(true));
    await page.getByRole('button', { name: /quit to main menu/i }).click();
    await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
  });

  test('window resize updates the renderer', async ({ game: page }) => {
    await startMatch(page);
    await page.setViewportSize({ width: 900, height: 600 });
    await expect.poll(() => page.evaluate(() => [G.renderer.domElement.clientWidth, G.renderer.domElement.clientHeight]))
      .toEqual([900, 600]);
  });
});

test.describe('objectives', () => {
  test('planting as T then letting the bomb explode wins the round', async ({ game: page }) => {
    await startMatch(page, 'Terrorists');
    await freezeBots(page);
    await page.evaluate(() => {
      G.agents.forEach(a => { a.slots[5] = null; });
      G.player.slots[5] = new Gun('c4'); G.bomb.carrier = G.player;
      G.player.pos.copy(World.spot(7, 8)); // B site plant spot
      G.player.switchTo(5, true);
      Input.keys.KeyE = true;
      Engine.simulate(3.7);
      Input.keys.KeyE = false;
    });
    expect(await page.evaluate(() => G.bomb.state)).toBe('planted');
    await expect(page.locator('#bomb-planted')).toBeVisible();
    await page.evaluate(() => Engine.simulate(41));
    expect(await page.evaluate(() => ({ state: G.bomb.state, score: G.score[G.player.squad] })))
      .toEqual({ state: 'exploded', score: 1 });
    await expect(page.locator('#cm-big')).toHaveText('TERRORISTS WIN');
  });

  test('releasing E resets plant progress', async ({ game: page }) => {
    await startMatch(page, 'Terrorists');
    await freezeBots(page);
    const prog = await page.evaluate(() => {
      G.agents.forEach(a => { a.slots[5] = null; });
      G.player.slots[5] = new Gun('c4');
      G.player.pos.copy(World.spot(7, 8));
      G.player.switchTo(5, true);
      Input.keys.KeyE = true; Engine.simulate(2);
      const mid = G.player.plantProg;
      Input.keys.KeyE = false; Engine.simulate(0.1);
      return [mid, G.player.plantProg, G.bomb.state];
    });
    expect(prog[0]).toBeGreaterThan(1.9);
    expect(prog[1]).toBe(0);
    expect(prog[2]).toBe('carried');
  });

  test('defusing as CT without a kit takes 10s and wins the round', async ({ game: page }) => {
    await startMatch(page, 'Counter-Terrorists');
    await freezeBots(page, 'plant');
    await page.evaluate(() => {
      G.bomb.carrier.pos.copy(World.spot(32, 9)); // A site
      Engine.simulate(3.7);
    });
    expect(await page.evaluate(() => G.bomb.state)).toBe('planted');
    await page.evaluate(() => {
      G.player.kit = false;
      G.player.pos.copy(G.bomb.pos);
      Input.keys.KeyE = true;
      Engine.simulate(5);
    });
    await expect(page.locator('#progress-label')).toHaveText('DEFUSING BOMB');
    expect(await page.evaluate(() => G.bomb.state)).toBe('planted'); // not done at 5s without kit
    await page.evaluate(() => { Engine.simulate(5.3); Input.keys.KeyE = false; });
    expect(await page.evaluate(() => ({ state: G.bomb.state, score: G.score[G.player.squad] })))
      .toEqual({ state: 'defused', score: 1 });
    await expect(page.locator('#cm-big')).toHaveText('COUNTER-TERRORISTS WIN');
  });

  test('a bot-only round ends and awards a point', async ({ game: page }) => {
    await startMatch(page);
    const result = await page.evaluate(() => {
      G.paused = true;
      const startRound = G.round;
      for (let i = 0; i < 200 && G.round === startRound; i++) Engine.simulate(1);
      return { round: G.round, total: G.score[0] + G.score[1] };
    });
    expect(result).toEqual({ round: 2, total: 1 });
  });
});

test.describe('friendly fire', () => {
  test('bullets hurt teammates at 33% damage', async ({ game: page }) => {
    await startMatch(page);
    await freezeBots(page);
    const lost = await page.evaluate(() => {
      const p = G.player, mate = G.agents.find(a => a.isBot && a.team === p.team);
      p.pos.copy(World.spot(19, 28)); mate.pos.copy(World.spot(19, 26));
      mate.armor = 0; mate.helmet = false; // pistol-round bots may have bought kevlar
      p.vel.set(0, 0, 0); p.crouching = false;
      p.eye(_o);
      const a = anglesTo(_o.x, _o.y, _o.z, mate.pos.x, mate.pos.y + 1.2, mate.pos.z);
      p.yaw = a.yaw; p.pitch = a.pitch;
      p.gun().nextFire = 0; p.drawEnd = 0;
      fireGun(p, G.time);
      return 100 - mate.hp;
    });
    // USP-S chest hit is ~34 on an enemy; a teammate should take about a third of that
    expect(lost).toBeGreaterThanOrEqual(8);
    expect(lost).toBeLessThanOrEqual(15);
  });

  test('grenades do not hurt teammates but do hurt the thrower', async ({ game: page }) => {
    await startMatch(page);
    await freezeBots(page);
    const hp = await page.evaluate(() => {
      const p = G.player, mate = G.agents.find(a => a.isBot && a.team === p.team);
      p.pos.copy(World.spot(19, 28)); mate.pos.copy(World.spot(20, 28));
      p.nades = ['he']; p.pitch = -1.4; // throw at own feet
      Grenades.throwFrom(p, 'he', 0.4);
      Engine.simulate(2.5);
      return { mate: mate.hp, self: p.hp };
    });
    expect(hp.mate).toBe(100);
    expect(hp.self).toBeLessThan(100);
  });

  test('bots do not shoot through a teammate in their line of fire', async ({ game: page }) => {
    await startMatch(page);
    const r = await page.evaluate(() => {
      const realUpdate = Bots.update;
      G.paused = true; G.phaseT = 0;
      const [shooter, mate] = G.agents.filter(a => a.isBot && a.team === G.player.team);
      const enemy = G.agents.find(a => a.team !== G.player.team);
      G.agents.forEach(a => { if (a !== shooter && a !== mate && a !== enemy) a.alive = false; });
      Bots.update = (b, dt) => (b === shooter ? realUpdate(b, dt) : b.move(dt, 0, 0, false));
      Engine.simulate(0.1);
      shooter.pos.copy(World.spot(19, 28)); mate.pos.copy(World.spot(19, 25)); enemy.pos.copy(World.spot(19, 20));
      shooter.yaw = 0; shooter.pitch = 0;
      const t0 = G.time;
      Engine.simulate(3);
      return { mateHp: mate.hp, fired: shooter.gun().lastShot > t0 };
    });
    expect(r.mateHp).toBe(100);
    expect(r.fired).toBe(true); // it side-stepped to a clear line and engaged
  });
});

test.describe('map', () => {
  test('all named spots are walkable and reachable from both spawns', async ({ game: page }) => {
    const bad = await page.evaluate(() => {
      const spots = [...SPOTS.T_SPAWN, ...SPOTS.CT_SPAWN, ...SPOTS.PLANT.A, ...SPOTS.PLANT.B,
        ...['A', 'B', 'MID'].flatMap(k => SPOTS.CT_HOLD[k].map(h => h.p)),
        ...['A', 'B'].flatMap(k => SPOTS.T_HOLD[k].map(h => h.p)),
        ...['A', 'B'].flatMap(k => SPOTS.ROUTES[k].flat())];
      const out = [];
      for (const [c, r] of spots) {
        if (!World.walkable(c, r)) out.push(`not walkable ${c},${r}`);
        if (!findPath(20, 34, c, r)) out.push(`no path from T spawn to ${c},${r}`);
        if (!findPath(19, 3, c, r)) out.push(`no path from CT spawn to ${c},${r}`);
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
});
