# Architecture — boundaries of Provider / Clock / State / Command

## Layers (Frontend, V1)

| Layer | Path | Responsibility |
| --- | --- | --- |
| app / UI | `src/app/**` | React + Tailwind panels. Reads the Zustand store; never touches Babylon objects except through `SceneHost`'s public API (timeline `clock`). |
| domain | `src/domain/**` | Asset identity (`assetId`, `nodeKey`), hierarchy (assembly), topology (ports/connections), sensors (instrument / channel / measurement point / binding), instances (JSON config). |
| config | `config/**`, `src/config/geometry.ts` | Versioned geometry config + validation + derived layout (`deriveChamberLayout`). Visual scenario and instance seeds are JSON. |
| geometry | `src/geometry/**` | Pure procedural mesh generators (no Babylon dependency except `meshlib/toBabylon.ts`). Sector-aware (cutaway) builders. |
| materials | `src/materials/**` | Procedural textures, in-memory HDR environment, shared PBR presets + per-instance x-ray variants. |
| plasma | `src/plasma/**` | `PlasmaVolume` ShaderMaterial (GLSL/WGSL), uniforms only updated per frame, never re-created. |
| scene | `src/scene/**` | Engine factory (WebGPU → WebGL2 fallback), `SceneHost` lifecycle, `ChamberInstance`, lighting rig, render pipeline + quality manager, camera presets. |
| interaction | `src/interaction/**` | Picking (metadata → asset), DOM labels, schematic overlays. |
| presentation | `src/presentation/**` | Zustand `PresentationState`, `VisualClock` (presentation_time), scenario evaluator, cutaway resolver. |
| providers | `src/providers/modes.ts` | Mode registry. Only Visual Inspection is available; Simulation/Replay are described as planned. |

## State separation

1. **Domain definition** — template components, ports, connections, sensors (`src/domain`). Immutable at runtime.
2. **Geometry definition** — `config/geometry/ccp-pecvd-300-v1.json` (`geometry_revision`), derived layout, part generators. Changing the config re-derives every placement; invalid combinations are reported by `validateGeometryConfig` (dev warning overlay + unit tests + `npm run validate:config`).
3. **PresentationState** — camera preset/requests, selection/hover, view mode, cutaway sector, x-ray opacity, explode amount, hidden/isolated assets, visual settings (plasma look), overlays, quality, lighting preset, renderer status, low-rate perf/timeline snapshots.
4. **SimulationState** — *not present in V1*. Will be owned by the Operational Backend (FastAPI + FSM + SimPy + physics) and delivered as snapshots.
5. **Measurement** — definitions only (`src/domain/sensors.ts`); every `ChannelBinding.source === "unbound"`. No observations are fabricated.

Visual manipulation (camera, cutaway, explode, glow) never writes to 2, 4 or 5.

## Clocks

| Clock | Owner | V1 |
| --- | --- | --- |
| `presentation_time` | `VisualClock` in `SceneHost` (monotonic `performance.now()` deltas, speed, loop, scrub). Hidden-tab or stall gaps are clamped to 100 ms per tick so the playhead never jumps. Pausing freezes effect time and the scripted sequence; camera/selection/cutaway remain interactive. | implemented |
| `simulation_time` | Operational Backend (physics/FSM/DES/sampling) | planned |
| `replay_time` | Recorded run playback (read-only) | planned |

Scenario evaluation is `f(time, visual_seed)` (`src/presentation/scenario.ts`); plasma noise is `f(time, seed, position)` in the shader. No per-frame random numbers, so pause/scrub reproduce the same frame.

## Commands

V1 has no backend command service. View commands (camera, cutaway, explode, visual settings) are store actions and are explicitly not operational commands. Future operational commands (`command_id`, `run_id`, `target_asset_id`, `action`, `payload`) go through the backend command service described in `docs/data-contract.md`.

## Renderer lifecycle

```
SceneHost.mount(container)
  ├─ createCanvas → tryCreateWebGPU (IsSupportedAsync + initAsync) or tryCreateWebGL2
  ├─ buildWorld: Scene, ArcRotateCamera, HDR env (in-memory), textures, MaterialLibrary,
  │   LightingRig (key + fill + headlamp + explicit plasma point light), ChamberInstance(s),
  │   DepthRenderer (camera-space Z, opaque meshes only), RenderPipeline (FXAA/MSAA/ACES, SSAO2 via geometry buffer),
  │   HighlightLayer, PickingController, LabelsOverlay, overlays, ResizeObserver
  ├─ scene.whenReadyAsync + plasma forceCompilationAsync  → failure on WebGPU ⇒ one-shot fallback:
  │   teardownWorld, engine.dispose, canvas.remove, new canvas, WebGL2, buildWorld (no retry loops)
  └─ store.subscribe(applyState) + runRenderLoop(renderFrame)
```

React `Viewport` mounts the host once; StrictMode double-invocation is handled by `dispose()` cancelling an in-flight mount. The debug API (`window.__pecvdTwin`) exposes `setCamera`, `freezeTime`, `stats`, `logs`, `store` for QA scripts.

## Per-instance isolation

Each `ChamberInstance` owns its `TransformNode` tree, meshes, cap meshes, `PlasmaVolume` and overlays. Shared materials are never mutated: x-ray swaps meshes to cached transparent clones; cutaway regenerates vertex data in place for sector parts and toggles azimuth-attached parts. The two-chamber fixture (`?fixture=two-chambers`) verifies that cutaway/x-ray/explode/selection apply to the active instance only.

## Resource ownership

- Shared: `MaterialLibrary` materials/textures, `ProceduralTextureSet`, HDR environment (disposed by `SceneHost.teardownWorld`).
- Per instance: meshes, nodes, plasma material, overlay materials (disposed by `ChamberInstance.dispose`).
- Lazily created but bounded: x-ray material variants (one per base material), SSAO2 pipeline (created once, attached/detached). The e2e test "repeated mode/preset/reset cycles do not accumulate scene resources" asserts the second cycle adds nothing.
