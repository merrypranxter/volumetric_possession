# VOLUMETRIC POSSESSION

A touch-first, mobile-aware mathematical volumetric art studio.

## Phase 01 — Living Volume
**Current source:** `build/phase-01-living-volume` (not yet deployed). A pure static, no-build WebGL2 app with:
- Persistent 28×28×28 three-channel pigment density with four deterministic genesis structures: cathedral, gyroid, trefoil knot, and helix braid.
- **Phase 01C GPU fast path:** WebGL2 ping-pong 3D texture-layer advection (28 slice draws per fixed step), with CPU semi-Lagrangian fallback if GPU layer framebuffers or shaders cannot initialize.
- Three selectable divergence-free baseline fields (localized vortex, ABC/Beltrami-type, paired countercurrent), plus independently controlled divergence-free analytic microturbulence and localized touch impulses.
- WebGL2 3D texture and ray marching through the volume.
- Stir, Inject and Orbit modes; pointer cancellation rollback; bounded checkpoint Undo/Redo (GPU copies remain on GPU); explicit reseed confirmation.
- Phase 01D: Fast/Euler or Curved/Midpoint characteristic backtracing, selectable without replacing pigment. The midpoint option evaluates velocity twice per sample (extra CPU/GPU cost); neither mode guarantees mass conservation.
- Multi-tap directional volumetric light attenuation (1, 2, or 4 density probes per active ray sample for Mobile / Balanced / Detailed), three light directions, emission and optical density. Real device rendering and speed still require QA.
- Eight **starter** palettes, independent optical density/emission, mobile render quality, single-frame PNG.

## Run locally
```sh
git clone https://github.com/merrypranxter/volumetric_possession.git
cd volumetric_possession
git switch build/phase-01-living-volume
python3 -m http.server 8080
```
Open http://localhost:8080 in a WebGL2 browser. (Do not open index.html as a file: ES modules require HTTP.) No dependencies or paid API.

## Automated checks
The GPU contract uses a mocked WebGL API, verifying layer draw counts, checkpoint copying and state transitions. It does **not** verify shader compilation or actual pixels.
```sh
node --test
```

See [architecture and QA notes](docs/ARCHITECTURE.md). Browser shader compile and real iPhone device performance **remain unverified**; do not treat this branch as a production deployment.

## Deferred
GPU velocity projection, evolving gyroid/trefoil topology (current versions seed their initial densities), coupling/equation mutation, true multi-scattering, full artist palette vault, exact loop animation and real GIF/MP4 encoding. Please do not relabel a WebM as MP4 or claim a seamless state loop until proven.
