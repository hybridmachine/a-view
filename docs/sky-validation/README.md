# Dynamic sky verification

Validation on September 18–19, 2026, using an isolated temporary SQLite database on port 4174. The repository's persisted world was not modified. Scene `lakeside-cottage`, sky version 1, seed 617.

## Results

- `npm run check`: passed, including the new shared, renderer, preview and offline scripts.
- `npm test`: 30 passed, including nine new sky/wind contracts and the existing clock, connection, action and sound tests.
- Production WebGL shader: 17/17 pixel assertions passed. The tolerance is three 8-bit channel values. Assertions cover clear celestial pixels, opaque cloud concealment, half-alpha composition, multiplied transmission, opaque/partial foreground and holes, atlas wrapping, four-corner orientation, crop/pan and changed pixel ratio.
- Browser lifecycle/display preferences: 26/26 assertions passed, including three context loss/restoration cycles, stable resource counts, unchanged celestial upload count while paused, reduced-motion media changes, repeated initialization/disposal, independent sessions and reloads, missing assets, mismatched foreground alpha, insufficient sampler/texture limits, shader failure, and no WebGL.
- Visitor controls and clock integration: 12/12 assertions passed, including actual pause/resume pixel comparisons, all five light studies, return to live, pending action boundaries, expired snapshots, reconnection, and tab freeze/activation.
- No uncaught browser errors in either suite. Deliberately injected asset/shader failures produce the expected fallback warning.

Detailed machine-readable results: [browser-results.json](browser-results.json), [display-results.json](display-results.json), and [baseline.json](baseline.json).

## Visual inspection

Inspected 1920 × 1080, 1440 × 900, and 390 × 844 viewports, both pan extremes, and device pixel ratios 1 and 2 (rendering remains capped at 1.6). Inspected clear/thin/dense night, daytime overcast, dawn, dusk, oak and horizon, and a fixed full moon crossing. Native-resolution and enlarged oak/ridge crops were examined over black, white, magenta and replacement skies. Contact sheets include light values 0, .25, .5, .75 and 1.

The first mask export exposed warm cloud fragments among leaf gaps and incorrect ridge spikes. The final exporter uses an oak search envelope, corrected color matte, detailed hill trace, and a narrow continuous edge search. Recovered edge colors and shared canonical geometry remove the old sky fringe and doubled night branches. The current asset set has matching foreground coverage and no recognizable stationary cloud forms in exposed sky.

Representative review frames are retained:

- [Original moon-over-painting defect](baseline-night.png): controlled full phase, hour 20, no cloud multiplier; original renderer/plates.
- [Layered daylight](day-clouds.png): world day 135, hour 15.5, cover .45, motion 1000 s.
- [Cloud crossing the moon](crossing-160.png): world day 135, hour 0, cover .65, motion 160 s, fixed moon `(x=.78, y=.16, phase=.5)`.
- [Portrait at device pixel ratio 2](portrait-dpr2.png): 390 × 844 viewport, right pan, cover .4, motion 1000 s.

The full PNG matrix and contact sheets are generated locally and ignored by Git; rerun the exporter and browser check to reproduce them. Pixel output can differ slightly across GPUs. Semantic state and composition equations are the compatibility contracts.

## Performance and resource budget

Host: Apple M1, macOS 26.6.2, headless Chromium 140.0.7339.186 using ANGLE Metal. A preliminary software-only run used SwiftShader and is not representative of physical phone performance. The same M1 Metal configuration was used for final before/after draw-submission measurements: 1440 × 900, DPR 1, 180 frames, night study, displayed time beginning at 1,000,000 ms.

Both the original and layered renderer measured approximately 0.10 ms median and 0.20 ms p95 synchronous submission time. These browser timings, even with `gl.finish()`, are **not GPU execution timings** and do not establish a phone frame-rate guarantee. The result JSON separately records a full minute of actual preview frame intervals and sampled transmission during the cloud crossing.

The final M1 crossing delivered **1,800 frames in 60.018 seconds (29.99 fps)**, with **33.3 ms median / 33.4 ms p95** frame intervals. At the fixed moon center, transmission moved from 0.980 to 0.055 as the cloud crossed it; the disk's partial concealment is captured at motion time 160 seconds. This measures the capped preview at the stated viewport, not all devices.

The original frame throttle discarded fractional intervals and averaged about 22 fps on this 60 Hz environment. The updated throttle retains that remainder while preserving the 30 fps cap and the supplied world clock. Neighborhood coverage sampling is restricted to moving, fully covered foreground. Sky and partially covered silhouette pixels avoid those extra texture fetches.

Resource budget:

| Resource | Measured / estimated |
| --- | --- |
| Runtime sky bundle PNG bytes | 13,358,996 bytes (12.74 MiB); excludes QA mask/metadata and original fallback plates |
| Largest texture | 2048 × 1024 cloud atlas |
| GPU textures | 7; approximately 39.5 MiB uncompressed RGBA, excluding driver/backbuffers |
| Original fallback image decoding | Approximately 12 MiB for both original plates |
| Resources after each restoration | 7 textures, 2 shaders, 1 buffer, 1 program |
| Static uploads per initialization | 7; no repeated texture allocation during frames |
| Celestial updates | Cached by quantized actual raster inputs; no repeated upload for an unchanged paused/study frame |

The final measurement records seven celestial updates across fixture setup plus timing runs, with combined draw/upload submission overhead around one millisecond on the M1. This is not a transfer-bandwidth measurement. Native offscreen Canvas and decoded source images add CPU-side memory beyond the GPU estimate. Small state/uniform objects are still created per frame; no image, Canvas, buffer or texture allocations occur in the steady drawing path. No startup preloads were added because no measured loading benefit justified them.

## Reproduce

Start the server with a temporary database as described in the root README, then open `/dev/sky-study.html`. **Run pixel checks** reports production-shader pass/fail in the page. **Play crossing** runs the fixed edge crossing from motion time 120 seconds. **Lose / restore context** exercises recovery.

Optional development dependencies are `sharp` and `playwright`; they are not runtime dependencies. With those packages resolvable by Node (or supplied through `NODE_PATH`):

```sh
node scripts/prepare-sky-assets.mjs
SKY_GPU=metal SKY_LONG_CHECK=1 node scripts/check-sky-browser.mjs
node scripts/check-sky-display.mjs
```

`BROWSER_EXECUTABLE` can select an installed Chromium binary. `SKY_PREVIEW_URL` overrides the default local port. Omit `SKY_GPU=metal` on non-macOS hosts; it requests the host Metal renderer for the macOS benchmark. The display check uses the same Metal flags on this host.

## Remaining external validation and approximation limits

Physical phone hardware and Safari/Firefox were not available for this run. Phone-sized Chromium viewports validate registration and layout, not mobile GPU throughput or cross-browser behavior. A physical phone benchmark and those browser runs remain release checks; this implementation does not claim a measured 30 fps guarantee on them.

Celestial motion retains the original approximate model. Clouds use two repeated painted strips; broad overcast is a density floor. Night illumination transfers low-frequency color onto the canonical day detail, rather than geometrically warping the old night plate. The landscape mask provides sky occlusion only. Cloud-shaped lake reflections, exact moon reflections, moving terrain shadows, volumetric clouds and general bird/branch depth ordering remain subsequent work.
