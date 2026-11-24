# Asset attributions

Geometry, textures and the environment are generated locally at build/run time or committed as files under
`public/` (Blender-built GLBs, the prefiltered `.env`, the font and the logo); no CDN or other external
resource is loaded while the application runs.

| Asset | Source | License / note |
| --- | --- | --- |
| CCP chamber geometry (all parts) | Procedural generators in `src/geometry/chamberParts.ts` driven by `config/geometry/ccp-pecvd-300-v1.json` | Project code. Dimensions are assumed representative values, not vendor data. |
| Remote ICP PECVD, STI CMP, OHT and FOUP geometry | Procedural generators in `src/equipment/*/parts.ts` and `src/geometry/sharedParts.ts` driven by `config/geometry/remote-icp-pecvd-300-v1.json`, `sti-cmp-rotary-300-v1.json`, `oht-bay-v1.json` | Project code. Assumed representative values, not vendor data. |
| Brushed / machined / ceramic normal maps, roughness variation | `src/materials/proceduralTextures.ts` (seeded hash noise) | Project code |
| Cleanroom environment (IBL) | `src/materials/environment.ts` generates an RGBE `.hdr` panorama in memory | Project code |
| Plasma volume shader (CCP electrode gap, Remote source tube and afterglow) | `src/plasma/shaders/plasma.glsl.ts`, `plasma.wgsl.ts` | Project code, illustrative approximation |
| Schematic overlays (gas path, source/precursor traces, slurry, optical path, rail frames, measurement markers) | `src/interaction/gasPathOverlay.ts`, `src/equipment/*/effects.ts`, `src/scene/measurementOverlay.ts` | Project code, illustrative |
| Current-bay process interiors (Producer cell A / B, Tactras PM-01, CELLESTA PM-01, handling stations) | Procedural generators in `src/equipment/{producer,tactras,cellesta}/parts.ts`, `src/equipment/handling/*` driven by `config/geometry/producer-se-twin-v1.json`, `tactras-oxide-rie-v1.json`, `cellesta-i-md-v1.json` | Project code. Representative configurations, not OEM CAD. |
| Equipment exteriors and the CLW-08v2 vehicle shell (GLB) | Built by `scripts/blender/` with Blender 4.5.16 LTS from `assets/source/envelopes/*.json`; editable sources `assets/source/blender/*.blend`; runtime files `public/models/*.glb` | Project code / project-made assets. Silhouettes informed by public product images (see below); no OEM model, photo, logo or graphic is contained. |
| Normal map for painted panels | ambientCG "Plastic010" (1K-JPG, `Plastic010_1K-JPG_NormalGL.jpg`), https://ambientcg.com/view?id=Plastic010, by Lennart Demes (ambientCG) | CC0 1.0 (https://docs.ambientcg.com/license/). Modification: only the NormalGL map is used, downscaled to 512 px inside the Blender build; colour and roughness maps are not used. Source kept in `assets/source/textures/Plastic010/`. |
| Normal map for stainless / aluminium | ambientCG "Metal012" (1K-JPG, `Metal012_1K-JPG_NormalGL.jpg`), https://ambientcg.com/view?id=Metal012, by Lennart Demes (ambientCG) | CC0 1.0. Modification: NormalGL only, downscaled to 512 px, low strength (0.05-0.08); colour / roughness / metalness maps are not used. Source in `assets/source/textures/Metal012/`. |
| Indoor environment (IBL) | Poly Haven "White Studio 05" (2K HDR), https://polyhaven.com/a/white_studio_05, by Grzegorz Wronkowski | CC0 1.0 (https://polyhaven.com/license). Modification: prefiltered to a Babylon `.env` (256 px, specular mips + SH) by `npm run assets:env` -> `public/env/white_studio_05.env`. Source `assets/source/hdri/white_studio_05_2k.hdr`. The procedural panorama below remains the fallback. |
| Icons | `lucide-react` 1.70.0 | ISC license (npm package) |
| Asset tools (dev only) | `@gltf-transform/{cli,core,extensions,functions}` 4.5.1 (MIT), `gltf-validator` 2.0.0-dev.3.10 (Apache-2.0), Blender 4.5.16 LTS (GPL; used as a tool, not shipped) | Build-time tools; not part of the runtime bundle |
| UI font | Pretendard Variable v1.3.9 (orioncactus/pretendard), subset to Latin and KS X 1001 Hangul: `public/fonts/PretendardVariable.subset.woff2` | SIL Open Font License 1.1, `public/fonts/Pretendard-OFL.txt` |
| SK hynix logo | Official logo image from www.skhynix.com (`/img/common/img_logo_m.png`), unmodified: `public/brand/sk-hynix-logo.png` | SK hynix trademark, used to identify the company; not covered by the project license |
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

Current bay (2026-11-24, public pages consulted for outline / platform description only; reference images were
viewed locally and are not redistributed):

- Tokyo Electron, Tactras product page, https://www.tel.com/product/tactras.html: rectangular cluster, 300 mm, 1-6 chambers, dielectric / conductor / RIE applications.
- Tokyo Electron, CELLESTA product page, https://www.tel.com/product/cellesta.html: CELLESTA-i MD single-wafer clean, chamber atmosphere control, IPA dispenser, chemical recycle.
- Daifuku, Eco products page, https://www.daifuku.com/sustainability/ecoproducts/: Cleanroom transport system Cleanway, model CLW-08v2 (lighter, motor control upgraded, 200 -> 300 m/min).
- Applied Materials, Producer CVD page (HTTP 403 when fetched on 2026-11-24, not consulted) and 2001 report link (platform naming only): Producer, Twin-Chamber, SE.
