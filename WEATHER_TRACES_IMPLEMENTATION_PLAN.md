# Weather that leaves traces

Status: implemented on `codex/weather-traces`, September 19–20, 2026; awaiting PR review. See [validation evidence](docs/weather-validation/README.md). The sections below retain the implementation design. This is the first priority in [the engagement plan](ENGAGEMENT_PLAN.md); [cottage life](COTTAGE_LIFE_IMPLEMENTATION_PLAN.md) follows it.

## Intended experience and scope

Rain should leave the Lakeside Cottage changed for a while. A few path stones darken; a small depression holds water; the oak continues to shed occasional drops after the rain passes. The scene gradually dries, retaining its oil-painting texture and ordinary calm throughout.

The first release contains three related effects:

| Effect | Initial extent | Desired behavior |
| --- | --- | --- |
| Damp surfaces | One authored path region and a few nearby stones | Darken gradually in rain, retain moisture after it ends, then recover the dry painting |
| A shallow puddle | One existing low area of the path, selected during the art pilot | Appears only after sufficient rain; grows within a fixed depression; drains and evaporates gradually |
| Residual drips | Two or three authored oak drip points | Sparse drops continue briefly after rain, with small impact marks only where a visible receiving surface exists |

Morning mist is a second phase. Snow, soil ecology, lake-level changes, erosion, and a physical catchment water budget are outside this release. The moisture model is explicitly an artistic approximation with documented rates, not a claim of measured hydrology.

## Current implementation and consequences

- `shared/world.js` supplies deterministic, continuous `weather(epoch, now)` with cloud, rain, and wind. Its current weather oscillations use elapsed real seconds. Preserve that schedule for this feature; do not silently convert it to accelerated calendar time.
- `src/store.js` persists a version-1 world containing the nest and one bird action. There is no moisture history or general environmental checkpoint.
- `src/server.js` samples the store every two seconds, including without visitors. HTTP and stream requests also sample it. A new environmental model must give the same result under all these call patterns.
- `public/painting.js` draws rain on the Canvas life overlay. `public/sky-renderer.js` already applies cloud/rain darkening globally and moves lake texture. Neither stores rain's consequences.
- Foliage uses repaired bases plus moving painted patches. New effects must work with both the intact sky foreground and the active foliage base; they must not restore a stationary copy of moving grass.
- `WorldClient` holds display time at snapshot expiry and just before an uncommitted bird delivery. Pause clones the displayed snapshot. Private light studies override current conditions without changing world state.
- `public/app.js` currently treats every world revision as a reason to mark field notes unread. Continuous moisture checkpoints would make that behavior noisy; separating notes from simulation revisions is part of this release.

## 1. Prove the wet-paint treatment

Select one path patch and one stone at native 1672 × 941 artwork resolution. Prefer fixed areas that remain readable in the default portrait crop and do not overlap moving foliage. Record exact scene coordinates after inspecting the source; avoid guessed coordinates in production metadata.

Prepare registered dry/wet alternatives using canonical daytime geometry and the existing day-to-night illumination-transfer approach. Keep the stone edges and brush marks attached. Wetness should first read as a restrained shift in value and color; use only a small, broad reflection contribution in the puddle. Do not make the whole foreground glossy.

Create a production-renderer study with fixed dry, lightly damp, saturated, puddled, and drying fixtures. Review day/night light blends of 0, .25, .5, .75, and 1, with rain both present and absent. Wet surfaces must remain legible at night without becoming luminous. Establish the strongest acceptable wetness at normal screen size before selecting additional areas.

The pilot passes when its dry state matches the existing painting, its wet state belongs to the same medium, and the transition does not resemble a transparent sticker or moving blur. If the puddle cannot meet that standard, finish the damp-surface pilot before expanding the release.

## 2. Model persistent surface memory

Add pure functions in proposed `shared/surface-weather.js`, with authored rendering metadata kept separately in proposed `shared/lakeside-weather.js`.

Persist a small environmental state under `world.environment`, containing:

| Field | Meaning |
| --- | --- |
| `rulesVersion`, `introducedAt` | Model interpretation and the explicit start of surface-history tracking |
| `tickOrigin`, `tickIndex` | Canonical integration grid and latest fully completed tick |
| `pathWetness`, `stoneWetness` | Independent normalized moisture stores in [0, 1] |
| `puddleStorage` | Normalized storage for the single authored depression |
| `canopyStorage` | Normalized retained water controlling residual dripping |

Use a **10-real-second canonical tick** as the initial model resolution. This is independent of render frames, request arrival, the two-second broadcast, and the accelerated world calendar. Sample forcing at each tick's start and use that same forcing for the entire tick. Treat this discretization as part of `rulesVersion`, so results remain reproducible.

For each normalized store, use a bounded response of the form:

```text
dx/dt = I × (1 - x) - D × x
x(t + dt) = equilibrium + (x(t) - equilibrium) × exp(-(I + D) × dt)
equilibrium = I / (I + D)
```

Here `dt` is elapsed real seconds, `I` and `D` are nonnegative rates per real second, and the zero-rate case preserves `x`. Rain drives input; existing light and wind can affect drying. No temperature value is available yet, so do not describe a temperature-dependent model without adding that input explicitly.

- Give path and stone different absorption/drying parameters.
- Let puddle input depend on rain and path saturation sampled at the canonical tick start; use drainage plus evaporation for its loss. This is a response coupling, not a conserved transfer of physical water.
- Let canopy storage rise in rain and drain faster than the ground. Derive drip visibility from storage and current rain, with a smooth transition as rainfall ends.
- Keep all coefficients constant within a canonical tick. Evaluate partial ticks with the same formula, without writing partial results back as canonical checkpoints.

This last rule is essential: sampling at 3 seconds and then 10 seconds must not change the result compared with sampling directly at 10 seconds. Persist completed ticks only. Derive the displayed remainder from that checkpoint, and use the identical sampler on server and browser.

Initial art-tuning targets after meaningful rain are roughly 4–12 real minutes of visible dampness, 8–25 minutes for a substantial puddle to disappear, and 30–120 seconds of diminishing drips. These are trial ranges, not biological or meteorological facts. Tune against the actual existing rain cycle so the scene can become dry again and light showers need not form a puddle. Do not multiply these rates by `RATE`.

## 3. Migration, advancement, and snapshot contract

Introduce an explicit version-1-to-version-2 world migration for this release, preserving the epoch, nest, bird action, revision lineage, and existing events. Initialize the new surface stores dry at the migration timestamp, record `introducedAt`, and accumulate from that point. This is an acknowledged starting condition; do not fabricate older wetness observations or replay years of previously unmodeled weather.

Run migration transactionally and reject unsupported future versions. Test against a copy of an existing world. Keep the pre-upgrade database available because old application code currently rejects newer world versions; application rollback requires a compatible database backup, not just old JavaScript.

`WorldStore.advance()` should advance environmental ticks deterministically alongside existing nest completion. Update state once per transaction rather than writing each simulated tick. Advance the revision by a deterministic rule tied to processed state transitions/ticks, not the number of requests. Do not create an event record for every wetness change.

The snapshot includes the canonical environmental checkpoint, model version, and the existing `serverTime`/`validUntil`. The browser computes the partial tick and at most a few projected ticks within the current 30-second lease. It can safely project continuous surface state because the weather schedule and rules are deterministic. The server remains the owner of persisted checkpoints and any historical events.

Do not impose a new client hold every ten seconds solely for a continuous moisture tick. Continue to honor the earlier of transport expiry and any discrete action boundary. An unsupported environmental model should disable these visual effects and prompt a refresh or compatibility indication, rather than guessing a new history.

Catch up by replaying canonical ticks in bounded batches. Measure at least 24 hours and 30 real days of downtime; 30 days is approximately 259,200 ten-second ticks. If a long catch-up must yield, keep the server in an explicit catching-up state until a current, consistent snapshot exists. Do not stamp stale environmental state with the present time. Add analytic skipping only if it is proven equivalent to the chosen recurrence.

## 4. Assets and rendering

Proposed asset locations are `artwork/lakeside-weather-v1/` for editable sources and `public/assets/lakeside-weather-v1/` for exports. Add a reproducible exporter, proposed `scripts/prepare-weather-assets.mjs`, using the existing optional offline tooling rather than a runtime image-processing dependency.

Export:

- Small day/night wet-surface atlases with matching coverage alpha and padded interiors.
- Separate masks for dampness coverage and puddle depression/fill thresholds, preserving stone and vegetation occlusion.
- Drip origins, bounded fall paths, valid impact regions, asset compatibility information, and an export manifest.
- Inspection sheets showing dry/wet endpoints, intermediate coverage, and colored-background edge checks.

Use a separate, optional `public/weather-renderer.js` pass; the sky program already has seven samplers. Draw surface patches after the sky/landscape and before moving foliage, using `Painting`'s exact crop and pan transform. Restrict the initial masks to fixed surfaces so missing foliage does not create duplicate grass or incompatible coverage. Match existing light, cloud/rain shading, and dusk tint once; avoid double darkening a pre-tinted atlas.

Blend wet alternatives over their dry counterparts using stable, feathered authored coverage. Puddle fill should reveal connected portions of one depression, not scale a hard-edged oval. Begin with a muted sky-color reflection sampled from the existing lighting model; accurate reflected clouds and scene geometry are later work. A small ripple must inherit the same visible puddle boundary.

Drips can use a bounded Canvas pass with stable seeded emission opportunities derived from displayed real time and canopy storage. Drops are cosmetic particles, not individually persisted entities. Keep them in front of their source leaves and terminate them at authored surfaces; any drop needing an unsupported branch/terrain occlusion path should be removed from the pilot. Avoid a free-running random generator or frame-count accumulation.

Load the feature independently. Validate dimensions, coordinates, coverage, model compatibility, and GPU limits before activation. Missing/corrupt assets, draw failure, or context loss should remove the complete weather effect while preserving the existing sky, foliage, and original-plate fallback. Follow the current generation/disposal conventions so late async loads cannot revive stale resources.

## 5. Display modes, notes, and accessibility

| Situation | Required behavior |
| --- | --- |
| Live view | Surface state follows the shared environment and displayed clock |
| Local pause | Hold the full surface state, drip/ripple pose, lighting, and snapshot |
| Reduced motion | Disable falling drips and animated ripples; allow slow moisture/color change, with no moving geometry |
| Hidden tab or reconnect | Sample the current bounded state directly; do not replay missed drops |
| Expired snapshot | Hold with the existing connection indication; stop advancing drying |
| Private light study | Use deterministic local environmental fixtures, never mutate or advance the live environment from study rain |
| Return to live | Discard study state and rejoin the shared environmental checkpoint |

For light-study defaults, use dry surfaces in the fair-weather studies and a fixed wet fixture in Rain. Developer controls may explore intermediate states. Make the private status clear in the accessible description; a study must not produce field notes.

Add short current-condition descriptions such as “The path is still damp” or “Water rests in a shallow hollow.” Derive them from stable threshold bands, avoiding rapid threshold chatter. Include those details in the inspectable description; keep routine drying changes out of automatic live announcements in the first release.

Change the unread-note logic to compare the latest committed event sequence rather than `world.revision`, recording the latest seen sequence when notes are opened. Environmental ticks do not create new notes. Existing nest events remain visible. Historical weather prose is an optional later addition, requiring explicit committed event facts and deduplication.

## 6. Integration map

| File or area | Planned change |
| --- | --- |
| `shared/surface-weather.js` (new) | Versioned recurrence, partial-tick evaluation, stable descriptors |
| `shared/lakeside-weather.js` (new) | Surface bounds, masks, drip paths, asset manifest configuration |
| `shared/world.js` | Attach optional scene weather-art configuration; retain the current weather schedule |
| `src/store.js` | Versioned migration, environmental checkpoints, deterministic advancement, snapshot fields |
| `public/weather-renderer.js` (new) | Wet-surface/puddle GPU pass and resource lifecycle |
| `public/painting.js` | Load, order, sample, and dispose weather art; add bounded drips and mode handling |
| `public/app.js`, `public/scene-description.js` | Event-sequence note state, study fixtures, quiet environmental descriptions |
| `public/dev/` and `scripts/` | Production-renderer weather study, asset exporter, focused browser checks |
| `test/`, `package.json` | State/migration/client checks and syntax-check coverage for added modules |
| `ARTWORK.md`, `README.md`, validation report | Provenance, implemented behavior, measurements, and explicit limits |

## 7. Validation and acceptance

**State and timing:** compare identical final checkpoints across regular ticks, arbitrary HTTP/SSE sampling, a single catch-up, and a restart during rain/drying. Cover exact tick boundaries, partial ticks, zero and saturated stores, changing rules versions, repeated migration, and recovery without duplicate events. Verify real-second rates at different calendar positions. Check that all states remain finite and within bounds.

**Client behavior:** two clients at the same displayed time agree on wetness and puddle extent. Old snapshots cannot rewind them. Pause freezes all inputs; reduced motion removes particle movement; private rain cannot wet the live world. Environmental revisions cannot repeatedly mark notes unread.

**Art and lifecycle:** capture dry/rain/after-rain/drying at five light blends, desktop landscape, default portrait, pan extremes, and supported DPR settings. Inspect moving clips as well as stills. Verify no dark rectangles, seams, grass duplication, glowing puddles, floating impacts, or damaged fallback paths. Simulate missing assets and WebGL loss/restoration.

**Performance:** compare baseline and feature-enabled asset bytes, GPU memory/draws, frame intervals, SQLite write frequency, and catch-up time on the same machine. Preserve the current 30 fps display target. Begin with atlas pairs no larger than 1024 × 1024 and a small bounded particle set; expand only when visible quality warrants it. No per-frame texture uploads or growing particle histories.

Run `npm run check` and `npm test`, then the applicable sky, foliage, and display browser suites plus focused weather checks against a temporary database. Record unavailable physical-device/browser coverage honestly. The release is accepted only when the causal/timing checks pass and the visual review preserves the quiet painting.

## Delivery milestones

1. **Visual pilot:** one wet path patch and stone in the production renderer, fixed fixtures, documented tonal limits.
2. **Surface continuity:** pure model, migration, canonical catch-up, snapshots, and deterministic tests; fix event-sequence note behavior.
3. **Complete first release:** one puddle, residual drips, mode handling, accessibility, and independent asset fallback.
4. **Validation and documentation:** regression suites, performance/catch-up measurements, visual evidence, artwork provenance, and updated scope.

Follow-on mist should start as a separate art study with an explicit depth mask for the far hills/lake. Its appearance may depend on retained moisture, daylight, and wind as artistic rules; a meteorological claim would require additional environmental inputs. It must not be a full-screen haze that washes out the cottage and foreground oak.
