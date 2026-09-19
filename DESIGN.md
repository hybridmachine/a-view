# A View — initial world and scene design

Status: proposal for discussion, September 18, 2026. This is a design brief, not an implemented system. “A View” is a working title taken from the project directory.

Implementation checkpoint: the initial scene prototype is now available. See [README.md](README.md) for what is implemented and its explicit limits. It uses a small WebGL art renderer and local SQLite persistence to test the visual direction and continuity; the broader architecture below remains the target design.

The experience is a place to return to: an oil painting that quietly lives, remembers what happened, and offers new things to notice. The landscape occupies the browser viewport. Its composition must be satisfying when nothing dramatic is happening.

## Design commitments and working assumptions

The requested commitments are a persistent world; natural visible movement; one 365-day world year per 30 elapsed real days; accelerated seasons and day/night; weather; and stories arising from the lives of plants, animals, and people. The infrastructure must accommodate many scenes.

Confirmed by the user during this design session:

- Everyone visits the same world. A scene has one present and one history, independent of who is watching.
- Lasting changes accumulate across years. Seasons repeat, but the world does not reset.

Additional working assumptions:

- Visitors observe and follow places. They do not initially feed animals, place objects, or alter events.
- The first region is a fictional temperate lake valley. Species, latitude, architectural references, and painting style will be selected together before production art.
- Each scene has an authored camera and composition. Browsing the world moves between views.

The architecture below incorporates the confirmed shared-world and lasting-change decisions. The additional assumptions remain open for discussion.

## Time: two explicit domains

Use an accelerated calendar for slow change and astronomical time, and elapsed real seconds for visible actions.

`worldSeconds = worldEpochSeconds + (serverUtcSeconds - realEpochSeconds) × 365 / 30`

The ratio is exactly 73/6. Store the epoch and ratio centrally; use integer or rational calculations for durable timestamps. “30 days” means 30 × 24 elapsed hours, not a named calendar month. Timezones and daylight saving changes affect display only. The initial fictional calendar has 365 days per year, without leap days.

| World duration | Elapsed real duration |
| --- | --- |
| 1 hour | 4 minutes 55.9 seconds |
| 1 day | 1 hour 58 minutes 21.4 seconds |
| 1 week | 13 hours 48 minutes 29.6 seconds |
| One quarter of a year | 7.5 days |
| 1 year | 30 days |

A 365-day real year contains about 12.17 world years. Literal lifetime progression therefore means recognizable animals and residents eventually age and are replaced. The landscape can remain recognizable through mature trees, durable buildings, maintenance, reproduction, and succession.

| Process | Governing time and behavior |
| --- | --- |
| Sun, moon, stars, daylight length | World time and the region's latitude/longitude. Shadows and sky change continuously. |
| Leaf development, flowering, maturation, aging | World time, modified by environment and species rules. |
| Breeding readiness and biological development | World time plus resource and care prerequisites. |
| Walking, flight, hopping, chewing, door movement | Real seconds, with plausible path lengths and speeds. |
| Rain particles, ripples, falling leaves, smoke | Real seconds. Environmental conditions supply their intensity and direction. |
| Weather systems | A world-time regional schedule with continuous transitions; local wind and cloud motion remain visually natural. |
| Wetness, snow, soil moisture, lake storage | Explicit rate equations with documented units and bounded transitions. |

This is an intentional time abstraction. Accelerated biology and astronomy alongside normal motion cannot reproduce one universally scaled physical clock. The design promise is natural motion and consistent cause and effect under these explicit rules.

Every process declares its time domain. Biological rates can use world days; precipitation flux uses millimeters per real hour and is integrated once. Regional weather parameters must be calibrated to that choice, so annual water balance remains credible without multiplying rain accumulation twice. Numerical rain particles visualize a flux; they are not individually counted as all the water in the watershed.

Visible work is never completed merely because the calendar advanced. A nest receives material after a delivery finishes. A person completes a journey before entering a cottage. Resource gathering and care requirements must fit the shorter day: use compact habitats and achievable action budgets, then tune abstract resource units rather than speeding up bodies. Calendar deadlines trigger replanning, not teleportation.

Behavior scheduling follows local daylight. A walk that starts before sunset may finish after it. A new visitor does not reset anyone's actions or synchronize all birds to the same animation phase.

## The first scene

Working concept: **The Lakeside Cottage**.

A foreground tree frames a winding path down to a small cottage near a lake. Grass and shoreline reeds give the foreground subtle movement. The lake provides broad areas of visual rest and changing reflections. Hills and a distant second roof suggest places beyond this view. A nest site is close enough to read without turning the whole composition into a close-up. A squirrel uses the tree, ground, and a sheltered cache. A cottage resident has reasons to walk between the door, shore, garden, and an exit path.

Keep several durable landmarks that make return visits legible: the fork in the foreground tree, a stone by the water, the cottage gate, and the path's curve. The camera remains still by default. Responsive framing can reveal more sky or foreground and offer gentle panning on narrow screens; it must not move or distort world objects to fit the screen.

The initial story palette has three scales:

- Seconds and minutes: a bird lands and looks around; the resident carries something along the path; a breeze crosses the grass.
- Real hours and days: a nest takes shape; rain leaves the path damp; a cache is used; flowers emerge.
- Real weeks and months: a brood leaves; foliage changes; a sapling grows; a branch remains broken; the cottage is maintained; new inhabitants arrive when appropriate.

These are candidate events, not a guaranteed timetable. A quiet visit must still be worthwhile.

## Painting and rendering

Recommended starting direction: a fixed-camera scene built from painted layers, shallow geometry, and a small number of fully modeled moving subjects. “2.5D” here means an authored painting composition with enough spatial depth for occlusion, paths, lighting, and reflections.

Separate the distant sky/hills, terrain and lake, tree trunks and foliage, cottage and props, moving inhabitants, and atmospheric effects. Interactive foreground objects need stable identities and spatial coordinates even when their visible representation is a painted card.

Build the oil-painting character into the assets and materials: a controlled palette, broken color, brush direction following forms, selective sharpness, and restrained detail. Brush textures should stay attached to surfaces. A light final image treatment can unify layers, but a moving full-screen filter alone is unlikely to deliver the desired painting quality; this is a hypothesis to validate visually.

Day/night requires relightable surfaces or authored light-response layers. A painting with strong baked-in noon shadows cannot simply be tinted blue to become convincing moonlight. Use depth and normal information where helpful, separate emissive cottage windows, and ensure reflections follow the same sky and light sources. Seasonal foliage changes should vary across branches and patches, preserving trunk shapes and object identity. Snow rests on plausible surfaces and melts progressively.

Cloud cover, sun elevation, moon phase, and seasonal atmosphere influence both light and palette. Stars have stable positions in a coherent sky model, and the moon's illumination follows its relation to the sun. Specific astronomical precision can be chosen during implementation; arbitrary independent sky loops would undermine continuity.

AI-created artwork can help with offline concepts and asset production. Production frames should be rendered from stable assets and state; generating replacement scene images over time would make continuity, motion, and reproducibility difficult to control.

Start the rendering experiment with TypeScript and Three.js. Its render targets and postprocessing facilities provide building blocks for this approach; they do not guarantee the desired art quality. Select a renderer and pinned version after testing the required materials on the target browsers. [Three.js render targets](https://threejs.org/docs/pages/RenderTarget.html), [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html), and [WebGPU postprocessing](https://threejs.org/manual/pages/webgpu-postprocessing.html).

## A world, regions, and views

Use this conceptual hierarchy:

`World → Regions → Persistent places and entities → Scene views`

A **world** owns the epoch, calendar, seed, simulation rules, and history. A **region** owns climate, connected terrain, water relationships, habitats, and the entities currently in it. A **scene** is an authored view of part of a region, with a camera, framing rules, art layers, and visible entity bindings.

This distinction prevents every new scene from becoming an unrelated simulation. Two views of the same tree refer to the same tree. Nearby views sample one regional weather field, with terrain-dependent differences. A person may leave one scene, travel out of view, and later enter another. Scene visibility is not entity ownership.

Initially, one worker can own the entire first region. Later, partition by region rather than by camera. Transfers between regions use one durable transfer identity and one authoritative owner at a time, with a real arrival time. Overlapping views never create duplicate entities.

A new scene contains content, not a copy of the engine. Its authored package includes camera and crop rules, asset manifest, coordinates, occluders, path graph, entrances, perches, shelters, water edges, story-relevant locations, and habitat bindings. Opening a new view into an existing place reveals its current state; it does not start a fresh season. New places need an explicit introduction or initialized history consistent with the world date.

## Persistence and stories

Every consequential object has a stable ID and state. Examples include tree age and branch damage; nest location, material, occupants, and stage; animal age, home, energy abstraction, current intent, and relationships; cottage occupancy and condition; and ground wetness or snow cover.

Use three complementary records:

1. **Current state and snapshots** for efficient loading and recovery.
2. **Durable causal events** for changes that matter, such as a completed delivery, hatching, a broken branch, a departure, or a repair.
3. **Scheduled actions and deadlines** for the future work already committed by the simulation.

Do not persist every wingbeat or blade of grass. Persist enough to reconstruct the world and meaningful action trajectories. Events record IDs, causal parents, canonical timestamps, rule versions, and relevant inputs. Randomness uses stable per-entity/per-purpose seeds and counters; opening scenes in a different order must not change outcomes.

Stories arise from constrained behavior. An animal chooses among feasible needs: forage, rest, shelter, court, carry material, care for young. A person follows routines modulated by daylight, weather, resources, and relationships. Reusable life-cycle rules give those choices longer consequences.

For example, nesting readiness requires the appropriate season, a viable pair, and a safe site. Collection trips add actual material. Construction must finish before eggs can be laid. Incubation requires elapsed biological time and care; hatching and fledging follow species-specific prerequisites. Weather may interrupt trips. An unsuccessful attempt can end without a forced replacement story. Exact species biology should be researched when the first species is selected.

An authored story layer can provide opportunities—an available nest site or a resident's garden—and bound how many activities compete for attention. It cannot override physical prerequisites to manufacture a dramatic beat. Use gentle parameters and believable maintenance to support the intended mood. Persistent scars and change should remain; a repair requires materials, a capable actor, and elapsed work.

Optional history summaries come from committed events. Any generated prose is downstream of those facts and cannot invent events or alter the world.

## Running the world economically

The server owns consequential state. Browsers draw that state and interpolate ongoing actions. A paused tab, low frame rate, additional visitor, or absent audience does not slow, multiply, or redirect the world.

Use discrete events for meaningful transitions and bounded fixed or analytic updates for continuous processes. Integrate only the necessary state, not every visible particle. Separating simulation updates from rendering is a standard game-loop technique; the detailed scheduling policy here is a project design choice. [Glenn Fiedler, Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/).

An animal's planned visible action contains its entity ID, route, start/end server timestamps, speed profile, animation phase seed, and completion effects. Clients evaluate the same trajectory at the same authoritative time. Cosmetic grass and raindrop details may differ with rendering quality; an animal's position and story state may not depend on client quality.

The first implementation should keep one modest worker advancing the region continuously. Optimize only after measuring it. For many regions, sleeping workers can catch up from a snapshot through scheduled events and mathematically safe intervals. This skips computation, not history. Interacting events still execute in canonical order, and region weather or neighboring-region inputs must be available for the interval. Coarse updates cannot jump past a hatch, a blocked route, or an arrival that changes later decisions.

Catch-up and continuously running execution must reach the same semantic state for the same time and version. Viewer presence may affect streaming and rendering effort only. Predetermined action plans and analytic trajectories allow movement to remain consistent without a server running every animation frame for empty scenes.

## Initial infrastructure and contracts

Start with one codebase and a small deployment: static assets, a TypeScript API, one simulation worker, PostgreSQL, and object storage behind a CDN. The API and worker are distinct responsibilities but do not need a fleet of microservices. User accounts and cross-device follows can be added after the scene works; local bookmarks are enough for an initial prototype.

| Record | Essential responsibilities |
| --- | --- |
| World | Epoch, rational clock rate, calendar, seed, rules version |
| Region | Climate/habitat state, simulation cursor, ownership revision |
| Place/entity | Stable identity, location, lifecycle state, relationships |
| Scene definition | Region reference, camera, art bindings, manifest version |
| Action | Entity, route, real timestamps, prerequisites, completion effects |
| Event | Unique ID, sequence, cause, time, type, payload, rule version |
| Snapshot | Covered sequence/time, state version, serialized state |
| Follow | User or local profile, scene/entity reference, preferences |

Bootstrap a view with a consistent snapshot, revision, server time, world-clock mapping, asset version, and active action plans. Continue with a resumable stream of changes, initially server-sent events because visitors are observers. Read-only periodic refresh is an acceptable fallback. Missing sequence numbers trigger a fresh snapshot.

World-clock estimation uses server timestamps plus a browser monotonic timer, not the visitor's device date. Smooth small timing corrections. After suspension or reconnect, fetch the current state and reconcile; do not run hours of missed frames. During a connection gap, render only within the validity of received plans, then hold the last consistent view with a quiet connection indication.

For writes, enforce one authoritative writer per region with transactions, revision checks, and idempotent event IDs. Update state, record events, and schedule the next actions atomically. Stream committed records only, with delivery retry independent of simulation execution. A crashed worker must not hatch an egg twice or erase a completed delivery. Short row-locking transactions are a suitable starting mechanism. [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

Snapshots and asset/rule versions must be compatible. Changing art cannot silently replace identities or terrain under walking subjects. Simulation upgrades need a saved pre-upgrade state and explicit migrations; old history must not be reinterpreted under new rules. Keep backups and verify restore behavior before trusting the world with long-lived stories.

The expected cost model is simulation work per region plus distribution per viewer. Assets are shared and cacheable; consequential events are small. Avoid any architecture that requires video generation or a dedicated simulation per viewer. Dollar estimates should wait for measured art size, client targets, scene counts, and concurrency.

## Visitor experience

Open directly into the painting. A small control surface appears on deliberate interaction and provides scene selection, follow, sound, and an optional record of changes. Keep sound opt-in. A scene title and current season can be available without permanent overlays.

Following should initially mean an easy return path. Later, an optional observation journal can say what changed since the last visit, based only on stored events. Browsing could grow from a simple gallery to a map as the geography becomes meaningful. Notifications require a separate opt-in; the experience should not create urgency around missing a moment.

Offer reduced motion and an accessible text description of present conditions and recent meaningful changes. A locally paused view is clearly paused; it does not pause the shared world. Night should preserve the region's lighting logic while remaining artistically legible through palette, moonlight when available, sky glow, and plausible cottage light.

## Prototype sequence and acceptance criteria

1. **Prove the painting.** Build a small representative area with tree, cottage, lake, one moving bird, changing light, and wind. Inspect at the intended display size, in portrait and landscape, during dusk, rain, and night. Acceptance: the still frame feels like the intended oil painting and movement preserves that character without flicker or sliding brush textures.
2. **Prove time and continuity.** Connect the two time domains and authoritative persistence. Two browser sessions must agree on time, weather, subject positions, and consequences. Reloading mid-action and restarting the worker must preserve continuity. An isolated developer time control can test seasons without changing the public world.
3. **Prove one complete story.** Implement one researched nesting cycle with collection, incubation, and departure; a simple resident routine; and weather effects with memory. Exercise blocked routes, interrupted work, and season boundaries. Acceptance: every visible result has satisfied its prerequisites.
4. **Prove a durable year.** Run an accelerated headless year and compare it with varied update schedules, plus visual checkpoints through all seasons. Include snapshot recovery, event retries, and multi-year aging. Acceptance: no duplicate inhabitants, silent annual reset, impossible stage transitions, unbounded populations, or disappearing damage.
5. **Prove a second view.** Add an adjacent view that shares weather and at least one persistent entity or journey. Acceptance: it uses the same engine and identities, and travel remains continuous across views.

The first useful prototype is deliberately small: one tree, one cottage, one patch of lake, and one bird, rendered beautifully and behaving consistently. Complete the first scene's broader cast after that foundation works.

Initial performance goals are 60 fps on a representative desktop and 30 fps on a representative phone, subject to measurement. Tune resolution, particles, reflections, and shadow detail before compromising canonical behavior. Track frame time, asset weight, worker lag, catch-up latency, memory growth, and event volume. Pause rendering in hidden tabs while server time continues.

## Next design decisions

With the shared world and lasting change confirmed, next select the painterly reference direction, the region and species, target screen/device priorities, and how much long-term adversity belongs in the tone. Those choices determine asset production and ecological detail. Hosting vendor, precise framework versions, and a large scene editor can wait until the visual and persistence experiments establish what is actually needed.
