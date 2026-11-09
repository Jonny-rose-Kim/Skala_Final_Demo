# Status — Visual Milestone V1 (2026-11-09)

## Scope delivered

Frontend-only Visual Inspection of a representative single-wafer CCP PECVD process chamber. No backend, no sensor data,
no physics model. Everything below was executed in this environment (Ubuntu 22.04, i7-14700F, RTX 4070 SUPER, Chrome 148).

| V1 requirement | State | Evidence |
| --- | --- | --- |
| Frontend loads chamber + core features without backend | done | e2e "loads the chamber without a backend", `npm run dev` |
| Showerhead / upper electrode / insulators / wafer / pedestal / gate / exhaust / body distinguishable | done | 35 selectable assets, 63 generated parts, screenshots 02/03/06/10 |
| 3D picking ↔ tree ↔ inspector same semantic asset (metadata based) | done | e2e "3D pick, tree and inspector point to the same asset" |
| Cutaway / X-ray / Exploded switch and restore | done | e2e "view modes switch and restore", screenshots 02–07 |
| Plasma occluded by opaque parts, never through electrodes/wafer | done | depth-texture termination + exact volume bounds; screenshots 03/08, debug mode `?plasmaDebug=depth` |
| Plasma depth from side / oblique / close-up | done | screenshots 02/03/07/08 (same on WebGL2 and WebGPU) |
| Play / Pause / Restart / Scrub, camera usable while paused | done | e2e "timeline …" |
| Visual settings create no sensor values / runs / commands | done | e2e "visual settings never create sensor data or backend calls" (no /api or ws requests) |
| No fake sensor values or live indicators without backend | done | every channel "Unbound / 연결된 데이터 없음"; modes Simulation/Replay marked unavailable |
| Force WebGL2 keeps all features | done | `?renderer=webgl2`; whole e2e suite runs in the `chrome-webgl2` project |
| Repeated view/preset/reset without resource accumulation | done | e2e "repeated mode/preset/reset cycles do not accumulate scene resources" |
| Assumed geometry / illustrative effect provenance shown consistently | done | inspector badges, empty-state note, plasma inspector entry |
| Second chamber instance fixture, per-instance effects | done | `?fixture=two-chambers`, e2e "two-chamber fixture …" |

## Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` (`tsc -b`, app + node + test projects) | pass |
| `npm test` (Vitest) | 34 tests pass — geometry config/template/sensors, mesh library (winding consistency, caps, ported shell, perforated disc), chamber parts (assembled + cut), cutaway resolver (all azimuths/sweeps), visual clock, scenario determinism |
| `npm run test:e2e` (Playwright, system Chrome, headed) | 16 tests pass: 8 × `chrome-webgl2`, 8 × `chrome-webgpu` |
| `npm run build` | pass (dist ≈ 2.1 MB JS, 536 kB gzip main chunk) |
| `npm run validate:config` | 0 errors, 0 warnings |
| Interaction QA (`qa/interaction.mjs`) | 12/12 pass on WebGL2 and 12/12 on WebGPU (renderer badge confirmed), 0 console errors |
| Console errors in any QA run | 0 (one transient Vite "Outdated Optimize Dep" 504 after adding imports, not a product error) |

### Review screenshots (fixed camera, frozen visual time 8 s, seed 7, quality High, DPR 1) — `qa/out/<backend>/`

01 assembled plasma off · 02 side cutaway plasma on · 03 oblique wafer/showerhead close-up · 04 showerhead underside (exploded) · 05 exploded plasma hidden · 06 cutaway overview with UI · 07 x-ray · 08 viewport window with plasma glow · 09 exhaust/baffle underside · 10 lid/feedthrough close-up · 11 selection highlight · 12 focus · 13 overlays · 14 two-chamber fixture (default overview frames CH-A; CH-B is only partly in view). Captured for both WebGL2 and WebGPU (11–14 on WebGPU were captured in a follow-up run on 2026-11-09); images are visually identical between backends.

Defects found and fixed during review: black viewport from StrictMode double mount; shadow acne bands; over-exposure; brushed normal too strong; roughness noise bound to the wrong workflow channel; wafer appearing white (IBL); prepass MRT warning with the custom shader (SSAO moved to the geometry buffer); WebGPU scene build failure from unregistered engine extensions (now registered; fallback path was exercised and worked); highlight glow leaking into the plasma proxy footprint (stencil exclusion); different background tone between backends (explicit backdrop); showerhead-underside preset blocked by the pedestal (now uses the exploded state); cutaway snapping collapsing inside a wide port keep-out.

### Performance (headed Chrome, vsync disabled, 1426×992 canvas at DPR 1, quality High unless noted)

| State | WebGL2 | WebGPU |
| --- | --- | --- |
| assembled, plasma off | 490 fps / 2.0 ms | 387 fps / 2.6 ms |
| cutaway, plasma on, overview | 348 fps / 2.9 ms | 286 fps / 3.5 ms |
| cutaway, plasma on, close-up (plasma fills screen) | 350 fps / 2.9 ms | 285 fps / 3.5 ms |
| same, Balanced | 403 fps / 2.5 ms | 330 fps / 3.0 ms |
| x-ray, plasma on | 468 fps / 2.1 ms | 351 fps / 2.9 ms |

With vsync the app holds 60 fps. These are measurements on this RTX 4070 SUPER only; they are not guarantees for other hardware. Cutaway regeneration (all sector parts incl. the 2,500-hole faceplate) takes 45–60 ms and is debounced.

## Not verified / limitations

- macOS (Intel or Apple Silicon) and Safari were not available; only Linux Chrome 148 was tested. WebGPU on this Chrome requires `--enable-unsafe-webgpu --enable-features=Vulkan`; without flags the app correctly falls back to WebGL2.
- Blender is not installed; no Blender-authored GLB exists. The procedural path is the shipped asset; OBJ export exists for refinement.
- Plasma look is a visual approximation only (no field data).
- The cutaway is a sector (azimuth + sweep); an arbitrary offset section plane is not implemented.
- Plasma render resolution follows the global hardware scaling level; a separate half-resolution plasma pass was not needed at measured frame times.

## Preserved existing functionality

This is a new project; there was no existing repository, backend or database to preserve.

## Not implemented (Operational roadmap O1–O5)

Equipment state machine, SimPy queues/recipes, physics adapter, FastAPI/WebSocket, SQLite/Alembic, recording/replay,
fault injection, Simulation/Replay modes, charts. Mode descriptors and type boundaries exist (`src/providers/modes.ts`,
`docs/data-contract.md`); no endpoint is called.

## Next priorities

1. O1 — Integrate the detailed chamber into a PECVD tool (load lock, transfer chamber, two process chambers) with summary rendering for non-selected chambers and instance configuration.
2. O2 — Operational backend skeleton (FastAPI, command service with accepted/applied/rejected, FSM, lumped pressure model, WebSocket snapshots) and a Simulation provider that maps authoritative state to the 3D scene without touching PresentationState.
3. Asset refinement — Blender-based GLB variants for the most visible parts (lid, slit valve, throttle/isolation valves) through the existing manifest, plus optional offset section plane.
