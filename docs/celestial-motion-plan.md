Make the sun and moon travel continuously through a fixed view of the sky, emerging from behind the landscape and disappearing through natural occlusion or outside the frame. Their positions should follow the shared world clock, with seasonal solar paths and a lunar cycle that also produces daytime moons.

Implemented as celestial model version 1; see [validation and recordings](celestial-validation/README.md). The framing is a real window onto the sky, calibrated to face east with a 100° horizontal field of view. It does not guarantee that an entire rise-to-set journey fits inside the painting. The numbered design below records the implementation rationale.

1. Fix the underlying causes.

   `shared/sky.js:31` currently gives the moon a small screen-space oval and a hard `elevation >= .15` visibility switch. This elevation is an arbitrary cosine, not the angle above the landscape. `public/sky-renderer.js:185` also puts the entire moon inside a nighttime gate. No moving sun disk is rendered. Stars wrap horizontally using the hour of day, which resets at midnight. Replace these behaviors with continuously sampled sky directions and geometric visibility.

2. Keep the world's time and location explicit.

   Retain Stillwater's fictional latitude of 49° north and its existing rate of 365 world days per 30 real days. One world day takes approximately 118.36 real minutes; one world hour takes 4.93 real minutes. Sample celestial state from the displayed `calendar.total`, so all visitors at the same world time agree and a reload requires no frame replay. Clouds and animal animation retain their existing time domains.

   Use an Earth-like orbital approximation calibrated to the fictional 365-day year. Set fixed initial lunar phase and orbital orientation in versioned configuration. This is a physically coherent fictional sky, not a prediction for today's Earth date. Do not feed the synthetic calendar directly into an Earth ephemeris without defining that mapping: Earth's year length and leap dates would otherwise drift against the world's seasons.

3. Separate astronomy from projection.

   Add a pure celestial sampler that returns sun and moon direction vectors, altitude, azimuth, angular size, lunar illumination, and the orientation of the bright limb. Give every angle an explicit convention; use radians internally and clockwise-from-north azimuth at the public boundary. Keep geometric altitude distinct from any apparent altitude corrected for atmospheric refraction.

   Build the sun path from latitude, continuous seasonal declination, and solar hour angle. Extend the existing seasonal model instead of drawing another independent screen-space arc. Evaluate the visual path continuously across day and year boundaries. Preserve the existing calendar's illumination and scheduling outputs in the first release; extract shared solar math with an explicit legacy sampling mode if needed. A later change to persisted daylight forcing must be versioned and tested as a simulation-rule change.

   For the moon, combine its orbit with the same observer rotation used by the sun. Model orbital inclination and distinguish the roughly 27.3-day orbit relative to the stars from the roughly 29.5-day phase cycle. Derive illumination and the bright limb from the sun–moon geometry, including their projected orientation. The orbit must continue across midnight and phase wrap; it must not reset to a repeated nightly arc. NASA documents the orbital inclination and the distinction between these periods in its [lunar orbit reference](https://eclipse.gsfc.nasa.gov/help/moonorbit.html).

   A separate projector converts direction vectors into coordinates in the full painting using an authored camera bearing, pitch, field of view, and horizon alignment. Apply the existing viewport crop and pan afterward. Mobile screens show a smaller part of the same world. Never clamp an offscreen object to an image edge or alter its trajectory to follow the viewport.

4. Make rising and setting visible events.

   Render the sun and moon behind the existing clouds and foreground coverage. A rising disk first reveals its upper edge above the ridge, then progressively clears it. Setting reverses that process. Trees and moving foliage hide the appropriate portions of each disk and halo. The painted hill skyline is an occluder above the astronomical horizon; it is not itself the zero-altitude line.

   Remove arbitrary altitude and night/day visibility gates. Use smooth atmospheric attenuation for low-altitude objects and continuous contrast against the sky. Cull only after the entire drawable extent, including its halo, is outside the view or fully hidden. A smooth fade alone must not substitute for the disk physically crossing the ridge. Refraction can modestly adjust near-horizon apparent positions, but it must be applied consistently; [NOAA's calculation notes](https://gml.noaa.gov/grad/solcalc/calcdetails.html) describe why apparent and geometric solar positions differ.

   Draw a restrained sun disk with warm low-altitude color and a soft halo. Draw a pale moon during daylight when its geometry and contrast permit. The phase boundary rotates correctly through the sky, and stars must not show through the unlit part of the lunar disk. Begin with similar angular sizes for sun and moon, approximately half a degree, then review readability at the painting's resolution. Any artistic size multiplier must be an explicit constant, not a horizon-dependent enlargement. [NASA's angular-size reference](https://chandra.si.edu/photo/scale.html) gives that approximate apparent diameter.

5. Use the same sky geometry for the surrounding scene.

   Place the seeded stars on a celestial sphere and project their rotation through the same camera. Fade their visibility continuously through twilight; do not wrap individual stars across the painting or reset them at midnight. A small synthetic star field is sufficient for this release.

   Add subtle sky warmth in the sun's direction, including when the disk is just outside the frame, while retaining the established ambient day/night blend. Keep the existing landscape and cloud occlusion order. The painted landscape has limited relighting information, so moving terrain shadows, directional lake reflections, planets, and eclipse effects are later work. The new celestial interface should accommodate additional bodies without requiring them now.

6. Preserve display controls and performance.

   Local pause freezes the whole displayed sky. Resume and reconnection sample the current shared time directly; that deliberate time jump is distinct from an object popping during normal playback. Light studies sample celestial geometry at their selected world date and hour. Reduced motion holds celestial geometry and lunar phase, alongside the held cloud geometry, while environmental illumination may continue changing. Returning to normal motion rejoins the shared clock.

   Keep the current cached celestial texture approach initially. Include the sun, both star coordinates, lunar orientation, phase, opacity, and drawable size in the raster cache key. Quantization must remain below a visible subpixel displacement. Measure redraw/upload frequency during a moving sky; the existing stationary-moon fixture does not establish the cost of the new motion. Optimize texture regions or move disks to shader rendering only if measurements justify it.

7. Build a reviewable motion study before production integration.

   Extend the existing sky study with a world-date/hour scrubber, calendar playback, lunar-cycle playback, seasonal presets, and camera calibration controls. Its current playback advances cloud motion while holding calendar hour fixed, so it cannot validate rising and setting yet. Add optional horizon, cardinal-direction, and trajectory guides and a readout explaining whether a body is below the horizon, behind terrain, behind the camera, or outside the crop.

   Review an equinox and both solstices, plus new, quarter, and full moons. A full moon should broadly rise near sunset and set near sunrise; a first-quarter moon is an afternoon/evening object, and a last-quarter moon is a late-night/morning object. These are approximate patterns rather than exact daily schedules, as described in [NASA's phase guide](https://science.nasa.gov/moon/moon-phases/).

8. Validate continuity, occlusion, and shared state.

   Numeric checks should cover matching state across visitors and reloads; tiny time steps across midnight, year wrap, lunar phase wrap, and azimuth wrap; bounded output over long time jumps; seasonal sun height; lunar phase/position relationships; and known camera projections. Replace the test that currently requires the old moon oval with behavioral tests for the new model.

   Use production-renderer sequences to check gradual disk emergence above the actual ridge, setting, partial tree occlusion, thin/dense clouds, daytime moon contrast, and complete disk/halo departure at every frame boundary. Inspect desktop and portrait crops at both pan extremes. Test local pause, reduced motion, private studies, context loss/restoration, and fallback. Record a time-lapse for trajectory review and a real-speed interval for motion smoothness and upload cost. Existing world, bird, cottage, and surface-weather tests must still pass because their calendar rules are retained.

The implementation order is: pure sky model and projection; calendar-playback study and camera calibration; sun/moon rendering and natural occlusion; coherent stars and directional sky color; production integration and regression validation. The first review milestone is a scrub-able sunrise and moonrise over the actual painting.

| Area | Planned changes |
| --- | --- |
| `shared/celestial.js` (new) | Deterministic sun, moon, and star directions; phase and angular-size outputs |
| `shared/celestial-projection.js` (new) | Direction-to-painting projection, camera conventions, view clipping |
| `shared/world.js` and scene configuration | Observer/camera/model configuration; preserve current shared clock and simulation calendar behavior |
| `shared/sky.js` | Replace the oval and star wrapping; add directional visual lighting |
| `public/sky-renderer.js` | Sun disk, continuously visible moon, rotated phase shading, full-extent clipping, cache updates |
| `public/painting.js` | Celestial inputs, crop/pan integration, pause/study/reduced-motion handling |
| `public/dev/sky-study.html` and `.js` | Calendar playback, seasonal/lunar fixtures, camera and trajectory diagnostics |
| `test/sky.test.js`, new celestial tests, sky browser/display checks | Geometry, continuity, actual motion sequences, controls, occlusion, performance |

Completion means an observer can watch a disk progressively emerge from behind the landscape, move along a continuous seasonal or lunar path, and leave through the landscape or the frame without an arbitrary visibility switch. Geometry must agree at the same world time on every device, while the artwork keeps its quiet painted appearance.
