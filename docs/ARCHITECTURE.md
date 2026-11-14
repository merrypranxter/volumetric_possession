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
