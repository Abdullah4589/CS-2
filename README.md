# Counter-Strike Web: Tactical

Single-file browser tactical shooter (Three.js r128 from cdnjs). 5v5 bomb defusal vs bots.

- **Play:** open `index.html` in Chrome/Edge/Firefox (internet needed once for the Three.js CDN).
  If your browser blocks pointer lock on `file://`, serve the folder: `python -m http.server` → http://localhost:8000
- **Source:** `src/` holds the file split into sections; `sh src/build.sh` concatenates them into `index.html`.
- Controls: see the in-game "Controls & Help" screen. Use **C** to crouch if Ctrl+W would close your tab.
