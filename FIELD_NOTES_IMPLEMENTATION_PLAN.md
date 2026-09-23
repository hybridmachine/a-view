# A View — field notes that remember visits

Status: implemented September 22, 2026, on `codex/field-notes`. The planned history contract, local memory, panel, and focused verification are complete. See [validation and representative captures](docs/field-notes-validation/README.md). The sections below retain the design rationale and acceptance contract. Safari/Firefox, physical devices, and human return-visit feedback remain coverage limits; production deployment is separate.

## First useful release

When a visitor returns and opens **Field notes**, a short “Since you were here” passage recalls a few supported changes in the shared world. Their previous visit is remembered on this browser. The painting opens as it does today, and the notes remain optional.

Example, only when both events occurred after the saved visit:

> The nest was finished. The bird returned to the same branch on three days.

Use one or two sentences, at most about 60 words. Favor a lasting change over a repeated routine. Keep the existing current observations and recent event list below the recap. Label past events and present observations distinctly, so a roof visit yesterday cannot imply the bird is on the roof now.

This addition makes the existing history easier to notice without increasing activity in the painting. It is a smaller next step than a visible resident, a nesting lifecycle, or another atmospheric rendering layer.

## What the current code provides

- `src/store.js` retains committed events in SQLite, including structured bird/cottage payloads and `noteVisible`. Its snapshots expose only the latest 20 visible notes.
- `public/app.js` renders those notes and tracks the unread sequence in memory. The first snapshot marks the current notes as seen; a reload forgets earlier reading progress. Following a place already uses local storage.
- The completed nest, first roof arrival, and three-day branch habit provide useful milestones. The bird habit payload retains its three supporting return IDs.
- Cottage lights create one ordinary visible note per qualifying world day. These can eventually displace older milestones from the latest-20 list.
- Current bird/nest descriptions use the displayed snapshot during pause, but the event list currently refreshes from incoming live snapshots. The new recap and timeline need a consistent display policy.
- Weather moisture is durable state, but there is no authored history of rain episodes suitable for retrospective prose. Sky motion is sampled continuously rather than recorded as narrative events.

The release therefore needs both browser memory and a small history query. Increasing the snapshot's event limit would leave long absences unreliable and enlarge every stream update.

## Visitor experience

| Situation | Intended behavior |
| --- | --- |
| First visit or cleared memory | Show current observations and recent notes. A quiet line explains that this browser will remember the visit; do not describe earlier events as changes since a nonexistent visit. |
| Returning visitor | Show the fixed recap for the interval between the previous live observation and the first valid live snapshot of this visit. |
| No selected changes | “No new field notes since your last visit.” This does not claim the world was inactive. |
| Long absence | Retrieve milestones across the complete supported interval, even if they have fallen outside the latest 20 notes. Keep the recap short. |
| Private light study | Identify the notes as shared-world history. Study conditions never become visit evidence or produce a recap about the fixture. |
| Local pause | Hold the recap, event list, and observations at their displayed history boundary. Newer live arrivals remain unread until displayed. |
| Disconnection or query failure | Retain the last valid content and quietly identify unavailable history. Do not substitute “no changes” for a failed lookup. |
| Storage unavailable | Keep the feature usable for this visit and explain once, inside the panel, that visits cannot be remembered on this browser. |

Reuse the existing dialog, typography, spacing, close behavior, and keyboard focus handling. The recap sits above the oak/cottage observations. The current sketch remains sufficient for this release. No automatic dialog opening, notification toast, count badge, or live announcement accompanies a return.

The existing unread dot represents unread selected field-note events. Hidden routine actions and a rewritten recap do not light it. Opening the panel acknowledges only the history successfully displayed, not newer incoming notes or a pending request.

## Memory and visit boundaries

Keep three concepts separate:

1. **Last live observation:** the latest accepted snapshot actually presented while the document was visible, live, and within its timing validity. This supplies the next visit's starting point; it does not claim the visitor noticed every detail.
2. **Current visit baseline:** a frozen copy of the prior observation, captured before saving this visit's progress. The recap must not disappear when a stream update arrives or the panel is reopened.
3. **Read progress:** the last note boundary successfully presented in the open panel. Visiting the painting alone does not read the notes.

Store a small versioned record per scene in local storage: history identity, observed cursor/server time, and read cursor. Retain this tab's visit baseline and recap end boundary in session storage so a reload preserves the current recap. Never store a growing local event history, complete world snapshots, or rendered HTML.

Proposed session rule: a new tab/navigation begins a visit; reloading preserves it. Returning to an existing tab after at least 30 elapsed real minutes away begins another visit, using the last live observation as its baseline. Short hides/reconnects remain the same visit. Use accepted server times for the interval and monotonic elapsed timing while running; the visitor's device date must not determine world history. This threshold is a usability default to review with the fixture pilot.

Write the first qualifying observation after freezing the baseline, then coalesce subsequent writes to at most once every ten real seconds and attempt a final write on page hide. Correctness must not depend on an unload event firing. Hidden streams, paused views, private studies, stale snapshots, and failed loads do not advance observation memory. A study-only session does not create a live visit.

Validate size, version, scene/history identity, cursor shape, and finite timestamps before use. Corrupt or incompatible memory starts a fresh baseline. Cross-tab updates can advance future-visit/read progress but cannot rewrite another tab's active recap; merge forward progress and ignore stale updates. Test competing writes and storage events. Provide a small “Forget visit memory” action in the notes footer that clears only this feature's local/session record and leaves Follow intact.

## A bounded, factual history contract

Add a read-only notes summary endpoint, provisionally `GET /api/notes`, backed by the existing event table. The browser supplies its scene, history identity, saved observation cursor, and the fixed end cursor from an accepted snapshot. The interval is **after the saved cursor, through the end cursor**, inclusive only at the end. Requests never create narrative events or persist visitor identity on the server.

Snapshots need a compact notes-history identity and visible-event head cursor. A cursor includes sequence and event ID; zero is the documented empty-history sentinel. Visible sequences may have gaps because hidden events share the table. Do not treat gaps as missing notes.

Persist a notes-history identity once per database in additive metadata, leaving version-4 simulation behavior unchanged. Pair it with the world/scene identity and epoch. Validate both boundary event anchors, ordering, and the supported scene. A replacement world, a cursor ahead of restored history, or a missing/mismatched anchor produces an explicit reset response; the client then establishes a fresh baseline. Backups preserve identity. Restoring the exact same committed prefix is valid; an incompatible prefix is not silently compared.

Return a bounded selection of typed facts with their supporting event IDs, sequences, and times, plus the validated interval and coverage status. Use a small fixed number of indexed queries for the supported types rather than loading all rows from a long absence. Add an event-type/visibility/sequence index if the query plan needs it. The existing 20-note list remains explicitly **Recent notes**, not the complete interval history.

Freeze the query's end at the displayed snapshot boundary. New events arriving during the request belong to later progress. Reject stale responses by request generation, history identity, and interval; cancel them when the baseline or display mode changes. Unsupported metadata during a mixed deployment falls back to existing recent notes without manufacturing a recap.

| Candidate fact | Required evidence | Wording limit |
| --- | --- | --- |
| Nest completed | The known final legacy delivery event, within the interval, interpreted by an explicit legacy adapter | “The nest was finished.” Completion state alone cannot establish when it happened. |
| Nest progressed | Committed material-delivery events within the interval, if completion is absent | Collapse repeated deliveries into one observation. |
| Branch habit established | `bird.habit-noticed` with valid three-day evidence | Describe the recorded milestone; it does not prove the habit continued throughout the absence. |
| First roof visit | `bird.roof-noticed` within the interval | Past tense: “The bird paused on the cottage roof.” |
| Cottage light | A visible completed `cottage.light` event with the main room and target-on payload | “The main-room light came on.” Do not infer somebody's identity or an evening unless its time supports that. |

Prioritize nest completion, established bird habit, first roof visit, nest progress, then the latest qualifying cottage light. Select at most two facts and order the resulting sentences by event time. Completion replaces individual nest deliveries. A quiet interval may yield no sentence beyond the empty-state line.

Use fixed, reviewed templates and typed validation. Legacy deliveries currently lack structured payloads: identify their known event type and stable delivery IDs, not substrings in prose. Unknown or malformed records never become asserted facts; distinguish unsupported/incomplete history from an interval verified to contain no supported changes. Weather narratives, continuous bird returns after the one-time milestone, and changing sky conditions need separate evidence before they can enter a recap.

## Delivery sequence

| Step | Work | Concrete completion artifact |
| --- | --- | --- |
| 1. Copy and panel pilot | Build local fixtures for first visit, nest completion, bird milestones, cottage-only, quiet return, and long absence in the actual notes dialog. | Desktop and portrait captures; agree the short copy and hierarchy before expanding implementation. |
| 2. History contract | Add metadata, snapshot cursors, indexed selection, typed facts, and legacy compatibility. | Semantic tests showing that a milestone survives more than 20 newer visible notes and that interval/restore boundaries are correct. |
| 3. Browser visit memory | Implement versioned memory, fixed visit baselines, reading progress, storage failure, and forgetting memory. | Reload, new visit, cross-tab, cleared storage, and delayed-response checks. |
| 4. Production integration | Connect the recap and existing timeline to displayed history, including pause, studies, reconnect, and the unread dot. | A two-visit browser demonstration against one disposable persistent world, with no change to simulation activity. |
| 5. Focused verification | Run relevant tests, inspect narrow layouts and keyboard use, record supported browsers and remaining gaps. | `docs/field-notes-validation/README.md` with results, captures, and the final copy examples. |

The first implementation task is the copy/panel pilot plus the interval fixtures. The complete useful release includes steps 1–5; local memory alone is insufficient for truthful long-absence recaps.

## Integration and acceptance

Keep fact selection/formatting in a small pure module and browser storage/session handling in a separate module. Integrate through `src/store.js`, `src/server.js`, `public/world-client.js`, `public/app.js`, `public/index.html`, and `public/style.css`. Extend `package.json` syntax coverage and document the feature in `README.md` and the engagement list.

Acceptance should establish:

- Identical world history and visitor boundaries produce identical facts and copy. Notes requests do not change event history or the simulation schedule.
- An event exactly at the saved start is excluded; an event exactly at the end is included. Equal timestamps, hidden-event sequence gaps, and repeated requests do not duplicate facts.
- Long absence, world replacement, compatible restart/backup, truncated restore, old snapshots, and malformed local/server data have explicit outcomes. A retry cannot silently acknowledge undisplayed history.
- The baseline survives a reload and panel reopen. Hidden/pause/study activity does not erase the next return's changes. A late response cannot overwrite another visit or a paused panel.
- The first visit is quiet; routine updates do not create unread signals or automatic announcements. Repeated cottage events stay sparse in the recap.
- All prose is inserted as text. Query parameters and result sizes are bounded. Month/year histories use indexed bounded selection; report query cost and payload size on the existing disposable long-history fixtures.
- Run `npm run check`, `npm test`, and focused field-note browser checks. Re-run visitor display/bird note checks affected by the integration; broader renderer suites are warranted only if those paths change.
- Inspect desktop and narrow portrait layouts, keyboard/focus behavior, reduced motion, and available Safari/Firefox coverage. Record unavailable physical-device review honestly rather than treating desktop results as device evidence.

## Later choices

After this release, **Keep this view** is the next recommended small addition: save the actual displayed painting with its world date and a clear live/study distinction. Wider ambience and quiet coincidences remain separate options. Morning mist, a visible cottage resident, seasonal artwork, and a researched nesting lifecycle each warrant their own art/evidence plan.

Accounts, cross-device memory, personal writing, generated prose, notifications, and a full searchable journal remain future choices. This release succeeds when a returning visitor can recognize one true change and comfortably close the notes to look at the painting.
