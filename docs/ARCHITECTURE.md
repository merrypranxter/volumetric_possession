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

## Phase 01J — Curve Witch: persistent 3D velocity fields drawn by touch

**Artist interaction:** choose ⌁ Draw Flow, select a type and Touch Depth, draw across the full-viewport canvas. The 2D touch stroke is projected into the current camera-aligned world-depth plane, yielding a true **3D polyline** in object coordinates. A second stroke from another camera angle can occupy a different plane. The visible trace is a **control overlay only**; it is not painted into the rendering texture.

On release, the drawn path is arc-length-resampled to at most eight evenly spaced 3D control points with endpoints preserved; samples shorter than 0.075 world units are ignored. Raw touch points are capped at 96 and progressively decimated, preventing unbounded transient memory. The user can tap near an existing trace to select it and drag to translate the whole 3D curve on its former camera-depth plane. Undo/Redo snapshots preserve full 3D positions, type, strength and width. Clear-all asks for confirmation, and New Design/Restart intentionally clear authored curves without regenerating prior pigment during ordinary edits. Art Only hides the interaction overlay.

**Velocity equation:** for a voxel `x`, each curve selects the nearest point `q` on its piecewise-linear segments and that segment's normalized tangent `a`. For `d=x-q`, radius `r`, strength `s`:
`g=0.55 s (0.82+0.18 sin(0.75t+2.1*curveIndex)) exp(-|d|²/(2r²))`,
with influence ignored when `|d|>3r`.
- **Stream:** `v += g a`.
- **Coil:** `v += (g/r) (a × d)`.
- **Gather:** `v -= (g/r) d`.

The field uses at most two curves with seven segments each, checking the closest segment once per curve, rather than adding seven disconnected forces. CPU implementation: `src/flow-curve.js`; GPU shared velocity shader: `uCurveCount`, `uCurvePoints[16]`, `uCurveInfo[2]`. Both pigment and fiber GLSL passes share this math and get the same bounded uniform arrays. No extra volume, framebuffer or render pass is allocated. Empty curves incur only a zero-count guard and preserve previous simulation behavior.

**Limitations:** spline-smooth mathematical tubes are **not** yet implemented; line-segment tangent direction can jump at corners (though arc-length resampling reduces finger jitter). Gather is deliberately compressible, Stream may add nonzero divergence because of its spatial envelope, Coil is only approximately solenoidal around straight segments and piecewise connections. This is not a pressure-projected fluid solver, volume-preserving deformation, or guaranteed temporal loop. GPU's repeated nearest-segment tests can tax older phones; at most two curves and disabling Fiber Nerves evolution offers a performance escape hatch. Actual WebGL2 compilation and Safari rendering/FPS are **still not verified** in a browser here.

**QA:** CPU directionality/determinism/state and real material-effect checks; mocked dual GPU pass uniform packing, exact Undo/Redo and zero readbacks; camera-aware touch draw/select/move/recast/clear and Undo/Redo/Restart integration. Real device shader and pixel QA still required.

## Phase 01K — Topology Gremlin: deform, split, and braid cause-field curves

**Edit existing structural geometry without redrawing or resetting:**
- Draw Flow mode displays a small **glowing handle for each 3D control point** of the selected curve. Tap and drag an individual dot to move that one point in the 3D world on its original camera-depth plane, preserving all other control points; drag on a segment between handles to translate the whole path. Point selection radius is 20 CSS pixels, independent of screen pixel ratio; canvas overlay markers are not GPU-simulated or injected dye.
- **Split at Handle** requires an interior point and exactly one existing curve. It produces independent paths with a **shared exact junction point**; original mode/strength/radius are preserved for each half. It uses both allowed curve slots. Undo can restore original geometry and old volumetric state.
- **Braid into Two Strands** requires exactly one curve. It resamples the spine to eight control points, constructs a locally rotation-minimizing 3D frame by tangent-plane parallel projection of the previous normal, and offsets two strands oppositely by `spread*(.85+.15 sin(πs)) * [normal*cos(2π turns s)+binormal*sin(2π turns s)]`, where `s` is normalized accumulated arc length. Each strand gets half the original force strength to avoid instantaneous doubling. The **Braid Turns** and **Braid Spread** controls affect the *geometric cause field*, not texture appearance. Each braid strand remains independently editable after construction. User must Undo to recover the unsplit spine.
- A generated pair always remains within the preexisting maximum of **two curves × eight control points**; the shared CPU and GPU nearest-segment velocity laws from Phase 01J are intentionally unchanged. There are no extra 3D textures, shader passes, framebuffers or added uniforms.
- At geometry edit time, the persistent pigment and fiber memory are not changed. The modified curves influence subsequent advection, yielding gradual physical-ish rearrangement. All operations take one checkpoint and are undoable; Restart/New Design still clears authored geometry.
- Validation covers split junction integrity, deterministic braid/geometry distinctness, bounded point counts, intensity partition, refusal of degenerate paths or invalid parameters, correct touch mapping, per-point drag-only edits, Undo/Redo for split/braid and prior volume state.
- **Limitations:** Current braid is a discretized piecewise-linear set of two paths with eight samples each, not a smooth NURBS or real twist-stable rod simulator; tight turns can approach/saturate bounds and discrete tangents can kink. Split may change total field strength in overlapping neighborhoods despite each half retaining original settings. Draw-flow is a camera-aligned depth-plane gesture; true freehand XYZ tracing requires another control mode. Real iPhone Safari shader rendering and FPS remain unverified. This phase does not add GIF/MP4 export or the complete palette vault.

## Phase 01L — Living Braid / causal topology motion (November 2026)

An authored curve is persistent **construction DNA**: its base world-space control points stay unchanged. The new pure function `evaluateLivingCurves(baseCurves,simulationTime,mode,rate,amount)` creates a bounded derived shape that is used in the **actual analytic velocity field**, not painted onto the screen. This is deliberately reversible, seeded by the deterministic simulation clock, not driven by unrepeatable wall time. `phase = (2π/8) × simulationTime × rate` (period = `8/rate` simulation seconds). Still or zero amplitude/rate leaves previous behavior exactly unchanged.

The existing cap remains **two curves, eight control points each**:
- **Writhe:** at normalized arc fraction `s`, a finite-amplitude displacement travels along a locally defined perpendicular tangent-frame `(n,b)`: `Δp = amount × sin(πs) × [n cos(phase−2π·1.4s+offset)+b sin(...)]`. The endpoints remain anchored, and every interior control point actually moves through 3D.
- **Grow / Retract:** smoothly changes the *arc-length prefix* of each authored path using a cyclic cosine envelope and a positive minimum length, without changing/destroying original authored points. The velocity field therefore changes its spatial support as the active tip extends and withdraws.
- **Unbraid / Rebraid:** for exactly two paths, at each matched control point move their offsets toward/from the pair centerline and rotate the transverse offset around the local tangent. The near-coincidence is bounded by the excursion control; geometry genuinely contracts and reopens. It works on the CURRENT user-edited base control points. With one curve, the mode is inert rather than silently substituting another mathematical behavior.
- **Tail Exchange / Reconnection Cycle:** for exactly two paths, apply a smoothly eased interpolation of the distal control points toward their partner curve (preserving the beginning of each). At a half cycle with default excursion 0.18, the distal endpoints have exchanged; at a full cycle they return to their original base positions. This is **geometric tail-exchange morphing**, not a topological surgery or physical strand crossing solver. `Bake Current Shape` can make the current exchanged connectivity permanent by replacing the authored base point arrays.

Because the normalized displacement is clamped within the existing world-domain boundaries and each derived shape uses the same number or fewer control points, this adds **zero GPU 3D passes, zero new textures, and no shader uniform growth**. CPU `PigmentField.step()` caches the derived path ONCE per fixed timestep before its 28³ voxel loop and retains it until after fiber-director update. GPU `GPUPigmentTransport.step()` evaluates the same pure helper ONCE at `time+dt` and uploads the two 8-point arrays through the pre-existing `uCurvePoints[16]` and `uCurveInfo[2]` uniforms; its fiber pass receives those identical effective curves. Both pigment dye and fiber history respond causally to every moving path.

The renderer's edit overlay is derived from the same `engine.time` and live geometry, while Undo/Redo keeps the unmodified authoring controls and simulation time. The selected base control points can still be edited via touch: the pointer drag translates a base point by the inverse-camera projected movement delta, so moving live geometry doesn't overwrite its source DNA. Selecting Bake performs an Undoable checkpoint of the current derived 3D pose, switches evolution to Still and leaves all existing GPU textures and CPU material history untouched. Restart and New Design clear authored geometry but retain current motion/rate/excursion settings.

**Performance / honesty:** CPU and GPU now perform a tiny O(2×8) CPU-side time-to-geometry evaluation for live paths, not O(voxels × curve deformation math). The volumetric velocity code still performs per-voxel nearest-segment lookups from earlier phases. The deformation is not Navier–Stokes, and the phase-periodic *forces* do not guarantee a perfect periodic pigment/fiber state or seamless video export. Reconnection Cycle changes effective curve paths only; it is not a physics-based cutting, collision, or remeshing process. On an older iPhone, choose Still or disable Fiber Evolution if frame rate suffers. Shader compilation and live Safari visuals/FPS remain unverified by mocked GPU tests. GIF/MP4 encoding and full palette vault are still outstanding.

## Phase 01M — GENE THIEF: three-parent 3D curve-system inheritance

**Core distinction:** Genetics changes authored *cause-field construction DNA*, not the already accumulated RGB pigment/fiber material. A captured parent stores only `{curves: [{type,points[],r,strength}],livingMode,livingRate,livingAmount}`, cloned by value; it never copies GPU textures or a rendered PNG. A nursery holds three optional parent genomes. Capture overwrites a chosen slot; Starter Nursery populates deliberately distinct, editable prototype parents (single writhing Stream, two Coils with Unbraid, and a Gather/Stream pair with Tail Exchange). The parent selection and offspring creation work even when no curves are currently visible, provided two slots are populated.

**Deterministic genetic crossover:** `breedCurveGenomes(parents, uint32Seed, mutation, dominantParent)` is a pure, independent JavaScript operation. Its seeded 32-bit pseudorandom generator samples a donor's 1-curve or 2-curve system **topology** and, independently, selects motion and force genes. Optional dominant parent gets 4× discrete donor weighting over other captured parents; Balanced uses equal weights. Each offspring curve is arc-length-resampled to eight world-space control points; donor directions are aligned by chord so reverse-drawn parents can blend geometrically rather than cancel in opposing order. A dominant lead contributes the larger share of continuous geometry, while other eligible parents supply smaller blended contributions. Mutations are bounded, smooth correlated waves over the control-point index instead of independent per-point jitter. Strength and influence width inherit weighted parental traits with bounded mutations. Motion (Still, Writhe, Grow, Unbraid, Tail Exchange), rate, and excursion are inherited independently of geometry; paired-only modes fall back to Writhe on a one-curve offspring. Default mutation is 0.22; range is 0–0.50. Maximum offspring complexity remains **2 curves × 8 points**, matching existing GPU `uCurvePoints[16]` and `uCurveInfo[2]` and CPU field limits. A seed repeated with the same parents/mutation/dominance reproduces exactly the same child, including topology, continuous shape and motion traits.

**Touch UI:** Curve Witch contains the collapsed/expandable Gene Thief nursery. Capture A/B/C, load starters, pick Balanced/A/B/C dominance, edit Offspring Seed and Mutation, Breed Offspring, or Clear Nursery. A birth replaces only the active `flowCurves`, `livingMode`, `livingRate` and `livingAmount`, updates their visible controls and selects Draw Flow to allow immediate editing. It increments the seed to produce an alternate child on the next tap. The captured family is independent of current active curves: even after restarting the material, the nursery remains available. Parent labels report strand count, force types and inherited motion. An empty family cannot breed and an invalid integer seed is rejected before any mutation.

**State and reversibility:** Both `PigmentField.snapshot/restore` and `GPUPigmentTransport.snapshot/restore` include `cloneBreederParents(breederParents)` and `breederSeed`. Slots can be captured, overwritten or cleared with Undo/Redo; every birth checkpoints previous active curves, motion genes, and seed. A child birth does not execute a simulation step or upload texture data. The existing 3D dye and fiber volumes and their history are kept as-is, with new force changes affecting *future* advection. CPU and GPU `reset` intentionally clear authored active curves but retain saved family slots and next seed. New Design likewise preserves family DNA while regenerating material.

**Tests/limits:** Pure genetic tests verify 3-parent construction, deep-copy capture, no texture capture, rejected insufficient families or invalid seeds, fixed-seed reproduction, genetic diversity of 1- and 2-curve offspring, limits/finite coordinates, force variability, mutation, true pigment/fiber changes after simulation, and exact current-material preservation on birth/Undo. Mock touch workflow verifies starter generation, birth, repeat-seed reproduction, capture/undo, clear/undo, reset preservation; source contracts guard mobile controls and CPU/GPU family checkpoints. No new GPU shader passes/uniforms/textures. This is *generative mathematical inheritance*, not biological genetics or simulation of actual meiosis. Random seed governs **child construction**; the ensuing nonrepeating pigment transport remains driven by the existing dynamical system. Current complete MATHEMAGICAL palette vault and high-resolution GIF/MP4 export are still separate backlogs. iPhone Safari runtime/GLSL compilation/FPS remain unverified by mocks.

## Phase 01N — MUTANT FAMILY ALBUM: real selective ancestry, favorites and backups

**Motivation:** The earlier Gene Thief could generate beautiful curve offspring but offered no durable collection, stable family identity, or way to reuse a great child in a later generation. This phase creates a compact DNA-only archive attached to the existing Curve Witch nursery.

**Specimens:** A `geneGallery` contains at most `24` validated, deep-cloned `{id,label,genome,parents[],generation,favorite,seed,mutation,sequence}` records. Each genome is precisely the previously supported 1–2 curve (maximum eight 3D points each) `{curves,livingMode,livingRate,livingAmount}` record. A monotonic serial creates stable IDs (`g1`, `g2`...) distinct even after old specimens are evicted. No image pixels, 3D textures, checkpoints, user identification or unrelated data are stored. `src/gene-gallery.js` implements pure cloning, constrained creation, favorite/rename, removal, lineage traversal and JSON serialization/validation. Labels enter the DOM through `textContent`; no markup is generated from untrusted names.

**Three-generation—and deeper—lineage:** Three starter ancestors become independently archived generation-0 specimens and populate Parent A/B/C. Capturing the current curve system saves a fresh specimen and assigns its ID to the captured parent. Choosing **Parent A/B/C** on any album card copies that specimen's genome into the corresponding breeding slot and stores a separate `breederSources[i]={id,label}` reference. Birth uses the current parent IDs, retains them in the child's `parents[]`, and calculates its generation as one more than the highest archived ancestor. Subsequent children can become parents and produce generation-2/3+ families. The album's expandable ancestry view traverses stable parent IDs, deduplicates repeated ancestors, and limits visible depth for readability. When an old ancestor has been deleted/evicted, descendants retain its last known label and the UI explicitly notes that the old specimen is no longer in the album; lineage is never fabricated by matching shapes.

**Gallery visual/control surface:** Responsive 2-column phone / 3-column wider-screen cards with lightweight **Canvas 2D** previews of the exact 3D control-point geometry, color-coded Stream/Coil/Gather (not GPU raymarch screenshots). Select for family tree, Activate (Undoable, changes only authored curve DNA and Living Braid controls), Favorite, assign to A/B/C, Rename, Delete (confirmed). **Save Active** archives a hand-edited mutant and can cite the last selected archive specimen as its parent; it does not encode the screen image. Album is scroll-contained inside the existing mobile control dock.

**Persistence and portability:** The album and three parent slots/source refs, next serial and breeding seed save to `window.localStorage["volumetric-possession-gene-album-v1"]` after checkpointed edits. On startup, only these **gene-bank fields** restore—never overwrite the live volume or pigment. Browser storage is best-effort and device/profile-specific; private browsing or site-data cleanup may clear it. The UI indicates unavailable storage rather than pretending a save succeeded. **Backup JSON** creates a Blob download on the device; **Restore JSON** uses an iPhone-compatible file picker. Version-1 parsing validates schema, archive size, IDs, duplicate IDs, next ID sequence and seed; the 400 KB maximum prevents excessive imports. Restore asks for confirmation, changes the gene bank in one Undoable operation and leaves pigment untouched. Backups are plain mathematical metadata and are portable to another device. They do not contain personal account data, passwords, rendered art or any pixel texture.

**Archive capacity semantics:** At 24 specimens, a new save/birth removes the oldest **nonfavorite** entry. Favorites never auto-evict. If all 24 are favorited, the next save/birth fails before changing the live volume; the user can unstar/delete a specimen or back up the album. Explicit deletion of any favorite remains possible after confirmation. Missing-ancestor labels remain available in descendant records. No database/server required.

**Reversibility and performance:** `PigmentField` and `GPUPigmentTransport` now deep-copy `geneGallery`, `geneNextSequence`, and `breederSources` into normal Undo checkpoints, alongside the existing parent genomes/seed. The CPU field and GPU engine stay synchronized whenever the nursery/gallery changes; renderer and shader velocity caps remain **two curves × eight points**. Thumbnail generation occurs only during album UI updates, not per animation frame, and runs 2D canvas code; no new GPU volume, framebuffer, uniform or raymarch pass was introduced. Gallery persists through Restart/New Design and on-device reload.

**Verification boundaries:** mathematical genealogy, favorite capacity handling, JSON roundtrip and invalid import validation; mocked mobile controls for starter birth, family promotion, generation-2 offspring, Undo/Redo, restart and local reload; CPU/GPU scene snapshot preservation. No claim of actual iPhone Safari visual/performance testing. The gallery preserves **curve DNA only**—not screenshot thumbnails, pigment/fiber history, permanent video loops, the full MATHEMAGICAL palette vault or GIF/MP4 exports.

## Phase 01O — Trait Heist: selective causal inheritance + preview-before-hatch

The artist no longer relies on stochastic inheritance for every trait. A small fixed `breedTraitLocks` record has six explicitly named channels, each `"auto"` or `"0"/"1"/"2"` for Parent A/B/C:

| Channel | Inherited property | Meaning |
| --- | --- | --- |
| topology | One or two 3D paths | Picks donor curve count without exceeding the 2-curve GPU limit |
| shape | Each curve's world-space control points | Exact source-geometry copy for chosen donor; auto preserves baseline arc-length crossover |
| force | Stream/Coil/Gather velocity law | Exactly inherited per curve when locked |
| material | Force radius + strength | Exactly inherited per curve when locked |
| motion | Still/Writhe/Grow/Unbraid/Tail Exchange | Exactly inherited motion mode when compatible |
| dynamics | Living Braid cycle rate + excursion | Exact inherited animated movement parameters |

**Backward compatibility:** `src/trait-locks.js` invokes the existing pure, seed-dependent `breedCurveGenomes` first. When all six channels are Auto, the offspring's curves, motion, dynamics, seed and lineage are unchanged from Phase 01M/01N. Only explicitly locked traits are overridden. Locked properties bypass incidental mutation, and the Mutation slider still meaningfully affects unlocked properties. A locked donor must exist; missing A/B/C is a visible error, never silently swapped. If a one-curve donor is asked to contribute curve 2 (because topology was locked to a two-curve parent), the extra curve is taken from the selected topology parent if possible, otherwise another actual parent with curve 2. Every such exception is explicitly listed in the preview's receipt, avoiding fake “exact inheritance.” Two-strand-only motion on a one-curve child becomes Writhe with an explicit compatibility note; it never quietly freezes.

**Preview vs Hatch:** The six compact dropdowns live inside a collapsible **Trait Heist** subsection of Gene Thief. `Preview Child` deterministically computes a candidate and draws a small **Canvas 2D projection of its actual 3D mathematical curves**, with a full source-by-trait receipt and fallback notes. Preview changes *none* of the live GPU textures, dye/fiber arrays, active paths, gallery/ancestor records, parent slots, current seed, or undo history. `Hatch Preview` checks a signature containing parent genomes, selected locks, original seed, mutation, and dominance. Changing any of these invalidates the preview and requires another preview rather than hatching stale DNA. Hatch commits that **identical** previewed candidate into the old Undoable birth flow and the 24-specimen album. The existing `Breed new offspring (direct)` button is retained for one-tap experiments.

**Persistence and ancestry:** Both CPU `PigmentField` and GPU `GPUPigmentTransport` own and checkpoint `breedTraitLocks`, including Undo/Redo. The existing on-device version-1 JSON gene bank gains an *optional* `breedTraitLocks` field while preserving compatibility with older Phase 01N JSON exports (missing field means all Auto). Each specimen additionally archives its `traitLocks` and a `inheritance` receipt, so the family tree can say **Shape ← A, Force ← C**, etc. All metadata is plain bounded mathematical DNA; no RGB volume or fiber texture is added to backups. The new phase retains the established two-curve × eight-point GPU uniform budget and requires **no new 3D simulation pass**.

**Intentional limits:** This is controlled mathematical trait recombination, not a biological/meiosis simulation. The preview is a flat 2D projection of DNA, not a WYSIWYG raymarched prediction of evolved pigment; actual volume appearance emerges after further simulation. Locked six-channel inheritance intentionally leaves no crossover contribution to those selected traits; Auto is how to preserve free mutation/crossover. Browser localStorage may be cleared; JSON backup remains strongly encouraged. Real Safari/WebGL2 shader compilation and FPS remain device-verification tasks. Full palette vault and smooth high-res GIF/MP4 exporting are still out of scope.

## Phase 01P — Gene Surgery: selective post-birth velocity-field grafts

**New pure module:** `src/gene-surgery.js` exports `performGeneSurgery(recipient, donor, {operation,target,donorStrand})`. Both genomes are deep-cloned through the existing `cloneCurveGenome` contract; it never edits the original parents or active simulation state. All resulting curves remain the existing bounded `newFlowCurve` data, preserving the **two curves × eight 3D points** renderer/CPU/GPU transport budget.

The surgeon operates on the *living force architecture* itself—not on a screenshot or postprocessing effect. The eight operations are:
- `strand`: exact single-strand transplant, preserving every other path and global motion.
- `shape`: swap only the 3D control points, retaining the patient's local Stream/Coil/Gather law, radius and strength.
- `force`: transplant only Stream/Coil/Gather.
- `material`: transplant only the local radius and strength.
- `append`: add one donor strand as the second force path; allowed only when recipient has one.
- `remove`: delete the selected one of two strands; removal of the last remaining path is refused.
- `motion`: transplant the global Living Braid mode, leaving individual paths alone.
- `dynamics`: transplant global motion rate/excursion, leaving the motion type and both 3D curves alone.

A two-strand motion mode (`unravel` or `reconnect`) is incompatible with one path. If an operation leaves only one path, the mode becomes `writhe` with a visible explanatory note. Invalid donor index/target index, nonexistent strand, absent donor, and unsupported operations fail before modifying the active artwork.

**UI:** Inside Motion → Curve Witch → Gene Thief → **Gene Surgery**, the artist selects donor Parent A/B/C or **Selected album specimen** (chosen via the album's View tree control), operation, target strand and donor strand. Before/After previews use the existing lightweight Canvas 2D projection of actual world-space 3D curves. The pure preview does not change parent DNA, shader state, pigment, fiber texture, time, seed, album or Undo history. Preview's signature captures the exact patient's current DNA, exact donor DNA and real source identity, operation and strand indices. Apply rechecks the signature and refuses stale inputs, rather than committing a new child after the artist has touched the work.

**Atomic archival and true genealogy:** A successful Apply builds a new gallery record *before mutating live volume flow*. If the gallery is full of favorites, surgery fails without altering material. The record contains a safe bounded `surgery={operation,target,donorStrand,sourceLabel}`. It links to the archived patient only when the active curve genome exactly matches an actual archived genome, even if the currently selected album specimen is being used as donor. If the patient has been independently hand-edited and is not archived, it is explicitly labeled **Edited / unarchived live sculpture**, never falsely attributed to an unrelated specimen. The donor links through its real `breederSources` or album ID if present; an unarchived donor is labeled as such. Existing ancestry traversal and JSON gene-bank v1 support the optional surgery field without changing the version or requiring migration.

**Live material safety / Undo:** Apply swaps only active `flowCurves`, `livingMode`, `livingRate` and `livingAmount`, and mirrors these control values to CPU fallback. Existing GPU 3D textures, persistent pigment density, fold state and Fiber Nerves director/coherence are not reseeded or overwritten. The existing scene checkpoint captures the preoperative material and paths once for Undo/Redo. Only subsequent simulation steps use the new velocity system. Local gallery/parent DNA persists across reload, while full volumetric artwork is still not stored or restored across reload. No extra GPU transport pass, texture or GLSL shader modifications are needed.

**Verification and limits:** Static/non-mutating previews cannot predict the final pigment after evolving the newly grafted force law. Changing a force/radius may look identical in the 2D structural preview (the receipt identifies the actual value change), but it causally changes future advection. Applied surgery records 3D mathematical DNA only, not screenshots/texture snapshots. No claim of physical tissue surgery, real Safari rendering or guaranteed periodic material loops. Exportable high-resolution GIF/MP4 and full MATHEMAGICAL palette vault remain backlog.

## Phase 01Q — POSSESSED CANVAS: causal touch, bounded OKLab, measured phase winding

### Gesture Witch — two-finger 3D source-curve editing

The previous iPhone pointer system interpreted every two-finger action as camera zoom. In `Draw Flow` mode, once the artist has selected a persistent named curve (tap its line/handle), a two-pointer gesture now has **semantic ownership** of that curve instead of the camera. `src/gesture-twist.js` turns the signed finger-angle delta into a bounded spatially varying twist of its **actual control-point geometry**, using Rodrigues rotation around the current camera-forward axis, with opposing rotations at the two ends so the deformation changes curvature. Pinch changes only that curve's causal spatial influence radius. Geometry stays inside [-0.93,0.93]³ and radius [.12,.65], so both CPU and GPU retain their unchanged two-curve × eight-point budget. A two-finger edit stores the *original* mathematical curve and a single pre-gesture GPU/CPU checkpoint: every move recomputes from original DNA rather than accumulating drift; release makes **one Undo**. Pointer cancellation, lost capture, Escape, blur and backgrounding restore the pre-gesture state; when one finger lifts the other cannot accidentally resume a one-finger brush. In non-edit modes, pinch still zooms the camera. Existing Draw Flow, Sculpt, Inject, Stir, Orbit, zoom buttons, single-pointer selection and Undo/Redo remain.

### Saturation Sadist — selective, opt-in chroma on rendered display pixels

The production raymarch already maps accumulated optical/filament density to a gamut-limited display-looking `pow(color, vec3(.82))` output; it is **not** an HDR, Display-P3, or spectrally calibrated pipeline. Phase 01Q leaves that *exact* output intact when Neon Chroma=0. When enabled, `src/render.js` interprets the final [0,1] encoded display RGB as ordinary sRGB, decodes to linear, maps to **OKLab**, multiplies only usable midtone chroma by a user-adjustable strength while protecting near-black folds, near-white glows, and almost-neutral features, and performs a bounded **7-iteration binary search** for the in-gamut chroma limit at fixed lightness and hue; it then converts back to sRGB. Already-gamut-bound colors cannot be made infinitely more saturated. With Color Grading=Lens, the gain is additionally multiplied by a camera-screen-space Gaussian focus, not by an invented 3D material property. This optional stage is read-only; no palette stop, original color channel transport, alpha, or GPU 3D texture is changed. The user can drag **✴ Neon Lens** over the canvas, or two-finger pinch to adjust focus radius. All color state is recorded in `colorGrade={neon,mode,lens,radius,defectGlow}` and copied into CPU/GPU Undo checkpoints; `reset` retains artist color choices. The colored surface is rendered via the same single raymarch shader; costs increase only when grading is on, to be profiled on actual iPhone Safari. The new controls are off by default; a simple gesture in Neon Lens mode explicitly enables the lens and uses one Undo transaction.

### Color Topologist — genuine phase winding, not invented 3D genus

The project contains **actual 3D velocity curves and anchors**, not a validated watertight 3D mesh. Consequently the honest available topological measurement is an **S1 index of the projected 2D authored flow**: sample XY velocities at the open `z=0` slice on a **20×20 lattice**, using the existing `curveVelocity` and `sculptVelocity` equations (with current dynamically evaluated curve positions). At each lattice plaquette, take the sum of four wrapped `atan2(v_y,v_x)` edge differences and divide by 2π. Reject cells with near-zero nodal speed or unresolved noninteger winding. A valid charge +1 indicates a winding center (including **both** clockwise and counterclockwise rotation); −1 is characteristic of a saddle-type director defect. This is **not vorticity sign**, a material defect in all 3D slices, a mesh handle count, or genus. A negative index is not just a clockwise vortex. Up to six detected feature centers are projected through the actual scene camera to a tiny optional read-only chromatic halo using existing palette colors, never an independently invented palette. Screen-space distance only controls cosmetic width of the measured marker, not its index. The diagnostic is recomputed at most every ~650 ms and only when the defect slider is above zero; sampling is disabled when there are no authored curves/anchors. It adds no extra GPU framebuffers or simulation passes. The UI reports number of resolved indices and explicitly identifies z=0 and the sampling grid. Fluid vortices between sample nodes, merged defects and small ambiguous cores can be missed, so zero reported defects does not certify topologically trivial continuous flow.

### Reversibility and QA

All new visual controls are opt-in and default to the original appearance. Optics grading is not a way of editing density, sculpture forces or mathematically true surface topology. Color and winding options do not modify the original named palette definitions, simulation state or saved family DNA. Both `PigmentField.snapshot/restore` and `GPUPigmentTransport.snapshot/restore/reset` clone color state. GPU Reset now also restores nursery archive data and parent source IDs from the CPU source, correcting a preexisting inconsistency. The lens and curve transforms use existing bounded snapshot Undo/Redo and revert interrupted touch operations. Full fidelity output of the WebGL shader, precision/cost of the OKLab gamut search, edge gestures on iPhone, OLED color range, and FPS require actual Safari device testing; V8 mocked tests do not prove mobile visual behavior. The earlier high-res GIF/MP4 and complete MATHEMAGICAL palette vault remain separate work.

## Phase 01R — Elastic Strand Puppet: locality-aware 3D source edits

The Draw Flow viewport offers three mutually exclusive **grab intents**: Elastic Tug (default), Move Whole Strand, and Edit Control Points. Selection of the tool is explicit, because the 20 px handle hitboxes of the older phase would otherwise intercept practically every direct line grab on narrow phone screens. A single screen-space curve hit now returns the actual **normalized world-arclength contact position** and 3D hit location; the picker rejects invisible segments and positions farther than 27 screen pixels from a projected curve. No invisible canvas or separate screenshot layer is touched.

The pure function `bendForceCurve` in `src/elastic-strand.js` takes a frozen 3D curve, arclength parameter, accumulated world-space drag, Reach and Tension. It displaces each existing control point according to a bounded Gaussian `exp(-0.5*((s-contact)/reach)^2)`, where `s` is normalized cumulative 3D arclength. The resulting real control geometry stays inside [-0.93,0.93]³; the original curve type, force influence radius and strength stay fixed. Short two- or three-point genetic curves expand through the existing `resampleStroke` function to no more than eight 3D points. This is **local Gaussian curve deformation**, not a full continuum-mechanics elastic solver. The 2×8 velocity-curve CPU and GLSL limits remain unchanged.

The artist can now pull a small neighborhood (small Reach), most of a strand (large Reach), or simply select Move Whole Strand and retain previous translation behavior. For exact dot-position edits, choose Edit Control Points; two-finger twist and influence-width pinch still work regardless of one-finger grab intent. The canvas uses the preexisting one-stroke GPU/CPU snapshot, hence pointer release is one Undo step, while pointer cancellation, lost capture, blur/hidden tab and Escape restore the old curve and material. The existing GPU transport reads the modified underlying curve geometry on subsequent steps; no shader-source modification or extra volume buffer is involved. Saved pigment, fiber and fold states are never reset as a side effect of this gesture.

**Verification:** pure screen-hit, local-vs-global bending, parent DNA immutability, two-point resampling, bound checks, and DOM wiring are covered in `tests/elastic-strand.test.js`; targeted JavaScript smoke checks passed. The complete `node --test` suite, browser/WebGL rendering and iPhone Safari gestures have not been executed in this connector-only editing session. Netlify was not manually invoked; a separately enabled GitHub-to-Netlify automatic deployment can still be triggered by changes pushed to `main`.

## Phase 01S — Gesture Afterlife: persistent chromatic traces in the real fluid

**Mechanism:** The user’s movement writes additional material into the *same* existing three-channel 28³ pigment volume used by Filament Forge, Inject Pigment, and raymarched lighting. A gesture trail is not a CPU canvas trick, a glow overlay or a new volume. After the finger lifts, the added pigment remains in the current state and is advected by the existing velocity field, interacting with its fold-memory and fiber-guided transport. Concentration naturally diffuses and slowly fades: “afterlife” means continued material evolution, not unbounded permanent persistence.

**Palette logic:** RGB here means three abstract *dye channels*, which the existing renderer maps through the current three-color palette. A deterministic world-arclength phase produces Prism Chase (shifting chromatic peaks), Staccato (alternating dominant dye channels), Aurora (soft blended bands), or Ghost (weaker residues). Strength and Width control actual material dose and radius. On-screen colors follow the current palette without hardcoded color stops, and the final optional Neon Lens remains a separate post-render treatment.

**Gesture integration:** Stir mode starts with one small dye seed on pointerdown and adds samples along movement in world space. “All” also applies to one-finger Draw Flow edits and Sculpt anchor dragging; no mark is made by camera Orbit, Neon Lens, two-finger pinch, or the original Inject Pigment tool. The artist can turn touch trails Off to restore the original Stir flow without new dye. A per-gesture sampler maintains length-based spacing across pointermove events and caps an individual event at 12 deposits. Large teleports downsample to avoid locking up the GPU queue rather than claiming gapless continuity through physically impossible jumps.

**CPU/GPU parity:** `PigmentField.stampRGB` adds three Gaussian-like bounded radial dye doses to CPU volume cells. `GPUPigmentTransport.stampRGB` adds an RGB triplet to its existing 16-stamp shader queue. The existing transport steps process queued dabs; any remaining dabs flush through the existing zero-time transport path before recording the completed gesture snapshot. This does not grow new Filament Forge material on a zero-time flush. Undo/Redo checkpoints hold the actual modified volumes, while interrupted gestures restore the old state and clear pending GPU stamps. No new textures, additional volume passes per fixed simulation step, or changes to preexisting GLSL shader source are introduced. Flushing many queued stamps can still require extra existing slice passes, especially during rapid gestures; benchmark on iOS Safari before declaring performance solved.

**Scope/QA:** Node regression tests in `tests/gesture-afterlife.test.js` cover color weights, target behavior, sample spacing, sample budget, actual CPU RGBA volume mutation/reversal, and GPU/UI contracts. Pure JS and static smoke checks ran during authoring. Full Node test suite, real WebGL2 shader compile and iPhone gesture reliability are not yet tested. Work stays on a separate feature branch so main is not changed by this phase; deployment services may still react to branch pushes if automatic branch builds are configured.
