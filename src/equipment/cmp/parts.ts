/**
 * Procedural parts of the rotary STI CMP template (instance frame, rest pose: head raised at the polish
 * position, conditioner parked angle 0 = innermost sweep, hatch closed). Rotating parts are revolved
 * around their own axis (`axisXZ`) so the same azimuthal sector cutaway opens platen/pad and head alike.
 */
import { DEG, TAU } from "../../config/geometry";
import type { PartGeometry } from "../../geometry/chamberParts";
import { chamferProfile, chamferedBox, createMeshData, mergeMeshData, rectProfile, revolveProfile, rotateYMeshData, translateMeshData, tubeAlongPath, type MeshData, type Vec2, type Vec3 } from "../../geometry/meshlib";
import { PartSink, chamfRect } from "../../geometry/sharedParts";
import type { CmpLayout } from "./layout";

function groovedPadProfile(L: CmpLayout): Vec2[] {
  const p = L.pad;
  const g = L.cfg.pad;
  const pts: Vec2[] = [
    [0, p.y0],
    [p.r, p.y0],
    [p.r, p.y1],
  ];
  const rMin = L.platen.rHub + 0.02;
  for (let rg = p.r - 0.012; rg > rMin; rg -= g.groove_pitch) {
    pts.push([rg + g.groove_width / 2, p.y1], [rg + g.groove_width / 2, p.y1 - g.groove_depth], [rg - g.groove_width / 2, p.y1 - g.groove_depth], [rg - g.groove_width / 2, p.y1]);
  }
  pts.push([0, p.y1]);
  return pts;
}

/** Box authored along +X (length) then rotated to `angle` (phi convention) and translated. */
function orientedBox(length: number, height: number, width: number, angle: number, at: Vec3, chamfer = 0.003): MeshData {
  const md = chamferedBox([length, height, width], chamfer, [length / 2, 0, 0]);
  rotateYMeshData(md, angle);
  translateMeshData(md, at[0], at[1], at[2]);
  return md;
}

export function buildCmpParts(L: CmpLayout): PartGeometry[] {
  const sink = new PartSink();
  const cfg = L.cfg;
  const hx = L.head.polishX;
  const headAxis: [number, number] = [hx, 0];

  // ------------------------------------------------------------------ platen drive, platen, pad, window, optical head
  {
    const pd = cfg.platen;
    const housing = revolveProfile(chamfRect(0, pd.drive_housing_radius, pd.drive_housing_bottom_y, L.platen.y0 - 0.004, 0.004), { segments: 64 });
    const motor = revolveProfile(chamfRect(0, pd.motor_radius, pd.drive_housing_bottom_y - pd.motor_length, pd.drive_housing_bottom_y, 0.004), { segments: 48 });
    const motorRibs: MeshData[] = [];
    for (let i = 0; i < 12; i++) {
      const rib = chamferedBox([0.012, pd.motor_length - 0.03, 0.006], 0.001, [pd.motor_radius + 0.004, pd.drive_housing_bottom_y - pd.motor_length / 2, 0]);
      motorRibs.push(rotateYMeshData(rib, (i / 12) * TAU));
    }
    sink.fixed("drive_housing", "platen_drive", "painted_housing", mergeMeshData([housing, motor]), { cutaway: "keep" });
    sink.fixed("drive_ribs", "platen_drive", "dark_steel", mergeMeshData(motorRibs), { cutaway: "keep", pickable: false, castShadow: false });
    const platenProfile = chamferProfile(
      [
        [0, L.platen.y0 - 0.04],
        [L.platen.rHub, L.platen.y0 - 0.04],
        [L.platen.rHub, L.platen.y0],
        [L.platen.r, L.platen.y0],
        [L.platen.r, L.platen.y1],
        [0, L.platen.y1],
      ],
      0.004,
      (_, q) => q[0] < 1e-9,
    );
    sink.sector("platen", "platen", "stainless", platenProfile, { segments: 160, axisXZ: [0, 0], jointId: "platen_spin" });
    sink.sector("pad", "pad", "polymer_pad", groovedPadProfile(L), { segments: 192, axisXZ: [0, 0], jointId: "platen_spin", castShadow: false });
    const w = L.pad.window;
    const win = chamferedBox([w.lenR, L.pad.y1 - L.pad.y0 + 0.0006, w.widT], 0.0003, [w.r * Math.cos(w.azimuth), (L.pad.y0 + L.pad.y1) / 2 + 0.0003, w.r * Math.sin(w.azimuth)]);
    sink.fixed("pad_window", "pad_window", "quartz", win, { cutaway: "keep", isGlass: true, castShadow: false, jointId: "platen_spin" });
    const oh = cfg.endpoint.head_size;
    const ohPos = L.endpoint.opticalHeadLocal;
    const opticalHead = chamferedBox(oh, 0.003, ohPos);
    const fiberRot: Vec3[] = [
      [ohPos[0] - oh[0] / 2, ohPos[1] - 0.01, ohPos[2]],
      [0.03, ohPos[1] - 0.01, ohPos[2]],
      [0, L.platen.y0 - 0.02, 0],
      [0, L.endpoint.rotaryInterface[1] + 0.03, 0],
    ];
    sink.fixed("optical_head", "optical_head", "painted_dark", opticalHead, { cutaway: "keep", jointId: "platen_spin" });
    sink.fixed("optical_fiber_rotating", "optical_head", "dark_steel", tubeAlongPath(fiberRot, 0.003, { segments: 10, cornerRadius: 0.02 }), { cutaway: "keep", pickable: false, castShadow: false, jointId: "platen_spin" });
    const ri = L.endpoint.rotaryInterface;
    const rr = cfg.endpoint.rotary_interface_radius;
    sink.fixed("rotary_optical_interface", "rotary_optical_interface", "stainless", revolveProfile(chamfRect(0, rr, ri[1] - 0.03, ri[1] + 0.03, 0.003), { segments: 48 }), { cutaway: "keep" });
    const mp = L.endpoint.module;
    const ms = cfg.endpoint.module_size;
    const module = chamferedBox(ms, 0.005, mp);
    const fiberFixed: Vec3[] = [
      [rr, ri[1], 0],
      [rr + 0.06, ri[1], 0],
      [mp[0] - ms[0] / 2 - 0.02, ri[1], mp[2]],
      [mp[0] - ms[0] / 2 - 0.02, mp[1], mp[2]],
      [mp[0] - ms[0] / 2, mp[1], mp[2]],
    ];
    sink.fixed("endpoint_module", "endpoint_module", "painted_dark", module, { cutaway: "keep" });
    sink.fixed("optical_fiber_fixed", "endpoint_module", "dark_steel", tubeAlongPath(fiberFixed, 0.003, { segments: 10, cornerRadius: 0.03 }), { cutaway: "keep", pickable: false, castShadow: false });
  }

  // ------------------------------------------------------------------ gantry, carriage, spindle, head
  {
    const b = L.head.beam;
    const beam = chamferedBox([b.x1 - b.x0, b.y1 - b.y0, b.width], 0.006, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0]);
    const cx = cfg.head.column_x;
    const cs = cfg.head.column_size;
    const column = chamferedBox([cs, b.y0 - L.deckTopY, cs], 0.006, [cx, (b.y0 + L.deckTopY) / 2, 0]);
    const foot = chamferedBox([cs + 0.1, 0.03, cs + 0.1], 0.004, [cx, L.deckTopY + 0.015, 0]);
    const rail = chamferedBox([b.x1 - b.x0 - 0.1, 0.02, 0.03], 0.002, [(b.x0 + b.x1) / 2 - 0.05, b.y0 - 0.01, 0]);
    sink.fixed("gantry", "gantry", "painted_housing", mergeMeshData([beam, column, foot]), { cutaway: "keep" });
    sink.fixed("gantry_rail", "gantry", "stainless", rail, { cutaway: "keep", pickable: false });
    const cz = L.head.carriage.size;
    const carriage = chamferedBox(cz, 0.006, [hx, L.head.carriage.centerY, 0]);
    const regulator = chamferedBox([0.09, 0.11, 0.06], 0.003, [hx, L.head.carriage.centerY + 0.02, cz[2] / 2 + 0.03]);
    const regPorts: MeshData[] = [];
    for (let i = 0; i < 4; i++) regPorts.push(revolveProfile(chamfRect(0, 0.005, 0, 0.012, 0.001), { segments: 12 }));
    regPorts.forEach((p, i) => {
      // rotate to +Z: build along +Y then map y->z
      for (let k = 0; k < p.positions.length; k += 3) {
        const y = p.positions[k + 1];
        p.positions[k + 1] = p.positions[k + 2] + L.head.carriage.centerY + 0.055 - i * 0.025;
        p.positions[k + 2] = y + cz[2] / 2 + 0.06;
        p.positions[k] += hx + 0.03;
        const ny = p.normals[k + 1];
        p.normals[k + 1] = p.normals[k + 2];
        p.normals[k + 2] = ny;
      }
    });
    sink.fixed("carriage", "head_carriage", "painted_housing", carriage, { cutaway: "keep", jointId: "head_lateral" });
    sink.fixed("carriage_regulators", "head_carriage", "stainless", mergeMeshData([regulator, ...regPorts]), { cutaway: "keep", jointId: "head_lateral" });
    const spindleTop = L.head.spindleTopY;
    const unionH = cfg.head.rotary_union_height;
    sink.fixed("rotary_union", "rotary_union", "stainless", revolveProfile(chamfRect(0, 0.035, spindleTop, spindleTop + unionH, 0.003), { segments: 40 }).positions.length ? translateMeshData(revolveProfile(chamfRect(0, 0.035, spindleTop, spindleTop + unionH, 0.003), { segments: 40 }), hx, 0, 0) : createMeshData(), { cutaway: "keep", jointId: "head_lift" });
    const h = L.head;
    sink.sector("spindle", "head_spindle", "stainless", chamfRect(0, h.rSpindle, h.housingY1 - 0.002, spindleTop, 0.002), { segments: 48, axisXZ: headAxis, jointId: "head_spin" });
    sink.sector("spindle_flange", "head_spindle", "stainless", chamfRect(h.rSpindle, 0.07, h.housingY1 - 0.002, h.housingY1 + 0.014, 0.002), { segments: 64, axisXZ: headAxis, jointId: "head_spin" });
    const cavityTop = h.membraneTopY + 0.03;
    const housingProfile = chamferProfile(rectProfile(0, h.rHousing, h.housingY0, h.housingY1), 0.004, (_, q) => q[0] < 1e-9);
    const cavity = rectProfile(0, h.rRingIn + 0.002, h.housingY0 - 0.001, cavityTop);
    // housing: outer shell with an inner cavity holding the zone plate / membrane (visible in cutaway)
    sink.sector("head_housing", "head_housing", "stainless", { outer: housingProfile, holes: [cavity] }, { segments: 160, axisXZ: headAxis, jointId: "head_spin" });
    // zone backing: stepped plates
    const z = h.zoneRadii;
    const mt = h.membraneTopY;
    sink.sector("zone_1", "membrane_backing", "aluminum_anodized", chamfRect(0, z[0] - 0.002, mt + 0.0005, mt + 0.014, 0.001), { segments: 96, axisXZ: headAxis, jointId: "head_spin" });
    sink.sector("zone_2", "membrane_backing", "aluminum_anodized", chamfRect(z[0] + 0.002, z[1] - 0.002, mt + 0.0005, mt + 0.010, 0.001), { segments: 128, axisXZ: headAxis, jointId: "head_spin" });
    sink.sector("zone_3", "membrane_backing", "aluminum_anodized", chamfRect(z[1] + 0.002, z[2], mt + 0.0005, mt + 0.007, 0.001), { segments: 160, axisXZ: headAxis, jointId: "head_spin" });
    sink.sector("zone_walls", "membrane_backing", "aluminum_anodized", { outer: rectProfile(z[0] - 0.002, z[0] + 0.002, mt + 0.0005, cavityTop - 0.001), holes: [] }, { segments: 96, axisXZ: headAxis, jointId: "head_spin", pickable: false });
    sink.sector("zone_walls_2", "membrane_backing", "aluminum_anodized", rectProfile(z[1] - 0.002, z[1] + 0.002, mt + 0.0005, cavityTop - 0.001), { segments: 128, axisXZ: headAxis, jointId: "head_spin", pickable: false });
    sink.sector("zone_top", "membrane_backing", "aluminum_anodized", rectProfile(0, h.rRingIn, cavityTop - 0.001, cavityTop + 0.004), { segments: 160, axisXZ: headAxis, jointId: "head_spin", pickable: false });
    sink.sector("membrane", "membrane", "rubber_membrane", rectProfile(0, h.rMembrane, h.membraneBottomY, h.membraneTopY), { segments: 192, axisXZ: headAxis, jointId: "head_spin", castShadow: false });
    sink.sector("retaining_ring", "retaining_ring", "polymer_white", chamfRect(h.rRingIn, h.rRingOut, h.ringBottomY, h.ringTopY, 0.0015), { segments: 192, axisXZ: headAxis, jointId: "head_spin" });
    sink.sector("wafer", "wafer", "silicon_wafer", rectProfile(0, L.rWafer, h.waferFrontY, h.waferBackY), { segments: 192, axisXZ: headAxis, jointId: "head_spin", castShadow: false });
  }

  // ------------------------------------------------------------------ load cup, alcove, hatch
  {
    const lc = L.loadCup;
    const cup = revolveProfile(chamfRect(0, lc.r, lc.topY - 0.04, lc.topY, 0.004), { segments: 96 });
    const ped = revolveProfile(rectProfile(0, 0.05, L.deckTopY, lc.topY - 0.04), { segments: 32 });
    const pins: MeshData[] = [];
    for (const azDeg of [90, 210, 330]) {
      const pin = revolveProfile(chamfRect(0, 0.006, lc.topY, lc.pinTopY, 0.001), { segments: 16 });
      translateMeshData(pin, L.rWafer - 0.006, 0, 0);
      pins.push(rotateYMeshData(pin, azDeg * DEG));
    }
    const cupAll = mergeMeshData([cup, ped]);
    translateMeshData(cupAll, lc.x, 0, lc.z);
    const pinsAll = mergeMeshData(pins);
    translateMeshData(pinsAll, lc.x, 0, lc.z);
    sink.fixed("load_cup", "load_cup", "polymer_white", cupAll, { cutaway: "keep" });
    sink.fixed("load_cup_pins", "load_cup", "stainless", pinsAll, { cutaway: "keep", pickable: false, castShadow: false });
    const wcup = revolveProfile(rectProfile(0, L.rWafer, lc.waferFrontY, lc.waferFrontY + L.waferThickness), { segments: 128 });
    translateMeshData(wcup, lc.x, 0, lc.z);
    sink.fixed("wafer_on_cup", "wafer_on_cup", "silicon_wafer", wcup, { cutaway: "keep", castShadow: false });
    const a = lc.alcove;
    const t = 0.01;
    const walls = mergeMeshData([
      chamferedBox([a.x1 - a.x0, a.y1 - a.y0, t], 0.002, [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, a.z0 + t / 2]),
      chamferedBox([a.x1 - a.x0, a.y1 - a.y0, t], 0.002, [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, a.z1 - t / 2]),
      chamferedBox([t, a.y1 - a.y0, a.z1 - a.z0], 0.002, [a.x0 + t / 2, (a.y0 + a.y1) / 2, 0]),
      chamferedBox([t, a.y1 - a.y0, a.z1 - a.z0], 0.002, [a.x1 - t / 2, (a.y0 + a.y1) / 2, 0]),
    ]);
    sink.fixed("alcove_walls", "load_alcove", "painted_housing", walls, { cutaway: "keep", alwaysOpaque: true });
    const hatch = chamferedBox([a.x1 - a.x0 + 0.02, 0.01, a.z1 - a.z0 + 0.02], 0.002, [(a.x0 + a.x1) / 2, a.y1 + 0.005, 0]);
    const handle = chamferedBox([0.08, 0.012, 0.012], 0.002, [(a.x0 + a.x1) / 2, a.y1 + 0.02, 0.1]);
    sink.fixed("hatch", "load_hatch", "painted_housing", mergeMeshData([hatch, handle]), { cutaway: "keep", alwaysOpaque: true, jointId: "load_hatch" });
  }

  // ------------------------------------------------------------------ conditioner
  {
    const c = L.conditioner;
    const col = revolveProfile(chamfRect(0, cfg.conditioner.column_radius, L.deckTopY, c.pivot[1] + 0.04, 0.004), { segments: 48 });
    translateMeshData(col, c.pivot[0], 0, c.pivot[2]);
    sink.fixed("conditioner_column", "conditioner_column", "stainless", col, { cutaway: "keep" });
    const arm = orientedBox(c.armLength, 0.05, 0.08, c.dir0, [c.pivot[0], c.pivot[1], c.pivot[2]], 0.004);
    const hub = revolveProfile(chamfRect(0, 0.07, c.pivot[1] - 0.035, c.pivot[1] + 0.035, 0.003), { segments: 48 });
    translateMeshData(hub, c.pivot[0], 0, c.pivot[2]);
    const holder = revolveProfile(chamfRect(0, 0.03, c.discTopY + 0.006, c.pivot[1] - 0.024, 0.002), { segments: 32 });
    translateMeshData(holder, c.discCenterRest[0], 0, c.discCenterRest[2]);
    sink.fixed("conditioner_arm", "conditioner_arm", "stainless", mergeMeshData([arm, hub, holder]), { cutaway: "keep", jointId: "conditioner_sweep" });
    const discAxis: [number, number] = [c.discCenterRest[0], c.discCenterRest[2]];
    sink.sector("conditioner_disc", "conditioner_disc", "dark_steel", chamfRect(0, c.discR, c.discBottomY, c.discTopY, 0.001), { segments: 64, axisXZ: discAxis, jointId: "conditioner_spin" });
    sink.sector("conditioner_disc_spindle", "conditioner_disc", "stainless", chamfRect(0, 0.012, c.discTopY, c.discTopY + 0.008, 0.001), { segments: 24, axisXZ: discAxis, jointId: "conditioner_spin", pickable: false });
  }

  // ------------------------------------------------------------------ slurry supply
  {
    const s = cfg.slurry;
    const tip = L.slurry.nozzleTip;
    const post = revolveProfile(chamfRect(0, 0.02, L.deckTopY, s.arm_y + 0.02, 0.003), { segments: 32 });
    translateMeshData(post, s.post_x, 0, s.post_z);
    const arm = tubeAlongPath([[s.post_x, s.arm_y, s.post_z], [s.nozzle_x, s.arm_y, s.nozzle_z]], 0.012, { segments: 16 });
    const nozzle = revolveProfile(chamfRect(0, 0.008, tip[1], s.arm_y + 0.004, 0.001), { segments: 16 });
    translateMeshData(nozzle, tip[0], 0, tip[2]);
    sink.fixed("slurry_arm", "slurry_arm", "polymer_white", mergeMeshData([post, arm, nozzle]), { cutaway: "keep" });
    const fm = L.slurry.flowMeter;
    const pp = L.slurry.panel;
    const line: Vec3[] = [
      [pp[0] - s.panel_size[0] / 2, pp[1], pp[2]],
      [fm[0] + 0.03, pp[1], pp[2]],
      [fm[0] - 0.03, fm[1], fm[2]],
      [s.post_x + 0.02, fm[1], fm[2]],
      [s.post_x, L.deckTopY + 0.05, s.post_z],
    ];
    sink.fixed("slurry_line", "slurry_line", "polymer_white", tubeAlongPath(line, s.line_radius, { segments: 12, cornerRadius: 0.04 }), { cutaway: "keep", castShadow: false });
    sink.fixed("slurry_flow_meter", "slurry_flow_meter", "painted_dark", chamferedBox([0.06, 0.08, 0.06], 0.003, fm), { cutaway: "keep" });
    sink.fixed("slurry_panel", "slurry_panel", "painted_housing", chamferedBox(s.panel_size, 0.005, pp), { cutaway: "keep" });
  }

  // ------------------------------------------------------------------ base, deck, splash guard, drain
  {
    const b = cfg.base;
    const deck = chamferedBox([b.x1 - b.x0, b.deck_thickness, b.z1 - b.z0], 0.004, [(b.x0 + b.x1) / 2, L.deckTopY - b.deck_thickness / 2, (b.z0 + b.z1) / 2]);
    const rim = mergeMeshData([
      chamferedBox([b.x1 - b.x0, 0.05, 0.012], 0.002, [(b.x0 + b.x1) / 2, L.deckTopY + 0.025, b.z0 + 0.006]),
      chamferedBox([b.x1 - b.x0, 0.05, 0.012], 0.002, [(b.x0 + b.x1) / 2, L.deckTopY + 0.025, b.z1 - 0.006]),
      chamferedBox([0.012, 0.05, b.z1 - b.z0], 0.002, [b.x1 - 0.006, L.deckTopY + 0.025, (b.z0 + b.z1) / 2]),
    ]);
    const frame = chamferedBox([b.x1 - b.x0 - 2 * b.frame_inset, L.deckTopY - b.deck_thickness - 0.04, b.z1 - b.z0 - 2 * b.frame_inset], 0.008, [(b.x0 + b.x1) / 2, (L.deckTopY - b.deck_thickness + 0.04) / 2, (b.z0 + b.z1) / 2]);
    const feet: MeshData[] = [];
    for (const [fx, fz] of [
      [b.x0 + b.frame_inset + 0.05, b.z0 + b.frame_inset + 0.05],
      [b.x1 - b.frame_inset - 0.05, b.z0 + b.frame_inset + 0.05],
      [b.x0 + b.frame_inset + 0.05, b.z1 - b.frame_inset - 0.05],
      [b.x1 - b.frame_inset - 0.05, b.z1 - b.frame_inset - 0.05],
    ]) feet.push(revolveProfile(chamfRect(0, 0.03, 0, 0.04, 0.003), { segments: 24 }).positions.length ? translateMeshData(revolveProfile(chamfRect(0, 0.03, 0, 0.04, 0.003), { segments: 24 }), fx, 0, fz) : createMeshData());
    sink.fixed("base_frame", "base_frame", "painted_housing", mergeMeshData([deck, rim, frame]), { cutaway: "keep", alwaysOpaque: false });
    sink.fixed("base_feet", "base_frame", "dark_steel", mergeMeshData(feet), { cutaway: "keep", pickable: false, castShadow: false });
    const sg = L.splashGuard;
    sink.sector("splash_guard", "splash_guard", "polymer_white", chamfRect(sg.rIn, sg.rOut, sg.y0, sg.y1, 0.002), { segments: 160, axisXZ: [0, 0], castShadow: false });
    const d = cfg.drain;
    const dx = d.radius_position * Math.cos(d.azimuth_deg * DEG);
    const dz = d.radius_position * Math.sin(d.azimuth_deg * DEG);
    const drainPath: Vec3[] = [
      [dx, L.deckTopY - 0.01, dz],
      [dx, d.drop_y, dz],
      [dx + 0.15, d.drop_y, dz],
    ];
    const drainCup = revolveProfile(chamfRect(d.pipe_radius, d.pipe_radius + 0.02, L.deckTopY - 0.012, L.deckTopY + 0.002, 0.002), { segments: 32 });
    translateMeshData(drainCup, dx, 0, dz);
    sink.fixed("drain", "drain", "polymer_white", mergeMeshData([tubeAlongPath(drainPath, d.pipe_radius, { segments: 16, cornerRadius: 0.05 }), drainCup]), { cutaway: "keep" });
  }

  // ------------------------------------------------------------------ clean / dry modules
  {
    const cm = L.clean;
    const box = chamferedBox(cm.size, 0.006, cm.center);
    const lidSeam = chamferedBox([cm.size[0] - 0.04, 0.004, cm.size[2] - 0.04], 0.001, [cm.center[0], cm.baseY + cm.size[1] + 0.002, cm.center[2]]);
    sink.fixed("clean_module", "clean_module", "painted_housing", mergeMeshData([box, lidSeam]), { cutaway: "keep" });
    const rollers: MeshData[] = [];
    for (const dy of [-(cm.rRoller + 0.001 + L.waferThickness / 2), cm.rRoller + 0.001 + L.waferThickness / 2]) {
      const y = cm.waferY + dy;
      rollers.push(tubeAlongPath([[cm.center[0] - cm.rollerLen / 2, y, cm.center[2]], [cm.center[0] + cm.rollerLen / 2, y, cm.center[2]]], cm.rRoller, { segments: 24 }));
    }
    sink.fixed("brush_rollers", "brush_rollers", "polymer_white", mergeMeshData(rollers), { cutaway: "keep", castShadow: false });
    const rinse = revolveProfile(chamfRect(0, 0.006, cm.waferY + cm.rRoller * 2 + 0.03, cm.baseY + cm.size[1] - 0.02, 0.001), { segments: 12 });
    translateMeshData(rinse, cm.center[0] + 0.1, 0, cm.center[2]);
    sink.fixed("rinse_nozzle", "clean_module", "stainless", rinse, { cutaway: "keep", pickable: false, castShadow: false });
    const wc = revolveProfile(rectProfile(0, L.rWafer, cm.waferY - L.waferThickness / 2, cm.waferY + L.waferThickness / 2), { segments: 128 });
    translateMeshData(wc, cm.center[0], 0, cm.center[2]);
    sink.fixed("wafer_in_clean", "wafer_in_clean", "silicon_wafer", wc, { cutaway: "keep", castShadow: false });
    const dm = L.dry;
    const dbox = chamferedBox(dm.size, 0.006, dm.center);
    const dseam = chamferedBox([dm.size[0] - 0.04, 0.004, dm.size[2] - 0.04], 0.001, [dm.center[0], dm.baseY + dm.size[1] + 0.002, dm.center[2]]);
    const bowl = revolveProfile(chamfRect(dm.rBowl - 0.006, dm.rBowl, dm.baseY + 0.04, dm.waferY + 0.04, 0.001), { segments: 96 });
    translateMeshData(bowl, dm.center[0], 0, dm.center[2]);
    sink.fixed("dry_module", "dry_module", "painted_housing", mergeMeshData([dbox, dseam]), { cutaway: "keep" });
    sink.fixed("dry_bowl", "dry_module", "polymer_white", bowl, { cutaway: "keep", pickable: false, castShadow: false });
    const dryAxis: [number, number] = [dm.center[0], dm.center[2]];
    sink.sector("dry_chuck", "dry_chuck", "stainless", chamfRect(0, dm.rChuck, dm.chuckTopY - 0.025, dm.chuckTopY, 0.002), { segments: 64, axisXZ: dryAxis, jointId: "dry_spin" });
    sink.sector("dry_chuck_shaft", "dry_chuck", "stainless", rectProfile(0, 0.015, dm.baseY + 0.02, dm.chuckTopY - 0.025), { segments: 24, axisXZ: dryAxis, jointId: "dry_spin", pickable: false });
    sink.sector("wafer_in_dry", "wafer_in_dry", "silicon_wafer", rectProfile(0, L.rWafer, dm.chuckTopY, dm.chuckTopY + L.waferThickness), { segments: 128, axisXZ: dryAxis, jointId: "dry_spin", castShadow: false });
  }

  // ------------------------------------------------------------------ station: wet transfer, EFEM, load port deck
  {
    const wt = cfg.wet_transfer;
    sink.fixed("wet_transfer", "wet_transfer", "painted_housing", chamferedBox([wt.x1 - wt.x0, wt.y1 - wt.y0, wt.z1 - wt.z0], 0.004, [(wt.x0 + wt.x1) / 2, (wt.y0 + wt.y1) / 2, (wt.z0 + wt.z1) / 2]), { cutaway: "keep", alwaysOpaque: true });
    const ef = L.station.efem;
    const efem = chamferedBox([ef.x1 - ef.x0, ef.top_y, ef.z1 - ef.z0], 0.008, [(ef.x0 + ef.x1) / 2, ef.top_y / 2, 0]);
    const panel = chamferedBox([0.006, ef.top_y - 0.12, ef.z1 - ef.z0 - 0.12], 0.001, [ef.x0 - 0.003, ef.top_y / 2, 0]);
    const lightBar = chamferedBox([0.012, 0.03, ef.z1 - ef.z0 - 0.3], 0.002, [ef.x0 - 0.006, ef.top_y - 0.06, 0]);
    sink.fixed("efem_box", "efem_enclosure", "painted_housing", mergeMeshData([efem, panel]), { cutaway: "keep", alwaysOpaque: true });
    sink.fixed("efem_light_bar", "efem_enclosure", "safety_marking", lightBar, { cutaway: "keep", pickable: false, castShadow: false, alwaysOpaque: true });
    const st = L.station;
    const deck = chamferedBox([st.deckX1 - st.deckX0, st.deckThickness, st.deckWidth], 0.004, [(st.deckX0 + st.deckX1) / 2, st.deckTopY - st.deckThickness / 2, 0]);
    const ped = chamferedBox([st.deckX1 - st.deckX0 - 0.08, st.deckTopY - st.deckThickness, st.deckWidth - 0.1], 0.006, [(st.deckX0 + st.deckX1) / 2, (st.deckTopY - st.deckThickness) / 2, 0]);
    const doorFrame = mergeMeshData([
      chamferedBox([0.014, 0.42, 0.03], 0.002, [ef.x0 - 0.007, st.deckTopY + 0.25, 0.2]),
      chamferedBox([0.014, 0.42, 0.03], 0.002, [ef.x0 - 0.007, st.deckTopY + 0.25, -0.2]),
      chamferedBox([0.014, 0.03, 0.43], 0.002, [ef.x0 - 0.007, st.deckTopY + 0.46, 0]),
    ]);
    const pins: MeshData[] = [];
    for (const [dx, dz] of [
      [0.0, 0.09],
      [0.0, -0.09],
      [-0.09, 0.0],
    ] as const) {
      const pin = revolveProfile(chamferProfile(rectProfile(0, 0.008, st.deckTopY, st.deckTopY + 0.012), 0.002), { segments: 20 });
      translateMeshData(pin, st.seat[0] + dx, 0, dz);
      pins.push(pin);
    }
    sink.fixed("deck", "load_port", "stainless", deck, { cutaway: "keep" });
    sink.fixed("deck_pedestal", "load_port", "painted_housing", ped, { cutaway: "keep" });
    sink.fixed("door_frame", "load_port", "dark_steel", doorFrame, { cutaway: "keep", pickable: false });
    sink.fixed("seat_pins", "load_port", "stainless", mergeMeshData(pins), { cutaway: "keep", pickable: false, castShadow: false });
  }

  return sink.parts;
}
