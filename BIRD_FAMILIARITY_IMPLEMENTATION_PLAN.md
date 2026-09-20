# A familiar bird and daily habits

Status: implemented on the feature branch September 20, 2026, for review. See [bird validation](docs/bird-validation/README.md) and [the combined engagement review](docs/engagement-validation/README.md). The sections below retain the incremental implementation design; the branch includes the oak routine, roof habit, and synchronized call. Deployment awaits human review.

## Outcome and release boundary

Give the existing bird a life visitors can recognize after the nest-building study finishes. It returns to a preferred place in the oak, occasionally pauses on the cottage roof, and spends substantial time resting or out of sight. A later sound increment gives it a recognizable, quietly timed call. None of these actions depends on whether anyone is watching.

The first useful release is silent: one persistent bird identity, one preferred oak perch, one sheltered resting location, and believable travel between them after nest completion. Add the roof habit once that small system works. The recognizable call is a separate increment because the existing audio has no shared action timing.

The nest remains complete with twelve material units. This work does not add eggs, a mate, incubation, chicks, aging, seasonal migration, food accounting, or a second animal. A full nesting lifecycle needs a separate species and habitat research brief. The bird remains an explicitly limited behavior study; recurring habits are not evidence of a complete biological simulation.

## Why this comes next

Weather traces and cottage life are present in the local checkout, including the merge commits for PRs #5 and #6. Together they establish environmental continuity and an implied resident. A familiar bird adds a recurring individual without introducing the visible person, furniture handling, or new landscape depth that other ideas require.

The remaining engagement ideas stay in this order of opportunity, subject to the viewing review:

| Work | Relationship to this release |
| --- | --- |
| Review weather and cottage together | First milestone; establish how much activity the painting already contains |
| Familiar bird | Selected next feature; prove recognition through position, silhouette, and repeated behavior |
| Local visit memory | Likely next separate feature; it can summarize the bird's committed history once those facts exist |
| Keep this view | Independent later feature; requires faithful capture of the displayed composition and mode |
| Wider soundscape | Expand only after the bird call establishes shared action timing and silence works well |
| Mist, visible resident, movable chair, quiet coincidences | Separate art/system studies; avoid accumulating them into this release |

## Starting point verified in the repository

| Existing behavior | Consequence for this work |
| --- | --- |
| `shared/world.js` supplies a sixteen-real-second collection trip and a nest perch | Preserve the existing delivery trajectory and timing while construction is active |
| `src/store.js` starts with three material units and finishes nine deliveries; `world.action` then becomes null | The daily routine begins after construction, without resetting the nest or adding more material |
| `birdPose(null, now)` returns the nest position; `Painting.drawBird()` hides the bird below a solar-elevation threshold | There is currently no departure to shelter, persisted rest location, or independent bird identity |
| The bird is drawn on the Canvas overlay after the WebGL foliage | Roof and branch visits require authored visibility rules; the current layer order is not general depth ordering |
| Version 3 stores surface memory, cottage routines, structured event payloads, and note visibility | Extend these contracts rather than introducing another simulation or database |
| `WorldClient` holds at the earliest uncommitted action/decision boundary | Add every bird boundary to both server aggregation and client validation |
| `public/sound.js` emits synthesized chirps every eight seconds after local opt-in | These chirps cannot be presented as the familiar bird's voice without replacing their timing |
| Field notes show the latest twenty visible events, and unread state is local to the current page session | Keep routine bird events hidden; cross-visit memory remains a separate feature |

Existing validation reports record 61 unit tests and successful local Chrome/Metal browser suites after cottage work. Those are historical results, not validation of this proposal. Safari, Firefox, physical mobile review, and the combined artistic viewing review are still outstanding in the recorded evidence.

## 1. Close the combined viewing review

Use a disposable SQLite world and the production renderer. Observe at least one continuous world day, approximately 1 hour 58 minutes of real time. Sample additional deterministic weather intervals if that day does not contain rain followed by drying. Collect short clips at actual playback speed; accelerated sampling is useful for finding conditions but cannot establish whether motion feels natural.

Capture dawn, fair afternoon, rainfall, residual drips, drying, dusk, and night with the cottage routine enabled. Include the full landscape, the actual default portrait framing (`pan = .38`), and both pan extremes. Record event counts and representative periods of simultaneous cottage, weather, foliage, and bird activity.

Review whether the eye can rest on the lake, whether lights and smoke already make the cottage busy, and whether wet surfaces remain subtle at normal viewing size. Save paired images, short clips, and a concise decision record in a proposed `docs/engagement-validation/README.md`.

**Exit condition:** identify any required density/timing corrections and resolve them before adding the full bird routine. Do not treat passing shader checks as artistic acceptance. Device coverage and deployment review remain explicit release checks; a local art pilot can proceed while those reviews are arranged.

## 2. Prove one bird, one perch, and one flight

Start in the existing `/dev/sky-study.html` developer preview, using fixed bird fixtures through the production painting code. The pilot has no world writes.

Author a small scene package, proposed `shared/lakeside-bird.js`, containing stable location and route IDs:

| Location | Role and placement constraint |
| --- | --- |
| `nest` | Preserve the existing nest anchor and the legacy collection route |
| `oak-perch` | A visible, fixed branch near the existing fork; separate from the nest, outside moving leaf envelopes |
| `oak-shelter` | A resting location hidden by a fixed part of the oak, with an authored entry/exit path |
| `roof-perch` | A small exposed part of the cottage roof, away from the chimney and moving casement; added in the second art increment |

Trace exact anchors against the registered 1672 × 941 painting. Store coordinates in one documented scene coordinate system, with explicit conversions to normalized positions. Check the subject's full movement envelope, not just the anchor. Do not move the nest, enlarge the cottage, or reposition the bird for portrait screens.

Preserve the bird's small scale and restrained brown/olive palette. Review its silhouette, feet, tail, facing, folded wing, and a short flight cycle before deciding whether the current Canvas drawing needs painted replacement assets. If painted assets are needed, use a compact registered pose atlas with stable contact points, reproducible export, and provenance in `ARTWORK.md`. The pilot chooses the art technique; a new rendering engine is unnecessary.

Use authored curves with continuous takeoff and landing, no spline overshoot through the roof or trunk, and fixed endpoints. Turning and wing phase derive from the committed action and elapsed real time. Perspective scale follows authored depth continuously; replace the current abrupt `pose.y > .5` size switch for new routes.

Keep visible route segments in front of known scene surfaces and outside all moving foliage envelopes. For shelter entry, apply a small fixed occlusion mask to the bird alone on a scratch canvas before compositing. Do not redraw opaque chunks of background over weather, cottage, or foliage. The mask must work against both intact and foliage-repaired foregrounds. If a convincing route requires dynamic branch/leaf depth, choose another route for this release.

**Pilot evidence:** paired perch frames and a real-speed takeoff/landing clip at day, dusk, and night; a shelter crossing; portrait/default-pan captures; and a guide image of anchors, paths, fixed occluders, and moving foliage exclusions. The bird should be discoverable without sharpening or brightening it into a focal-point badge.

**Exit condition:** the oak perch and shelter route belong to the painting at normal scale. Resolve floating feet, digital edges, gliding brushwork, visibility pops, and terrain crossings before persistence work expands the behavior.

## 3. Define the daily routine

Implement pure planning and sampling in proposed `shared/bird.js`. Choices use stable seeds keyed by bird identity, rules version, absolute world day, purpose, and an explicit counter. Do not use visitor arrival, request order, frame count, or browser randomness.

Use the following initial tuning values as artistic defaults, to be adjusted from review rather than presented as species biology:

| Situation | Behavior | Initial timing and limits |
| --- | --- | --- |
| Nest still under construction | Existing material trips and nest rest | Keep the existing sixteen-real-second trips and delivery count; no concurrent routine |
| After dawn, construction complete | Leave shelter and settle at the oak perch when conditions allow | Opportunity begins roughly 20–60 world minutes after sunrise, with seeded daily variation |
| Fair daylight | Long perch rests interspersed with shelter visits | Rest about 3–8 real minutes; new travel opportunities no more often than 5–12 real minutes |
| Fair late afternoon | Sometimes visit the roof, then return along an authored route | At most one roof outing per absolute world day; an opportunity may be skipped entirely; roof rest about 20–60 real seconds |
| Rain or stronger wind | Prefer shelter and suppress optional roof outings | Decide from the existing normalized rain/wind inputs; use separate enter/exit thresholds and a minimum fair interval |
| Approaching dusk | Finish the current short action, then travel to shelter | Start settling roughly 20–45 world minutes before sunset; do not vanish at a light threshold |
| Night | Remain sheltered and silent | No ordinary travel until the next eligible daylight period |

Evaluate choices on a canonical thirty-real-second grid aligned to the feature introduction timestamp. Persist accepted plans; a later request cannot reroll the choice. A pending flight completes even if weather changes, then the next decision can route the bird to shelter. Track time since sustained fair conditions on that same grid to prevent rapid shelter/perch oscillation.

Initial weather thresholds can reuse the cottage's established scale: seek shelter above rain `.12` or wind `.44`; permit departure only after rain is below `.03` and wind below `.35` for ninety real seconds. Dusk and weather sheltering override discretionary rest timers after the active action finishes. Evaluate the optional roof outing once per day's authored opportunity, initially with a seeded one-in-three eligibility choice. Persist a considered-day marker as well as a completed-visit marker, so repeated grid checks cannot reroll a skipped day. These are tuning parameters, not meteorological or species claims.

Visible flights should initially take roughly 4–12 real seconds, with the actual duration set per approved route. Split travel, resting, and calling into explicit phases. A route starts at the previous settled anchor and settles at its destination only after completion. Ordinary quiet rests need no fidget loop. Any small look or turn must be sparse and stable across clients if it is part of the recognizable behavior.

The world calendar controls daylight opportunities; server milliseconds control flights, perching durations, and calls. Name constants with units. Do not multiply visible action durations by the 365/30 calendar rate. Use the available daylight and rain/wind inputs without inventing temperature, hunger, threat perception, or resource observations.

**Exit condition:** a deterministic timeline contains long quiet stretches, feasible journeys, optional roof visits, and genuine shelter periods. A short visitor session may contain no bird movement.

## 4. State, migration, and shared timing

### One bird owner and a small state contract

Propose world version 4, with a versioned `world.bird` record. Keep `world.action` only as the legacy nest-construction action until that finite study ends. It must not become a second routine owner.

| Field | Responsibility |
| --- | --- |
| `id`, `rulesVersion`, `introducedAt` | Stable bird identity, interpretation, and start of the newly modeled behavior |
| `mode` | `construction` or `routine`; prevents simultaneous legacy and new activity |
| `locationId`, `settledAt` | Last completed location; current position during travel comes from its action |
| `pending` | At most one committed action with ID, kind, route/version, from/to, start/end server milliseconds, phase seed, and completion effects |
| `nextDecisionAt`, `routineCounter` | Canonical decision boundary and stable action identity |
| `restUntil`, `fairSince`, `roofConsideredDay`, `lastRoofDay` | Bounded dwell, weather hysteresis, one daily roof opportunity, and completed-visit limit |
| `familiarity` | Capped qualifying return count, last counted absolute day, and one-time note flags; no growing array of visits |

For the first release, the location graph contains nest-to-oak, oak-to-shelter, and their needed reverse routes. Add roof links only after their artwork passes review. A generic finite route graph is sufficient; do not build a pathfinding engine or a general animal-needs framework.

### Preserve existing worlds

Migrate version 3 transactionally while preserving the world epoch, environment, cottage, nest materials/stage, revision lineage, legacy action IDs/times, and all existing events. Versions 1 and 2 must still traverse the existing migration chain. Reject unsupported future schemas/rules.

Set `introducedAt` to a documented upgrade boundary at or after the saved world time. Historical catch-up before that boundary must retain the old nest behavior and cannot generate new bird habits. New routine decisions begin on the first eligible grid boundary after both introduction and final material delivery. This also covers a database whose final delivery falls in downtime before the upgrade.

An in-flight or future legacy delivery keeps its exact trajectory and completion effects. The sampler delegates to the legacy pose while construction owns the bird. On handover, its first new action departs from the nest anchor; it cannot appear directly on the roof or in shelter. If the world is already built, initialize the new routine from the old settled nest location as an explicit introduction condition, then move causally. Do not invent previous roosting, roof visits, or a biological age.

A fresh version-4 world starts with the same initial three-unit nest and nine deliveries. Migration must be idempotent, and rollback must leave neither consumed counters nor half-written events. Document a compatible pre-upgrade database backup and restore procedure: old application code cannot read version 4.

### Canonical advancement and events

Extend `nextCommitAt` to include bird action completion and routine decisions. Use one chronological loop for all subsystems. Define and test the equal-time order: environment checkpoint, legacy nest delivery, bird routine completion, cottage completion, bird decision, cottage decision. A newly eligible routine cannot start before its final delivery or introduction boundary.

Accepted future phases may be sampled within their committed plan without another server write. A start that requires a fresh decision or changes durable facts is itself a commit boundary. Mirror this distinction in `WorldClient` validation; never let an old snapshot carry a bird across an uncommitted destination, call, or choice.

Persist action acceptance/completion facts with stable IDs and structured payloads identifying bird, route, locations, action, and canonical time. Ordinary records have `noteVisible = 0`. A decision that chooses no action updates the bounded checkpoint without adding an event. Keep revisions deterministic across regular execution and catch-up.

Validate finite ordered timestamps, known route/location IDs and versions, mutually exclusive construction/routine ownership, monotonic counters, and action endpoints consistent with the settled location. Include new boundaries in client stale-response rejection, lease holding, HTTP recovery, and SSE handling. Extend tests to exercise JSON serialization, including null aggregate boundaries.

Retain bounded catch-up batches and retryable HTTP/SSE 503 responses until the entire world reaches the requested present. Measure combined catch-up for one real day, thirty real days, and one real year. Record action/event counts and database growth; do not assume the old 208 ms month measurement survives the new routine. Current snapshots contain only bounded current state and the existing bounded note list.

## 5. Display modes, fallback, and field notes

| Mode | Bird behavior |
| --- | --- |
| Live | Sample the shared committed action at the displayed server time |
| Local pause | Freeze bird pose, nest, current observation, and action phase from the paused snapshot; suppress new bird calls |
| Reduced motion | Suppress flight interpolation, wingbeats, and fidgets; show the last settled pose until committed arrival, then update discretely; inspectable text identifies reduced-motion presentation |
| Hidden tab/reconnect | Sample the current pose without replaying missed trips or sounds |
| Expired lease/action boundary | Hold the last valid pose and suppress new calls until a fresh compatible snapshot arrives |
| Private light study | Keep the existing omission of the live bird; developer-only bird fixtures are explicit and local |
| Return to live | Discard fixtures and sample the current shared bird directly |

Reduced-motion rendering does not change the server location or route. On initial entry midway through a flight, its saved `from` anchor supplies the settled display pose. Descriptions distinguish that display from the shared action rather than claiming the still image depicts a landed bird at its destination.

If replacement artwork is used, load it independently and activate a validated complete bundle. Late loads cannot revive disposed resources. A safe procedural fallback must sample the same action, scale, and visibility masks; it cannot put the bird back on the nest. If the route or required occlusion data cannot be validated, omit the bird and identify its unavailable visual treatment in the inspectable description. Preserve the painting and other optional layers. Do not play a visible bird call from a missing or incompatible visual treatment.

Keep the nest observation factual: a completed nest does not imply eggs are coming. Add a short current bird observation in the existing oak/notes area, derived from the displayed snapshot even when a newer live snapshot arrives during pause. Keep routine bird movement out of the automatic live announcement.

Allow at most two one-time visible milestones in this release: the first completed roof arrival and an established return habit. Suggested habit wording is “The bird has returned to the same branch on three days,” only after qualifying completed returns on three distinct absolute world days. Count returns following an actual departure, exclude migration and fixtures, and persist the supporting event references in the event payload. If the fact is not established, omit the sentence. Perch changes and routine decisions must not repeatedly light the unread-note dot.

## 6. Add a recognizable call after the silent routine

Create a small, repeatable sound motif as an explicitly synthesized study. Selecting a real species name or claiming an authentic song requires a separate authoritative natural-history and recording/provenance review. Do not casually retrofit the existing generic silhouette into a named species.

Calls are rare committed opportunities while resting on an exposed approved perch during suitable daylight. Start with no more than one short phrase per outing and at least 5–10 real minutes between opportunities. Persist the phrase ID, start/end, and perch with the bird action plan. Sound opt-in controls playback only; enabling sound cannot schedule a world event.

Replace the current eight-second chirp timer when this increment lands. General water/wind ambience can remain cosmetic. Schedule the bird phrase from displayed shared time into Web Audio's clock with a small bounded look-ahead, keyed by action ID so HTTP/SSE duplication cannot retrigger it. Preserve asynchronous toggle coalescing and bounded gain automation.

Initially commit a phrase at least five real seconds before its start to accommodate the current two-second stream cadence. Calling occupies the bird's single pending action while it stays perched; it cannot simultaneously start a flight. Use a 100 ms synchronization target in controlled two-client tests, report the measured spread, and skip late phrases rather than promising timing through arbitrary network stalls.

Skip phrases whose start was already missed on opt-in, reconnect, tab return, or return to live. Cancel pending phrase nodes on mute, pause, study entry, lost timing validity, or page hide; do not resume a partially heard phrase later. Resume with future eligible phrases. Reduced motion still allows opted-in sound but suppresses optional beak/head animation. If a visible calling pose is added, use the same action interval.

**Exit condition:** two enabled clients observing the same upcoming action hear the same phrase timing within documented scheduling tolerance; muted or late-arriving clients do not affect the event. Generous silence remains the normal experience. If audio quality does not pass review, the silent bird release remains useful and complete.

## 7. Delivery sequence and concrete review artifacts

| Milestone | Work package | Review artifact and completion condition |
| --- | --- | --- |
| M0 — Combined review | Review current weather/cottage behavior; tune any density issues | `docs/engagement-validation/README.md`, paired captures, real-speed excerpts, recorded decisions |
| M1 — Oak art pilot | Author oak perch, shelter, route, and visibility treatment in the production preview | Anchor/route sheet and small day/dusk/night/portrait clip set; no unresolved contact or occlusion defects |
| M2 — Silent persistent bird | Add pure routine, version-4 migration, canonical actions/events, snapshots, display modes, fallback, and factual current description | Demonstrate two clients, restart during flight, completed-nest upgrade, pause/reconnect, and a quiet world-day timeline; first useful release |
| M3 — Roof habit | Add one approved roof route and sparse daily opportunity; expose supported one-time notes | Real-speed roof landing/departure, default portrait evidence, three-day habit facts, no repetitive unread signals |
| M4 — Recognizable call | Replace local chirp timer with committed phrases and cancellation/deduplication | Synchronized two-client audio evidence; mute/pause/hidden/reconnect checks; long silent intervals |
| M5 — Release validation | Run regressions, measure performance/catch-up, review art and available devices, document limits | `docs/bird-validation/README.md`, reproducible results, migration/rollback instructions, final viewing review |

M0 establishes the activity budget. M1 must pass before completing M2; M3 and M4 depend on the stable M2 contract. Each milestone should leave a reviewable result. There is no commitment to deliver the entire seven-idea brainstorm in this sequence.

Apply the relevant acceptance checks before releasing any increment, including M2 if the silent routine ships first. M5 consolidates evidence for the full chosen scope; it does not defer migration, continuity, or visual verification until after a release.

### Integration map

| File/area | Planned responsibility |
| --- | --- |
| `shared/bird.js` (new) | State validation, deterministic choices, completion, pose sampling, descriptors, stable phrase opportunities |
| `shared/lakeside-bird.js` (new) | Fixed anchors, approved route curves, depth/scale, occlusion and optional artwork metadata |
| `shared/world.js` | Bind bird scene configuration; preserve legacy collection compatibility and existing calendar/weather functions |
| `src/store.js` | Version-4 migration, ownership handover, chronological boundaries, structured hidden events and rare visible milestones |
| `public/world-client.js` | Validate bird plans and earliest boundary; preserve ordering, lease, and refresh behavior |
| `public/painting.js`, optional `public/bird-renderer.js` | Production pose drawing, per-subject occlusion, display modes, independent artwork lifecycle |
| `public/app.js`, `public/scene-description.js`, `public/index.html` | Current bird observation in existing notes, factual nest wording, paused-description consistency, playback mode inputs |
| `public/sound.js` | Later shared phrase scheduling, cancellation, deduplication; retain explicit opt-in |
| `public/dev/sky-study.html` and associated preview code | Fixed fixtures, route guides, time controls, production-renderer checks |
| `scripts/`, `test/`, `package.json` | Focused browser checks, optional asset exporter, semantic tests, syntax-check coverage |
| `ARTWORK.md`, `README.md`, validation reports | Provenance, actual behavior, measured costs, supported modes, explicit biological/art limits |

## 8. Acceptance checks

**Continuity and causality:** compare complete semantic states and ordered histories after regular stepping, arbitrary requests, a single catch-up, and restart. Cover active/future/final legacy delivery migration, built nests, stale saved worlds, equal-time cottage/bird boundaries, departure/arrival endpoints, skipped roof opportunities, weather hysteresis, and transaction failure. Nest materials must remain twelve after completion. There must never be two owners or two visible copies of the bird.

**Client behavior:** two clients at the same displayed time agree on position, action, carried material, and settled location. Cover stale HTTP after SSE, out-of-order revisions, mid-flight reload, disconnected boundary hold, and a silently stalled stream. Paused pose and current observation stay consistent after newer snapshots arrive. Studies cannot generate bird history. Ordinary routine revisions and hidden events do not produce unread notes.

**Art:** inspect complete routes and contact poses, including the new bird against current weather, smoke, all supported foreground variants, and night lighting. Capture full landscape, default portrait, pan extremes, and device pixel ratios. Check the footprint at actual viewing size and review unaccelerated clips. A hidden bird must enter shelter plausibly and remain absent without drawing through the trunk.

**Recovery and accessibility:** verify missing/corrupt assets, invalid route versions, delayed loads, disposal, WebGL loss/restoration, and procedural/omitted-bird fallback. Inspect keyboard access and current descriptions. Reduced motion removes continuous bird motion, while no routine action is automatically announced.

**Performance and storage:** compare baseline and enabled frame timing on the same machine and preserve the existing 30 fps target. Record atlas bytes if used, scratch-canvas size, draw counts, allocations, current-state size, daily event growth, and combined catch-up timings. Avoid per-frame asset work, full-landscape scratch compositing for one small bird, or unbounded audio/action histories.

**Verification commands:** run `npm run check` and `npm test`; add focused `test/bird.test.js` and `scripts/check-bird-browser.mjs`; extend existing world/client/sound tests for changed semantics. Run the existing sky, display, foliage, weather, and cottage browser suites against a disposable database. The browser suites continue using optional development-only Playwright. Record actual browser/device coverage; do not present desktop timing as phone evidence.

The release is ready when the bird is recognizable across visits, location changes have visible causes, the shared history survives unobserved time, and an uneventful visit still feels complete. Automated evidence and selected visual review are recorded in the validation reports; uninterrupted human viewing and physical-device coverage remain review limitations.
