# VOLUMETRIC POSSESSION

A touch-first, mobile-aware mathematical volumetric art studio.

## Phase 01 — Living Volume
**Live main branch:** a static, no-build WebGL2 app (hosted at https://volumetricart.netlify.app/). It includes:
- Persistent 28×28×28 three-channel pigment density with four deterministic genesis structures: cathedral, gyroid, trefoil knot, and helix braid.
- **Phase 01C GPU fast path:** WebGL2 ping-pong 3D texture-layer advection (28 slice draws per fixed step), with CPU semi-Lagrangian fallback if GPU layer framebuffers or shaders cannot initialize.
- Three selectable divergence-free baseline fields (localized vortex, ABC/Beltrami-type, paired countercurrent), plus independently controlled divergence-free analytic microturbulence and localized touch impulses.
- WebGL2 3D texture and ray marching through the volume.
- Stir, Inject and Orbit modes; pointer cancellation rollback; bounded checkpoint Undo/Redo (GPU copies remain on GPU); explicit reseed confirmation.
- Phase 01D: Fast/Euler or Curved/Midpoint characteristic backtracing, selectable without replacing pigment. The midpoint option evaluates velocity twice per sample (extra CPU/GPU cost); neither mode guarantees mass conservation.
- **Phase 01E — Material Memory:** the formerly unused 3D texture alpha channel now stores a persistent, advected `fold-memory` scalar. Pigment-interface contrast writes into the memory; it decays at an artist-adjustable rate, changes local transport speed through Fold Grip, and accentuates filament illumination. The diagnostic Fold-Memory Map displays stored history independently of pigment color. Includes matching CPU/GPU paths and undoable fold-parameter changes.
- Multi-tap directional volumetric light attenuation (1, 2, or 4 density probes per active ray sample for Mobile / Balanced / Detailed), three light directions, emission and optical density. Real device rendering and speed still require QA.
- Eight **starter** palettes, independent optical density/emission, mobile render quality, single-frame PNG.
- **Phase 01G — Filament Forge:** three distinct mathematical 3D source geometries continuously feed RGB density into the existing advected volume: Triple Helix Nerves, Orbital Rosettes, and Gyroid Sutures, plus Off. Strength, thickness, and source motion are live controls and are preserved by Undo/Redo. Defaults to Orbital Rosettes. Source is actual material accumulation, not a separate visual overlay.
- **Phase 01H — Fiber Nerves:** a *second persistent 28³ 3D RGBA8 volume* tracks an advected 3D filament tangent and coherence. The tangent bends under the local velocity gradient (finite-difference director transport); accumulated coherence can guide subsequent RGB advection along strands. Lighting reacts to strand direction, and a diagnostic Fiber Alignment Map displays the stored state independently. Formation, Persistence, Bending, Guidance, Lighting, and an evolution On/Off switch are exposed. GPU doubles 3D slice draws per active time-step (56 rather than 28). Switch evolution Off if performance suffers.
- **Phase 01L — Living Braid:** real time-dependent **3D force geometry**, not a shader-only oscillation. Select Writhe (advected-looking spatial traveling wave), Grow/Retract (reversible arc-length tip extension), Unbraid/Rebraid (two paired curves approach and re-open), or Tail Exchange (two curves meet and morph their distal portions across one another). Still disables motion. Cycle Speed and Shape Excursion are Undo/Redo checkpointed. Braiding a still curve starts Unbraid/Rebraid automatically. **Bake Current Shape** commits the current evolving 3D path into editable permanent control points and disables motion without deleting existing RGB/fiber history. CPU and GPU evaluate the exact same time-dependent geometry once per fixed 15 Hz simulation step and feed it to existing 2×8 control-point velocity logic. No new GPU texture, shader uniform or 3D pass.
- **Phase 01K — Topology Gremlin:** direct **3D deformation handles** on selected curve control points, plus Split at Handle and Braid into Two Strands. The braid constructs an opposed pair around a transported normal/binormal frame, with controllable turns/spread and total source strength shared between both strands. Split preserves the exact junction and produces independently editable paths. Every topology operation is checkpointed, can be Undone/Redone, and leaves existing RGB/fiber history untouched until subsequent evolution. Existing two curves × eight points / WebGL2 uniform budget remains unchanged. Use Draw Flow, select a glowing point, then bend, split, or braid.
- **Phase 01J — Curve Witch:** draw an actual persistent 3D **curve-shaped velocity field** with a finger. Stream transports along the path tangent, Coil rotates around it, Gather pulls toward it. At most 2 editable curves × 8 resampled control points keep CPU/WebGL2 cost bounded; each path adds a nearest-segment analytic force to the existing pigment and fiber equations. Curve overlays follow camera projection and vanish in Art Only. Tap/drag existing curves to move them, adjust type/strength/width, Remove/Clear, Undo/Redo and reset. The curves are placed on the selected Touch Depth plane; multiple camera orientations can generate different 3D placement planes.
- **Phase 01I — Flow Necromancer:** touch-place and drag up to six persistent 3D **flow anchors**. Whirlpool twists, Implode pulls, Repel pushes; a soft time-varying pulse modulates each mathematically localized force. These change actual advected RGB pigment **and** fiber-memory transport. Summon Triad, Remove Selected and Clear All; force types, strengths and radii; on-screen 3D-aligned handles; Undo/Redo for every structural change. New Design/Restart clears anchors. Neither one alters existing pigment immediately; changes affect future motion.
- **Phase 01F — Immersive Atmosphere:** default viewport-sized artwork, no framed square, true aspect-preserving 3D camera **cover** projection, closer camera, softened volume edges, collapsible touch-control dock, pinch/+/- zoom, Fill View, one-tap Art Only with restore button.
- Higher-contrast wisp edge lighting derived from the existing advected RGB dye field, and 3D depth-phase prismatic palette exchange. Both are adjustable/optional optical effects, not new fluid equations. Fine turbulence starts at 0.6 to introduce internal motion.

## Run locally
```sh
git clone https://github.com/merrypranxter/volumetric_possession.git
cd volumetric_possession
python3 -m http.server 8080
```
Open http://localhost:8080 in a WebGL2 browser. (Do not open index.html as a file: ES modules require HTTP.) No dependencies or paid API.

## Automated checks
The GPU contract uses a mocked WebGL API, verifying layer draw counts, checkpoint copying and state transitions. It does **not** verify shader compilation or actual pixels.
```sh
node --test
```

See [architecture and QA notes](docs/ARCHITECTURE.md). The static site is deployed from main; **the new immersive changes require live Safari/WebGL2 verification after merge**. A deployed build is not proof of correct GPU rendering.

## Tested / not tested
- Verified by direct calculation: CPU memory stays empty when fold writing is disabled; with writing enabled it accumulates and modifies subsequent RGB transport when Fold Grip is nonzero. Determinism and CPU checkpoint restore passed.
- WebGL shader execution and real iPhone Safari visual output have **not** been verified; project still requires a real WebGL2 screen/pixel test. The interface-memory metric is NOT a physical deformation tensor, and feedback is a non-conservative artistic effect.
- GPU stores the scalar in 8-bit alpha. Very faint folds may quantize away on GPU. The full artist palette vault and animated capture remain outstanding.

## Deferred
GPU velocity projection, evolving gyroid/trefoil topology (current versions seed their initial densities), coupling/equation mutation, true multi-scattering, full artist palette vault, exact loop animation and real GIF/MP4 encoding. Please do not relabel a WebM as MP4 or claim a seamless state loop until proven.
