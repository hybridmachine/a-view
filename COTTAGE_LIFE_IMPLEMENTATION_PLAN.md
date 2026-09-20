# Small signs of cottage life

Status: implemented on `codex/cottage-life`, September 20, 2026; awaiting PR review. See [validation evidence](docs/cottage-validation/README.md). The sections below retain the implementation design. This is the second priority in [the engagement plan](ENGAGEMENT_PLAN.md), following [weather traces](WEATHER_TRACES_IMPLEMENTATION_PLAN.md).

## Intended experience and first release

The cottage should gradually become a familiar home. At dusk, one room lights before the other. A casement is occasionally left open during a fair afternoon. Smoke reflects someone tending a hearth. Visitors can infer a quiet life from these signs without needing a named character or an explanation on screen.

The first release includes two independently controlled room lights, one opening casement chosen during the art pilot, and chimney smoke driven by durable hearth state. It introduces one implied resident whose interior activity gives those changes a coherent sequence. It does not yet draw a person, move a chair, or simulate a complete human life.

The cottage should remain unremarkable for long stretches. A routine follows daylight and weather and persists regardless of visitors. Opening the page never starts a performance.

## Starting implementation and dependencies

- `shared/world.js` currently gives the cottage only door and chimney coordinates. There are no authored window masks, room identities, resident state, or action paths.
- Amber window light is already painted into the original night image and retained in the registered night foreground. Adding an independent glow on top would leave supposedly dark rooms lit. Independent control requires complete local replacement of that existing emission.
- The active foreground can be the intact sky bundle or the foliage-repaired base. Any replacement window patches must work with both.
- `Painting.drawSmoke()` currently uses calendar hour and loops cosmetic puffs. It has no fire, occupancy, or wind-driven history. The new routine must become its single activity source.
- `WorldStore` currently processes one bird action, while `WorldClient` recognizes only that action's completion boundary. Cottage transitions require multiple concurrent sources of committed changes.
- `sceneText()` and field notes currently concern the nest and general conditions. Use those existing surfaces for meaningful cottage information without adding a new control panel.

Implement after the weather plan's version-2 environment migration and event-sequence note handling. The cottage can use current rain/wind immediately; later outdoor routines can also use persisted path wetness. Keep the two features' asset loaders independent.

## 1. Establish independent window artwork

Start with a single existing window. Trace its opening, frame, visible foliage, and the full region of baked amber spill at native resolution. Produce a dark interior replacement, a restrained lit interior, and any necessary wall-spill correction. Preserve the original stonework and frame geometry.

Use small opaque interior repair patches with feathered boundaries entirely inside stable surfaces, followed by separately controllable emissive paint. The neutral replacement must cover every baked contribution in its authored envelope at all day/night blends. Its complete contribution is required even when the new room light is off. Merely drawing a translucent black rectangle over the old glow is insufficient.

For the opening casement, author a closed pose, repaired interior, hinge anchors, and a small set of compatible painted poses or a shallow hinged mesh. Keep the brush texture attached to the panel and the hinge fixed. Opening reveals the repaired interior, never the original closed window beneath it. If this treatment does not read at the window's actual small size, select a more readable existing casement during the pilot rather than enlarging the building.

Build a production-renderer study showing:

- Each room on/off independently at day, dusk, and night.
- Both room lights off against the original lit-night source, to reveal missed glow.
- The casement closed, partly open, and fully open, including its entire movement envelope.
- The active foliage base and the intact sky foreground, with matching edges in both.
- Default portrait framing and the full landscape at normal viewing scale.

Do not add a resident sprite until the architecture and small details feel like the original painting. The pilot succeeds when an unlit room is truly unlit, a lit room retains painted edges, and the casement introduces no hole, duplicate frame, or hard digital shine.

## 2. Define a small, coherent routine

Create a pure routine planner in proposed `shared/cottage.js`. Use daylight boundaries from the existing `calendar()` and stable variation keyed by resident ID, absolute world day, routine purpose, and rule version. Never use browser arrival, frame count, or an unseeded random choice to select activities.

These are initial authored behaviors to tune after the pilot:

| Situation | Proposed behavior | Preconditions and limits |
| --- | --- | --- |
| After dawn | Extinguish remaining overnight room light; occasionally tend the hearth | Resident is inside; light/hearth change follows an interior task |
| Fair daylight | Open one casement for a while | Sufficient daylight, rain below a threshold, modest wind; do not infer warmth from a nonexistent temperature reading |
| Rain or stronger wind | Close the open casement after a short reaction delay | Complete or safely reverse the existing transition; hysteresis prevents repeated toggling |
| Around dusk | Light the main room, then sometimes the second room later | Resident completes the corresponding interior movement/task; rooms do not switch together mechanically |
| Later evening | Extinguish the main room, then the remaining light | Preserve a quiet interval and complete active tasks before settling |
| Most other times | No visible change | No minimum number of events is owed to a visitor |

Use broad schedule windows relative to sunrise/sunset, with seeded variation of approximately 15–45 world minutes as an initial range. Avoid a fixed timetable that repeats identically every day. The calendar currently runs at 365/30 speed: one world day lasts about 1 hour 58 real minutes, and one world hour about 4 minutes 56 seconds. Thus ordinary routines already recur frequently enough for observation.

Interior movement/task durations use real seconds: initially around 8–20 seconds between room activities, and 3–6 seconds for a visible casement movement. Tune these against the art. Minimum dwell times should keep lights and window poses stable for several real minutes when conditions allow. A weather response may interrupt a long dwell, with a bounded delay rather than instantaneous reaction.

The first resident remains inside. Track a coarse interior location such as `main-room`, `second-room`, or `moving-between-rooms`; room lights may remain on after the resident leaves them. This modest model establishes causes without pretending to simulate hidden human detail. Light intensity is a state of the room, not a direct proxy for occupancy.

Plan the next activity from the state at the last committed boundary, not from the latest request time. Evaluate weather-dependent opportunities on a fixed, versioned decision cadence (initially 30 real seconds), aligned to the feature's introduction time. Once a journey/task is accepted, persist its plan. A new visitor cannot reroll tomorrow's routine.

## 3. Persist cottage state and actions

Add a version-2-to-version-3 world migration, preserving the existing environment, epoch, nest, and events. Store a compact `world.cottage` record with:

| State | Purpose |
| --- | --- |
| `id`, `rulesVersion`, `introducedAt`, `residentId` | Stable identities and explicit interpretation |
| `residentLocation`, `activity` | Coarse interior presence and currently committed task |
| `rooms` | Stable room IDs, light state, and any in-progress light transition |
| `casement` | Stable window ID, settled opening, and active transition metadata |
| `hearth` | Fire state and bounded ignition/extinction history needed for smoke tails |
| `pending`, `nextDecisionAt`, `routineCounter` | Durable action plan, next decision time, stable action identity |

A pending action identifies its actor, type, start/end server milliseconds, starting state, target state, and completion effects. Persist decisions and accepted plans atomically. Keep at most one resident task active, while allowing already-started visual effects such as a smoke tail to coexist.

At introduction, initialize the resident indoors with the casement closed. Choose explicit initial room-light states consistent with current daylight and the existing night appearance, and record them as an initial condition. Start future routine decisions from that timestamp. Do not invent past movements, birthdays, relationships, or historical events for the implied resident.

For historical notes, add a nullable structured event payload through a transactional events-table migration, retaining existing `id`, `at`, `type`, and `text` compatibility. Payloads identify the resident, room/window, action, and resulting state; prose remains a presentation of those facts. Unique action/event IDs must make repeated advancement and recovery idempotent.

Use a versioned stable ID format based on resident, absolute world day or monotonic routine counter, and action purpose. Do not key events by day-of-year alone, which repeats annually. Transaction rollback must leave neither a half-applied action nor a consumed counter.

## 4. Generalize committed timing without disturbing the bird

Retain the existing `world.action` bird payload initially for compatibility, and add cottage state alongside it. Generalize advancement to process the earliest pending discrete boundary across bird completion, cottage action start/end, and cottage decisions. Define a deterministic tie order, then advance the environment to that timestamp before evaluating weather-dependent decisions. Finally advance to the requested snapshot time.

Do not process all bird events first and all cottage events second: that would make event sequence order differ from actual time during catch-up. Stable ordering is also needed for tests comparing regular execution with a single long catch-up.

Snapshots should include an aggregate `nextCommitAt`: the earliest discrete boundary whose effects are absent from that snapshot. If no such boundary exists, it is null. A future cottage action start may require a boundary as well as its end, because it changes visible activity or actor location.

Update `WorldClient.now()` and `needsRefresh()` to use that aggregate boundary, falling back to the existing bird boundary when reading an older payload. Hold immediately before the boundary until a committed snapshot includes its effects. Preserve stale-response rejection, monotonic display time, HTTP/SSE coalescing, and transport expiry. Validate the new payload before accepting it so malformed boundaries cannot create an infinite refresh loop or rewind display time.

Within an already committed casement action, both clients evaluate the same bounded pose curve from its saved start/end and starting pose. Only the server settles the final window state. A light transition uses the same principle; it may be very short, but must not jump ahead of its committed cause.

Rain arriving during window opening should produce a feasible continuation: either finish opening and schedule closing, or commit a reversal starting from the current sampled pose. Choose one policy initially; prefer finishing the brief movement and then closing to minimize state complexity. Never restart a transition from an unrelated pose.

Catch up through discrete actions and decision ticks in bounded batches. Keep only pending actions and bounded smoke history in the current state. Historical events may be durable, but the snapshot stays bounded. Measure a month of real downtime and several world years; if catch-up yields, retain an explicit catching-up state until all displayed subsystems agree on the present.

## 5. Art bundle, layer order, and smoke

Proposed source/export directories are `artwork/lakeside-cottage-v1/` and `public/assets/lakeside-cottage-v1/`. Put authored configuration in proposed `shared/lakeside-cottage.js` and reproducible export logic in `scripts/prepare-cottage-assets.mjs`.

The bundle contains neutral repair patches, registered day/night room and casement atlases, interior/occlusion masks, hinge geometry, emission masks, and metadata identifying compatible base assets. Start with a 512 × 512 atlas pair if native resolution fits. Inspect alpha edges over colored backgrounds and at five light blends. Match established premultiplied-alpha conventions exactly once on upload.

Use a separate optional `public/cottage-renderer.js` pass rather than adding samplers to the current seven-sampler sky shader. Proposed layer order is sky/landscape, weather surface effects, cottage repair and state, moving foliage, then Canvas life effects. Keep repair envelopes clear of moving patches where possible; masks must retain any fixed foreground vine or vegetation that crosses the cottage.

Apply the same ambient light and weather tint to non-emissive cottage paint. Treat room emission separately so it remains warm and subdued through ambient transitions; it should not become a flashing bloom effect. Keep spill within its authored wall/glass envelope. Physical light transport into the lake is outside this release.

Refactor smoke so the previous hour-based source is removed when state-driven smoke is active. Puff positions follow displayed real seconds and the shared wind model. Emission depends on hearth state, with a small retained interval history allowing existing puffs to disperse naturally after the hearth goes out. Preserve only as much history as the maximum puff lifetime needs; do not persist every puff or replay emissions on reconnect.

Stage and activate the complete cottage bundle atomically. Missing repair art must never accompany a supposedly dark window, and missing casement art must never expose a repaired hole. On bundle or draw failure, disable the entire cottage visual layer and state-driven cottage smoke together, restoring the original painted cottage. Other sky/foliage/weather features continue independently. Full WebGL failure uses the existing complete painting fallback.

The original fallback has baked window lights and cannot exactly depict every new cottage state. Treat it honestly as a static artwork fallback: accessible current-world information may still describe the shared state, but identify the visual fallback instead of implying the image represents independent lights correctly. Rebuild resources on context restoration and reveal only a complete valid frame.

## 6. Presentation, studies, and accessibility

No new permanent interface is required. Extend current scene descriptions with concise facts such as “A light is on in the main room” or “One casement stands open.” Use neutral room labels in accessible text until the artwork or world establishes a room's purpose; do not claim someone is cooking or reading solely because a light is on.

Expose a cottage observation in field notes when this feature is available. Record consequential transitions in structured events, but keep repetitive on/off and decision-tick activity out of the default narrative list. Add an explicit note-visibility policy or dedicated note query: filtering the latest 20 mixed events in the browser can hide older nest notes behind routine cottage events. Fetch a bounded set of note-visible events instead, while retaining simulation history separately.

Use a sparse observation such as the first evening light in a world day only when its committed event exists. Further repetition can be condensed into a date grouping. Drive the unread indicator from note-visible event sequence, extending the weather release's event-sequence fix. Never raise it for every interior movement or checkpoint. Do not add automatic sound in this release; any later door/window sound must remain opt-in and correspond to its actual action.

| Display mode | Behavior |
| --- | --- |
| Live | Sample cottage poses from committed shared actions and displayed time |
| Pause | Freeze snapshot, light transition, casement pose, and smoke |
| Reduced motion | Omit animated smoke and intermediate casement movement; show the settled pose after a committed action, retaining current light state |
| Connection gap | Hold at the earliest action/lease limit and retain the existing connection indication |
| Private study | Use fixed, documented local cottage poses/light states; suppress routine actors and events |
| Return to live | Rejoin current state without replaying missed activity |

Keep routine room-light changes in the readable scene description, with automatic announcements reserved for sparse meaningful transitions. Announcements must not run every frame or decision tick. Study fixtures should explicitly choose lights and hearth for each lighting condition, so live behavior is not accidentally presented under a different time of day.

## 7. Integration map

| File or area | Planned change |
| --- | --- |
| `shared/cottage.js` (new) | Pure routine decisions, stable IDs, transition samplers, bounded smoke inputs |
| `shared/lakeside-cottage.js` (new), `shared/world.js` | Window/room identities, asset metadata, scene bindings |
| `src/store.js` | State and event migrations, chronological scheduler, idempotent actions, note-visible queries |
| `public/world-client.js` | Aggregate action boundary validation, hold, and refresh logic |
| `public/cottage-renderer.js` (new) | Independent room/casement rendering, emission, compatible repairs, lifecycle |
| `public/painting.js` | Layer ordering, optional bundle integration, state-driven smoke, display modes |
| `public/app.js`, `public/index.html`, `public/scene-description.js` | Cottage note block, accessible state, note filtering, study fixtures |
| `public/dev/`, `scripts/`, `test/`, `package.json` | Production-renderer fixtures, asset export, migration/scheduler/client/browser checks |
| `ARTWORK.md`, `README.md`, validation report | Provenance, behavior, static-fallback limits, evidence |

## 8. Validation and acceptance

**Durability and causality:** compare regular execution, arbitrary snapshot requests, restart mid-action, and single-step catch-up. Check exact action boundaries, simultaneous nest/cottage changes, rain during opening, daylight/season/year boundaries, and migration from versions 1 and 2 through the full migration chain. Verify no duplicated actor, event, or action effect and no revision reset.

**Client consistency:** two clients agree on room states, casement pose, and smoke activity at the same displayed time. Delayed HTTP responses cannot undo streamed changes. The client holds before both bird and cottage completion, including ties; no action finishes visually before its settled state is committed. Ensure decision cadence does not cause repeated avoidable connection warnings or request storms.

**Art:** inspect all combinations of two room lights, casement endpoints and movement, day/night blends, rain, and foliage availability. Verify full baked-glow removal, no duplicate window, fixed hinges, consistent ambient tint, restrained emission, and smoke dispersal after extinction. Check portrait/landscape, pan extremes, and DPR settings. Review real-speed clips of a quiet interval and a complete routine.

**Recovery:** test missing/corrupt individual assets, incompatible manifests, failed GPU allocation/draw, context loss/restoration, and stale async loads. Confirm complete layer fallback without holes or competing smoke sources. Check the static-fallback description for honesty.

**Performance and long runs:** measure frame intervals, texture memory, render passes, database write/event growth, and long catch-up duration against the weather-enabled baseline. Preserve the current 30 fps target and bounded current state. Do not store repeated unchanged decisions or a record for each smoke particle.

Run `npm run check`, `npm test`, applicable existing sky/foliage/display browser suites, and focused cottage checks using an isolated database. Keep migration backups and record device/browser gaps. Release only after the timing/state contracts pass and the cottage still feels like part of the painting at ordinary scale.

## Delivery milestones and later expansion

1. **Window pilot:** one truly independent room light with complete neutral repair and lifecycle fallback.
2. **Durable presence:** cottage migration, routine state, chronological action processing, and aggregate client boundary support.
3. **Complete first release:** second room, one casement, state-driven smoke, private fixtures, and restrained notes/accessibility.
4. **Validation:** visual combinations, timing/recovery regressions, catch-up measurements, and documentation.

The next cottage milestone is a single visible walk from the door to a nearby resting place, followed by a return. Author and validate the route, terrain perspective, doorway occlusion, gait, pauses, and actor identity before expanding destinations. Paths use real travel time and can be conditioned on rain or damp ground.

A movable chair comes after that actor can carry and place it. Persist its location, require pickup/carry/placement actions, and keep it at its last committed location while the resident is elsewhere. A chair facing the lake then becomes evidence of a life that actually unfolded, rather than a decorative random change.

## Implemented choices

The release uses two 256 × 256 atlases and six small draws. The left casement has a fixed hinge and four-second shallow opening movement; a generated dark recess is confined beneath it. Canonical foreground paint supplies all stonework, frames, and moving panel texture. Neutral repairs replace the original night emission before separate light paint is added.

Version 3 adds one interior resident, independent room states, a casement, and bounded hearth history. Decisions occur every 30 real seconds; tasks take 8–20 seconds. Lights and reopening have a three-minute minimum dwell; hearth changes have a five-minute dwell. An opening finishes before a weather-driven closing begins. Wind thresholds use the existing model's actual range: below 0.35 to open, above 0.44 to close.

The shared scheduler uses environment → bird completion → cottage completion → cottage decision for ties. `nextCommitAt` limits client display time across all discrete changes. Catch-up processes at most 120,000 boundaries and 300,000 environment ticks per call; retryable HTTP 503 withholds inconsistent snapshots. Current state contains one pending task and one prior burn interval, with no persisted particles.

All cottage transitions have structured history, but only the first main-room light each world day enters the normal note query. Routine decisions create no event rows. Private studies select fixed cottage poses and omit smoke. Missing or invalid cottage art restores the original static cottage and identifies that limitation in accessible text.
