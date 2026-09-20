# Cottage life validation

Validated September 20, 2026, with Node 26.7.0 and Chrome 153 on Apple M1/ANGLE Metal. All HTTP/browser work used a disposable local SQLite world. No deployment or production data changed.

- `npm run check`: passed.
- `npm test`: 61 tests passed. Coverage includes chronological catch-up, equal-time bird/cottage effects, malformed client boundaries, migration and restart during a task, dwell/weather hysteresis, smoke tails, note filtering, and retryable HTTP/SSE catch-up responses.
- Focused cottage browser checks: 28 passed; [results](browser-results.json), including a 120-draw matrix of illumination, rain, independent lights, and casement positions.
- Existing sky shader/lifecycle checks: passed; [results](sky-browser-results.json).
- Existing foliage suite: 40 checks passed; [results](foliage-browser-results.json).
- Existing weather suite: 16 checks passed; [results](weather-browser-results.json).
- Existing visitor display suite: [12 checks passed](display-results.json), covering pause, studies, return to live, action/lease holding, and tab suspension.

Thirty real days (one world year) of joint catch-up took 233 ms in the final local unit run. The test database had 4,617 events, including 50 deliberately inserted hidden fixtures; the current cottage state remained under 1,800 characters. Arbitrary reads and one-step catch-up produced exactly equal snapshots and complete chronological histories. The HTTP test additionally exercises a world one real year behind, yielding bounded progress until all subsystems catch up.

## Art and recovery

The main unlit window's mean red-channel intensity fell from 168 in the original night painting to 28; the second fell from 161 to 29. Independent light and casement pixel comparisons changed zero pixels outside their authored room envelopes. The open casement changed 554 pixels within the main-room envelope. These measurements verify locality and baked-glow removal; they do not replace artistic review.

- [Dark rooms](cottage-dark.png)
- [Main-room light](main-room.png)
- [Open casement](open-casement.png)
- [Portrait framing](portrait-390.png)

The complete bundle needs two 256 × 256 RGBA textures (0.5 MiB) and six small draws. Local synchronized baseline/cottage median and p95 draw timings are recorded in `browser-results.json`; both stayed below the 33.34 ms frame budget at 800 × 844. These are local GPU measurements, not phone performance claims.

Focused checks cover fixed private studies, local pause, reduced-motion casement and smoke behavior, hearth-driven Canvas pixels, context restoration, invalid hinge/repair metadata, absent and corrupt assets, stale loads after disposal/reinitialization/context loss, and partial-draw recovery that preserves surviving sky/weather/foliage layers. Accessible text identifies the original static cottage when optional cottage art is unavailable. Every browser page reports uncaught exceptions.

## Reproduction and limits

Run the server on port 4174 with a disposable `A_VIEW_DB`. Use optional development-only Playwright for `node scripts/check-cottage-browser.mjs`. `BROWSER_EXECUTABLE` selects Chrome; `SKY_GPU=metal` explicitly opts into ANGLE Metal. `COTTAGE_RECORD=1` records a real-time committed casement task followed by a sampled burning hearth in `routine.webm`, and saves `hearth-smoke.png`. Playwright's optional ffmpeg component is needed for video. Full fixture matrices and videos are regenerable and ignored by Git; representative PNGs and numeric results are retained.

The small generated interior source and exact prompt are preserved in [ARTWORK.md](../../ARTWORK.md). Window panels and surrounding architecture retain canonical foreground geometry. The renderer is a shallow painted treatment, not a 3D building or physical light simulation.

Safari, Firefox, and physical mobile-device checks remain for human/device review. A visible resident, furniture handling, reflected room light, sound, and a full human lifecycle remain outside this release. Deployment awaits the user's human review.
