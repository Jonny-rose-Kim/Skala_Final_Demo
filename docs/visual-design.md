# Visual design — materials, lighting, plasma, view modes, quality

## Materials (`src/materials/materialLibrary.ts`)

Metallic-roughness PBR, shared per scene. Presets:

| Ref | Use | Look |
| --- | --- | --- |
| `aluminum_machined` | body, lid, flanges, showerhead, pedestal, stem | albedo 0.86, metallic 1, roughness 0.36, fine brushed/turning normal map (UV in meters → turning marks follow the lathe), roughness variation via metallic texture G channel |
| `aluminum_anodized` | liner, pumping baffle | darker, roughness 0.62, machined normal |
| `stainless` | pipes, valves, fittings, shaft, bellows | roughness 0.30, fine brushed normal |
| `painted_housing` | matching network, gas panel, pump, generator, frame | non-metal 0.62 grey, roughness 0.5 |
| `ceramic` | isolator ring, bushing, edge insulator, edge ring, lift pins, gas isolator | off-white, speckle normal |
| `quartz` | viewport window | alpha 0.28 blend, roughness 0.04, IOR 1.46 |
| `silicon_wafer` | wafer | dark (0.17) polished metal-like, roughness 0.18, reduced environment intensity (IBL cannot see the faceplate occluding the ceiling) |
| `copper` / `nichrome` / `dark_steel` | RF strap, heater element, bolts/sockets/cables | — |
| section caps | cutaway faces | albedo × 0.3, roughness 0.85, non-metal |

X-ray variants are lazy clones (alpha blend, depth pre-pass, bump/roughness textures removed) cached per base material; opacity is a presentation setting.

## Lighting (`src/scene/lighting.ts`, `src/materials/environment.ts`)

- IBL: procedural cleanroom RGBE panorama (ceiling light-panel grid, neutral walls, dark floor) generated in memory and prefiltered by `HDRCubeTexture`. Environment intensity 0.75 (exterior) / 0.9 (inspection).
- Key directional light with PCF shadows (2048/1024 map, `forceBackFacesOnly`, bias 0.0015, normal bias 0.02), hemispheric fill.
- Inspection preset adds a camera-following point light ("headlamp") and lowers the key light.
- Plasma glow on surfaces = explicit point light at the volume center (intensity ∝ scenario intensity × glow, color = preset core color) restricted to nearby interior meshes. This is a lighting approximation, not radiative transfer.
- Post: `DefaultRenderingPipeline` (HDR) with FXAA + MSAA, ACES tone mapping, exposure 0.88, contrast 1.05. No bloom, lens flare, motion blur, chromatic aberration or depth of field by default. SSAO2 (geometry buffer, mild) on High.
- Background: unlit backdrop sphere so WebGL2 and WebGPU produce the same tone-mapped background.

## Plasma volume (`src/plasma/**`)

- Proxy cylinder = electrode radius + halo margin, height = electrode gap exactly (never overlaps wafer or faceplate).
- Inside faces rendered (winding flipped + back-face culling), depth test disabled, depth write off, premultiplied alpha blend, `alphaIndex -10` (before glass and x-ray shells).
- Fragment: analytic ray/cylinder intersection → [t0, t1]; `t0 = max(t0, 0)` (camera inside); `t1 = min(t1, opaqueDepth / cos)` from a `DepthRenderer` storing camera-space Z of opaque meshes only (transparent shells, glass, overlays and the plasma excluded). Fixed sample count (48 High / 24 Balanced) with per-pixel interleaved gradient noise jitter (no temporal randomness).
- Density: radial soft falloff (edge softness), axial profile with darker sheath bands near both electrodes (`sheathFraction`, developer setting), mild edge brightening, 3D value noise variation `f(position, time, seed)`.
- Cutaway: the resolved removed sector is applied per sample (`atan2`), matching the geometry caps exactly.
- GLSL (WebGL2) and WGSL (WebGPU) sources have identical uniform semantics; writing WGSL natively avoids the twgsl WASM download. Results verified identical in both backends (QA screenshot sets).
- Visual parameters (user panel): visibility, glow intensity, opacity, color preset (named by appearance), edge softness, spatial variation, animation speed, visual seed, plasma light toggle. Developer settings: sheath fraction, halo margin. No parameter is named after a physical quantity.
- `render_source = "illustrative"`; the Inspector entry for the plasma states this and the scripted sequence source.

## Scenario (`config/visual/illustrative-cycle-v1.json`)

Off (0–1.5 s) → Ignition illustration (1.5–4 s: deterministic pre-breakdown flashes then rise) → Stable (4–14 s: ±2.5 % slow modulation) → Extinction illustration (14–16.5 s) → Off. Timeline supports play/pause/restart/scrub/phase jump/loop/speed. Everything is `f(time, seed)`.

## View modes

| Mode | Implementation |
| --- | --- |
| Assembled | opaque shells; interior visible through the viewport glass; plasma occluded by the depth texture |
| Cutaway | sector geometry regeneration + caps (debounced 90 ms), azimuth hiding, analytic plasma clip; adjustable azimuth/sweep with port snapping |
| X-ray | per-instance transparent material variants for shell assets; interior and plasma readable; opacity slider |
| Exploded | display offsets on per-asset transform nodes (explode amount 0–1); plasma hidden; gas line / RF strap / coax hidden; exact return at 0 |
| Component inspection | focus (camera interpolation to asset bounds), isolate, hide/show, highlight layer (plasma/overlays excluded from the stencil) |

Camera presets: overview, side cutaway, wafer close-up, showerhead underside (exploded, camera under the lifted faceplate), exploded.

## Quality

| Preset | DPR cap | MSAA | plasma steps | shadow map | SSAO |
| --- | --- | --- | --- | --- | --- |
| High | 2.0 | 4 | 48 | 2048 | on |
| Balanced | 1.25 | 2 | 24 | 1024 | off |

Auto: EMA frame time > 26 ms for 2.5 s → Balanced; < 11 ms for 6 s → High; at most one switch per 8 s; stalls > 250 ms ignored. Shader/GPU resources are not re-created on preset changes (uniform + RTT size updates only).

## Overlays (optional)

- Gas path: thin unlit tubes with arrow cones moving at `presentation_time`, routed through real openings (feed tube bore, faceplate, pedestal edge, baffle slots, exhaust port). Schematic only.
- Assembly labels: DOM labels, priority overlap pruning, low-rate ray occlusion test.
- Sheath concept region: translucent rings near both electrodes; labelled as concept, not a computed boundary.
