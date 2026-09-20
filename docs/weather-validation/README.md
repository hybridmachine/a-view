# Weather traces validation

Validated locally September 19–20, 2026, using Node 26.7.0 and Chrome 153 on Apple M1/ANGLE Metal. The server used a disposable SQLite database on port 4174. No production world or deployment was changed.

- `npm run check`: passed.
- `npm test`: 52 tests passed, including canonical/partial tick equivalence, wet/dry behavior, bounded catch-up, migration preservation, and private-study isolation.
- `check-weather-browser.mjs`: 16 checks passed; see [results](browser-results.json).
- Existing sky shader/lifecycle checks: passed; see [results](sky-browser-results.json).
- Existing foliage checks: 40 passed; see [results](foliage-browser-results.json).
- Existing visitor display suite: all 12 checks passed, including pause, five light studies, return to live, action/lease boundaries, and tab suspension.

The wet/dry pixel comparison changed 13,808 pixels inside the authored surface rectangles and zero outside. The fixed-input weather pass uses two 512 × 512 RGBA textures (2 MiB). At the 800 × 844 test viewport, the synchronized draw measurement had a 0.7 ms median and 1.3 ms p95 with weather enabled; the baseline was 0.2 ms and 0.5 ms. These are local draw measurements, not physical-phone performance claims. Thirty real days of environmental catch-up took approximately 90 ms in the unit-test run.

The browser suite covers five illumination blends, desktop/portrait framing, private studies, pause, reduced-motion clock holding, context restoration, missing/corrupt assets, late completion after disposal, and unread-note behavior. The existing foliage suite additionally checks optional-layer loading, failures, and dynamic-sky preservation.

## Visual evidence

- [Authored selections](selections.png)
- [After rain](after-rain.png)
- [Portrait view](view-390.png)

The wet source contributes only low-frequency color, preserving canonical stone/earth brush detail. Visual inspection moved the shore-stone mask off adjacent grass. The path puddle remains small and subdued. Residual drops have short bounded falls and intentionally omit impact rings on vegetation.

## Limits and decisions

This first release uses one path patch, one exposed stone face, one puddle, and two drip origins. The model stores normalized artistic moisture, with no physical water conservation claim. Migration introduces dry surfaces at upgrade time; earlier weather is not invented. Catch-up is capped at 300,000 ticks per call (about 35 real days), committing progress and withholding a current snapshot with HTTP 503 until caught up.

The full source painting and existing foliage bases remain intact. Wet art is optional and adds no runtime package dependency. Missing environmental state or unsupported rules omit surface effects; private studies use their own fixtures. Automatic announcements remain unchanged during gradual drying.

Safari, Firefox, and physical mobile-device verification remain for human/device review. Mist, lake accumulation, and reflected cloud geometry are deferred as specified in the plan.

## Review follow-up

The catch-up response regression is now covered by an isolated HTTP test with a world one real year behind: both JSON and SSE return retryable HTTP 503 until advancement completes, then JSON returns a current snapshot. Optional ANGLE Metal flags are selected only with `SKY_GPU=metal`. Every browser test page reports uncaught errors. GPU error polling occurs on the first weather frame or explicit diagnostics rather than every frame. The 52-test suite and all 16 focused browser checks pass after these fixes.
