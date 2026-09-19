# A View

A full-window, living oil painting. The first scene is **The Lakeside Cottage**, in the fictional Stillwater Valley.

![The Lakeside Cottage, a painted landscape with an old oak, a stone cottage, and a quiet lake](public/assets/lakeside-day.png)

## Run locally

Node.js 24 or newer is required. There are no third-party runtime dependencies or installation steps.

```sh
npm start
```

Open **http://127.0.0.1:4173**. `PORT` selects a different port. `A_VIEW_DB` selects a different SQLite file. The default world is saved in `data/world.sqlite`; retain this file and its SQLite sidecars when backing up a running world. Restarting the application preserves the world epoch and history.

```sh
npm run check
npm test
```

## What works in this first prototype

- Full-viewport daytime and nighttime oil paintings, with subtle GPU water/foliage movement and authored night illumination.
- Server-authoritative calendar: exactly 365 world days per 30 elapsed real days. Daylight varies seasonally at a fictional latitude of 49° north.
- Stable, shared weather and a restrained procedural sky, rain, smoke, reeds, and birds. Motion uses real seconds.
- One persisted nest-building study: a bird collects strands and delivers them before material is added. Its action position agrees across visitors. Nine deliveries complete the initial nest; there is no fabricated subsequent breeding cycle.
- Transactional SQLite state and event records. Catch-up after downtime produces the same nesting result as continuous execution.
- Field notes derived from committed events, local follows, opt-in synthesized sound, fullscreen where supported, and a local pause that does not stop the world.
- Private light studies available through the **a view.** mark. They do not change server state. **Return to live** restores the current shared time.
- Narrow-screen panning by dragging the landscape, keyboard-accessible controls and dialogs, and reduced-motion support.

Controls fade after 12 seconds of inactivity. Move the pointer, tap, or use the keyboard to reveal them. The page remains available as a static painting when WebGL is unavailable.

## Scope and honest limits

This is the first visual and continuity prototype. The spring landscape is painted into registered day/night plates; foliage does not yet grow, lose leaves, or accumulate snow. Blending these plates is an art experiment, not a full relightable 3D scene. The clock and season labels continue advancing, and the interface identifies the spring artwork study.

The nest study ends when construction finishes. Aging, breeding, generations, inhabitants' routines, squirrels, ecological resource budgets, water accumulation, additional scenes, and region transfers remain design work. Ambient distant birds and smoke are visual effects, not individually persisted entities. Rain currently changes appearance without a persisted water budget. The sky is an approximate procedural study, not an astronomical ephemeris. Sound is synthesized ambience, not a spatial ecological soundscape.

The world is shared by browsers connected to this running local server. It is not publicly hosted. The application binds to loopback. SQLite is a deliberate small-prototype substitute for the planned PostgreSQL infrastructure; this version is a single-process deployment. Every stream update sends a complete bounded snapshot, so a reconnect does not depend on replaying stream deltas. A connection gap longer than 30 seconds holds the latest valid state.

## Structure

- `shared/world.js`: scene registry, clock, environmental functions, and continuous bird trajectories.
- `src/store.js`: transactional state, scheduled action completion, and event history.
- `src/server.js`: static delivery, world snapshot API, and shared event stream.
- `public/painting.js`: WebGL art rendering and lightweight Canvas animation.
- `public/app.js`: timing synchronization, controls, field notes, and private preview state.
- `public/sound.js`: optional synthesized ambience.
- `test/world.test.js`: timing, causality, restart, catch-up, and shared-state checks.

The larger architecture and next milestones are in [DESIGN.md](DESIGN.md). Artwork provenance and generation prompts are in [ARTWORK.md](ARTWORK.md).

## License

This project is available under the [MIT License](LICENSE).
