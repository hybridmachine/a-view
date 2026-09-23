# Field notes that remember visits

Validated September 22, 2026, with review fixes checked September 23, using Node 26.7.0 and Chromium 140 / ANGLE Metal on an Apple M1. All worlds were disposable. The implementation adds a short optional return recap to the existing panel, backed by committed history and browser-local observation/read cursors.

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 103 passed, including 17 field-note tests |
| [Field-note browser checks](browser-results.json) | 60 passed; no uncaught browser errors |
| [Existing visitor-display checks](display-results.json) | 12 passed |
| [Existing bird checks](bird-browser-results.json) | 18 passed, including quiet notes, pause, studies, and sound |

## Panel and copy

The fixture pilot covers first visit, additional nest material, completed nest, established bird habit, cottage-only history, no new selected changes, and long absence. Representative captures show the [first visit](first-visit.png), [long absence on desktop](long-absence.png), [390-pixel portrait](portrait.png), and [320-pixel portrait](narrow-portrait.png). Captures were inspected at their native sizes. The recap is a short serif passage above the existing current observations; historical and present-tense sections are visually distinct. The dialog scrolls vertically on small screens without horizontal overflow.

Browser checks verify that the panel never opens automatically, the recap matches the supported interval facts, and reading clears the dot only after a successful recap. Reloads preserve the recap. Keyboard opening, Escape, and focus return pass. The pilot uses reduced motion; the existing display suite separately checks moving live/pause behavior.

Two-tab checks verify that reading progress propagates while each tab retains its own frozen visit baseline. Closing a pending request leaves the notes unread. Failure/retry, storage denial, forgetting memory while retaining Follow, paused timeline consistency, and private-study observation suppression pass. Unit checks cover hidden/invalid frames, cross-tab write races, and a paused old-world tab attempting to overwrite replacement-world memory.

## History and state

Unit tests establish exclusive-start/inclusive-end boundaries, equal timestamps, hidden-event sequence gaps, deterministic copy, missing anchors, replaced databases, truncated history, malformed or unknown facts, invalid habit evidence, reloads, long absence, and coalesced writes. Notes queries leave world state and event counts unchanged. The existing persistence/catch-up suites still compare complete simulation states and histories; only the deliberately different per-database notes identity is normalized when comparing independently created worlds.

The history identity is stored in an additive `metadata` table; an additive `notes_by_type` index supports type/sequence range selection. Simulation schema version 4 and its scheduling remain unchanged. Restart retains notes identity, and normal SQLite backup preserves it. An invalid interval receives HTTP 400; an incompatible history anchor yields an explicit reset result. Unknown or malformed selected facts produce partial coverage instead of a false no-change claim. HTTP checks also verify no-store responses, HEAD behavior, and rejection of mutation methods.

The legacy final delivery is recognized by its known type and `delivery-12` ID, not by prose. The three-day bird claim validates the milestone payload and its three actual completed-return records, including matching each completion ID to the action ID in its payload. Current nest state alone is never used to infer when completion occurred.

Review fixes replace cross-world timestamp comparisons with explicit permission to replace this tab's previously displayed history identity. The permission is consumed after publication and cannot overwrite a third identity that superseded that predecessor. Regressions cover replacement clocks both ahead of and behind the old tab, continued old-history observation, joining the replacement, and a competing third history. Mismatched, empty, or missing action IDs in bird-habit proofs now yield partial coverage and omit the unsupported habit claim.

Reading is bounded by the history captured when the panel opens. A delayed recap cannot consume later notes, including on subsequent animation frames; reopening acknowledges the newer recent notes. Equal-time observations and cross-tab merges retain the greater event sequence, and stale equal-time snapshots cannot erase that progress. Reset and forget notices remain until a fresh live baseline is saved, then clear. Three regression tests reproduced these review findings before their fixes, and browser checks cover the request race and both notices. Syntax checks, the full 103-test suite, and 60 focused browser checks pass; the display/bird reports and performance measurements remain from the initial implementation.

## Query cost

[State measurements](history-results.json), 100 repeated summary reads per disposable history:

| Elapsed history | All events | Visible notes | Median query | p95 query | JSON response |
| --- | --- | --- | --- | --- | --- |
| 30 real days | 10,951 | 377 | 0.19 ms | 0.26 ms | 661 bytes |
| 365 real days | 132,101 | 4,453 | 1.68 ms | 3.60 ms | 663 bytes |

Both recaps select nest completion and the established bird habit, even though the latest 20 notes contain only cottage lights. Known fact types use a fixed number of indexed range seeks and at most three supporting-record lookups. Detecting unknown visible event types additionally scans the interval's visible-note index; query cost is not claimed to be constant with unlimited history. Returned facts and response size stay bounded. These are local in-memory SQLite measurements, not production latency guarantees.

## Reproduction and limits

Run a server against a disposable `A_VIEW_DB`, optionally with `PORT=4175`. Run `npm run check`, `npm test`, and `node scripts/check-field-notes-state.mjs`. With the existing optional development-only Playwright setup, run `node scripts/check-field-notes-browser.mjs`; use `SKY_PREVIEW_URL` for another preview address, `BROWSER_EXECUTABLE` for the Chromium executable, and `SKY_GPU=metal` on supported macOS systems. `NOTES_VALIDATION_DIR` selects an output directory. The browser suite uses the actual HTTP endpoint for protocol checks and a deterministic `WorldStore` behind intercepted snapshot/summary requests for its time fixtures; it never writes those fixtures to the preview server.

The existing visitor-display suite wrote its report here using `SKY_VALIDATION_DIR`. The bird suite ran with a temporary working directory, and its result JSON was copied here so earlier bird evidence stayed intact. The full screenshot matrix is regenerable; four representative captures are retained.

Safari/WebKit, Firefox, physical mobile devices, and human feedback over natural return visits were not covered. The 30-real-minute visit boundary remains an initial usability choice. This feature summarizes selected nest/bird/cottage facts; weather episodes, continued habits after the one-time milestone, private-study conditions, and imagined inhabitants are not retrospective evidence. There are no accounts, cross-device memory, notifications, or generated prose.
