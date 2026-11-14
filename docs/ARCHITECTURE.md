# Phase 01 — Living Volume

## Verified scope to build
- Persistent 28³ pigment volume, three individually addressable dye channels, seeded 3D torus/plume/ribbon initial conditions.
- Semi-Lagrangian backward tracing at a fixed 15 Hz (trilinear CPU sampling); normalized 8-bit RGBA uploaded to a WebGL2 3D texture.
- Three time-dependent localized rotational fields: \(v=\omega(a\times(p-c))\exp(-\|p-c\|^2/s^2)\). For fixed a and c, each analytic field is divergence-free because \((a\times(p-c))\cdot(p-c)=0\); Wolfram symbolic divergence check returned 0 for the y-axis example.
- Temporary bounded touch impulses (not individually divergence-free); pigment painting; camera-only orbit.
- Ray/box intersection and front-to-back Beer–Lambert-inspired opacity integration, approximate 1-offset light shading, emission control.
- Explicit confirmation for replacing work; bounded snapshots for pigment-touch undo/redo.
- PNG still export. No GIF, MP4, pressure solve, or exact looping claim.

## Important honesty
Velocity evolves analytically but is **not** dynamically solved from the dye field. Numerical interpolation diffuses concentrations and the domain clamps at boundaries; mass is not strictly conserved. Touch impulses are ad hoc momentum-like perturbations, not incompressible pressure-projected impulses. Volumetric lighting is an artistic single-sample approximation rather than full multiple scattering. The CPU volume updates at 18 Hz while rendering may run at a higher frame rate.

## Structural plan
1. Phase 01 — measurable persistent dye transport + touch gestures and volume ray marching.
2. Phase 02 — velocity memory and pressure-projected 3D GPU fluid option; benchmark against mobile.
3. Phase 03 — field morphologies (gyroid, trefoil, braid, vortex pairs), with persistent transport rather than camera-only motion.
4. Phase 04 — advanced optics: anisotropic scattering, colored absorption, art-directed emission, layered lighting.
5. Phase 05 — saved composition DNA, exact checkpoint/replay, undo logs, robust capture/export with real codec identification.

## Mobile and QA
- WebGL2 required, no paid service or CDN; adaptive canvas resolution capped at DPR 1.3 and 780 pixels each side.
- Test an actual iPhone Safari build before claiming device readiness. Check compile/link errors and texture upload behavior, orientation, pointercancel, and context loss.
- Visual A/B: freeze camera; with flow > 0 the internal density must change. Pause flow and move only camera to prove the distinction. Set vortex speed=0 and verify decay almost stops; local touch injections must remain in the volume after camera orbit.
- Test interaction undo/redo as approximate volume checkpoints, not exact time-forward semantic replay; the rollback restores a historical snapshot and simulation time.
- Animated exports: fixed timestep alone does not imply periodic fluid-state loops. Later loops require true periodic state or verified repeatable cycle.
- Full artist palette vault source has not yet been imported. Initial palette collection is intentionally labeled a starter set.

## Phase 01B — morphology and flow vocabulary
The initial density may be seeded by four distinct implicit/material structures: a torus/plume/ribbon (Vortex Cathedral), gyroid level-set bands (Gyroid Ghost), closest-distance sampling against a closed trefoil centerline (Trefoil Apparition), or three twisted helical pigment tubes (Braided Exorcism). These are *starting density distributions*, not extra simulation laws.

The velocity system now selects between: (a) the original localized Gaussian vortices, (b) ABC/Beltrami-type trigonometric advection, and (c) paired Gaussian countercurrents. For each, analytical baseline divergence is zero up to finite-difference tolerance. User touch impulses intentionally are not divergence-free. Flow changes affect future advection without resetting persistent dye; genesis changes are queued until a confirmed New Design. Undo snapshots include the selected law and genesis morphology, but simulation replay does not yet yield exact trajectory-preserving undo.

Browser-based WebGL smoke tests are blocked in the current sandbox environment, including localhost, so **no successful GPU shader compilation or iPhone Safari rendering is claimed**. Local numerical tests are not a replacement for this QA.

## Phase 01C — actual GPU pigment advection
GPU mode allocates **two distinct 3D RGBA8 dye textures**. An advection shader samples the previous volume, renders 28 Z layers (WebGL2 `framebufferTextureLayer`) to a second volume, then swaps buffers. The ray-marching renderer reads the new texture directly. There is no CPU readback or re-upload **during normal GPU animation**. Touch injections are applied in the advection pass; temporary touch forces perturb velocity. A per-voxel analytic divergence-free microturbulence term is optional and is mirrored in the CPU fallback.

GPU history is captured by layerwise `copyTexSubImage3D` into separate 3D checkpoint textures. Undo restores dye and simulation time/flow/morphology; it does not guarantee exact deterministic replay of real-time interaction timing. Checkpoint textures are released when history is cleared or truncated. The GPU fast path automatically falls back to existing CPU advection **only when framebuffer/shader initialization fails**; lack of WebGL2 itself still prevents rendering.

**Important limitations:** 8-bit textures quantize dye concentrations, pressure projection and vorticity feedback are not implemented, self-shadowing is a single directional density probe (not multiple scattering), and WebGL2 shader execution plus Safari GPU performance are not yet verified on a real browser with WebGL2. A mock WebGL contract test validates slice draws and GPU-only copy calls but not pixel correctness. Avoid claims of physically correct incompressible simulations or device benchmarks.

## Phase 01D — trajectory fidelity and depth-sensitive light
A per-substance **Flow tracing** selector controls how the characteristic departure point is found for dye advection, independently from the selected vortex field:
- Fast: one velocity evaluation at end-of-step time, then backtrace with first-order Euler.
- Curved: one end-of-step velocity estimate, then a second velocity evaluation at a half-step backtraced position and halfway time; this is second-order midpoint integration of particle trajectories, **not** second-order reconstruction of the pigment field. Sampling is still trilinear semi-Lagrangian and remains diffusive and non-conservative.
- The CPU fallback and GPU WebGL2 slice shader share this time convention. Both keep the previous volume unchanged while selecting the tracing mode.
- Mode is stored with snapshot/restore and preserved on Restart/New Design. UI mode switches are undoable.

The ray-marched optical shader now accumulates density in the illumination direction for 1/2/4 short sampling steps according to render quality. Light absorption uses exponential attenuation from these probes, rather than the old one-offset approximation. It is approximate art-directed self-shadowing, not multiple-scattering, not a path-traced volume, and **not a claim of browser visual verification**.

### Acceptance criteria and limitations
1. JS parse for CPU engine, GPU shader-source host and renderer; no missing UI controls.
2. Euler and midpoint results differ numerically for vortex, Beltrami and countercurrent fields, remain finite and deterministic; checkpoint includes the chosen integration mode.
3. Shader contract checks for `uIntegrator`, `uLightSteps`, fixed loop bounds and quality mapping.
4. Browser reality still requires a WebGL2 context and physical iPhone Safari test; the available headless Chromium reported `webgl2: false` even with software rendering flags, and local file navigation was blocked.
5. No promise of faster performance from midpoint mode; it doubles velocity evaluation cost. If the iPhone struggles, use Fast and Mobile.

## Phase 01E — Material Memory / Fold Ghosts (2026-11-13)
**Material state now has four channels per 3D voxel:**
- R/G/B = independent transported pigment concentrations.
- A = a persistent `foldMemory` scalar in [0,1], *not* opacity. Previously the channel was an unused constant 1; now it starts at 0 and evolves.

At each fixed simulation step:
1. Sample the prior volume at the velocity-backtraced coordinate, including the prior memory value `m_advected` (trilinear CPU/GPU).
2. Compare two prior RGB samples at adjacent voxels along a grid axis chosen approximately across the local flow in XY. The bounded RGB contrast is an **interface activity proxy**, not a physical strain tensor:
   `contrast = min(1, length(dye_plus - dye_minus) / sqrt(3))`.
3. Write a bounded amount of this observed contrast into memory, weighted by the advected pigment mass, and relax previously written memory:
   `m_next = clamp(m_advected * exp(-dt * (.06 + 1.15 * (1 - persistence))) + dt * foldWrite * contrast * min(1, sum(rgb_next)), 0, 1)`.
4. Let old memory locally slow the backtraced transport velocity by the bounded factor `1 - .35 * foldGrip * m_here`, where `m_here` is the prior cell's memory. This introduces genuine *feedback into subsequent RGB evolution*, but it is an **art-directed, generally compressible** intervention; not Navier–Stokes, not elastic strain, not mass preserving. With Fold Grip zero it only affects appearance.
5. In the volume ray marcher, RGBA sampling exposes the memory as optional filament brightness/opacity enhancement. **Inspect substance → Fold-memory map** renders memory without using RGB as its primary density.

The extra memory channel uses the same existing RGBA8 GPU ping-pong volumes and GPU checkpoint layers. There is **no new 3D texture** beyond the existing front/back and undo snapshot textures. CPU fallback packs A to bytes, while GPU shader writes it alongside RGB. The CPU uses float intermediate memory, GPU quantizes to 8 bits; parity is approximate (especially for faint folds).

### Controls and undo
Substance: Fold formation, Fold persistence, Fold grip, and Fold-memory map diagnostic. Light + color: Filament shine (purely optical). Changing fold structural sliders creates undoable GPU/CPU checkpoints at the end of the edit. Undo/redo snapshots retain the new fold parameters; reseeding explicitly preserves current parameters but clears the material's accumulated history.

### Next real physical evolution
An actual local 3D deformation-gradient or advected fiber-orientation tensor is **not yet implemented**. Such a model can later track individual filaments stretching and aligning in flow. The present field captures and preserves pigmented interfaces and their history; calling it physical vortex stretching would be incorrect.

### QA status
Simulation arithmetic, finite values, zero-write baseline, positive accumulated memory, pigment response to Fold Grip, deterministic repeats, bytes and checkpoint restore are testable without WebGL. GPU shader uniform and GLSL source contract tests protect integration but **do not verify live shader compilation, rendered pixels or Safari performance**. No merge or production deploy requested.
