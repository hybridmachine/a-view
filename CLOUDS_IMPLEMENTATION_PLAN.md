# Dynamic clouds and correct sky occlusion

Status: proposed implementation plan. This document describes future work; the renderer and artwork have not been changed as part of writing it.

## 1. Intended result

The Lakeside Cottage should have slowly moving, painterly clouds that respond to the shared weather. The moon and stars must appear behind clouds, hills, and trees. Thin clouds should soften celestial objects; dense clouds should conceal them. Cloud movement must remain continuous when visitors reload, resize, pan, pause, or return to the view.

Keep the existing JavaScript, WebGL, and Canvas architecture. Implement this as an extension of the current renderer, with offline asset preparation and deterministic visual state. No database migration, new simulation worker, or runtime graphics framework is needed.

The first release includes two cloud layers, correct sky occlusion, day/night lighting, weather-driven coverage, a modest response in reflected lake light, fallback handling, and focused validation. Detailed cloud reflections, cloud shadows moving across terrain, volumetric clouds, a new astronomical model, and general occlusion between every moving animal and landscape object are subsequent work.

## 2. Current behavior and cause of the defect

The relevant implementation is in these files:

| File | Current responsibility | Implication |
| --- | --- | --- |
| `public/painting.js` | Blends day/night paintings in WebGL and draws life effects on a Canvas overlay. | The sky and landscape are currently flattened together. |
| `public/painting.js`, `drawSky()` | Draws stars, moon glow, and the moon disk on `#life`. | All of those pixels appear above the complete painting, including its clouds. |
| `public/index.html` | Places `#life` after `#painting`. | Changing CSS stacking cannot separate clouds from the landscape image. |
| `shared/world.js` | Provides scene metadata, the accelerated calendar, weather, and light-study conditions. | Reuse its authoritative inputs for cloud coverage and timing. |
| `public/app.js` | Supplies the displayed time, pause state, studies, and a render loop capped at 30 fps. | Cloud animation must use this supplied time rather than another clock. |
| `public/world-client.js` | Orders snapshots and limits displayed time during connection gaps and pending actions. | Clouds should observe the same time limits as the rest of the view. |
| `ARTWORK.md` | Records the two existing paintings and their provenance. | It explicitly states that their registration is close, not guaranteed identical. |

Both existing paintings contain stationary clouds. Adding moving clouds above them would leave the old clouds visible underneath. The current moon and star opacity uses the scene-wide `w.cloud` value; that cannot express a cloud covering only half of the moon.

The implementation therefore needs both new art layers and a renderer change. Asset registration and foreground edge quality are prerequisites for the final visual result.

## 3. Rendering contract

Use an explicit order from farthest to nearest:

| Order | Layer | Required behavior |
| --- | --- | --- |
| 1 | Clear sky | Cloud-free day/night background, blended using the existing light model. |
| 2 | Stars and moon | Stars, moon disk, and restrained moon glow, all behind atmospheric clouds. |
| 3 | Distant clouds | Broad, thin forms with slower apparent movement. |
| 4 | Nearer clouds | More distinct forms with greater opacity and somewhat faster movement. |
| 5 | Landscape foreground | Hills, cottage, tree, land, and lake; alpha coverage exposes the sky behind them. |
| 6 | Existing local effects | Smoke, reeds, nest, and the existing bird effects retain their current ordering. |
| 7 | Rain and interface | Existing foreground rain, edge shade, and controls. |

Implement orders 1–5 in the WebGL painting compositor. Keep the existing `#life` canvas for local effects, and remove its celestial drawing. Do not add a second visible sky canvas with an independent crop transform.

The foreground alpha is a visibility mask, not a depth buffer. It correctly handles sky versus landscape, including gaps through leaves. It does not automatically make a bird disappear behind a particular branch. Keep that distinction explicit in documentation and follow-up work.

## 4. Asset preparation

### 4.1 Deliverables

Keep the original `lakeside-day.png` and `lakeside-night.png` as fallback assets. Create a versioned set under `public/assets/lakeside-sky-v1/`:

| Asset | Format and size | Purpose |
| --- | --- | --- |
| `sky-day.png` | Opaque RGB/RGBA, 1672 × 941 | Cloud-free daytime sky extending behind the complete composition. |
| `sky-night.png` | Opaque RGB/RGBA, 1672 × 941 | Corresponding cloud-free night sky with the same texture registration. |
| `foreground-day.png` | RGBA, 1672 × 941 | Daytime landscape with transparent sky and carefully recovered edge colors. |
| `foreground-night.png` | RGBA, 1672 × 941 | Nighttime landscape with exactly the same coverage alpha. |
| `sky-mask.png` | Grayscale PNG, 1672 × 941 | Authoring and QA mask: white is visible sky, black is opaque landscape. |
| `cloud-atlas.png` | RGBA, initial target 2048 × 1024 | Two padded cloud texture regions: distant and nearer clouds. |

The exported foreground alpha is `1 - skyMask`. The standalone mask is retained for inspection and future authoring; it does not need a separate runtime sampler.

Treat the atlas dimensions as an initial quality budget to validate at the target display sizes. Store atlas regions and sampling bounds in the scene configuration. Each region needs its own duplicated edge gutters so linear filtering cannot sample its neighbor.

### 4.2 Production steps

1. Select the daytime plate as the canonical composition and inspect the nighttime plate against it at full resolution.
2. Align or locally correct the night artwork around hills, fine branches, cottage edges, and leaf gaps. A shared mask must describe the same objects in both images.
3. Author the sky mask at native image resolution. Preserve small holes between leaves, the irregular hill silhouette, and partial edge coverage.
4. Recover foreground colors at partially transparent boundaries. Simply assigning alpha to pixels already blended with the old sky will leave bright or blue fringes when the replacement sky changes.
5. Author the clear sky pair without recognizable stationary clouds, celestial disks, or baked celestial glow. Preserve the palette and brush character of the original scene.
6. Author distant and nearer cloud forms with transparent gaps, soft but painted edges, and varied internal density. Make the two horizontal texture boundaries match so repeated sampling is seamless.
7. Keep the vertical texture boundary clear or clamped. Do not repeat a cloud band vertically into the horizon.
8. Export assets and record their paths, dimensions, alpha convention, atlas regions, generation/editing provenance, and registration corrections in `ARTWORK.md`.

For cloud textures, use RGB for neutral painterly shading and alpha for base cloud density. Density variation must come from the artwork, not from a moving screen-space noise filter. Extend appropriate RGB colors into transparent texels to avoid colored fringes when filtering.

The runtime alpha convention is specified in section 8. Validate exports against that convention before integrating them.

### 4.3 Asset acceptance gate

Composite the foreground pair over flat black, white, magenta, and both replacement skies. Inspect at 100% and enlarged around the oak and horizon. Blend daylight through 0, 0.25, 0.5, 0.75, and 1. There must be no duplicate branches, opaque patches in leaf gaps, old cloud remnants, or obvious edge halos.

Asset preparation is the largest visual uncertainty. If a boundary cannot be recovered cleanly, correct the asset rather than hiding it with a broad blur. A wide feather makes clouds leak over the landscape.

## 5. Scene configuration and module boundaries

Extend the Lakeside Cottage entry in `SCENES` with an optional `sky` configuration. Existing `assets.day` and `assets.night` continue to identify the complete fallback paintings.

The following is a schema sketch; values called out as tuning parameters must be settled using the preview before release:

```js
sky: {
  version: 1,
  seed: 617,
  assets: {
    day: '/assets/lakeside-sky-v1/sky-day.png',
    night: '/assets/lakeside-sky-v1/sky-night.png',
    foregroundDay: '/assets/lakeside-sky-v1/foreground-day.png',
    foregroundNight: '/assets/lakeside-sky-v1/foreground-night.png',
    clouds: '/assets/lakeside-sky-v1/cloud-atlas.png',
  },
  layers: [
    { id: 'distant', /* atlas bounds, period, speed, density, tint */ },
    { id: 'near', /* atlas bounds, period, speed, density, tint */ },
  ],
}
```

Each cloud layer configuration should contain its atlas interior rectangle, horizontal period in scene widths, vertical placement and extent, initial phase, speed coefficient, density response, and day/night shading colors. Keep these authored values together rather than spreading unexplained numbers through the shader.

Add these focused modules:

| Module | Responsibility |
| --- | --- |
| `shared/wind.js` | Pure wind sampling and its analytic displacement integral. |
| `shared/sky.js` | Pure cloud layer state and celestial pose calculations, using explicit input times and configuration. |
| `public/sky-renderer.js` | Sky assets, celestial texture generation, shader source/helpers, texture binding, and resource disposal. |
| `public/painting.js` | Final scene compositing, crop, existing landscape movement, local effects, and fallback selection. |

`shared/wind.js` must not import `world.js`. Let `world.js` call the extracted wind sampler, and let `sky.js` import the pure shared functions it needs. This avoids a circular dependency while keeping browser and Node test imports usable.

Use scene dimensions instead of adding more hardcoded `1672` and `941` values. The current resize implementation already contains those constants; replace them with `scene.width` and `scene.height` while connecting the sky transform.

## 6. Cloud state and time

### 6.1 Authoritative sampling

For each frame, calculate:

```js
const realSeconds = (displayedNow - snapshot.world.epoch) / 1000;
const conditions = viewConditions(snapshot.world.epoch, displayedNow, study);
```

`displayedNow` is the `now` argument already passed to `Painting.render()`. Do not read `Date.now()` or accumulate animation-frame deltas inside the cloud system.

Cloud translation and subtle shape changes use elapsed real seconds. Celestial motion and illumination continue to use the accelerated calendar returned by `viewConditions()`. Preserve the existing weather schedule in this change, even though the broader design document discusses a future world-time weather schedule.

Add a pure function such as:

```js
sampleCloudLayers({ realSeconds, motionSeconds, weather, config })
```

Return bounded layer phases, density controls, and shading inputs. The function must not retain frame history. `motionSeconds` normally equals `realSeconds`; reduced-motion handling may supply a frozen motion sample while current weather still affects appearance.

Use the configured seed for stable offsets and layer variation. Do not create random cloud instances on page load. The same scene version and sampled time must produce the same geometric arrangement across clients; minor GPU pixel differences are acceptable.

### 6.2 Integrate wind instead of multiplying by its current value

The current wind model is:

```text
w(t) = 0.28 + 0.13 sin(t / 83) + 0.12 sin(t / 221)
```

For real seconds `t`, its integral from zero is:

```text
I(t) = 0.28 t
     + 0.13 × 83  × (1 - cos(t / 83))
     + 0.12 × 221 × (1 - cos(t / 221))
```

For a layer whose speed coefficient `k` is measured in scene widths per real second per wind unit:

```text
displacement(t) = k × I(t)
phase(t) = positiveModulo(initialPhase + displacement(t), repeatPeriod)
```

Extract the existing coefficients into `shared/wind.js` and preserve existing `weather()` outputs. Both wind sampling and displacement must use the same coefficients. If the wind model changes later, update its integral and validation together.

Do not use `t × w(t)` for displacement: changes in wind would incorrectly move a cloud according to all previously elapsed time.

Start visual tuning with average apparent speeds of roughly 0.2–0.5 native artwork pixels per real second for distant clouds and 0.5–1.0 for nearer clouds. These are artistic starting values, not measured requirements. Convert to scene units using the scene width and the mean wind value. Use one authored horizontal direction initially, consistent with the scene's general wind cues.

### 6.3 Wrapping and long sessions

Reduce repeating translation phases on the CPU before uploading them to GPU uniforms. Keep shader values bounded so an old world does not lose visible motion precision from very large elapsed-time floats.

For each cloud layer, calculate periodic texture coordinates from scene UV and the bounded phase. Repeat within that layer's atlas interior, with gutters matching both horizontal boundaries. The artwork must be periodic as well as the mathematics.

Use bounded phases for deformation too. Independent, nonmatching time resets would introduce jumps. Test near phase boundaries and after long elapsed intervals without replaying intermediate frames.

### 6.4 Shape and coverage

Use two independently sampled cloud layers. Introduce only small, slow deformation in cloud-local coordinates, and sample shading and density through the same deformation so brush texture stays attached to the cloud.

Map `weather.cloud` to density with a smooth transfer function. A practical first implementation is a thresholded density texture with a tunable softness and an opacity scale. At zero cover, cloud alpha must be zero everywhere. Increasing cover must increase or preserve each pixel's alpha for a fixed motion sample. At heavy overcast, raise a broad density floor so the same sparse puffs do not simply become darker while large clear gaps remain.

Use rain to influence cloud color and the high-cover response, while keeping cloud cover the primary density input. Avoid thresholds that make entire layers suddenly appear or disappear.

## 7. Celestial rendering

Move the existing moon phase, approximate position, stars, and glow into a reusable celestial stage. Preserve the current approximate astronomical behavior for this scope, and expose its calculations as pure functions in `shared/sky.js` where useful for testing.

Render celestial elements into an offscreen transparent Canvas at a fixed scene aspect ratio, initially at native artwork resolution. Upload it to a WebGL texture used by the compositor. Use scene coordinates rather than viewport coordinates, so resizing and panning do not require a different celestial arrangement.

Draw the moon glow, disk, and stars before clouds. Remove the existing cloud-dependent multipliers from their brightness; spatial cloud opacity now attenuates them during compositing. Keep daylight-dependent visibility. Do not draw an extra unmasked glow above the completed painting.

Cache celestial drawing and uploads by their actual input state. A paused or unchanged study frame should not redraw or upload an identical texture. Begin with this straightforward path; if measurement shows excessive upload cost, move celestial drawing into the GPU without changing the layer contract.

Make celestial pose injectable in the developer preview. The existing night study does not guarantee that a suitably illuminated moon will be visible on every world day, so regression fixtures need a controlled moon pose and phase.

## 8. WebGL compositor

### 8.1 Texture budget and coordinates

The initial final compositor uses seven texture samplers:

1. Day foreground.
2. Night foreground.
3. Clear daytime sky.
4. Clear nighttime sky.
5. Cloud atlas.
6. Celestial texture.
7. Existing water mask.

Query the available texture units and maximum texture size before activating the new renderer. If a device cannot support the selected layout and asset sizes, use the fallback path. Reuse texture allocations; allocate or upload static textures only during initialization or context restoration.

Every scene layer uses the same scene-space mapping:

```text
sceneUv = viewportUv × crop + offset
```

Keep the existing top-left artwork coordinate convention consistent through Canvas uploads and WebGL sampling. Add a test texture with distinct corner colors to verify orientation. Atlas sampling occurs after this shared scene mapping.

### 8.2 Alpha convention and equations

Use explicit premultiplied colors for compositing. For uploaded RGBA images and Canvas textures, select and document one upload convention that produces premultiplied samples, including the `UNPACK_PREMULTIPLY_ALPHA_WEBGL` setting. Reset pixel-store state explicitly when needed. Never multiply the same alpha twice.

For two layers, with foreground premultiplied color `F`, foreground alpha `a`, and opaque background `B`:

```text
over(F, a, B) = F + (1 - a) × B
```

Build the frame in this sequence:

```text
sky = blend(clearNight, clearDay, daylight)
sky = over(celestialColor, celestialAlpha, sky)
sky = over(distantCloudColor, distantCloudAlpha, sky)
sky = over(nearCloudColor, nearCloudAlpha, sky)

foreground = blend(nightForeground, dayForeground, daylight)
scene = over(foregroundColor, foregroundAlpha, sky)
```

The foreground alpha must be shared between the day/night plates. When changing cloud density relative to its texture's original alpha, recover straight shading safely for nonzero alpha, then premultiply it by the final cloud alpha. Handle zero alpha without division by zero or NaNs.

The two cloud layers' combined transmission is:

```text
T = (1 - distantCloudAlpha) × (1 - nearCloudAlpha)
```

This naturally yields partial moon visibility and complete concealment when an intervening cloud is opaque. Use this as a debug visualization and as a test invariant. Do not additionally multiply celestial brightness by the same `T` before compositing; that would attenuate it twice.

Keep the initial color treatment consistent with the existing renderer. Document its working color space, and defer a full color-management conversion to a separate change rather than changing the entire painting's appearance incidentally.

### 8.3 Foreground movement and edge coverage

Preserve the water and interior foliage motion where they remain valid. Sample sky and clouds from undisplaced scene UV. Foreground water distortion must not move the sky mask or the horizon.

Gate foliage displacement near transparency boundaries using the foreground coverage at the original and proposed sample positions, with a conservative interior margin. Keep partially covered silhouette pixels fixed in the first version. This prevents an independently moving mask from exposing bright seams or erasing fine branches. Any future moving silhouette must carry both its color and coverage through the same transform.

Keep the existing water mask for distortion and glimmer. Inspect its alignment after the art layers are split.

### 8.4 Weather, lighting, and water

Blend clear skies and cloud shading using the existing daylight and dusk inputs. Day clouds should retain cream and gray brush detail; night clouds should remain legible against the blue sky without becoming luminous cutouts. Rain should produce a restrained darker palette.

Refactor the existing global `cloud` and `rain` multiplication so illumination is applied intentionally once per affected surface. Foreground ambient darkening may still use regional cover; that is separate from the spatial concealment of celestial objects. Verify that the refactor does not accidentally multiply the whole scene twice.

For the first lake response, derive a small, bounded ambient tint and brightness adjustment from the same calendar, cloud cover, and sky palette inputs. Apply it through the water mask. This should respond to broad sky conditions without introducing a sharp reflection that the static water painting cannot support. Detailed cloud-shaped reflections and a geometrically accurate moon reflection remain follow-up work.

## 9. Renderer lifecycle and failure handling

Load the original fallback images independently from the optional dynamic sky bundle. Validate the complete sky asset set before enabling the compositor: expected dimensions, matching foreground alpha, atlas bounds, successful decoding, texture limits, and shader compilation/linking.

Use a complete fallback whenever the dynamic bundle is missing or invalid. The original day/night paintings already include clouds; procedural celestial objects must not be drawn above them. Existing local life effects may remain available while conditions are being rendered normally.

On WebGL context loss, immediately hide the GPU canvas, clear the overlay to remove a potentially stale frame, and show the appropriate original day/night fallback. The current implementation stops rendering when `ready` becomes false; adjust the lifecycle so fallback selection can still follow the displayed conditions.

On restoration, recreate GPU resources and switch back only after a successful first complete render. Do not combine newly restored sky textures with stale foreground resources. Guard asynchronous initialization with a generation token so an obsolete load cannot replace a newer context's resources.

Track and release shaders, programs, buffers, textures, listeners, and offscreen references when rebuilding or disposing the renderer. Repeated context restoration must not accumulate GPU resources or event handlers. If initialization fails, keep rendering the coherent fallback rather than leaving a blank canvas.

Use versioned asset paths so caches cannot pair a new manifest with an old mask or foreground export.

## 10. Pause, reduced motion, studies, and reconnection

| Situation | Expected behavior |
| --- | --- |
| Normal live view | Cloud geometry samples displayed real time; light and celestial pose sample the world calendar. |
| Local pause | Frozen `now` and snapshot freeze geometry, weather, lighting, and celestial pose. |
| Resume | Sample the present directly. Do not replay missed cloud movement. |
| Reduced motion on initial load | Capture one current cloud motion sample; hold translation and deformation while allowing slow weather and lighting changes. |
| Reduced motion enabled during a visit | Freeze the current motion sample, avoiding a jump back to epoch zero. |
| Reduced motion disabled | Rejoin the shared current arrangement; avoid a fast catch-up animation. |
| Hidden tab | Keep the existing suspension of rendering. Sample the current accepted state when visible again. |
| Expired snapshot or action boundary | Honor the bounded displayed time from `WorldClient`; no separate cloud clock bypasses it. |
| Light study | Use the study's calendar and weather overrides while retaining real-time cloud movement. |
| Return to live | Restore live conditions and the arrangement derived from displayed time. |

Add a change listener to the reduced-motion media query and clean it up with the renderer. Keep the frozen motion sample as a local display preference, never as server state. Reduced-motion visitors may therefore see different held cloud geometry while receiving the same shared conditions.

For deterministic validation, the developer preview needs independent fixed values for calendar, cloud cover, and motion time. These preview inputs must not be implemented by changing the world epoch or writing to SQLite.

## 11. Developer preview and validation

### 11.1 Preview harness

Add `public/dev/sky-study.html` and `public/dev/sky-study.js`, served by the existing local server and unlinked from visitor controls. Pass fixture inputs directly to rendering helpers; do not create a new world-state API.

The preview should provide fixed scenes for clear night, thin cloud over the moon, dense cloud over the moon, a cloud edge crossing the disk, dense daytime overcast, dawn, dusk, and the oak/horizon boundaries. Include controls for elapsed time, layer visibility, fixed celestial pose, and cloud cover.

Provide debug modes for foreground alpha, each cloud alpha, combined transmission, and the pre-foreground sky. Include synthetic textures for numeric tests and real artwork for visual inspection. Synthetic fixtures must execute the production compositor shader, not a separate imitation.

### 11.2 Node tests

Add `test/sky.test.js` using the existing `node:test` setup. Cover these behavior-level contracts:

1. Repeated sampling at the same time and configuration returns identical cloud state.
2. Direct sampling at a later time matches sampling after an arbitrary sequence of intermediate frames.
3. Cloud displacement depends on elapsed real seconds, independently of a light-study calendar override.
4. The derivative of the displacement integral matches the wind sampler within a numeric tolerance, checked at several times.
5. Extracting wind preserves the current `weather()` outputs for representative timestamps.
6. Layer phases remain finite and bounded at zero, normal runtime, phase boundaries, and multi-year elapsed values.
7. A fixed motion sample with changing weather holds cloud geometry while changing density inputs.
8. Clear cover produces zero opacity; increasing cover produces monotonic density controls at fixed geometry.
9. Celestial phase and position fixtures remain valid and finite across calendar boundaries.

Use browser checks for real shader output, alpha filtering, resource handling, and image registration. Node-only math tests cannot establish that the GPU composition is correct.

### 11.3 Browser rendering checks

Run bounded pixel assertions in the preview against synthetic textures and the actual compositor. Read pixels only in this test path, not in the production animation loop. Report explicit pass/fail results in the harness.

| Fixture | Assertion |
| --- | --- |
| Clear sky with a bright moon and star | Both are visible at the expected coordinates. |
| Opaque cloud over celestial pixels | Changing the hidden moon/star brightness does not change the resulting covered pixel, within tolerance. |
| Cloud with alpha 0.5 over a known background | Output matches the premultiplied composition equation within an agreed channel tolerance. |
| Two partially transparent cloud layers | Celestial contribution matches the product of both transmissions. |
| Opaque foreground over moon and cloud | The output equals the foreground sample, independent of sky changes. |
| A transparent hole in foreground coverage | The composed sky remains visible through it. |
| Partial foreground coverage | The edge blends correctly without applying alpha twice. |
| Atlas phase immediately before/after wrapping | No visible seam or sudden color change beyond the expected small motion. |
| Crop, pan, and changed pixel ratio | All sky and foreground coordinates remain registered. |

Use a small channel tolerance for GPU color rounding; define it with synthetic fixtures before evaluating artistic images. Compare semantic cloud state across browsers, rather than requiring bit-identical screenshots on different GPUs.

### 11.4 Visual and interaction matrix

Inspect real artwork at wide desktop, standard laptop, and portrait phone dimensions, including both pan extremes and more than one device pixel ratio. Include all existing light studies and a controlled night fixture with a visible moon. Capture representative screenshots with fixed scene version, conditions, and motion time.

Observe a controlled cloud crossing for at least a minute: partial concealment must move smoothly, the glow must remain behind the cloud, and brush texture must remain attached to the form. Use longer time jumps in the preview to inspect repetition and overcast transitions without waiting for the live weather schedule.

Verify pause/resume, reduced-motion changes, reload, two browser sessions at the same injected time, connection expiration, hidden-tab return, asset-load failure, no WebGL, and context loss/restoration. Check browser console errors and resource growth during restoration.

### 11.5 Performance

Measure before and after at matching viewport, device pixel ratio, conditions, and displayed time. Preserve the existing 30 fps render cap and pixel-ratio cap initially.

Record frame-time distribution, texture upload time, peak texture dimensions, decoded texture memory estimate, asset bytes, and any repeated allocations. The target is a steady 30 fps on the representative laptop and phone chosen for validation; document the actual devices and results instead of claiming an unmeasured guarantee.

If the budget is exceeded, first avoid redundant celestial uploads and allocations, then tune celestial texture resolution and cloud sampling cost. Keep both cloud occlusion and the native foreground mask quality. A lower quality setting must retain the same cloud positions, coverage rules, and layer order.

## 12. File-by-file change list

| File or directory | Planned change |
| --- | --- |
| `public/assets/lakeside-sky-v1/` | Add validated sky, foreground, mask, and cloud atlas assets. |
| `ARTWORK.md` | Record production prompts/methods, dimensions, mask convention, registration, and asset version. |
| `shared/world.js` | Add optional scene sky metadata and call the extracted wind sampler without changing weather behavior. |
| `shared/wind.js` | Add shared wind coefficients, sampler, and displacement integral. |
| `shared/sky.js` | Add deterministic cloud state and extracted celestial math. |
| `public/sky-renderer.js` | Add celestial texture drawing, sky material/compositing helpers, and resource ownership. |
| `public/painting.js` | Integrate layered rendering, remove overlay celestial drawing, share scene transforms, and handle fallback/lifecycle. |
| `public/app.js` | Make only any required renderer-lifecycle integration changes; preserve its supplied clock and pause contracts. |
| `public/dev/sky-study.html` | Add the local developer preview page. |
| `public/dev/sky-study.js` | Add fixtures, layer inspection, and numeric rendering assertions. |
| `test/sky.test.js` | Add pure-state and wind behavior tests. |
| `package.json` | Include new JavaScript modules in `npm run check`; the existing test glob includes the new Node tests. |
| `README.md` | Document dynamic sky behavior, fallback behavior, preview URL, and remaining approximation limits. |

The visible canvas stack in `public/index.html` can stay as it is. Add production preloads only after measuring asset loading and deciding which resources actually improve startup. The static server already serves JavaScript and PNG files from the proposed locations.

## 13. Implementation sequence and completion gates

### Stage 1 — Establish the reproducible defect and test fixtures

Capture a fixed night frame showing the current moon-over-cloud issue. Add the isolated preview structure and fixtures that can drive a synthetic moon, cloud, and foreground sample. Record baseline rendering performance.

Completion gate: a developer can reproduce a known celestial position and cloud crossing without waiting for live time or modifying persisted state.

### Stage 2 — Prepare and register the assets

Produce the asset set, validate shared coverage, inspect edge composites, and record provenance. Add the scene manifest only once the exported dimensions and atlas bounds are known.

Completion gate: stationary compositions pass the black/white/magenta edge checks and day/night blend inspection, with no original clouds left in exposed sky.

### Stage 3 — Implement stationary compositing and correct occlusion

Integrate the new foreground and clear sky textures. Move celestial drawing off `#life`. Add two cloud samples with fixed phases and explicit alpha composition. Implement coherent fallback switching and resource ownership along with the new path.

Completion gate: synthetic pixel tests establish correct cloud and landscape occlusion, and a real-art night image visibly fixes the reported moon defect.

### Stage 4 — Add deterministic motion and weather

Extract the wind model, add its integral, implement bounded cloud phases and subtle deformation, then connect cover, rain, and palette inputs. Verify phase wrapping and the minimum-to-maximum coverage range.

Completion gate: two sessions given the same time produce matching state; direct time jumps match continuous sampling; clouds cross the moon smoothly without wrap seams or moving screen-space brush texture.

### Stage 5 — Integrate display modes and reflected light

Add reduced-motion change handling, verify pause and study behavior, and implement the bounded ambient lake adjustment. Exercise hidden-tab return, stale snapshots, missing assets, no WebGL, and context restoration.

Completion gate: every row in the display-mode table behaves as specified and all failure paths produce a coherent picture.

### Stage 6 — Validate and tune

Run the existing project checks plus the new tests, exercise the browser preview assertions, inspect the visual matrix, and measure performance. Tune artistic values against fixed fixtures, then document the chosen parameters and remaining limitations.

Commands for the implementation stage:

```sh
npm run check
npm test
```

Start the preview server against a separate temporary database when exercising integration behavior. For example, from the project root:

```sh
A_VIEW_DB="$(mktemp -d)/world.sqlite" PORT=4174 npm start
```

Open `http://127.0.0.1:4174/dev/sky-study.html` after the harness exists. Save screenshot evidence with fixture metadata so later rendering changes can reproduce the comparisons.

## 14. Definition of done

- Moving clouds preserve the scene's painterly character and have no stationary duplicates beneath them.
- The moon disk, stars, and moon glow are behind both cloud layers and all opaque landscape coverage.
- Thin and dense clouds produce spatially correct partial and complete concealment.
- Hills, fine branches, and leaf gaps remain clean through day/night blends, resize, and panning.
- Motion uses shared elapsed real time, is continuous through wind changes and wrapping, and is independent of render frame rate.
- Pause, reduced motion, studies, and connection recovery obey the documented display contracts.
- Broad weather changes affect cloud coverage, palette, and restrained lake illumination consistently.
- Fallbacks never reintroduce a procedural moon on top of baked clouds.
- Node checks, browser composition assertions, visual inspection, and measured performance meet their completion gates.
- Artwork provenance, scene parameters, verification results, and approximation limits are documented.
