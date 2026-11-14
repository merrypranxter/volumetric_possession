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

## Phase 01F — Immersive Atmosphere: occupy the screen
**User feedback:** the volume looked like a small object trapped in a cube, with controls living below a framed square.

### Layout and camera changes
- The canvas and its frame are now `position:fixed; inset:0; width/height:100%`, with no square aspect ratio, border or clipped specimen window; `100dvh` follows the mobile visual viewport.
- HUD labels are legible over the image; a bottom glass dock keeps Stir/Inject/Orbit accessible. `Controls` expands/collapses the rest of the settings. Art Only hides the header, dock and gesture hint; a small restore pill always remains.
- The default camera distance changes from 3.25 to 1.95 with a zoom range [1.22, 5.6]. Plus/minus, Fill view and two-finger pinch adjust the camera (without regenerating pigment). Desktop wheel zoom works too.
- The projection uses **cover** instead of contain framing. For viewport aspect `a = width/height`, the ray's horizontal/vertical multipliers are `[min(1,a), min(1,1/a)]`. This preserves isotropic angular scale per physical pixel while cropping into the volume for unusually tall or wide displays; unlike an arbitrary XY stretch, it does **not distort 3D geometry**. The canvas pixel-size cap preserves exact CSS aspect via a single scale.
- Raymarch density is smoothly attenuated as positions approach the six physical edges of the bounded volume so that its computational cube is not visibly a cube. This changes rendering only—not the underlying physical state or velocity boundary conditions.

### Visual depth without pretending to create fluid
- `Wisp definition` samples a local dye neighbor inside the 3D texture and accentuates existing pigment interfaces / fold memory optically. It costs at most one additional 3D sample per contributing raymarch step when enabled.
- `Prism depth` uses 3D-position-dependent palette-channel rotation. This enriches spatial color layering and is not wavelength dispersion or spectral ray tracing.
- Default fine turbulence rises to 0.6, which **does change the underlying transported dye state** through the existing divergence-free analytic microflow. The two new optical sliders only affect rendering.
- Render resolution is constrained to 780 pixels on the long edge, at most 420k pixels, respecting CSS aspect and reducing work on mobile.

### Reality checks
- JS parse and UI ID/HTML nesting checked; numerical cover projection gives equal world-angular scale per physical screen pixel for mobile portrait and desktop landscape.
- Small CPU ray-box/mass sampling of the initial seeded volume suggests the fraction of viewport rays hitting significant material increases on a 393x852 viewport from 24% (previous square-camera mapping) to ~58% (new cover/closer mapping); on a 874x402 view ~5% to ~65%. These are **approximate geometric occupancy estimates**, not screenshots, browser performance benchmarks, or a guarantee of the same visual impression.
- Renderer shaders and pinch interaction still need actual iPhone Safari testing. The environment lacks live WebGL2 frame verification. If frame time suffers, disable Wisp definition and choose Mobile quality.

## Phase 01G — Filament Forge
The source term is sampled analytically at all 28³ volume voxels after each dye advection step:
`dyeNext[c] += dt * power * source[c](position, phase, width) * (1 - dyeNext[c])`, bounded to [0,1]. Source mode Off, or power=0, causes no injection; existing material continues to advect. `dt=0` touch-flush passes never create new source matter.

Three genuinely different moving **3D manifolds**, one per pigment channel:
- **Triple Helix Nerves:** three Gaussian tubes following `[x,y]=0.42[cos(5.3z+phase+2πc/3),sin(5.3z+phase+2πc/3)]`.
- **Orbital Rosettes:** three separate lobed cylindrical loops with `r=.44+.16cos(5θ+phase+2πc/3)` and `y=.30sin(3θ-1.2phase+2πc/3)` where `θ=atan2(z,x)`. Density decays with squared distance to the centerline.
- **Gyroid Sutures:** three gyroid-like iso-sheet layers of `g=sin(x')cos(y')+sin(y')cos(z')+sin(z')cos(x')`, phase-shifted coordinates, and iso-values `[-.88,0,.88]`. Its dose is multiplied by 0.13 because surfaces occupy much more volume than threads; this reduces sudden scene saturation.

Phase = `(time + dt)*pace*.55 + seed*.000017`. The moving source loci are **not** the same as the flow: once injected, material persists, is carried by the independently selected analytic velocity fields, and contributes to the existing fold-memory system. Thus switching source types never regenerates or discards old dye.

The existing RGB channels inherit whichever palette is selected. Source parameters are saved with the simulation checkpoint for Undo/Redo and preserved across seeded Reset and New Design (which remove history intentionally). No extra GPU volume or rendering pass: the shader reuses the 28 z-layer transport fragment pass and exposes uForgeMode/Power/Width/Pace. There is an equivalent CPU fallback.

**Limitations:** RGB8 volume and 28³ discretization cannot resolve extremely thin fibers; semi-Lagrangian advection diffuses detail. Sources are bounded, but not mass-conservative, not pressure-projected fluid physics, and not guaranteed periodic. Gyroid is an implicit approximate sheet, not meshed geometry. Tests evaluate deterministic numerical behavior, but live shader compilation and iPhone Safari rendering performance remain unverified. 

## Phase 01H — Fiber Nerves / Directional Memory

Each 28³ voxel now has TWO independent advected material states:
1. Pigment RGBA8: R/G/B concentrations, A = previous Fold Memory scalar.
2. Fiber RGBA8: RGB encodes a unit world-space director `d=(2rgb-1)/|2rgb-1|`, alpha encodes accumulated directional coherence `c ∈ [0,1]`. CPU keeps signed Float32Array tangent xyz and scalar c, GPU packs tangents into unsigned 8-bit channels. Initial coherence is zero; reset clears it.

### Evolving physical-ish director transport
At each step, the fiber volume is semi-Lagrangian advected along the same analytic flow and feedback-modified backtrace used by the pigment volume. A tangent starts approximately tangent to the previous pigment density interface, `d = normalize(grad(totalPigment) × v)`. If degenerate, a gradient-orthogonal fallback is used.

Stored directors bend using the direction derivative of velocity, from a symmetric finite difference along the prior tangent:
`Dv·d ≈ (v(x + .065 d) − v(x − .065 d))/(2*.065)`.
`d' = normalize(d + dt * fiberBend * (Dv·d))`.
`c' = clamp(c_advected * exp(-dt * (.045 + 1.2 * (1-fiberPersistence))) + dt * fiberGrowth * interfaceActivity * mass * (0.8 + 0.2*positiveStretch), 0,1)`.

This is an **advected director field**, not a full tensor, mechanical elasticity simulation or complete physical vortex-stretching fluid. CPU uses newly advected dye for the activity mass, GPU samples previous dye; subtle numerical mismatch is expected. Spatial gradients and directions are approximate at 28³ and GPU orientations quantize to 8 bits.

### Causal feedback, not just optics
When evolution is On, coherence can project part of local dye velocity along a stored tangent:
`v_new = mix(v_old, d * dot(v_old,d), min(.75,.55*fiberGuidance*c))`.
This intentionally suppresses cross-strand transport, helping existing thin structures resist becoming undirected fog. It is **not divergence-free or mass-conservative**. Fold Grip runs before this guidance, and the resulting velocity is used for characteristic backtracing.

Directional volumetric highlights use a cylindrical scattering proxy:
`light = pow(1 − abs(dot(d, normalize(lightDir − viewRay))),6)`.
The strength is controlled by Fiber Glints, multiplied by coherence; it modulates the existing physical RGB dye and fold shading instead of recoloring the whole screen with an unrelated texture. The **Fiber Alignment Map** diagnostic uses normalized `abs(d)` as an RGB direction key and coherence for density. Newly seeded volumes show almost no map until material history accumulates.

### Resources / controls
- **CPU:** `src/fiber-memory.js` float RGBA arrays, checkpointed and packed to bytes on upload. CPU computes extra analytic velocities, so devices in fallback mode may run slowly.
- **GPU:** `src/gpu-fiber-memory.js` shares the exact velocity GLSL preface from pigment shader, owns second 3D ping-pong state and a separate FBO. It reads previous dye and previous fiber states, then atomically swaps its own volume after completing 28 z-layer writes. This adds 28 draws per active simulation step (56 total, compared with 28 before). The memory itself is **not transferred through readPixels**. Undo checkpoints now save both volumes and both state parameter groups; GPU snapshot copying adds 28 layers per volume. Memory footprint grows accordingly.
- **Substance → Fiber Nerves:** Evolution On/Off, Strand Formation, Persistence, Bending, Guidance; plus Inspect substance → Fiber Alignment Map.
- **Light + Color:** Fiber Glints. Turning evolution Off freezes the previously stored directions and skips the second GPU update pass, while directional lighting can still read that frozen state. Source-family and fiber parameters persist through Restart/New Design; actual history resets.

### QA and limitations
- CPU checks: deterministic seeded director evolution, finite bounds, no coherence on reset, positive coherence after time steps, RGB changes under guidance vs guidance zero, exact freeze, exact snapshot restoration.
- Mocked GPU checks: 28 dye + 28 fiber slice draws per step, shader uniform propagation and controls, double-volume checkpoint/restore, disabled fiber pass, 2 reset texture uploads and zero readPixels.
- Full live WebGL2 shader compilation, Safari frame rate, and visual aesthetics **not verified by the mock**. If mobile performance suffers, toggle Fiber Evolution Off and reduce render quality. High fidelity stretch will require more resolution and physically richer deformation machinery.

## Phase 01I — Flow Necromancer: editable persistent velocity anchors

The artist can place, drag, remove, or summon up to six persistent 3D nodes directly in the artwork. These nodes are stored in the same CPU/GPU simulation state as pigment, fold memory and fiber memory (without allocating another 3D texture). Unlike temporary Stir impulses, nodes remain until removed, Undone, or the artwork is regenerated.

### Physical field (art-directed, not a pressure solver)
For a node centered at `p0`, position delta `d = p - p0`, radius `r`, phase `φ`, strength `s`:
`g = 0.60 s (0.78+0.22 sin(0.83 t+φ)) exp(-|d|²/(2r²))/r`.
The field is evaluated only within `|d|² <= 9 r²` (bounded support via a hard cutoff). The three modes contribute:
- **Whirlpool:** `g [d_z,0,-d_x]` (localized world-Y vortex, divergence-free inside the support interior).
- **Implode:** `-g d` (compressible sink).
- **Repel:** `+g d` (compressible source).

This flow is added to the existing analytic field and temporary impulses. It affects the **same physical dye and fiber transport**, including its changing fold/filament state. It is not an extra visual mask, a global camera motion, or a Navier–Stokes pressure projection. Sharp support cutoff can introduce a velocity discontinuity at exactly 3r; forces are visually localized, not strictly physically continuous at that boundary. The soft periodic multiplier varies node strength over time but does not guarantee the overall artwork loops.

CPU uses `src/flow-sculpt.js`, called from PigmentField.velocity after baseline turbulence/impulses. GPU uses equivalent GLSL logic in the shared dye velocity header, automatically inherited by the GPU fiber pass. Uniforms are `uSculptCount, uSculptPos[6], uSculptInfo[6]`; six vectors are bound per pass. Max six avoids unbounded mobile loops. Empty-node simulations are behaviorally identical to the prior version.

### Gestures / camera
- **Sculpt** mode is a fourth touch tool beside Stir, Inject, Orbit. Tap to place the active force type at the Touch Depth plane, or drag a glowing on-volume handle to reposition an existing anchor at its prior camera-depth plane. Handle projection uses the exact inverse of the renderer's cover camera; it respects portrait/landscape proportions, rotation, zoom and device pixel ratio.
- **Motion → Flow Necromancer:** Force Spell, Strength, Radius, Count, Summon Three Forces, Remove Selected, Clear All. Strength/radius edits for an active selected node checkpoint on edit completion rather than every slider frame; changing type is undoable. Summon adds up to three when capacity permits. Clear All asks for confirmation.
- Persistent anchors are intentionally cleared on Restart and New Design, just like other user-authored geometry. The force settings themselves are retained in their sliders. Empty scene remains the default so existing preset simulations are not changed unexpectedly.
- Multitouch pinch temporarily cancels an in-progress sculpt gesture with checkpoint restoration, preserving the existing zoom interaction. An Art Only view hides handles along with the dock.

### Testing boundaries
- 3D orientation tests confirmed nonzero velocity and actual pigment/fiber differences with anchors, exact fixed-seed repeat, GPU/CPU state checkpoints, Undo/Redo and mobile camera projection/picking inversion.
- Mock WebGL2 tests confirmed bound uniforms on both dye/fiber passes, 56 volume slice writes on active fiber frames, GPU-to-GPU checkpoint copies of both volumes, and no CPU readPixels.
- **Actual browser shader compilation and iPhone Safari render/performance are not verified**; the source should be tested on a real WebGL2 phone before claiming seamless behavior. Attractive sink/repulsive source nodes are intentionally compressible and can concentrate pigment. Mobile users can remove anchors or disable fiber evolution to reduce load.

### Follow-on
Potential next phase: genuinely editable 3D flow curves, split/merge gestures and deformation handles for sculptural topology, possibly requiring finer than 28³ volume resolution.
