# Geometry assumptions — representative single-wafer CCP PECVD chamber

Source kind: **assumed**. All values are consistent representative choices for a 300 mm direct parallel-plate PECVD
chamber. They are not measurements of any vendor's equipment. Config: `config/geometry/ccp-pecvd-300-v1.json`
(`geometry_revision: ccp-pecvd-300-v1.1.0`). Derived placements: `src/config/geometry.ts` (`deriveChamberLayout`).

## Coordinate system

- Internal unit **meter**; UI shows mm (`mmText`).
- **+Y up**, **left-handed** (Babylon default, `scene.useRightHandedSystem = false`).
- Origin: chamber axis at the inner floor top surface (y = 0).
- Azimuth φ (deg) from +X toward +Z: position = (r cos φ, y, r sin φ). `ArcRotateCamera.alpha` uses the same convention.
- glTF/GLB (right-handed) is converted by Babylon's loader; procedural geometry is authored directly in the scene frame. A GLB replacement must keep each component under the same `assetId`/`nodeKey` (see `assets/manifests/ccp-pecvd-300.manifest.json`).

## Structure (design decisions)

- Upper electrode = RF-powered perforated showerhead faceplate; gas plenum between faceplate and backing plate with a central blocker plate.
- Lower electrode = heated pedestal/susceptor, grounded (no separate lower RF bias in this template).
- Showerhead assembly suspended from the lid through a ceramic isolator ring; RF stem passes through a ceramic feedthrough bushing in the lid bore; a ceramic edge insulator surrounds the electrode perimeter. The powered electrode never touches the grounded enclosure directly.
- Gas: panel → 1/2" line → feed tube (with ceramic isolator section) inside the RF stem → plenum → blocker → faceplate holes → wafer region → outward past the pedestal edge → slotted pumping baffle → exhaust plenum → side exhaust port → throttle valve → elbow → isolation (gate) valve → foreline → dry pump.
- Access: side slit valve at wafer transfer height (pedestal lowered), viewport at the electrode-gap height, pressure tap with a capacitance manometer, pedestal thermocouple through the shaft.
- ICP coils/domes, remote plasma sources or lower-bias configurations are intentionally not mixed in; they belong to separate future templates.

## Key dimensions (assumed)

| Item | Value |
| --- | --- |
| Wafer | Ø300 mm × 0.775 mm (SEMI 300 mm standard thickness) |
| Electrode gap (faceplate bottom ↔ wafer top) | 20 mm (common production range 10–25 mm; chosen for readability) |
| Showerhead faceplate | Ø340 × 12 mm, holes Ø1.2 mm, pitch 5.5 mm (polar array), pattern Ø310 mm |
| Plenum | 12 mm high, Ø316 mm; backing plate 22 mm; blocker plate Ø140 × 3 mm |
| Isolator ring (ceramic) | Ø280/Ø344, 23.2 mm high (backing plate top → lid underside) |
| Edge insulator (ceramic) | 12 mm thick around the showerhead perimeter |
| RF stem | Ø56/Ø40 through lid bore Ø80 filled by the ceramic bushing |
| Chamber body | inner Ø520, wall 35 mm, inner height 240 mm, floor 40 mm, top flange Ø660 × 40 mm |
| Lid | Ø670 × 50 mm, 24 bolts on Ø630, o-ring groove Ø600 |
| Liner | 4 mm anodized Al, 6 mm clearance, y 82–232 mm |
| Pedestal | Ø340 × 45 mm, process top y = 150 mm, transfer top y = 100 mm, shaft Ø70, heater cavity Ø70–300 × 16 mm (7 ring elements), 3 lift pins on Ø210 (12 mm stroke) |
| Edge ring (ceramic) | Ø302/Ø340 × 3 mm |
| Pumping baffle | Ø350/Ø498, 4 mm thick at y = 75 mm, 36 slots (42% open) |
| Slit | 360 × 50 mm, center y = 112 mm, azimuth 180° (transfer wafer plane y = 112.8 mm passes through it) |
| Viewport | bore Ø60, window Ø80 × 8 mm quartz, azimuth 45°, center y = 161 mm |
| Pressure tap | bore Ø16, azimuth 120°, y = 125 mm |
| Exhaust port | bore Ø64, azimuth 320°, y = 40 mm (below the baffle) |

## Validation rules (enforced)

`validateGeometryConfig` fails on: wafer not supported by the pedestal, non-positive gap, showerhead touching the liner,
hole pattern outside the faceplate, isolator height < 8 mm, stem not fitting the bushing, gas tube not fitting the stem,
pedestal not passing through the baffle, baffle intersecting the liner, slit outside the liner span or below the baffle,
transfer plane outside the slit opening, exhaust above the baffle, bolt circle off the flange, o-ring groove off the lid face.
Warnings cover unusual gaps and overlapping port keep-outs. Results surface in the dev overlay, `npm test`, `npm run validate:config`.

## Cutaway sector

The cutaway is real geometry, not a clip plane: revolved parts are regenerated over the kept angular range with planar
section caps (dark matte "section" material) so wall thickness reads correctly; azimuth-attached parts are hidden when
their azimuth is inside the removed sector. Sector boundaries are snapped out of port keep-out intervals
(`src/presentation/cutaway.ts`) so a port is either fully removed or fully kept; the UI shows the effective angles.
The plasma shader receives the same resolved sector and clips analytically.

## Reproducibility

`node --import tsx scripts/export-geometry-obj.ts` writes every part (assembled state) as OBJ with a manifest, for
inspection or Blender refinement. Blender is not installed in the verification environment, so no Blender-authored asset
is claimed; the procedural path is the shipped asset.
