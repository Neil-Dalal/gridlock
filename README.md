# Gridlock

A neon retro-arcade, 3-lane car-dodging game built with React, TypeScript, and Canvas — bootstrapped from a Google AI Studio app template. Steer between three lanes, dodge oncoming hazards, grab power-ups, and chase a high score.

## Gameplay

- **3-lane dodging** — move left/center/right to avoid oncoming traffic and road hazards (barricades, cones, potholes, stalled vehicles, oil slicks).
- **Run modifiers (draft system)** — before each run, pick 1 of 3 randomly drawn modifiers that change how the run plays:
  - ⚡ **Rush** — triples score, +40% speed
  - 🧲 **Magnet** — auto-collects rings, but also attracts hazards
  - 🔬 **Mini** — smaller hitbox, twitchier steering
  - 🔰 **Armor** — one-time crash protection, heavier steering
  - ⏳ **Slow-Mo** — 0.65× speed, darkened vision
- **Power-ups** — collect a Mystery Box for a random effect: 🛡️ Shield (1-hit protection), 💥 EMP Clear (screen-clearing burst), or 🧲 Magnet (temporary ring auto-collect).
- **Collectibles** — rings and coins add to your score along the way.
- **Retro presentation** — synthwave color palette, custom retro sound effects, and a scoring HUD.

Controls: **←/A** and **→/D** to change lanes, **Space** to start.

## Two ways to play

1. **React app** (`src/`) — the main app shell (`App.tsx`) wraps the game canvas component (`ArcadeGame.tsx`), with a header/footer and mute toggle.
2. **Standalone HTML** (`public/game.html`) — a self-contained, single-file version of the game with no build step. The React app has buttons to open this file directly or copy its raw HTML to the clipboard.

## Tech stack

- React 19 + TypeScript
- Vite 6 (dev server / bundler)
- Tailwind CSS 4
- lucide-react (icons), motion (animation)
- Game loop and rendering are hand-rolled (Canvas-based), not a game engine

> Note: the project still lists `@google/genai`, `express`, and `dotenv` as dependencies from the original AI Studio scaffold, but none of them are currently used in the game code — there's no live AI/Gemini integration or backend server in this project.

## Project structure

```
src/
├── App.tsx              # App shell: header, footer, mute toggle
├── main.tsx             # React entry point
├── components/
│   ├── ArcadeGame.tsx   # Core game loop, rendering, input handling
│   └── DraftModal.tsx   # Pre-run modifier draft/selection screen
├── modifiers.ts         # Run modifier definitions + ModifierManager
├── powerups.ts          # Power-up types + BuffManager
├── obstacles.ts         # Roadway hazard definitions
├── audio.ts             # Retro sound effect engine
├── types.ts             # Shared type definitions
└── index.css            # Global styles
public/
└── game.html            # Standalone single-file build of the game
```

## Run locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

This starts the Vite dev server at `http://localhost:3000`.

Other scripts:

```bash
npm run build     # production build
npm run preview   # preview the production build
npm run lint       # type-check with tsc
```

## Status

Deployed on Vercel: [gridlock-us.vercel.app](https://gridlock-us.vercel.app)
