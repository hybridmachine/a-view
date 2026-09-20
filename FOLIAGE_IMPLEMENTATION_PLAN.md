# Selective wind motion for foliage

Status: implemented on `codex/foliage-wind`, September 19, 2026. See `docs/foliage-validation/README.md` for evidence and remaining device validation. The initial release uses six grass patches, four leaf clusters, and a 512 × 512 atlas pair; the sections below retain the implementation design and tuning targets.

## Intended result

The Lakeside Cottage should show a light breeze moving through selected foreground grasses and small clusters of oak leaves. Grass bends from its roots; leaf clusters move from their twig attachments. A gust reaches nearby patches at slightly different times, with a slower bend, a gentle return, and restrained leaf flutter. Most of the composition stays still so the scene retains its quiet, painted character.

Use the existing JavaScript, WebGL, Canvas, and shared world clock. This is a visual extension with offline asset preparation, not a new server simulation. The first release keeps trunks, major branches, roots, rocks, path, cottage, nest support, and distant woodland fixed. Seasonal growth, falling leaves, branch physics, and moving foliage shadows are later work.

## What exists today

- `public/sky-renderer.js` applies a small horizontal texture displacement to broad canopy and grass regions selected by position and green color. It deliberately excludes partially transparent silhouettes. This produces interior paint movement but cannot bend leaf edges or individual grass tufts.
- The landscape is a registered day/night foreground pair with transparent sky and leaf gaps. The daytime geometry is canonical; the original night painting is not independently suitable for cutting matching foliage.
- `public/painting.js` already draws 24 thin animated reeds on the Canvas overlay. Their roots are fixed, but each uses an individual sine wave rather than a shared passing gust.
- `shared/wind.js` supplies deterministic wind strength and its analytic integral. `Painting.render()` supplies real elapsed motion time, including a held time for reduced motion. Local pause and connection limits already constrain the displayed clock.
- The sky compositor currently uses seven texture samplers in one program. A separate foliage pass can use its own atlas pair without adding samplers to that program.

The recommended change is to replace the broad foliage ripple with a small set of painted, deformable patches. Retain the existing water movement.

## 1. Choose a small set of moving subjects

Begin with **one foreground grass tuft and one terminal oak leaf cluster**, then expand to an initial target of **6–10 grass patches and 4–6 leaf clusters** if the pilot looks convincing. These are tuning targets, not a requirement to fill every region.

| Subject | Candidate location in the current painting | Motion |
| --- | --- | --- |
| Foreground grass | Tall tufts beside the lower-left rocks and along the lower path margins | Rooted bend with more travel toward the tips; neighboring tufts respond together with variation |
| Shore grass | A few existing tufts near the lower-right shoreline | Slightly more exposed to the breeze; coordinate with the Canvas reeds |
| Oak leaves | Small hanging clusters along the upper-center/right canopy fringe and terminal twigs | Slow cluster sway plus a much smaller flutter at the tips |

Choose small, visually separable subjects with recoverable backgrounds. Avoid the nest and its supporting branch, branch intersections, and regions where a moving patch would cross a fixed object. Inspect the complete movement envelope, not just the resting selection. Include patches that remain visible in the default portrait crop, as well as those revealed by panning.

Starting movement ranges at the native 1672 × 941 artwork size: roughly 1–3 pixels of leaf-tip travel and 2–5 pixels of grass-tip travel in a normal breeze, with occasional slightly larger grass bends. Tune at actual display sizes after the pilot; these values are artistic starting points. Keep quiet intervals and vary patch exposure so everything does not move at once.

## 2. Prepare registered foliage and background assets

Create a versioned bundle under `public/assets/lakeside-foliage-v1/` and retain editable sources under `artwork/lakeside-foliage-v1/`.

| Deliverable | Purpose |
| --- | --- |
| `base-day.png`, `base-night.png` | Full-size foreground pair with only the selected moving subjects removed and their backgrounds repaired |
| `foliage-day.png`, `foliage-night.png` | Padded RGBA atlases containing the extracted/reconstructed subjects, with identical geometry, atlas layout, and coverage alpha |
| Authoring masks and patch metadata | Stable IDs, scene bounds, atlas bounds, root/twig anchors, deformation weights, exposure, and draw order |
| Export metadata and inspection sheets | Dimensions, source provenance, alpha conventions, rest-pose and extreme-pose comparisons |

Use the existing registered daytime foreground as canonical geometry and derive corresponding night colors through the established illumination-transfer approach. Do not cut day and original night plates independently.

For each patch:

1. Extract or repaint the selected subject with clean coverage, preserving the brushwork and thin tips. Recover foreground edge colors so old sky or ground colors do not remain as fringes.
2. Remove the original subject from the base. Reconstruct what movement can expose throughout its maximum displacement envelope, including filtering margins. Leaf removal reveals sky only where sky belongs behind it; overlapping foliage and twigs must remain painted. Grass removal needs plausible ground or vegetation behind it.
3. Retain fixed attachment points and paint an overlap at the root/twig join to prevent cracks. Keep the overlap small enough to avoid a visible double image.
4. Give the patch a small subdivided mesh and a weight field: zero displacement at attachments, increasing movement toward free tips. Define atlas gutters and sample only within each patch's interior.
5. Verify the combined base and resting patches against the current registered foreground, then inspect maximum bend in both directions. Preserve the composition and lighting without stationary copies, holes, broad smears, or visible cutout seams.

Export straight-alpha PNGs and premultiply exactly once on GPU upload, consistent with the current renderer. Inspect partial edges over black, white, magenta, and the production sky, at day/night blend values 0, .25, .5, .75, and 1.

**Pilot checkpoint:** the one-tuft/one-cluster prototype must pass visual inspection at rest and in motion before preparing the remaining patches. Background repair and edge quality are the largest uncertainties. Simplify or replace a problematic selection rather than increasing blur or displacement to disguise it.

## 3. Define a shared, deterministic breeze

Add a pure `shared/foliage.js` sampler using the existing wind model. Keep `sampleWind()` and `integratedWind()` unchanged so weather and cloud travel preserve their existing behavior.

The sampler takes held/displayed real motion seconds, scene seed, and patch parameters. It returns bounded bend and flutter values that can be evaluated directly at any time without replaying frames.

- **Prevailing breeze:** use the existing wind strength and a predominantly rightward direction consistent with the current cloud travel. Give each patch an exposure and stiffness value.
- **Passing gusts:** layer smooth, deterministic gust envelopes over that strength. Evaluate one scene-wide field at each patch's position, with spatial delays so adjacent foliage shares a gust without moving in lockstep. Start with several-second gusts separated by calmer intervals.
- **Local response:** grass has a slower flexible bend; oak clusters have smaller sway and lighter, faster tip flutter. Use stable seeded differences in phase, stiffness, and exposure. The dominant motion remains correlated with the common breeze.
- **Return:** shape the response with a smooth rise, release, and small settling movement. Keep it bounded and avoid an obvious repeated pendulum rhythm.

All geometry-affecting values, including wind amplitude and gust strength, must use `motionSeconds`. Freezing phase while continuing to use live wind amplitude would still move foliage during reduced motion. Current calendar/weather may continue to affect color and illumination.

Compute long-running phases in JavaScript double precision and send bounded phases/poses to the shader. Do not accumulate frame deltas or pass ever-growing elapsed seconds into new GPU oscillators. Fixed time and seed must reproduce the same pose across reloads, frame rates, and tab suspension. Preview-only wind overrides should support calm, normal breeze, and a stronger gust without changing world state.

## 4. Render anchored painted patches

Add `public/foliage-renderer.js`, drawing into the same WebGL canvas immediately after the sky/landscape compositor and before the existing Canvas life effects.

1. The existing compositor draws the sky, celestial objects, clouds, and the repaired foreground base.
2. The foliage pass draws small meshes with day/night atlas samples blended at the same light value as the base. Apply the same cloud/rain darkening and dusk tint so cutouts do not appear brighter than surrounding paint.
3. Deform mesh positions using the sampled bend, local anchor, and stiffness weights. Keep UVs attached to the mesh so brush marks follow the foliage. Grass bends progressively along its height; leaf clusters rotate/bend slightly around their attachment with smaller tip deformation.
4. Use the exact same scene coordinates, crop, pan, and device-pixel-ratio handling as `Painting`. Displacement is specified in artwork units, not viewport pixels.
5. Blend premultiplied foliage with `ONE, ONE_MINUS_SRC_ALPHA`. Its moving alpha silhouette naturally conceals the already-rendered sky, clouds, moon, and stars, including changes in leaf gaps.

Choose first-release patches whose entire motion stays in front of their repaired background. If a required patch must pass behind a fixed branch or rock, split/clip the patch or add an explicit foreground occluder; drawing every patch last does not solve that depth relationship. Keep the nest area fixed so existing nest/bird overlay placement remains valid.

Remove the old canopy/grass color-selected ripple when introducing this feature. Update `drawReeds()` to use the common breeze response and remove any overlay reeds that visibly duplicate newly animated painted tufts. Preserve existing reed visibility behavior under reduced motion unless intentionally revisited.

Start with a few dozen vertices per patch and a small bounded set of draws. Aim for one atlas pair at 1024 × 1024 each (8 MiB of uncompressed RGBA total); increase only if native-resolution inspection requires it. The repaired base pair replaces the active foreground pair rather than adding another resident pair. Upload meshes and textures at initialization, then update only small pose/uniform inputs per frame.

## 5. Integrate configuration and lifecycle

Add optional versioned `foliage` configuration to the Lakeside Cottage entry in `shared/world.js`: asset paths, atlas dimensions, seed, and a patch list containing IDs, bounds, anchors, mesh/weights, motion type, exposure, maximum displacement, and order. Rendering details belong to the scene bundle, not durable world snapshots.

`Painting` owns foliage loading, activation, drawing, and disposal. Load and validate the complete candidate bundle before activating the repaired base. Check matching day/night alpha, dimensions, patch bounds/gutters, finite parameters, fixed anchors, and texture limits.

- **Normal operation:** publish the repaired base and moving patches together after a complete successful frame.
- **Foliage failure:** retain or restore the existing intact sky foreground pair and omit foliage animation, keeping the dynamic sky available. Never show a repaired base with missing patches.
- **Sky/WebGL failure:** preserve the existing complete day/night painting fallback.
- **Context restoration or repeated initialization:** reconstruct a complete compatible resource set, discard stale async generations, and dispose retired resources. Reveal only a complete frame.
- **Local pause:** all displayed motion and lighting remain frozen through the existing supplied clock.
- **Reduced motion:** hold the current foliage pose, including its wind amplitude, while illumination follows existing behavior. Re-enabling motion rejoins shared time.

Keep feature loading optional for scenes without foliage configuration. No database, server scheduling, or new runtime graphics dependency is required.

## 6. Validate the visual result and contracts

Extend the existing development study with foliage visibility, patch/anchor overlays, fixed time, a rest pose, and calm/breeze/gust fixtures. Use the production foliage renderer in the preview. Retain sky pixel checks and add focused foliage checks rather than building a separate approximation for testing.

| Validation | Acceptance |
| --- | --- |
| Rest and maximum poses | No stationary duplicates, missing background, gaps at anchors, clipped tips, edge halos, or branch/rock overlap errors |
| Motion over 30–60 seconds | Natural rooted bending, shared gust progression, restrained flutter, visible quiet periods; no whole-canopy wobble or sliding paint |
| Lighting and sky occlusion | Clean day/dawn/dusk/night blending; clouds and moon visible through moving leaf gaps and hidden by moving leaf coverage |
| Pure motion tests | Same time/seed gives same pose; zero wind produces the rest pose; bounds and fixed anchors hold; held time freezes the full pose; large time jumps remain finite and deterministic |
| Display/lifecycle tests | Pause/resume, reduced-motion changes, reload, suspension, connection time limits, missing/corrupt foliage assets, repeated init/dispose, and context loss/restoration |
| Framing | Existing landscape and portrait viewport matrix, both pan extremes, DPR 1 and 2 with the current render cap; anchors stay registered |
| Performance | Compare before/after frame intervals, draw submission, GPU resources, and asset bytes on the same setup; preserve the existing 30 fps target with no per-frame image uploads or resource growth |

Run `npm run check`, `npm test`, the existing browser/display suites, and the added foliage checks against an isolated temporary database. Update existing resource-count assertions to cover both the active foliage bundle and the intact sky fallback. Inspect moving clips as well as screenshots. Record physical-device and Safari/Firefox results when available; a portrait desktop viewport is not a mobile performance measurement.

## Delivery sequence

1. **Art and motion pilot:** prepare one grass patch and one leaf cluster, their repaired backgrounds, and a minimal production-renderer preview. Establish the visual treatment and displacement limits.
2. **Shared breeze and integration:** complete the deterministic sampler, scene metadata, anchored mesh rendering, illumination, timing, and atomic fallback behavior. Remove the superseded foliage ripple.
3. **Selective expansion:** add only the patches that improve the scene, coordinate the reeds, and tune quiet intervals and exposure at desktop and portrait sizes.
4. **Validation and documentation:** complete the focused checks, inspect captures, measure performance, and update `ARTWORK.md`, `README.md`, package check scripts, and a foliage validation report.

The pilot is the first concrete implementation milestone. Expand after it demonstrates that the painting itself appears to breathe gently in the wind while its structure and brushwork remain convincing.
