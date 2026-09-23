# A View — quiet engagement

Status: brainstorm recorded September 19, 2026; updated September 22. Weather traces, cottage life, and the familiar bird are implemented and merged ([PR #5](https://github.com/hybridmachine/a-view/pull/5), [PR #6](https://github.com/hybridmachine/a-view/pull/6), and [PR #7](https://github.com/hybridmachine/a-view/pull/7)). Continuous celestial motion is also merged in [PR #8](https://github.com/hybridmachine/a-view/pull/8). Local “Since you were here” field notes are now implemented on `codex/field-notes`, with validation linked below. The reports retain the human-viewing and physical-device coverage limits; production deployment is separate.

## Creative direction

Make the place feel increasingly familiar, so small changes become meaningful. The moving sky, foliage, and nest already establish that the painting is alive. The next additions should give visitors something to recognize, wonder about, and remember.

The painting must remain satisfying during an uneventful visit. Preserve its open water, restrained palette, fixed composition, and stretches of stillness. Additions should belong to the place and its history. Visitor attention does not trigger or accelerate the shared world's events.

The desired feeling is: “Yesterday that chair was by the door. This evening it is facing the lake.” A small observation can carry a story.

## The brainstorm

1. **Let the cottage suggest a life inside.** A window opens on a warm afternoon. A chair appears near the door. One room lights up before the other. Eventually, someone occasionally walks down to the water. Begin with small signs of habitation and let visitors infer the story. Changes to visible objects must have a plausible action behind them; a chair cannot simply teleport between visits.

2. **Give weather an afterlife.** Rain leaves darker stones, a shallow puddle on the path, and drops falling from the oak after the sky clears. Morning mist slowly uncovers the far shore. These transitions make a visit feel like a particular moment, and let the painting carry evidence of earlier conditions.

3. **Make one animal become familiar.** Extend the existing bird's behavior with a preferred perch, a recognizable call, and a habit of pausing on the cottage roof. Recognition creates attachment before the scene needs a larger cast. A researched, complete nesting cycle can give that familiarity a longer story. The current nest-building study remains finite until that lifecycle exists.

4. **Let field notes remember visits.** An optional “Since you were here” passage could draw from committed changes: “The nest is finished. The bird still returns to the fork in the oak.” Keep the writing sparse and observational, perhaps alongside a small sketch. That example requires both facts to be supported by the world; prose must never invent behavior. Personal visit memory can remain local initially.

5. **Offer a way to keep a moment.** “Keep this view” could save a clean image with the place, world date, and an optional personal note. Visitors gradually collect light, weather, and memories. A saved view is a personal record of the shared world, not a means of changing it. Export should preserve the actual displayed state, including a clear distinction between live views and private studies.

6. **Use sound to suggest what lies beyond the frame.** A bird answers from across the lake, leaves rustle nearby, and an occasional door closes at the cottage. Leave generous silence. Sounds tied to a specific visible inhabitant or action should share that action's timing; general ambience may remain cosmetic. Preserve explicit sound opt-in.

7. **Include occasional, quiet coincidences.** A leaf touches the water and drifts away. A fish briefly disturbs a reflection. Evening light catches a window as the clouds part. Conditions should make these moments possible, and they should remain incidental enough that noticing one feels personal. Do not start a special event when a visitor arrives or build urgency around seeing it.

## First two picks — implemented

The first implementation sequence was weather traces, then cottage life. Both are now present in the checkout. These releases do not commit the project to implementing all seven ideas at once.

| Priority | Addition | First useful release | Why start here |
| --- | --- | --- | --- |
| 1 | Weather that leaves traces | Selectively damp path and stones, one shallow puddle, residual oak drips | Makes existing rain consequential and enriches the composition without adding a new character |
| 2 | Small signs of cottage life | Independently timed room lights, one opening window, smoke connected to hearth state | Establishes a recurring presence through small, readable changes in an existing focal point |

Detailed plans:

- [Weather traces implementation plan](WEATHER_TRACES_IMPLEMENTATION_PLAN.md)
- [Cottage life implementation plan](COTTAGE_LIFE_IMPLEMENTATION_PLAN.md)

Morning mist belongs to a later weather phase because it needs convincing depth and shoreline occlusion. A movable chair and visible resident belong to a later cottage phase because they need authored routes, handling actions, occlusion, and character art. The first releases should establish the systems and visual restraint those extensions depend on.

## Familiar bird and daily habits — implemented and merged

The existing bird now has a preferred oak perch, a sheltered resting location, and a quiet routine after nest construction finishes. It also includes occasional roof visits and a recognizable call driven by shared action timing. See the [combined viewing evidence](docs/engagement-validation/README.md) and [bird validation](docs/bird-validation/README.md). The oak art pilot established the routes and small visual footprint before they were connected to the routine.

The [familiar bird implementation plan](BIRD_FAMILIARITY_IMPLEMENTATION_PLAN.md) details the art pilot, routine, version-4 migration, legacy nest handover, shared timing, occlusion, display modes, field-note facts, audio, delivery milestones, and acceptance checks. It preserves the completed nest and defers eggs, breeding, aging, and a complete species lifecycle to a separate researched plan.

## Field notes that remember visits — implemented for review

The [field notes implementation plan](FIELD_NOTES_IMPLEMENTATION_PLAN.md) is implemented as a short, optional “Since you were here” passage in the existing notes panel. Browser-local visit memory supplies the interval; committed events supply the facts. A bounded history lookup preserves older milestones after they leave the latest-20 note list. Copy/layout fixtures, history selection, visit memory, display-mode integration, and focused checks are recorded in [field-notes validation](docs/field-notes-validation/README.md).

After field notes, “Keep this view” is the next recommended small addition. Wider ambience, quiet coincidences, mist, a visible resident, and a researched bird lifecycle remain separate options. This ordering is a planning recommendation, not a commitment to build every brainstorm item.

## Shared implementation principles

- **One world and one history.** Consequential changes originate in the server simulation and survive restarts and unobserved time. Browsers sample that history rather than creating their own versions.
- **Two time domains.** Daylight and routines follow the existing accelerated calendar. Drops, window movement, and eventual walking use elapsed real seconds. Document every rate's units.
- **Artwork first.** Establish one small production-renderer pilot for each feature. Expand only when its brushwork, edges, lighting, and movement belong to the original painting.
- **Small visible footprint.** Favor details around the path, oak, and cottage; retain broad areas of visual rest. Check the default portrait crop as well as the full landscape.
- **Quiet presentation.** Use the existing controls, scene description, and field notes. Routine simulation updates must not continually light the unread-note indicator or announce themselves.
- **Explicit limits.** Surface moisture is initially an artistic response model, not a watershed simulation. An implied resident is initially a small routine model, not a complete human lifecycle.
- **Graceful degradation.** Optional art bundles must fail independently without revealing repaired backgrounds, duplicate windows, or broken foliage. Keep the existing original-painting fallback.

## Sequence and review points

1. Build a wet-stone/path visual study with dry, rainy, and drying states. Choose its masks and restrained tonal range at normal viewing size.
2. Implement deterministic surface memory and snapshot integration; complete the puddle and drip treatment, migration, and validation.
3. Prepare one cottage window with independent light control. Review it at day, dusk, night, and intermediate blends before cutting more assets.
4. Add the cottage's durable routine and committed action timing. Expand to the second room, one opening casement, and state-driven smoke.
5. Review the two features together over a complete world day and several weather changes. Adjust density and timing before expanding engagement work.

Steps 1–4 are implemented. Step 5 has sampled full-day evidence, short real-speed recordings, and an elapsed full-day background run with documented observation gaps. The bird plan's oak pilot, persistent routine, roof habit, synchronized call, and automated release validation are implemented for review. Complete human viewing/device review before deployment.

Success is visible in the experience: two visits show believable continuity, a short visit can remain quiet, and a still frame retains the painting's original character. Validate this with paired captures, short real-speed recordings, deterministic state checks, and a small qualitative viewing review. Session length or interaction count alone would not establish that the artistic direction works.

## Boundaries of this planning pass

The companion plans specify proposed behavior, artwork, state contracts, integration, delivery milestones, and acceptance checks. They preserve the existing composition, shared-world history, and calendar rate, using the current JavaScript, WebGL, Canvas, SQLite, and snapshot architecture described in [README.md](README.md) and [DESIGN.md](DESIGN.md).
