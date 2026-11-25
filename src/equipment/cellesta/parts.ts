/**
 * Procedural parts of the CELLESTA-i MD based tool: front end (EFEM, active load port, EFEM robot), the
 * pass station, the corridor transfer robot and the representative single-wafer process module PM-01:
 * splash cup with two collection channels behind a three-level guard, edge-support spin chuck on a spindle,
 * swing dispense arm with chemical / UPW / IPA nozzles and its park position, shutter, supply manifold and
 * filter, drains, exhaust, leak pan and the recycle return line. The cup, guard, chuck and wafer are
 * coaxial with the instance axis, so one sector cutaway opens them. Exterior skins come from the GLB.
 * Liquid colours are distinction overlays (effects), never the colour of a real chemical.
 */
import { DEG, TAU } from "../../config/geometry";
import type { PartGeometry } from "../../geometry/chamberParts";
import { chamferedBox, mergeMeshData, rectProfile, revolveProfile, rotateYMeshData, translateMeshData, tubeAlongPath, type MeshData, type Vec2, type Vec3 } from "../../geometry/meshlib";
import { PartSink, chamfRect, type Mat } from "../../geometry/sharedParts";
import { waferHalfMeshes, waferHalfProfiles } from "../../geometry/waferParts";
import { buildScaraRobotParts } from "../handling/robotParts";
import { EFEM_FLOOR_RAISE, StationGeom, buildEfemParts } from "../handling/stationParts";
import { armAngle, type CellestaLayout } from "./layout";
import { atmSpec, trSpec } from "./robots";
import { CELLESTA_JOINTS as J } from "./sequence";

export function buildCellestaParts(L: CellestaLayout): PartGeometry[] {
  const sink = new PartSink();
  const g = new StationGeom(L.az, sink);
  const fy = L.floorY;
  const fe = L.cfg.front_end;
  const pm = L.pm;
  const t = L.waferThickness;

  // ------------------------------------------------------------------ front end: EFEM shell, active load port, robot
  const ps = fe.pass_station;
  buildEfemParts(g, {
    qc: L.efem.qc,
    lpQ: L.efem.lpQ,
    r0: L.efem.r0,
    r1: L.efem.r1,
    width: L.efem.width,
    floorY: fy,
    topY: L.efem.topY,
    ffuTopY: L.efem.ffuTopY,
    panelT: fe.efem.panel_thickness,
    frameSize: fe.efem.frame_size,
    backHoles: [{ y0: ps.housing_y0 + 0.01, y1: ps.housing_y1 - 0.01, q0: -ps.z - ps.half_z - L.efem.qc, q1: -ps.z + ps.half_z - L.efem.qc }],
    windowY: [fy + 0.9, fy + 1.6],
    loadPort: { ...L.loadPort, couplingPads: L.foup.couplingPads },
  });
  buildScaraRobotParts(sink, atmSpec(L));
  buildScaraRobotParts(sink, trSpec(L));

  // ------------------------------------------------------------------ pass station (wafer buffer with fixed pins)
  {
    const x0 = ps.x - ps.half_x;
    const x1 = ps.x + ps.half_x;
    const z0 = ps.z - ps.half_z;
    const z1 = ps.z + ps.half_z;
    const walls: MeshData[] = [
      chamferedBox([x1 - x0, 0.012, z1 - z0], 0.002, [ps.x, ps.housing_y0 + 0.006, ps.z]),
      chamferedBox([x1 - x0, 0.012, z1 - z0], 0.002, [ps.x, ps.housing_y1 - 0.006, ps.z]),
      chamferedBox([x1 - x0, ps.housing_y1 - ps.housing_y0, 0.012], 0.002, [ps.x, (ps.housing_y0 + ps.housing_y1) / 2, z0 + 0.006]),
      chamferedBox([x1 - x0, ps.housing_y1 - ps.housing_y0, 0.012], 0.002, [ps.x, (ps.housing_y0 + ps.housing_y1) / 2, z1 - 0.006]),
    ];
    sink.fixed("pass_housing", "pass_station", "aluminum_anodized", mergeMeshData(walls), { cutaway: "keep" });
    const pins: MeshData[] = [];
    for (const dr of ps.pin_r) for (const dq of [-ps.pin_q, ps.pin_q]) pins.push(translateMeshData(revolveProfile(chamfRect(0, ps.pin_radius, ps.housing_y0 + 0.012, ps.plane_y, 0.0006), { segments: 12 }), ps.x + dr, 0, ps.z + dq));
    sink.fixed("pass_pins", "pass_station", "polymer_white", mergeMeshData(pins), { cutaway: "keep", castShadow: false });
    const stand = chamferedBox([0.12, ps.housing_y0 - fy - 0.02, 0.12], 0.004, [ps.x, (fy + 0.02 + ps.housing_y0) / 2, ps.z]);
    sink.fixed("pass_stand", "pass_station", "painted_dark", stand, { cutaway: "keep" });
    const w = waferHalfMeshes(L.rWafer, ps.plane_y, t, false, ps.x, ps.z);
    sink.fixed("wafer_pass", "wafer_on_pass", "silicon_wafer", w.back, { cutaway: "keep", castShadow: false });
    sink.fixed("wafer_pass_front", "wafer_on_pass", "wafer_front", w.front, { cutaway: "keep", castShadow: false });
  }

  // ------------------------------------------------------------------ transfer corridor floor and robot plinth
  {
    const c = fe.corridor;
    sink.fixed("corridor_floor", "transfer_corridor", "painted_dark", chamferedBox([c.x1 - c.x0, 0.03, 2 * c.half_z], 0.004, [(c.x0 + c.x1) / 2, fy + 0.015, 0]), { cutaway: "keep", castShadow: false });
  }

  // ------------------------------------------------------------------ PM-01: cup, guard, chuck, spindle, wafer
  {
    const cup = pm.cup;
    const rIn = cup.inner_radius;
    const rOut = rIn + cup.wall_thickness;
    // outer cup: wall with an inward rim, floor with the two channel partition
    sink.sector("cup_wall", "cup", "polymer_gray", chamfRect(rIn, rOut, cup.bottom_y, cup.rim_y, 0.002), { segments: 128 });
    sink.sector("cup_rim", "cup", "polymer_gray", chamfRect(pm.guard.outer_radius + 0.004, rOut, cup.rim_y - 0.01, cup.rim_y, 0.002), { segments: 128 });
    sink.sector("cup_floor", "cup", "polymer_gray", chamfRect(pm.chuck.spindle_radius + 0.012, rOut, cup.bottom_y - cup.floor_thickness, cup.bottom_y, 0.002), { segments: 128 });
    sink.sector("cup_partition", "cup", "polymer_gray", rectProfile(cup.partition_radius - 0.003, cup.partition_radius, cup.bottom_y, cup.partition_top_y), { segments: 128 });
    // inner shroud around the spindle (keeps the motor dry)
    sink.sector("cup_shroud", "cup", "polymer_gray", rectProfile(pm.chuck.spindle_radius + 0.012, pm.chuck.spindle_radius + 0.016, cup.bottom_y, -0.05), { segments: 64 });
    // splash guard: conical lip + cylindrical skirt (moves on the guard joint; authored at the transfer level)
    const g0 = pm.guard.levels.transfer;
    const lip: [number, number][] = [
      [pm.guard.outer_radius, g0 - 0.004],
      [pm.guard.outer_radius, g0 + pm.guard.lip_height - 0.012],
      [pm.guard.inner_radius, g0 + pm.guard.lip_height],
      [pm.guard.inner_radius, g0 + pm.guard.lip_height - 0.006],
      [pm.guard.outer_radius - 0.006, g0 + pm.guard.lip_height - 0.018],
      [pm.guard.outer_radius - 0.006, g0 - 0.004],
    ];
    sink.sector("guard_lip", "cup_guard", "polymer_white", lip, { segments: 128, jointId: J.guard });
    sink.sector("guard_skirt", "cup_guard", "polymer_white", rectProfile(pm.guard.outer_radius - 0.005, pm.guard.outer_radius, pm.guard.skirt_bottom_y + (g0 - pm.guard.levels.transfer), g0 - 0.004), { segments: 128, jointId: J.guard });
    // spin chuck hub with support pins under the wafer edge and edge-guide pins (rotate with the spin joint)
    const ch = pm.chuck;
    const pinTop = -0.0002;
    sink.sector("chuck_hub", "spin_chuck", "polymer_gray", chamfRect(ch.spindle_radius, ch.hub_radius, pinTop - ch.support_pin_height - ch.hub_thickness, pinTop - ch.support_pin_height, 0.002), { segments: 96, jointId: J.spin });
    const arms: MeshData[] = [];
    const pins: MeshData[] = [];
    for (let i = 0; i < ch.support_pin_count; i++) {
      const a = (i / ch.support_pin_count) * TAU;
      const armMd = chamferedBox([ch.edge_pin_radius - ch.hub_radius + 0.012, 0.01, 0.02], 0.002, [(ch.hub_radius + ch.edge_pin_radius) / 2, pinTop - ch.support_pin_height - 0.005, 0]);
      arms.push(rotateYMeshData(armMd, a));
      const sup = translateMeshData(revolveProfile(chamfRect(0, 0.005, pinTop - ch.support_pin_height, pinTop, 0.001), { segments: 12 }), ch.support_pin_radius, 0, 0);
      const edgePin = translateMeshData(revolveProfile(chamfRect(0, 0.003, pinTop - ch.support_pin_height, pinTop + 0.004, 0.0008), { segments: 10 }), ch.edge_pin_radius + 0.003, 0, 0);
      pins.push(rotateYMeshData(mergeMeshData([sup, edgePin]), a));
    }
    sink.fixed("chuck_arms", "spin_chuck", "polymer_gray", mergeMeshData(arms), { cutaway: "keep", jointId: J.spin, castShadow: false });
    sink.fixed("chuck_pins", "spin_chuck", "polymer_white", mergeMeshData(pins), { cutaway: "keep", jointId: J.spin, castShadow: false });
    // spindle shaft (spins) and the drive motor below the cup (fixed)
    sink.sector("spindle", "spindle_drive", "stainless", rectProfile(0, ch.spindle_radius, ch.motor_y1, pinTop - ch.support_pin_height - ch.hub_thickness), { segments: 48, jointId: J.spin });
    sink.sector("motor", "spindle_drive", "painted_dark", chamfRect(0, ch.motor_radius, ch.motor_y0, ch.motor_y1, 0.006), { segments: 64 });
    sink.sector("motor_flange", "spindle_drive", "aluminum_machined", chamfRect(ch.spindle_radius + 0.004, ch.motor_radius + 0.02, ch.motor_y1, ch.motor_y1 + 0.012, 0.002), { segments: 64 });
    // wafer on the chuck support pins (spins with the chuck)
    const w = waferHalfProfiles(L.rWafer, 0, t, false);
    sink.sector("wafer", "wafer", "silicon_wafer", w.back, { jointId: J.spin, segments: 160, castShadow: false });
    sink.sector("wafer_front", "wafer", "wafer_front", w.front, { jointId: J.spin, segments: 160, castShadow: false });
  }

  // ------------------------------------------------------------------ dispense arm (swing) with three nozzles, column, park cup
  {
    const a = pm.arm;
    const pv = a.pivot;
    const armY = a.arm_height;
    const d = L.armRestDir;
    // authored at angle 0 (head over the spin axis): beam from the pivot to the head
    const len = a.length;
    const beam = tubeAlongPath([[pv[0], armY, pv[2]], [pv[0] + d[0] * (len - 0.03), armY, pv[2] + d[1] * (len - 0.03)]] as Vec3[], 0.011, { segments: 14 });
    // nozzle head as in documentary close-ups of single-wafer spin modules: an L bracket around a manifold block,
    // nozzles in one row across the arm, translucent PFA-style tapered tips
    const phi = Math.atan2(d[1], d[0]);
    const hx = pv[0] + d[0] * len;
    const hz = pv[2] + d[1] * len;
    const rowLen = (a.nozzles.length - 1) * 0.015 + 0.03;
    const local = (md: MeshData) => translateMeshData(rotateYMeshData(md, phi), hx, 0, hz);
    const bracket = mergeMeshData([
      local(chamferedBox([0.006, 0.05, rowLen + 0.012], 0.0015, [-0.024, armY - 0.01, 0])),
      local(chamferedBox([0.034, 0.006, rowLen + 0.012], 0.0015, [-0.01, armY + 0.012, 0])),
    ]);
    const manifold = local(chamferedBox([0.02, 0.018, rowLen], 0.002, [-0.004, armY - 0.004, 0]));
    sink.fixed("arm_beam", "dispense_arm", "polymer_white", mergeMeshData([beam, bracket]), { cutaway: "keep", jointId: J.arm });
    sink.fixed("arm_head", "dispense_arm", "stainless", manifold, { cutaway: "keep", jointId: J.arm, castShadow: false });
    const fittings: MeshData[] = [];
    const tips: MeshData[] = [];
    const tipTop = armY - 0.016;
    a.nozzles.forEach((_, i) => {
      const off = (i - (a.nozzles.length - 1) / 2) * 0.015;
      const nx = hx - d[1] * off;
      const nzz = hz + d[0] * off;
      fittings.push(translateMeshData(revolveProfile(chamfRect(0, 0.0055, tipTop, armY - 0.012, 0.0008), { segments: 14 }), nx, 0, nzz));
      const tip = [
        [0, tipTop],
        [0.0045, tipTop],
        [0.0045, tipTop - 0.012],
        [0.0016, armY - a.nozzle_drop],
        [0, armY - a.nozzle_drop],
      ] as Vec2[];
      tips.push(translateMeshData(revolveProfile(tip, { segments: 14 }), nx, 0, nzz));
    });
    sink.fixed("arm_nozzle_fittings", "dispense_arm", "polymer_white", mergeMeshData(fittings), { cutaway: "keep", jointId: J.arm, castShadow: false, lod: "fine" });
    sink.fixed("arm_nozzles", "dispense_arm", "quartz", mergeMeshData(tips), { cutaway: "keep", jointId: J.arm, castShadow: false, isGlass: true });
    const hoses = tubeAlongPath([[pv[0], armY + 0.012, pv[2]], [pv[0] + d[0] * (len - 0.04), armY + 0.016, pv[2] + d[1] * (len - 0.04)]] as Vec3[], 0.006, { segments: 10 });
    sink.fixed("arm_hoses", "dispense_arm", "polymer_gray", hoses, { cutaway: "keep", jointId: J.arm, castShadow: false, lod: "fine" });
    // column + swing drive (fixed)
    const col = translateMeshData(revolveProfile(chamfRect(0, a.column_radius, pm.cup.bottom_y - 0.05, armY + 0.02, 0.003), { segments: 32 }), pv[0], 0, pv[2]);
    const drive = translateMeshData(revolveProfile(chamfRect(0, 0.05, pm.cup.bottom_y - 0.2, pm.cup.bottom_y - 0.05, 0.004), { segments: 32 }), pv[0], 0, pv[2]);
    sink.fixed("arm_column", "dispense_arm_drive", "aluminum_machined", col, { cutaway: "keep" });
    sink.fixed("arm_drive", "dispense_arm_drive", "painted_dark", drive, { cutaway: "keep" });
    // park cup where the parked nozzles drip (outside the process cup)
    const pa = armAngle(L, "park");
    const c = Math.cos(pa);
    const s = Math.sin(pa);
    const pd: [number, number] = [d[0] * c + d[1] * s, -d[0] * s + d[1] * c];
    const px = pv[0] + pd[0] * len;
    const pz = pv[2] + pd[1] * len;
    sink.fixed("park_cup", "nozzle_park", "polymer_gray", translateMeshData(revolveProfile({ outer: chamfRect(0, 0.045, armY - 0.12, armY - 0.06, 0.003), holes: [rectProfile(0, 0.038, armY - 0.112, armY - 0.06)] }, { segments: 32 }), px, 0, pz), { cutaway: "keep" });
  }

  // ------------------------------------------------------------------ shutter (corridor side), supply, drains, exhaust, leak pan, recycle
  {
    const sh = pm.shutter;
    const x0 = pm.box.x0;
    const frame = mergeMeshData([
      chamferedBox([0.03, 0.03, sh.width + 0.08], 0.003, [x0 + 0.015, sh.center_y + sh.height / 2 + 0.015, 0]),
      chamferedBox([0.03, 0.03, sh.width + 0.08], 0.003, [x0 + 0.015, sh.center_y - sh.height / 2 - sh.travel - 0.03, 0]),
      chamferedBox([0.03, sh.height + sh.travel + 0.06, 0.03], 0.003, [x0 + 0.015, sh.center_y - sh.travel / 2, -sh.width / 2 - 0.025]),
      chamferedBox([0.03, sh.height + sh.travel + 0.06, 0.03], 0.003, [x0 + 0.015, sh.center_y - sh.travel / 2, sh.width / 2 + 0.025]),
    ]);
    sink.fixed("shutter_frame", "pm_shutter", "aluminum_anodized", frame, { cutaway: "keep" });
    sink.fixed("shutter_plate", "pm_shutter", "polymer_white", chamferedBox([sh.thickness, sh.height + 0.02, sh.width + 0.02], 0.002, [x0 - sh.thickness / 2 - 0.002, sh.center_y, 0]), { cutaway: "keep", jointId: J.shutter });
    const sup = pm.supply;
    sink.fixed("manifold", "supply_manifold", "polymer_white", chamferedBox(sup.manifold_size, 0.006, sup.manifold_center), { cutaway: "keep" });
    const valves: MeshData[] = [];
    for (let i = 0; i < 3; i++) valves.push(translateMeshData(revolveProfile(chamfRect(0, 0.014, 0, 0.03, 0.002), { segments: 16 }), sup.manifold_center[0] - sup.manifold_size[0] / 2 - 0.0, sup.manifold_center[1] + 0.06 - i * 0.06, sup.manifold_center[2] - sup.manifold_size[2] / 2 - 0.015));
    sink.fixed("manifold_valves", "supply_manifold", "stainless", mergeMeshData(valves), { cutaway: "keep", castShadow: false, lod: "fine" });
    sink.fixed("filter", "supply_filter", "polymer_white", translateMeshData(revolveProfile(chamfRect(0, sup.filter_radius, -sup.filter_height / 2, sup.filter_height / 2, 0.006), { segments: 32 }), sup.filter_center[0], sup.filter_center[1], sup.filter_center[2]), { cutaway: "keep" });
    // three supply lines (chemical / UPW / IPA) from the manifold up the arm column (colours come from materials only)
    const pv = pm.arm.pivot;
    const lines: [string, Mat, number][] = [["supply_chemical", "polymer_gray", -0.02], ["supply_upw", "polymer_white", 0], ["supply_ipa", "stainless", 0.02]];
    for (const [asset, mat, off] of lines) {
      const tube = tubeAlongPath([[sup.manifold_center[0], sup.manifold_center[1] + sup.manifold_size[1] / 2, sup.manifold_center[2] + off], [sup.manifold_center[0], pm.cup.bottom_y - 0.02, sup.manifold_center[2] + off], [pv[0] + 0.03, pm.cup.bottom_y - 0.02, pv[2] + off], [pv[0] + 0.03, pm.arm.arm_height - 0.02, pv[2] + off]] as Vec3[], 0.005, { segments: 10, cornerRadius: 0.03 });
      sink.fixed(asset, asset, mat, tube, { cutaway: "keep", castShadow: false });
    }
    // drains from the two collection channels and the cup exhaust
    const dr = pm.drain;
    for (const [asset, x] of [["drain_outer", dr.outer_x], ["drain_inner", dr.inner_x]] as [string, number][]) {
      const tube = tubeAlongPath([[x, pm.cup.bottom_y - 0.002, dr.z], [x, L.floorY + 0.12, dr.z], [x + 0.3, L.floorY + 0.12, dr.z]] as Vec3[], dr.radius, { segments: 12, cornerRadius: 0.04 });
      sink.clipped(asset, asset, "polymer_gray", tube, null, { castShadow: false });
    }
    const ex = pm.exhaust;
    sink.clipped("exhaust_duct", "cup_exhaust", "polymer_white", tubeAlongPath([[ex.x, pm.cup.bottom_y - 0.002, ex.z], [ex.x, pm.cup.bottom_y - 0.12, ex.z], [pm.box.x1 - 0.06, pm.cup.bottom_y - 0.12, ex.z], [pm.box.x1 - 0.06, pm.box.top_y - 0.05, ex.z]] as Vec3[], ex.duct_radius, { segments: 20, cornerRadius: 0.06 }), null, { castShadow: false });
    sink.fixed("leak_pan", "leak_pan", "polymer_gray", chamferedBox([0.7, 0.04, 0.7], 0.004, [0.05, L.floorY + 0.06, 0]), { cutaway: "keep", castShadow: false });
    // recycle return line toward the rear chemical cabinet (interface only)
    const rec = tubeAlongPath([[dr.outer_x + 0.3, L.floorY + 0.12, dr.z], [L.tool.chemical_cabinet.x0 + 0.02, L.floorY + 0.12, dr.z]] as Vec3[], 0.016, { segments: 12 });
    sink.fixed("recycle_return", "chemical_recycle_interface", "polymer_gray", rec, { cutaway: "keep", castShadow: false });
    void DEG;
  }
  // facility interface on the rear chemical cabinet
  {
    const cc = L.tool.chemical_cabinet;
    sink.fixed("facility_plate", "facility_interface", "stainless", chamferedBox([0.04, 0.7, 0.9], 0.004, [cc.x1 + 0.02, L.floorY + 0.75, 0]), { cutaway: "keep" });
  }
  void EFEM_FLOOR_RAISE;
  return sink.parts;
}
