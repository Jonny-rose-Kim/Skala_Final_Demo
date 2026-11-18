# Asset attributions

All runtime assets of PECVD FAB Twin V1 are generated locally at build/run time. No external HDRI, texture,
model, font or CDN resource is loaded while the application runs.

| Asset | Source | License / note |
| --- | --- | --- |
| CCP chamber geometry (all parts) | Procedural generators in `src/geometry/chamberParts.ts` driven by `config/geometry/ccp-pecvd-300-v1.json` | Project code. Dimensions are assumed representative values, not vendor data. |
| Remote ICP PECVD, STI CMP, OHT and FOUP geometry | Procedural generators in `src/equipment/*/parts.ts` and `src/geometry/sharedParts.ts` driven by `config/geometry/remote-icp-pecvd-300-v1.json`, `sti-cmp-rotary-300-v1.json`, `oht-bay-v1.json` | Project code. Assumed representative values, not vendor data. |
| Brushed / machined / ceramic normal maps, roughness variation | `src/materials/proceduralTextures.ts` (seeded hash noise) | Project code |
| Cleanroom environment (IBL) | `src/materials/environment.ts` generates an RGBE `.hdr` panorama in memory | Project code |
| Plasma volume shader (CCP electrode gap, Remote source tube and afterglow) | `src/plasma/shaders/plasma.glsl.ts`, `plasma.wgsl.ts` | Project code, illustrative approximation |
| Schematic overlays (gas path, source/precursor traces, slurry, optical path, rail frames, measurement markers) | `src/interaction/gasPathOverlay.ts`, `src/equipment/*/effects.ts`, `src/scene/measurementOverlay.ts` | Project code, illustrative |
| Icons | `lucide-react` 1.70.0 | ISC license (npm package) |
| 3D engine | `@babylonjs/core` 9.34.0, `@babylonjs/loaders` 9.34.0 | Apache-2.0 |
| UI | React 19.3.1, Tailwind CSS 4.3.5, Zustand 5.1.0 | MIT |

## Reference material (structure only)

Consulted for the arrangement, connection and contact relations of the representative structures. No CAD,
dimensions, recipes, measured values or product specifications were taken from any of them, and nothing in
this project claims to reproduce a specific product.

- Oxford Instruments, PECVD and ICPCVD technology overviews: direct CCP electrode / heated substrate relation; the ICP label alone does not imply a remote discharge.
- Park and Rhee (2004), "Low temperature silicon dioxide film deposition by remote plasma enhanced chemical vapor deposition: growth mechanism", Surface and Coatings Technology, DOI 10.1016/S0257-8972(03)00852-1: ICP remote excitation with downstream precursor injection (structure only).
- Lucovsky et al. (1989), "Formation of thin film dielectrics by remote plasma-enhanced chemical-vapor deposition", Applied Surface Science, DOI 10.1016/0169-4332(89)90418-2: reaction-region separation in classic remote PECVD (structure only).
- Advanced Energy MAXstream remote plasma source page: remote sources are also used for chamber cleaning; not reproduced here.
- Applied Materials CMP overview and Reflexion LK product page: face-down polishing, backside downforce, window-in-pad endpoint, post-polish clean/rinse/dry (structure only).
- EBARA technical capability table (polish, cleaning, end point detector): pad / slurry / dresser relation and dry-in dry-out zones (structure only).
- Applied Materials / MIT (1998), "Planarization and Integration of Shallow Trench Isolation": STI process context, oxide removal with nitride stop and trench oxide preserved; historical dimensions were not reused.
- Muratec Clean Factory Automation and Daifuku Cleanway pages: rail vehicle, hoist, FOUP and load port relation (structure only).
- SEMI E84 public scope and GEM300 tutorial overview: scope of carrier handoff, carrier management and substrate tracking; nothing of these standards is implemented or claimed compliant.
- SMC CMP force control page: pneumatic regulator / pressure switch roles (measurement role only).
- SEMI M1 300 mm wafer standard: diameter 300 mm, thickness 775 µm.
- Babylon.js documentation (PBR, ShaderMaterial, WebGPU/WGSL, clip planes) and MDN HTMLCanvasElement.getContext.
