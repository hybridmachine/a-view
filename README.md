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

## Deploy to the web

The [Ubuntu deployment guide](docs/deployment.md) configures **theplaces.online** on standard HTTP/HTTPS ports using Caddy, Node.js 24, and systemd. It includes SSH deployment scripts, persistent world data, daily SQLite backups, health checks, and application rollback.

```sh
bash scripts/deploy.sh setup YOUR_SSH_TARGET
bash scripts/deploy.sh deploy YOUR_SSH_TARGET
```

HTTP redirects to HTTPS; Caddy obtains and renews certificates automatically. See the guide for DNS and firewall prerequisites before running setup.

## What works in this first prototype

- Full-viewport daytime and nighttime oil paintings, with subtle GPU water/foliage movement and authored night illumination.
- Server-authoritative calendar: exactly 365 world days per 30 elapsed real days. Daylight varies seasonally at a fictional latitude of 49° north.
- Continuous seasonal sun paths, an inclined lunar orbit with daytime phases, and a rotating star field, sampled from shared world time. Celestial disks pass behind clouds, hills, and oak leaf gaps. Rain, smoke, reeds, and birds use displayed real time.
- Selective wind motion in six painted grass tufts and four oak leaf clusters, with fixed attachments, shared passing gusts, and restrained leaf flutter.
- Persistent surface moisture: a damp foreground path, a shore stone, a small puddle, and sparse oak drips after rain. These traces dry over elapsed real minutes.
- A quiet cottage routine: two independent room lights, a casement that opens in fair weather, and smoke from a persisted hearth. A single implied resident completes short interior tasks before each change.
- One persisted nest-building study: a bird collects strands and delivers them before material is added. Its action position agrees across visitors. Nine deliveries complete the initial nest; there is no fabricated subsequent breeding cycle.
- A familiar bird that returns to a fixed oak perch after construction, rests behind the trunk, and sometimes visits the cottage roof. Its sparse opt-in call follows the same committed action across visitors.
- Transactional SQLite state and event records. Catch-up after downtime produces the same nest, cottage, surface state, and causal event order as continuous execution.
- Field notes derived from committed events, local follows, opt-in synthesized sound, fullscreen where supported, and a local pause that does not stop the world.
- Private light studies available through the **a view.** mark. They do not change server state. **Return to live** restores the current shared time.
- Narrow-screen panning by dragging the landscape, keyboard-accessible controls and dialogs, and reduced-motion support.

Controls fade after 12 seconds of inactivity. Move the pointer, tap, or use the keyboard to reveal them. The page remains available as a static painting when WebGL is unavailable.

## Dynamic sky

Cloud positions are derived directly from the shared elapsed time and the analytic integral of the existing wind model. Reloading, resuming, or reconnecting samples the current arrangement without replaying frames. Light studies change the calendar and weather while clouds continue moving. Local pause freezes all displayed inputs. Reduced motion holds the current cloud position while weather and illumination continue to change; turning it off rejoins shared time.

Sun, moon, and stars use a common sky coordinate system at 49° north. The camera faces east with a 100° horizontal field of view; viewport cropping happens after projection. Bodies rise behind the painted ridge and can travel above or outside the frame. The orbital approximation follows the fictional 365-day year and a 29.53059-day lunar phase cycle, including inclination and slow nodal motion. A half-degree disk receives a constant 1.5× artistic size multiplier for readability. Moon phase shading faces the sun and its dark hemisphere conceals stars. Reduced motion holds celestial geometry and phase while contrast follows live illumination. The original calendar lighting, bird/cottage schedules, and surface-weather rules are preserved.

The renderer composites clear sky, celestial light, two cloud layers, and a landscape with shared day/night coverage. Thin clouds attenuate celestial light spatially; opaque clouds and foreground hide it completely. The lake receives a small broad sky tint. The alpha mask describes sky visibility, not general depth: birds still use the existing overlay order, and cloud-shaped reflections, terrain shadows, and a precise astronomical model remain outside this version.

The original paintings remain intact. Missing or invalid sky assets, insufficient GPU limits, shader failure, and context loss show the appropriate original day/night painting without a procedural moon over its baked clouds. Restoration replaces the complete GPU resource set and reveals it only after a full frame.

The unlinked developer preview is [http://127.0.0.1:4174/dev/sky-study.html](http://127.0.0.1:4174/dev/sky-study.html). Run it against a temporary database:

```sh
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4174 npm start
```

Open that HTTP address in the browser while the server is running. Opening `public/dev/sky-study.html` directly as a `file://` page cannot load the application's modules. With a regular `npm start`, use port 4173 instead.

The preview opens at equinox sunrise and provides a world day/hour scrubber, calendar playback at normal/day/lunar-cycle speeds, seasonal and lunar fixtures, camera calibration, horizon and trajectory guides, and visibility diagnostics. It also retains independent elapsed/motion time, cloud cover, a controlled moon pose, layer visibility, alpha/transmission inspection, context-loss simulation, and production-shader pixel checks. Press **H** to hide its controls. It never writes fixture inputs to the world.

Run `scripts/check-celestial-browser.mjs` with the same optional Playwright setup to check ridge crossings, daytime phases, star occlusion, controls, crops, and moving-sky upload cost. `CELESTIAL_RECORD=1` additionally records rise time-lapses and real-speed motion using FFmpeg; `CELESTIAL_FRAME_DIR` selects a directory for intermediate frames. `SKY_VALIDATION_DIR` selects an output directory for the celestial, sky browser, and display checks. See [celestial validation](docs/celestial-validation/README.md) for results and recordings.

`scripts/check-sky-browser.mjs` automates shader, lifecycle, fallback, viewport, and performance checks using optional development-only Playwright. `scripts/check-sky-display.mjs` exercises visitor controls and clock boundaries. Set `SKY_PREVIEW_URL` for a different local port, `BROWSER_EXECUTABLE` for an existing Chromium binary, and `SKY_LONG_CHECK=1` for a one-minute crossing. The asset exporter uses optional development-only Sharp; neither package is a runtime dependency. See [verification results](docs/sky-validation/README.md) for measurements and remaining physical-device validation.

## Foliage wind

Ten authored patches bend on small meshes while their brush texture stays attached. The base painting contains repaired backgrounds beneath those patches; moving leaf coverage reveals the sky behind it. Trunks, main branches, rocks, the cottage, and most vegetation stay fixed. Motion is sampled directly from shared elapsed real time, with stable variation between patches and a common passing breeze. Reduced motion holds the entire pose, including wind amplitude, while lighting can change.

Foliage uses a separate two-texture WebGL pass. The dynamic sky starts with the intact foreground as soon as its own assets are ready, independently of foliage loading. Once validated, the repaired base and moving foliage activate together in a complete frame. An invalid or missing foliage bundle retains the intact dynamic sky; a draw failure restores it with the same selected sky layers. The original full paintings remain the WebGL/sky fallback. General bird/branch depth ordering and moving foliage shadows remain outside this version.

The existing `/dev/sky-study.html` preview includes calm, breeze, gust, and two-subject pilot fixtures, a rest-pose control, patch/attachment guides, and production foliage pixel checks. `scripts/prepare-foliage-assets.mjs` reproducibly exports the registered layers using optional Sharp; `scripts/check-foliage-browser.mjs` runs optional Playwright validation with the same environment options as the sky suite. See [foliage validation](docs/foliage-validation/README.md) and [artwork provenance](ARTWORK.md).

## Scope and honest limits

This is the first visual and continuity prototype. The spring landscape is painted into registered day/night plates; foliage does not yet grow, lose leaves, or accumulate snow. Blending these plates is an art experiment, not a full relightable 3D scene. The clock and season labels continue advancing, and the interface identifies the spring artwork study.

The nest study ends when construction finishes; the same bird then follows a limited perch/shelter routine. Aging, breeding, generations, visible human inhabitants, squirrels, ecological resource budgets, physical water accumulation, additional scenes, and region transfers remain design work. Ambient distant birds are visual effects. Smoke particles are sampled from persisted hearth activity rather than stored individually; the implied cottage resident has a coarse indoor routine, not a complete life simulation. Surface moisture uses persisted normalized artistic reservoirs, not a conserved physical water budget. The sky is an approximate procedural study, not an astronomical ephemeris. Sound is synthesized ambience, not a spatial ecological soundscape.

The world is shared by browsers connected to the same server. The application binds to loopback; the production configuration exposes it through Caddy. SQLite is a deliberate small-prototype substitute for the planned PostgreSQL infrastructure; this version is a single-process deployment. Every stream update sends a complete bounded snapshot, so a reconnect does not depend on replaying stream deltas. Out-of-order responses cannot replace newer state or rewind the displayed clock. The view holds just before the earliest pending bird, cottage, or routine decision boundary until a committed snapshot includes its effects. Expired snapshots trigger a bounded HTTP refresh even when the stream has silently stalled; overlapping refreshes share one request.

## Structure

- `shared/world.js`: scene registry, clock, environmental functions, and continuous bird trajectories.
- `shared/cottage.js` and `shared/lakeside-cottage.js`: deterministic indoor routines, committed poses, bounded smoke sampling, and authored window geometry.
- `shared/bird.js`, `shared/lakeside-bird.js`, and `public/bird-renderer.js`: persistent bird routines, fixed perches and flights, and subject-only bark occlusion.
- `public/cottage-renderer.js`: neutral window repairs, independent emission, a hinged casement, and atomic optional-asset lifecycle.
- `src/store.js`: transactional state, scheduled action completion, and event history.
- `src/server.js`: static delivery, world snapshot API, and shared event stream.
- `public/painting.js`: WebGL art rendering and lightweight Canvas animation.
- `shared/wind.js` and `shared/sky.js`: pure wind integration, deterministic cloud state, and celestial pose.
- `shared/celestial.js` and `shared/celestial-projection.js`: continuous orbital directions, inclined lunar phases, seeded stars, and projection into the authored sky camera. `shared/solar.js` retains the exact legacy calendar declination curve.
- `public/sky-renderer.js`: premultiplied sky composition, validated assets, cached celestial uploads, and GPU resource ownership.
- `shared/foliage.js` and `shared/lakeside-foliage.js`: deterministic breeze sampling, anchored mesh weights, and the authored patch layout.
- `public/foliage-renderer.js`: validated foliage bundles, registered atlas blending, mesh rendering, and GPU resource cleanup.
- `public/dev/sky-study.html`: isolated fixed-input preview and production-shader assertions.
- `public/app.js`: timing synchronization, controls, field notes, and private preview state.
- `public/world-client.js`: snapshot ordering, monotonic display time, action boundaries, and reconnect recovery.
- `public/scene-description.js`: precise accessible descriptions and quiet announcements for meaningful changes.
- `public/sound.js`: optional synthesized ambience.
- `test/world.test.js`: timing, causality, restart, catch-up, and shared-state checks.
- `test/world-client.test.js` and `test/sound.test.js`: response races, stalled streams, delivery consistency, announcements, concurrent audio toggles, and bounded automation.

The larger architecture and next milestones are in [DESIGN.md](DESIGN.md). Artwork provenance and generation prompts are in [ARTWORK.md](ARTWORK.md).

## License

This project is available under the [MIT License](LICENSE).

## Weather traces

Rain fills four normalized surface stores on canonical ten-real-second ticks. Requests and render frames do not change the integration grid. Browsers sample the fractional tick within the snapshot lease; local pause and connection expiry hold the displayed state. Reduced motion removes falling drips and holds ripple motion while surfaces can slowly dry. Private light studies use local dry/wet fixtures and never alter the shared stores.

The version-2 migration preserves the world's epoch, nest, and events, and starts surface memory dry at the upgrade timestamp. Existing history is not backfilled. Keep a pre-upgrade SQLite backup: the old version-1 application cannot read the migrated database. Very long catch-up advances in bounded batches and HTTP returns 503 until the current checkpoint is available.

A small optional two-texture pass draws registered wet paint before moving foliage. Asset failure omits the entire effect and preserves the original landscape. The new **After rain**, **Drying path**, and **Surface memory** controls are in the existing `/dev/sky-study.html` preview. `scripts/prepare-weather-assets.mjs` reproduces the atlases with optional Sharp; `scripts/check-weather-browser.mjs` runs the focused checks with optional Playwright and the same local-server/browser environment variables as the sky suite. See [weather validation](docs/weather-validation/README.md) and [the implementation plan](WEATHER_TRACES_IMPLEMENTATION_PLAN.md).

## Cottage life

The implied resident follows daylight and weather on a fixed 30-real-second decision grid. Independent lights, a fair-weather casement, and a hearth change only after committed 8–20-second interior tasks. Opening takes four seconds, with a fixed hinge and a painted dark recess behind the original panel. Hearth smoke disperses for up to 64 seconds after extinction and follows shared wind. Reduced motion omits smoke and uses the last settled casement pose until completion; pause freezes all displayed state. Private studies use fixed local cottage states.

Version 3 introduces this resident at upgrade time without inventing earlier history. The migration preserves environment, epoch, nest, and existing events, and adds structured event payloads and note visibility. Keep a pre-upgrade SQLite backup: earlier application versions cannot read a version-3 world. Only the first evening main-room light per world day appears in ordinary notes; repetitive routines remain in durable simulation history.

The cottage uses an independent optional two-texture pass after weather and before foliage. Neutral repairs fully cover baked window light, then separate warm emission depicts each room. Invalid assets disable the entire cottage layer and its smoke together; the original static painted cottage remains, and accessible text identifies this fallback. Existing dynamic sky, weather, and foliage continue independently.

The developer study includes six cottage fixtures and individual light/opening controls. `scripts/prepare-cottage-assets.mjs` exports the atlas pair with optional Sharp; `scripts/check-cottage-browser.mjs` checks rendering, lifecycle, and display modes with optional Playwright. All browser suites accept `SKY_GPU=metal` as an opt-in for Chrome's ANGLE Metal backend. See [cottage validation](docs/cottage-validation/README.md), [the implementation plan](COTTAGE_LIFE_IMPLEMENTATION_PLAN.md), and [artwork provenance](ARTWORK.md).

## Familiar bird

After the final nest delivery, the bird departs from the existing nest along an authored route. A thirty-real-second decision grid chooses long rests, fair-weather departures, shelter in rain/wind, and an optional late-afternoon roof visit. Flights last four to nine real seconds. Ordinary oak/shelter rests last five to twelve real minutes, roof pauses twenty to sixty seconds. It settles behind fixed bark at night. No visit starts or accelerates an event.

Version 4 preserves pending legacy deliveries, the completed nest, world epoch, weather, cottage state, and event history. Upgrades introduce the new routine at upgrade time without backfilling earlier habits. Keep a pre-upgrade SQLite backup; rolling back to version-3 code also requires restoring that compatible database. The deployment scripts already create a SQLite backup before activation; the [deployment guide](docs/deployment.md) explains restore and rollback.

Only the first roof arrival and three qualifying branch returns on distinct world days can add bird field notes. Routine action records stay in durable history without creating unread-note signals. The nest remains complete; no eggs or later biological stages are implied. Current bird and nest descriptions follow the displayed snapshot during pause.

The original small Canvas silhouette is retained. A 96 × 96 subject canvas applies a fixed trunk mask without repainting any scenery; roof travel changes scale continuously. This adds no image assets or GPU textures. Invalid bird art omits the subject independently of the other layers. Reduced motion holds the last settled pose until committed arrival; private light studies omit the bird.

The old eight-second local chirp timer is replaced by rare shared phrase actions, committed five seconds ahead. Sound remains off until explicitly enabled. Muting, pause, studies, hidden tabs, or expired timing cancel pending phrases; late arrivals skip missed calls. General water ambience remains cosmetic. The bird's three-note phrase is synthesized and does not claim an authentic species song.

The developer study adds oak, roof, shelter, and flight fixtures, a bird-action time slider, and route/occluder guides. Run `scripts/check-bird-browser.mjs` with the same optional Playwright settings as the other browser suites; `BIRD_RECORD=1` also records real-speed routes using Playwright's optional FFmpeg component. `node scripts/check-bird-state.mjs` measures day/month/year catch-up. See [bird validation](docs/bird-validation/README.md), [combined engagement review](docs/engagement-validation/README.md), and [the implementation plan](BIRD_FAMILIARITY_IMPLEMENTATION_PLAN.md).
