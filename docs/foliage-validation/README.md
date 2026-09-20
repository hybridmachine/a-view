# Foliage verification

Validated September 19, 2026 on `codex/foliage-wind`, against an isolated temporary SQLite database on port 4175. The saved world was not modified. The shipped selection is six grass patches and four oak leaf clusters, seed 941, foliage bundle version 1.

## Results

- `npm run check`: passed, including all new sampler, layout, renderer, preview, export, and browser-check modules.
- `npm test`: 45 passed. Coverage verifies deterministic poses, calm/maximum displacement, continuity at wraps and long elapsed times, shared gusts, fixed attachments, mesh bounds, and rejection of invalid metadata. Four export tests also cover matching alpha, both lighting plates, unchanged pixels, and partial coverage.
- Foliage browser checks: 40/40 passed, including eleven production-shader pixel assertions, motion confined to selected regions, pause/reduced-motion/resume, direct time jumps, reload, three context restorations, every missing asset, mismatched dimensions/alpha, invalid patch metadata, and a draw failure restoring the intact foreground in the same frame. Delayed-request cases verify independent sky rendering, successful or failed late loads, stale completion after disposal/reinitialization/context loss, and restoration with fresh foliage.
- Existing sky shader/browser suite: 17 pixel assertions and 26 lifecycle/display contracts passed with the additional foliage resources. See [sky regression results](sky-browser-results.json).
- Visitor display suite: 12/12 passed, including real pause/resume screenshots, all light studies, action/connection time limits, and returning after tab suspension. See [display results](display-results.json).
- No uncaught browser errors in the completed foliage or visitor runs. Machine-readable foliage results are in [browser-results.json](browser-results.json).

The renderer disables its attributes after drawing and during disposal, so the sky pass can immediately draw the intact fallback without a WebGL error. First-load failure details are recorded explicitly to help diagnose activation problems.

## PR review verification

Optional foliage requests no longer block sky initialization. The browser suite holds all four foliage requests open while checking that the intact dynamic sky is visible and its cloud state advances. Validated CPU assets are staged until a render can install the repaired base and foliage together; a generation guard rejects stale completions. Tests cover failure, disposal, reinitialization, and context loss during the wait.

The fallback redraw reuses the original sky options. With both cloud layers disabled, an injected foliage draw failure produces the same pixels as the following intact frame, preventing the one-frame cloud flash reported in review.

The suggested atlas V inversion is unnecessary: native image-top UVs match the unflipped texture upload, while the vertex shader inverts screen Y. Four asymmetric colored corner marks pass through the production shader in their expected positions. These checks would fail if the atlas V coordinate were inverted.

Export checks now run before writing assets and reject mismatched day/night alpha or incorrect day/night rest reconstruction, including outside selected patches. The regenerated runtime PNGs are unchanged.

## Visual inspection

Compared calm and gust frames at native size and enlarged around leaf tips, grass seed heads, root seams, and neighboring rocks. The first grass extraction retained some pale edges; the final matte includes those pale ochre blades while excluding blue-gray lake paint. Rest reconstruction has maximum premultiplied color error **0.4942 / 255** by day and **0.4902 / 255** by night, with full-frame mean error below **0.001 / 255** for both. Maximum alpha error is **0.4746 / 255**. The exporter fails if color or alpha error exceeds one channel value.

Inspected the two-subject pilot and full set in daylight, dawn, dusk, and night, plus 1920 × 1080 and 390 × 844 at both pan extremes. The existing sky suite also covers DPR 2 with the 1.6 rendering cap. Native scene coordinates and the same crop transform are used by the base and moving mesh passes.

Retained review frames:

- [Selected subjects](selections.png)
- [Full scene during a gust](foliage-gust.png)
- [Portrait with foreground grass](view-390-pan-0.png)

The full fixture matrix and day/night rest-foreground images are generated locally and ignored by Git. A twelve-second detail clip was also captured at 15 fps, with enlarged leaf and grass frames inspected across the gust. The preview provides live playback, calm/breeze/gust inputs, a pilot-only motion control, rest pose, and attachment guides; it uses the production renderer.

## Performance and assets

Measured on an Apple M1 using Chrome 153 / ANGLE Metal, 1440 × 900 at DPR 1. A ten-second preview run delivered 299 measured intervals, with **33.3 ms median / 33.4 ms p95**, consistent with the existing 30 fps cap. Same-run synchronous draw-submission timing was 0.10 ms median before and after foliage; p95 was 0.20 ms before and 0.10 ms after. These coarse browser timings do not establish a speed improvement or measure GPU execution cost.

| Resource | Budget / measurement |
| --- | --- |
| Moving subjects | 10 patches, 60 quads each, 3,600 submitted vertices total |
| Additional GPU textures | Two 512 × 512 RGBA atlases, 2 MiB total |
| Additional vertex storage | 86,400 bytes |
| Active GPU resource set | 9 textures, 4 shaders, 2 buffers, 2 programs |
| Static foliage uploads | 2 per initialization; no per-frame atlas or vertex-buffer uploads |
| Foliage bundle PNG transfer | 8,551,194 bytes (8.16 MiB), including both repaired bases |

Repaired foreground textures replace the two active intact foreground textures; they do not add two more GPU textures. The intact foreground images remain decoded on the CPU for immediate fallback (approximately 12 MiB). Startup downloads the intact sky bundle and optional foliage bundle concurrently, but only the sky bundle gates dynamic sky rendering. Browser decode caches and backbuffers add memory beyond these figures.

## Reproduce

Start the application with a temporary `A_VIEW_DB` and open `/dev/sky-study.html`. With optional Sharp and Playwright resolvable by Node:

```sh
node scripts/prepare-foliage-assets.mjs
npm run check
npm test
SKY_PREVIEW_URL=http://127.0.0.1:4175 node scripts/check-foliage-browser.mjs
SKY_PREVIEW_URL=http://127.0.0.1:4175 node scripts/check-sky-browser.mjs
SKY_PREVIEW_URL=http://127.0.0.1:4175 node scripts/check-sky-display.mjs
```

`BROWSER_EXECUTABLE` selects an existing Chromium installation. `SKY_GPU=metal` requests the Metal path on macOS. Use `NODE_PATH` if the optional development packages are outside the repository.

Physical phone performance and Safari/Firefox rendering remain unverified. Foliage is selectively animated painted geometry, with reconstructed hidden backgrounds and fixed major branches; it is not a full tree or grass physics simulation. Current selections avoid new crossings behind fixed objects, and the nest/supporting branch remain fixed.
