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
