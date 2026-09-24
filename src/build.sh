#!/bin/sh
# Concatenate the source parts into the single-file game.
cd "$(dirname "$0")"
cat 01_head.html 02_core.js 03_map.js 04_weapons.js 05_agents.js 06_bots.js 07_fx.js 08_viewmodel.js 09_game.js 10_ui.js 11_engine.js 12_tail.html > ../index.html
