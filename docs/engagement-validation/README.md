# Combined engagement review

Recorded September 20, 2026, against an isolated archive of `d92a275` (weather and cottage features before the bird change). All state and servers were disposable; production data and deployment were untouched.

The [full-day results](results.json) sample 711 checkpoints at ten-real-second intervals over one world day (about 1 hour 58 minutes). That interval includes nine nest deliveries, five casement changes, four hearth changes, and four room-light changes. Representative captures cover [afternoon](afternoon.png), [rainy dusk](dusk.png), [after rain](after-rain.png), and [default portrait framing](portrait.png).

A background browser remained open for 7,246,643 ms, covering a world day, with 129 observations and no reported page exceptions. The largest observation gap was 1,004,625 ms (about 16.7 minutes), so this is elapsed-run/recovery evidence, **not uninterrupted real-time viewing**. The gap does not establish whether every intervening frame rendered. The deterministic samples and short real-speed recordings supplement that limited coverage; a continuous human viewing review remains outstanding.

`ENGAGEMENT_RECORD=1` separately recorded twelve-second production-renderer excerpts of afternoon, rainy dusk, and after-rain conditions; [recording results](recording-results.json). The regenerable local `combined.webm` is ignored by Git. Each excerpt uses committed two-second snapshot samples with `WorldClient` holding at action boundaries, while visible motion runs at real speed.

## Viewing decision

The selected frames preserve broad lake/sky rest areas. The wet path and small room lights remain local details; smoke and rain supply most transient movement. No baseline density changes were needed from these samples. The bird therefore retains a small silhouette, fixed composition, long rests, and no perching fidget loop. Its new activity stays below 1% of elapsed time in the seeded long simulation.

Portrait framing naturally crops out the nest and oak perch at the default pan. The roof remains in view; visitors can pan left to see the oak. Keep these world positions fixed rather than moving a subject into each visitor's crop.

## Reproduction

Use an isolated checkout/archive as `ENGAGEMENT_ROOT`, optional development-only Playwright, and a supported Chromium executable. `node scripts/check-engagement-browser.mjs` creates and stops its own temporary SQLite server, samples a full world day, and writes captures/results. `ENGAGEMENT_REALTIME=1` also leaves the visitor page running for one elapsed world day and records observation gaps. `ENGAGEMENT_RECORD=1` records the short excerpts with Playwright's optional FFmpeg component. `ENGAGEMENT_REPORT=recording-results.json` keeps a recording run separate from an existing long-run report. `BROWSER_EXECUTABLE` and opt-in `SKY_GPU=metal` match the other browser suites.

Safari, Firefox, physical mobile performance, and uninterrupted human viewing remain review work. This report does not establish production deployment readiness on those devices.
