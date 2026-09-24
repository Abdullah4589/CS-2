# Counter-Strike Web: Tactical

Single-file browser tactical shooter (Three.js r128 from cdnjs). 5v5 bomb defusal vs bots.

- **Play:** open `index.html` in Chrome/Edge/Firefox (internet needed once for the Three.js CDN).
  If your browser blocks pointer lock on `file://`, serve the folder: `python -m http.server` → http://localhost:8000
- **Source:** `src/` holds the file split into sections; `sh src/build.sh` concatenates them into `index.html`.
- Controls: see the in-game "Controls & Help" screen. Use **C** to crouch if Ctrl+W would close your tab.

## Tests

Playwright e2e tests run against your installed Google Chrome (no browser download):

```sh
npm install        # once
npm test           # rebuilds index.html, then runs tests/game.spec.js
```

They cover menus, settings persistence, HUD, buy menu, scoreboard, pause/resume,
resize, plant/explode, plant/defuse, a full bot round, and map pathing.
The page loads Three.js from cdnjs, so tests need network access.
