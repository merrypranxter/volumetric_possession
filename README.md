# VOLUMETRIC POSSESSION

A touch-first, mobile-aware mathematical volumetric art studio.

## Phase 01 — Living Volume
**Current source:** `build/phase-01-living-volume` (not yet deployed). A pure static, no-build WebGL2 app with:
- Persistent 28×28×28 three-channel pigment density; deterministic seeded torus/plume/ribbon.
- CPU semi-Lagrangian dye advection (fixed 15 Hz), three analytic localized divergence-free vortices, temporary touch impulses.
- WebGL2 3D texture and ray marching through the volume.
- Stir, Inject and Orbit modes; pointer cancellation rollback; bounded checkpoint Undo/Redo; explicit reseed confirmation.
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
```sh
node --test
```

See [architecture and QA notes](docs/ARCHITECTURE.md). Browser shader compile and real iPhone device performance **remain unverified**; do not treat this branch as a production deployment.

## Deferred
GPU velocity projection, gyroid/trefoil morphologies, coupling/equation mutation, true multi-scattering, full artist palette vault, exact loop animation and real GIF/MP4 encoding. Please do not relabel a WebM as MP4 or claim a seamless state loop until proven.
