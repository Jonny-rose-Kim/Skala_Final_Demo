# Asset attributions

All runtime assets of PECVD FAB Twin V1 are generated locally at build/run time. No external HDRI, texture,
model, font or CDN resource is loaded while the application runs.

| Asset | Source | License / note |
| --- | --- | --- |
| Chamber geometry (all parts) | Procedural generators in `src/geometry/` driven by `config/geometry/ccp-pecvd-300-v1.json` | Project code. Dimensions are assumed representative values, not vendor data. |
| Brushed / machined / ceramic normal maps, roughness variation | `src/materials/proceduralTextures.ts` (seeded hash noise) | Project code |
| Cleanroom environment (IBL) | `src/materials/environment.ts` generates an RGBE `.hdr` panorama in memory | Project code |
| Plasma volume shader | `src/plasma/shaders/plasma.glsl.ts`, `plasma.wgsl.ts` | Project code, illustrative approximation |
| Icons | `lucide-react` 1.70.0 | ISC license (npm package) |
| 3D engine | `@babylonjs/core` 9.34.0, `@babylonjs/loaders` 9.34.0 | Apache-2.0 |
| UI | React 19.3.1, Tailwind CSS 4.3.5, Zustand 5.1.0 | MIT |

## Reference material (structure only)

- Oxford Instruments, "PECVD" technology overview — representative parallel-plate RF electrode / heated lower electrode structure. No CAD, dimensions or plasma data were taken from it.
- SEMI M1 300 mm wafer standard — diameter 300 mm, thickness 775 µm.
- Babylon.js documentation (PBR, ShaderMaterial, WebGPU/WGSL, GlowLayer, clip planes).

Reference images or documents were consulted for structure only; no internal CAD of any product is claimed.
