# Familiar bird validation

Validated September 20, 2026, on Node 26.7.0 and Chrome 153 / ANGLE Metal on Apple M1, against disposable SQLite worlds. No production state or deployment changed.

- `npm run check`: passed.
- `npm test`: 76 passed, including migration from active/future/final/built/stale version-3 worlds, the existing version-1/2 chain, restart during flight, transactional failure, full causal history equality, roof opportunities, and bounded audio cancellation.
- Focused bird browser checks: [18 passed](browser-results.json), including 240 route/light/phase draws, shelter coverage, pause/resume, reduced motion, studies, fallback/context restoration, matching two-client pixels, quiet notes, and native Web Audio scheduling/cancellation.
- Existing [sky](sky-browser-results.json), [visitor display](display-results.json), [foliage](foliage-browser-results.json), [weather](weather-browser-results.json), and [cottage](cottage-browser-results.json) suites passed. These are new regression results copied here; earlier feature evidence remains unchanged.

Review follow-up: bird activity now clears when construction rendering is skipped at night, when debug/study views omit the bird, and while the settled bird is hidden in shelter. The added browser regression checks each transition and the return to a visible perch. Event insertion reuses one prepared statement per catch-up transaction. Syntax checks, all 76 tests, the focused browser suite, and the catch-up benchmark were rerun after these fixes; the other browser reports above are from the initial implementation.

## Artwork and timing

Review the [oak perch](oak-perch.png), [roof perch](roof-perch.png), [route/occluder guide](routes.png), [default portrait roof view](portrait-390.png), and [portrait panned to the oak](portrait-pan-0.png). The original small Canvas silhouette is reused. Roof scale changes continuously; its contact anchor was lowered four native pixels after enlarged inspection. A fixed bark mask removes only bird coverage, with no opaque scenery patch over the existing layers.

The routes use a single 96 × 96 scratch canvas (36,864 RGBA bytes), with no new GPU textures or raster assets. Paired baseline/bird draw timings at 800 × 844 are in the focused results and remain below the 33.34 ms frame budget. These are local desktop draw timings, not phone performance claims.

`BIRD_RECORD=1` recorded a real-speed `routes.webm` covering nest-to-oak, shelter entry, and roof approach through the production renderer. The large regenerable recording is ignored by Git; representative frames are retained. The developer preview also permits scrubbing every route without touching shared state.

The routine uses five-to-twelve-real-minute oak/shelter rests, twenty-to-sixty-second roof pauses, and four-to-nine-second flights. A daily roof opportunity waits until the current rest is complete, then makes a single seeded choice. This avoids silently consuming the opportunity while travel is still ineligible. Weather and dusk take precedence after any active action completes.

The voice retains the existing synthesized motif, with shared phrases committed five seconds ahead. Deterministic two-client audio tests map different AudioContext clocks to the same shared start within 0.001 ms of numerical tolerance. The native Chrome check schedules the expected 200 ms look-ahead and verifies cancellation and duplicate suppression. These checks cover scheduling; they do not measure physical speaker latency or guarantee synchronization through arbitrary network stalls. Late phrases are skipped.

## Persistence and long catch-up

[Reproducible measurements](catchup-results.json) from `node scripts/check-bird-state.mjs`:

| Elapsed downtime | Catch-up | Yields | Total events | Bird state |
| --- | --- | --- | --- | --- |
| 1 real day | 20 ms | 0 | 426 | 616 bytes |
| 30 real days / one world year | 194 ms | 0 | 10,951 | 612 bytes |
| 365 real days | 2,249 ms | 10 | 132,101 | 618 bytes |

The month simulation contains 32 roof outings and 736 short calls over 365 world days. Pending actions (including call lead time) occupy about 0.73% of elapsed time. Routine history remains durable, while only the first roof arrival and the third qualifying daily branch return add bird notes. Supporting return IDs are retained in the habit event payload; the current record caps its return evidence at three entries.

Version 4 introduces the routine at upgrade time, preserves legacy delivery plans and existing subsystem state/history, and prevents any new routine event before introduction and nest completion. The first new flight starts at the old nest anchor. The client cannot display arrival before the same committed snapshot includes its effect. Arbitrary reads and one-step catch-up produce identical ordered histories. An injected event-write failure rolls back state and history together.

Before deploying, retain a compatible pre-upgrade SQLite backup. Version-3 code rejects version-4 worlds, so an application rollback also needs restoration of the pre-upgrade database, including the deliberate loss of post-backup changes. Follow the existing deployment/restore procedure rather than copying a live SQLite main file without its WAL state.

## Reproduction and limits

Run a local server with a disposable `A_VIEW_DB`. Use optional Playwright for `node scripts/check-bird-browser.mjs`; set `SKY_PREVIEW_URL`, `BROWSER_EXECUTABLE`, and optionally `SKY_GPU=metal`. Set `BIRD_RECORD=1` with Playwright's optional FFmpeg installed for route recordings. The state benchmark requires only Node.

The [combined baseline review](../engagement-validation/README.md) documents full-day samples, short clips, and a background run with substantial observation gaps. Uninterrupted human viewing, Safari/Firefox, and physical mobile checks remain review limitations. Breeding, age, resource needs, a named species, dynamic leaf occlusion, and a physical spatial soundscape remain outside the feature. The PR is for review; deployment remains separate.
