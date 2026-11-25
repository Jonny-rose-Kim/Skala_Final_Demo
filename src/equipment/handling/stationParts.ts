/**
 * Procedural parts of the shared wafer-handling station (CCP / Remote): EFEM panel assembly with an FFU
 * and HMI, load port with dock plate and door opener, load lock with lid, doors, support pins and the
 * telescopic vacuum blade, the slit gate valve with a real through-opening, the process enclosure and
 * the facility interface. Geometry is authored in the station frame (x = r, z = q, y = height) and
 * rotated to the slit azimuth, at the rest pose (doors closed, blade retracted, pins down, robot folded).
 *
 * Panels flagged `cover` are removable for inspection (display only). Doors and gates are separate
 * components driven by scripted joints, so cover removal and door opening never mix.
 */
import { chamferedBox, mergeMeshData, prismY, rectProfile, revolveProfile, rotateYMeshData, translateMeshData, tubeAlongPath, type MeshData, type Vec2, type Vec3 } from "../../geometry/meshlib";
import { PartSink, chamfRect, type Mat } from "../../geometry/sharedParts";
import { buildScaraRobotParts, type ScaraRobotSpec } from "./robotParts";
import { waferHalfMeshes } from "../../geometry/waferParts";
import { SLIT_BONNET_HEIGHT, SLIT_GATE_INSET, SLIT_GATE_MARGIN, type HandlingStationLayout } from "./stationLayout";

/** Asset ids of the station components (kept in one place so template, parts and sequence agree). */
export const STATION_IDS = {
  efem: "efem_enclosure",
  ffu: "efem_ffu",
  hmi: "efem_hmi",
  loadPort: "load_port",
  dock: "load_port_dock",
  opener: "load_port_door_opener",
  loadLock: "load_lock",
  atmDoor: "load_lock_atm_door",
  llSupport: "load_lock_support",
  bladeDrive: "vacuum_blade_drive",
  bladeStage: "vacuum_blade_stage",
  blade: "vacuum_blade",
  waferLL: "wafer_in_loadlock",
  waferBlade: "wafer_on_blade",
  tc: "vacuum_transfer_chamber",
  shuttle: "vacuum_blade_shuttle",
  slitValve: "slit_valve",
  slitGate: "slit_valve_gate",
  robot: { base: "atm_robot_base", column: "atm_robot_column", arm1: "atm_robot_link1", arm2: "atm_robot_link2", ee: "atm_robot_end_effector", wafer: "wafer_on_atm_robot" },
} as const;

export const STATION_JOINTS = {
  dock: "lp_dock",
  doorPull: "lp_door_pull",
  doorLower: "lp_door_lower",
  llDoor: "ll_atm_door",
  llPins: "ll_pins",
  bladeS1: "vac_blade_s1",
  bladeS2: "vac_blade_s2",
  shuttle: "vac_shuttle",
  slitGate: "slit_gate",
} as const;

type Fixed = PartSink["fixed"];

export class StationGeom {
  constructor(
    readonly az: number,
    readonly sink: PartSink,
  ) {}
  /** Rotate geometry authored in the station frame to the instance frame. */
  rot(md: MeshData): MeshData {
    return rotateYMeshData(md, this.az);
  }
  /** Plate in the (q, y) plane between r0 and r1 with any number of rectangular holes. */
  holedPlate(r0: number, r1: number, y0: number, y1: number, q0: number, q1: number, holes: { y0: number; y1: number; q0: number; q1: number }[], c = 0.002): MeshData {
    const ys = Array.from(new Set([y0, y1, ...holes.flatMap((h) => [Math.max(y0, Math.min(y1, h.y0)), Math.max(y0, Math.min(y1, h.y1))])])).sort((a, b) => a - b);
    const parts: MeshData[] = [];
    for (let i = 0; i + 1 < ys.length; i++) {
      const a = ys[i];
      const b = ys[i + 1];
      if (b - a < 1e-4) continue;
      const mid = (a + b) / 2;
      const cuts = holes.filter((h) => h.y0 < mid && h.y1 > mid).map((h) => [Math.max(q0, h.q0), Math.min(q1, h.q1)] as [number, number]).sort((x, y) => x[0] - y[0]);
      let q = q0;
      for (const [c0, c1] of cuts) {
        if (c0 - q > 1e-4) parts.push(this.box(r0, r1, a, b, q, c0, c));
        q = Math.max(q, c1);
      }
      if (q1 - q > 1e-4) parts.push(this.box(r0, r1, a, b, q, q1, c));
    }
    return mergeMeshData(parts);
  }
  box(r0: number, r1: number, y0: number, y1: number, q0: number, q1: number, c = 0.003): MeshData {
    const lo = (a: number, b: number) => Math.min(a, b);
    const hi = (a: number, b: number) => Math.max(a, b);
    const R0 = lo(r0, r1);
    const R1 = hi(r0, r1);
    const Q0 = lo(q0, q1);
    const Q1 = hi(q0, q1);
    const cc = Math.min(c, (R1 - R0) / 4, (y1 - y0) / 4, (Q1 - Q0) / 4);
    return this.rot(chamferedBox([R1 - R0, y1 - y0, Q1 - Q0], Math.max(cc, 0), [(R0 + R1) / 2, (y0 + y1) / 2, (Q0 + Q1) / 2]));
  }
  /** Plate in the (q, y) plane at r with a rectangular opening (four boxes). */
  framedPlate(r0: number, r1: number, y0: number, y1: number, q0: number, q1: number, open: { y0: number; y1: number; q0: number; q1: number }, c = 0.002): MeshData {
    const parts: MeshData[] = [];
    if (open.y0 > y0 + 1e-4) parts.push(this.box(r0, r1, y0, open.y0, q0, q1, c));
    if (y1 > open.y1 + 1e-4) parts.push(this.box(r0, r1, open.y1, y1, q0, q1, c));
    if (open.q0 > q0 + 1e-4) parts.push(this.box(r0, r1, open.y0, open.y1, q0, open.q0, c));
    if (q1 > open.q1 + 1e-4) parts.push(this.box(r0, r1, open.y0, open.y1, open.q1, q1, c));
    return mergeMeshData(parts);
  }
  /** Plate in the (r, y) plane at q with a rectangular opening. */
  framedSide(q0: number, q1: number, y0: number, y1: number, r0: number, r1: number, open: { y0: number; y1: number; r0: number; r1: number }, c = 0.002): MeshData {
    const parts: MeshData[] = [];
    if (open.y0 > y0 + 1e-4) parts.push(this.box(r0, r1, y0, open.y0, q0, q1, c));
    if (y1 > open.y1 + 1e-4) parts.push(this.box(r0, r1, open.y1, y1, q0, q1, c));
    if (open.r0 > r0 + 1e-4) parts.push(this.box(r0, open.r0, open.y0, open.y1, q0, q1, c));
    if (r1 > open.r1 + 1e-4) parts.push(this.box(open.r1, r1, open.y0, open.y1, q0, q1, c));
    return mergeMeshData(parts);
  }
  /** Vertical cylinder at (r, q). */
  cylY(radius: number, y0: number, y1: number, r: number, q: number, seg = 24, c = 0.002): MeshData {
    const md = revolveProfile(chamfRect(0, radius, y0, y1, Math.min(c, (y1 - y0) / 3, radius / 3)), { segments: seg });
    translateMeshData(md, r, 0, q);
    return this.rot(md);
  }
  /** Cylinder along the radial axis from r0 to r1 at height y, lateral q. */
  cylR(radius: number, r0: number, r1: number, y: number, q: number, seg = 24, c = 0.002, rIn = 0): MeshData {
    const md = revolveProfile(chamfRect(rIn, radius, Math.min(r0, r1), Math.max(r0, r1), Math.min(c, Math.abs(r1 - r0) / 3, radius / 3)), { segments: seg });
    // (x, y, z) -> (r = y, height = z + y, q = x + q): proper rotation
    for (let i = 0; i < md.positions.length; i += 3) {
      const x = md.positions[i];
      const yy = md.positions[i + 1];
      const z = md.positions[i + 2];
      md.positions[i] = yy;
      md.positions[i + 1] = z + y;
      md.positions[i + 2] = x + q;
      const nx = md.normals[i];
      const ny = md.normals[i + 1];
      const nz = md.normals[i + 2];
      md.normals[i] = ny;
      md.normals[i + 1] = nz;
      md.normals[i + 2] = nx;
    }
    return this.rot(md);
  }
  /** Cylinder along the lateral axis from q0 to q1 at (r, y). */
  cylQ(radius: number, q0: number, q1: number, r: number, y: number, seg = 24, c = 0.002): MeshData {
    const md = revolveProfile(chamfRect(0, radius, Math.min(q0, q1), Math.max(q0, q1), Math.min(c, Math.abs(q1 - q0) / 3, radius / 3)), { segments: seg });
    // (x, y, z) -> (r = z + r, height = x + y, q = y): proper rotation
    for (let i = 0; i < md.positions.length; i += 3) {
      const x = md.positions[i];
      const yy = md.positions[i + 1];
      const z = md.positions[i + 2];
      md.positions[i] = z + r;
      md.positions[i + 1] = x + y;
      md.positions[i + 2] = yy;
      const nx = md.normals[i];
      const ny = md.normals[i + 1];
      const nz = md.normals[i + 2];
      md.normals[i] = nz;
      md.normals[i + 1] = nx;
      md.normals[i + 2] = ny;
    }
    return this.rot(md);
  }
  /** Prism of a station-frame (r, q) outline between y0 and y1. */
  prism(outline: Vec2[], y0: number, y1: number): MeshData {
    return this.rot(prismY(outline, y0, y1));
  }
  /** Tube through station-frame points (r, y, q). */
  tube(pts: Vec3[], radius: number, corner = 0.03, seg = 12): MeshData {
    return this.rot(tubeAlongPath(pts.map((p) => [p[0], p[1], p[2]] as Vec3), radius, { segments: seg, cornerRadius: corner }));
  }
  fixed(...args: Parameters<Fixed>): void {
    this.sink.fixed(...args);
  }
}

export function atmRobotSpec(S: HandlingStationLayout, efemFloorTop: number): ScaraRobotSpec {
  const ar = S.cfg.atm_robot;
  return {
    prefix: "atm",
    ids: { ...STATION_IDS.robot },
    assembly: "atm_robot",
    nameKo: "EFEM robot",
    axisXZ: S.robot.axisXZ,
    d0: S.u,
    floorY: efemFloorTop,
    baseTopY: S.robot.baseTopY,
    shoulderY0: S.robot.shoulderY0,
    baseRadius: ar.base_radius,
    columnRadius: ar.column_radius,
    zStroke: ar.z_stroke,
    linkLength: ar.link_length,
    linkWidth: ar.link_width,
    link1T: ar.link1_thickness,
    link2T: ar.link2_thickness,
    hubRadius: ar.hub_radius,
    eeReach: ar.ee_reach,
    eeMountH: ar.ee_mount_height,
    eeThickness: ar.ee_thickness,
    padH: ar.pad_height,
    tineQ: ar.tine_q,
    tipBeyond: ar.tip_beyond_center,
    ee: { kind: "fork" },
    waferRadius: 0.15,
    waferThickness: 0.000775,
  };
}

/** EFEM floor plate height above the fab floor. */
export const EFEM_FLOOR_RAISE = 0.06;

export interface ProcessEnclosureSpec {
  /** Box in the instance frame. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  topY: number;
  /** Opening in the station-side wall where the load lock adapter / EFEM passes (lateral half width, y range, optional z center). */
  stationOpening: { halfQ: number; y0: number; y1: number; centerZ?: number };
  /** Optional square cut-out in the top panel (Remote source passes through), half size, centered on the instance axis. */
  topCutHalf?: number;
  /** Optional square cut-out in the top panel at (x, z) (CMP overhead wet robot housing). */
  topCut?: { x: number; z: number; half: number };
  /** Viewing window on the -Z panel: x range and y range. */
  window: { x0: number; x1: number; y0: number; y1: number };
  /** Facility interface on the +X panel: center (z, y). */
  facility: { z: number; y: number };
}

/** Station (CCP / Remote) parts. `waferThickness` comes from the tool config. */
export function buildStationParts(sink: PartSink, S: HandlingStationLayout, opts: { waferThickness: number } = { waferThickness: 0.000775 }): void {
  const g = new StationGeom(S.az, sink);
  const I = STATION_IDS;
  const J = STATION_JOINTS;
  const fy = S.floorY;
  const ef = S.efem;
  const efCfg = S.cfg.efem;
  const pt = efCfg.panel_thickness;
  const fs = efCfg.frame_size;
  const efemFloorTop = fy + EFEM_FLOOR_RAISE;
  const t = opts.waferThickness;

  const ad = S.atmDoor;
  buildEfemParts(g, {
    qc: 0,
    r0: ef.r0,
    r1: ef.r1,
    width: ef.width,
    floorY: fy,
    topY: ef.topY,
    ffuTopY: ef.ffuTopY,
    panelT: pt,
    frameSize: fs,
    backHoles: [{ y0: ad.y0 - 0.03, y1: ad.y1 + 0.03, q0: -ad.width / 2 - 0.03, q1: ad.width / 2 + 0.03 }],
    windowY: [S.robot.shoulderY0 + 0.15, Math.min(ef.topY - 0.25, S.robot.shoulderY0 + 0.75)],
    loadPort: { ...S.loadPort, couplingPads: S.foup.couplingPads },
  });
  // ---------------------------------------------------------------- load lock body, lid, adapter, frame, legs, ports
  {
    const ll = S.ll;
    const hw = ll.width / 2;
    const iw = ll.innerWidth / 2;
    const ad = S.atmDoor;
    // floor and walls
    g.fixed("ll_floor", I.loadLock, "aluminum_machined", g.box(ll.r0, ll.r1, ll.bottomY, ll.innerBottomY, -hw, hw, 0.004), { cutaway: "keep" });
    const vo = ll.vacOpening;
    g.fixed("ll_vac_wall", I.loadLock, "aluminum_machined", g.framedPlate(ll.r0, ll.innerR0, ll.innerBottomY, ll.innerTopY, -hw, hw, { y0: vo.y0, y1: vo.y1, q0: -vo.width / 2, q1: vo.width / 2 }), { cutaway: "keep" });
    g.fixed("ll_atm_wall", I.loadLock, "aluminum_machined", g.framedPlate(ll.innerR1, ll.r1, ll.innerBottomY, ll.innerTopY, -hw, hw, { y0: ad.y0, y1: ad.y1, q0: -ad.width / 2, q1: ad.width / 2 }), { cutaway: "keep" });
    for (const sgn of [-1, 1]) g.fixed(`ll_side_${sgn > 0 ? "p" : "n"}`, I.loadLock, "aluminum_machined", g.box(ll.innerR0, ll.innerR1, ll.innerBottomY, ll.innerTopY, sgn * iw, sgn * hw, 0.003), { cutaway: "keep" });
    // lid with a viewing window (removable cover for inspection)
    const winR0 = ll.centerR - 0.14;
    const winR1 = ll.centerR + 0.14;
    const lid: MeshData[] = [g.box(ll.r0, winR0, ll.innerTopY, ll.topY, -hw, hw, 0.003), g.box(winR1, ll.r1, ll.innerTopY, ll.topY, -hw, hw, 0.003)];
    for (const sgn of [-1, 1]) lid.push(g.box(winR0, winR1, ll.innerTopY, ll.topY, sgn * 0.13, sgn * hw, 0.002));
    g.fixed("ll_lid", I.loadLock, "aluminum_machined", mergeMeshData(lid), { cutaway: "keep", cover: true });
    g.fixed("ll_lid_window", I.loadLock, "quartz", g.box(winR0 + 0.004, winR1 - 0.004, ll.topY - 0.012, ll.topY - 0.004, -0.126, 0.126, 0.001), { cutaway: "keep", cover: true, isGlass: true, castShadow: false, pickable: false });
    const bolts: MeshData[] = [];
    for (let k = 0; k <= 8; k++) for (const sgn of [-1, 1]) bolts.push(g.cylY(0.005, ll.topY, ll.topY + 0.004, ll.r0 + 0.02 + ((ll.r1 - ll.r0 - 0.04) * k) / 8, sgn * (hw - 0.015), 10, 0.001));
    g.fixed("ll_lid_bolts", I.loadLock, "dark_steel", mergeMeshData(bolts), { cutaway: "keep", cover: true, castShadow: false, lod: "fine", pickable: false });
    // adapter flange between the slit valve and the load lock (open path)
    const sl = S.slit;
    g.fixed("ll_adapter", I.loadLock, "stainless", g.framedPlate(S.adapter.r0, S.adapter.r1, sl.y0 - 0.04, sl.y1 + 0.04, -sl.width / 2 - 0.05, sl.width / 2 + 0.05, { y0: sl.y0, y1: sl.y1, q0: -sl.width / 2, q1: sl.width / 2 }), { cutaway: "keep" });
    // atmospheric door frame + pneumatic cylinder + guide rails (fixed)
    const fr = g.framedPlate(ad.r0 + 0.004 + ad.gateThickness, ad.r1, ad.y0 - ad.gateTravel - 0.03, ad.y1 + 0.03, -ad.width / 2 - 0.05, ad.width / 2 + 0.05, { y0: ad.y0, y1: ad.y1, q0: -ad.width / 2, q1: ad.width / 2 });
    const rails: MeshData[] = [];
    for (const sgn of [-1, 1]) rails.push(g.box(ad.r0, ad.r0 + 0.004 + ad.gateThickness + 0.004, ad.y0 - ad.gateTravel - 0.03, ad.y1 + 0.03, sgn * (ad.width / 2 + 0.03), sgn * (ad.width / 2 + 0.05), 0.002));
    const cyl = g.cylY(0.018, ad.y0 - ad.gateTravel - 0.16, ad.y0 - ad.gateTravel - 0.03, ad.r0 + 0.012, 0, 20);
    g.fixed("ll_atm_frame", I.loadLock, "aluminum_anodized", mergeMeshData([fr, ...rails]), { cutaway: "keep" });
    g.fixed("ll_atm_cylinder", I.loadLock, "stainless", cyl, { cutaway: "keep", castShadow: false });
    // legs / stand
    const legs: MeshData[] = [];
    const ls = S.cfg.load_lock.leg_size;
    for (const r of [ll.r0 + 0.05, ll.r1 - 0.05]) for (const q of [-hw + 0.04, hw - 0.04]) legs.push(g.box(r - ls / 2, r + ls / 2, fy + 0.02, ll.bottomY, q - ls / 2, q + ls / 2, 0.003));
    legs.push(g.box(ll.r0 + 0.03, ll.r1 - 0.03, fy + 0.22, fy + 0.25, -hw + 0.02, hw - 0.02, 0.003));
    g.fixed("ll_stand", I.loadLock, "painted_dark", mergeMeshData(legs), { cutaway: "keep" });
    // pump-down port (down and toward +q) and vent valve
    const pr = S.cfg.load_lock.pump_port_diameter / 2;
    const portR = ll.r0 + 0.07;
    const pump = g.tube([[portR, ll.bottomY + 0.004, hw - 0.06], [portR, ll.bottomY - 0.12, hw - 0.06], [portR, ll.bottomY - 0.12, hw + 0.15], [portR, fy + 0.35, hw + 0.15]], pr, 0.05, 20);
    const flange = g.cylY(pr + 0.02, ll.bottomY - 0.014, ll.bottomY, portR, hw - 0.06, 24);
    const vent = g.box(ll.innerR1 - 0.07, ll.innerR1 - 0.02, ll.innerTopY - 0.03, ll.innerTopY + 0.0, hw, hw + 0.05, 0.004);
    g.fixed("ll_pump_line", I.loadLock, "stainless", mergeMeshData([pump, flange]), { cutaway: "keep", castShadow: false });
    g.fixed("ll_vent_valve", I.loadLock, "stainless", vent, { cutaway: "keep", castShadow: false });
    // pin lift actuator and blade drive feedthrough below the floor (fixed)
    g.fixed("ll_pin_actuator", I.loadLock, "stainless", mergeMeshData([g.cylY(0.03, ll.bottomY - 0.11, ll.bottomY - 0.002, ll.centerR, 0, 24), g.cylY(0.02, ll.bottomY - 0.2, ll.bottomY - 0.11, ll.centerR, 0, 20)]), { cutaway: "keep", castShadow: false });
  }
  // ---------------------------------------------------------------- vacuum transfer chamber (cluster tools)
  if (S.tc) {
    const tc = S.tc;
    const ll = S.ll;
    const hw = tc.width / 2;
    const iw = tc.innerWidth / 2;
    const sl = S.slit;
    g.fixed("tc_floor", I.tc, "aluminum_machined", g.box(tc.r0, tc.r1, tc.bottomY, ll.innerBottomY, -hw, hw, 0.004), { cutaway: "keep" });
    g.fixed("tc_end_wall", I.tc, "aluminum_machined", g.framedPlate(tc.r0, tc.innerR0, ll.innerBottomY, ll.innerTopY, -hw, hw, { y0: sl.y0 - 0.006, y1: sl.y1 + 0.006, q0: -sl.width / 2 - 0.01, q1: sl.width / 2 + 0.01 }), { cutaway: "keep" });
    for (const sgn of [-1, 1]) g.fixed(`tc_side_${sgn > 0 ? "p" : "n"}`, I.tc, "aluminum_machined", g.box(tc.innerR0, tc.r1, ll.innerBottomY, ll.innerTopY, sgn * iw, sgn * hw, 0.003), { cutaway: "keep" });
    const winR0 = tc.innerR0 + 0.08;
    const winR1 = tc.r1 - 0.08;
    const lid: MeshData[] = [g.box(tc.r0, winR0, ll.innerTopY, tc.topY, -hw, hw, 0.003), g.box(winR1, tc.r1, ll.innerTopY, tc.topY, -hw, hw, 0.003)];
    for (const sgn of [-1, 1]) lid.push(g.box(winR0, winR1, ll.innerTopY, tc.topY, sgn * (iw - 0.06), sgn * hw, 0.002));
    g.fixed("tc_lid", I.tc, "aluminum_machined", mergeMeshData(lid), { cutaway: "keep", cover: true });
    if (winR1 > winR0 + 0.02) g.fixed("tc_lid_window", I.tc, "quartz", g.box(winR0 + 0.004, winR1 - 0.004, tc.topY - 0.012, tc.topY - 0.004, -(iw - 0.064), iw - 0.064, 0.001), { cutaway: "keep", cover: true, isGlass: true, castShadow: false, pickable: false });
    const legs: MeshData[] = [];
    const ls = S.cfg.load_lock.leg_size;
    for (const r of [tc.r0 + 0.06, tc.r1 - 0.06]) for (const q of [-hw + 0.05, hw - 0.05]) legs.push(g.box(r - ls / 2, r + ls / 2, S.floorY + 0.02, tc.bottomY, q - ls / 2, q + ls / 2, 0.003));
    legs.push(g.box(tc.r0 + 0.04, tc.r1 - 0.04, S.floorY + 0.22, S.floorY + 0.25, -hw + 0.03, hw - 0.03, 0.003));
    g.fixed("tc_stand", I.tc, "painted_dark", mergeMeshData(legs), { cutaway: "keep" });
    const pr = 0.04;
    const portR = (tc.r0 + tc.r1) / 2;
    g.fixed("tc_pump_line", I.tc, "stainless", mergeMeshData([g.cylY(pr + 0.02, tc.bottomY - 0.014, tc.bottomY, portR, -hw + 0.09, 24), g.tube([[portR, tc.bottomY, -hw + 0.09], [portR, S.floorY + 0.3, -hw + 0.09]], pr, 0.05, 20)]), { cutaway: "keep", castShadow: false });
  }
  // ---------------------------------------------------------------- atmospheric gate (moving)
  {
    const ad = S.atmDoor;
    const gate = g.box(ad.r0 + 0.004, ad.r0 + 0.004 + ad.gateThickness, ad.y0 - 0.015, ad.y1 + 0.015, -ad.width / 2 - 0.02, ad.width / 2 + 0.02, 0.003);
    const rod = g.cylY(0.007, ad.y0 - ad.gateTravel - 0.03, ad.y0 - 0.015, ad.r0 + 0.012, 0, 12);
    const oring = g.box(ad.r0 + 0.002, ad.r0 + 0.004, ad.y0 - 0.008, ad.y1 + 0.008, -ad.width / 2 - 0.012, ad.width / 2 + 0.012, 0.001);
    g.fixed("ll_atm_gate", I.atmDoor, "aluminum_machined", mergeMeshData([gate, rod]), { cutaway: "keep", jointId: J.llDoor });
    g.fixed("ll_atm_gate_seal", I.atmDoor, "rubber_membrane", oring, { cutaway: "keep", jointId: J.llDoor, castShadow: false, lod: "fine", pickable: false });
  }
  // ---------------------------------------------------------------- load-lock support pins (moving)
  {
    const ll = S.ll;
    const pins: MeshData[] = [];
    const tips: MeshData[] = [];
    const pinBottom = ll.pinDropTop - 0.064;
    for (const [r, q] of ll.pins) {
      pins.push(g.cylY(ll.pinRadius, pinBottom, ll.pinDropTop - 0.004, r, q, 16, 0.001));
      tips.push(g.cylY(ll.pinRadius * 0.9, ll.pinDropTop - 0.004, ll.pinDropTop, r, q, 16, 0.001));
    }
    const spider = g.box(ll.centerR - 0.09, ll.centerR + 0.09, pinBottom - 0.008, pinBottom, -0.07, 0.07, 0.003);
    g.fixed("ll_pins", I.llSupport, "stainless", mergeMeshData([...pins, spider]), { cutaway: "keep", jointId: J.llPins, castShadow: false });
    g.fixed("ll_pin_tips", I.llSupport, "polymer_white", mergeMeshData(tips), { cutaway: "keep", jointId: J.llPins, castShadow: false });
    const wl = waferHalfMeshes(0.15, ll.pinDropTop, t, false, ll.centerR, 0);
    g.fixed("wafer_ll", I.waferLL, "silicon_wafer", g.rot(wl.back), { cutaway: "keep", jointId: J.llPins, castShadow: false });
    g.fixed("wafer_ll_front", I.waferLL, "wafer_front", g.rot(wl.front), { cutaway: "keep", jointId: J.llPins, castShadow: false });
  }
  // ---------------------------------------------------------------- vacuum blade: drive (fixed), stage 1, carriage + blade
  {
    const ll = S.ll;
    const b = S.blade;
    const vb = S.cfg.vacuum_blade;
    const railR0 = S.tc ? S.tc.innerR0 + 0.004 : b.stageRestR0 - 0.005;
    const rail = g.box(railR0, ll.innerR1 - 0.004, b.railY0, b.railY1, -vb.rail_width / 2, vb.rail_width / 2, 0.002);
    const feedR = ll.innerR1 - 0.07;
    const seal = g.cylY(0.034, ll.bottomY - 0.06, ll.bottomY - 0.002, feedR, 0, 28);
    const motor = g.cylY(0.042, ll.bottomY - 0.17, ll.bottomY - 0.06, feedR, 0, 28, 0.006);
    const cable = g.tube([[feedR, ll.bottomY - 0.17, 0], [feedR, ll.bottomY - 0.22, 0], [feedR + 0.1, ll.bottomY - 0.22, 0.0]], 0.008, 0.03);
    g.fixed("blade_rail", I.bladeDrive, "stainless", rail, { cutaway: "keep", castShadow: false });
    g.fixed("blade_feedthrough", I.bladeDrive, "stainless", seal, { cutaway: "keep", castShadow: false });
    g.fixed("blade_motor", I.bladeDrive, "painted_dark", mergeMeshData([motor, cable]), { cutaway: "keep", castShadow: false });
    const stage = g.box(b.stageRestR0, b.stageRestR1, b.stageY0, b.stageY1, -vb.stage_width / 2, vb.stage_width / 2, 0.0015);
    g.fixed("blade_stage", I.bladeStage, "aluminum_anodized", stage, { cutaway: "keep", jointId: J.bladeS1, castShadow: false });
    if (S.tc) {
      // linear shuttle: two side rails across the transfer chamber and the load lock, sled blocks under the stage ends
      const tc = S.tc;
      const rq = tc.railQ;
      const sideRails: MeshData[] = [];
      for (const sgn of [-1, 1]) sideRails.push(g.box(tc.innerR0 + 0.004, ll.innerR1 - 0.004, b.railY0, b.railY1 + 0.004, sgn * rq - 0.01, sgn * rq + 0.01, 0.002));
      g.fixed("shuttle_rails", I.bladeDrive, "stainless", mergeMeshData(sideRails), { cutaway: "keep", castShadow: false });
      const sled: MeshData[] = [];
      for (const sgn of [-1, 1]) {
        for (const r of [b.stageRestR0 + 0.03, b.stageRestR1 - 0.03]) sled.push(g.box(r - 0.025, r + 0.025, b.railY1 + 0.004, b.stageY1, sgn * rq - 0.014, sgn * rq + 0.014, 0.002));
        // bridge from the stage edge out to the side rail
        const qa = sgn * vb.stage_width / 2;
        const qb = sgn * (rq + 0.014);
        sled.push(g.box(b.stageRestR0 + 0.005, b.stageRestR1 - 0.005, b.stageY0, b.stageY1, Math.min(qa, qb), Math.max(qa, qb), 0.001));
      }
      g.fixed("shuttle_sled", I.shuttle, "aluminum_anodized", mergeMeshData(sled), { cutaway: "keep", jointId: J.shuttle, castShadow: false });
    }
    const car = g.box(b.rootRestR - vb.carriage_length / 2, b.rootRestR + vb.carriage_length / 2, b.carriageY0, b.carriageY1, -vb.carriage_width / 2, vb.carriage_width / 2, 0.0015);
    const plate = g.box(b.pocketRestR - vb.tip_beyond_pocket, b.rootRestR + 0.02, b.bladeY0, b.bladeY1, -b.halfWidth, b.halfWidth, 0.001);
    const pads: MeshData[] = [];
    for (const dr of [-0.115, 0.115]) for (const q of [-0.03, 0.03]) pads.push(g.cylY(0.006, b.bladeY1 - 0.0002, S.planeY, b.pocketRestR + dr, q, 14, 0.0002));
    g.fixed("blade_carriage", I.blade, "stainless", car, { cutaway: "keep", jointId: J.bladeS2, castShadow: false });
    g.fixed("blade_plate", I.blade, "ceramic", plate, { cutaway: "keep", jointId: J.bladeS2, castShadow: false });
    g.fixed("blade_pads", I.blade, "polymer_white", mergeMeshData(pads), { cutaway: "keep", jointId: J.bladeS2, castShadow: false, pickable: false, lod: "fine" });
    const wb = waferHalfMeshes(0.15, S.planeY, t, false, b.pocketRestR, 0);
    g.fixed("wafer_blade", I.waferBlade, "silicon_wafer", g.rot(wb.back), { cutaway: "keep", jointId: J.bladeS2, castShadow: false });
    g.fixed("wafer_blade_front", I.waferBlade, "wafer_front", g.rot(wb.front), { cutaway: "keep", jointId: J.bladeS2, castShadow: false });
  }
  // ---------------------------------------------------------------- atmospheric robot
  buildScaraRobotParts(sink, atmRobotSpec(S, efemFloorTop));
}

/** EFEM shell + FFU + HMI + load port module (dock plate, door opener), shared by the stations and the CMP front end. */
export interface EfemSpec {
  /** Lateral center of the EFEM in the station frame. */
  qc: number;
  /** Lateral center of the (active) load port bay; defaults to the EFEM center. */
  lpQ?: number;
  r0: number;
  r1: number;
  width: number;
  floorY: number;
  topY: number;
  ffuTopY: number;
  panelT: number;
  frameSize: number;
  /** Openings in the back wall (q relative to qc). */
  backHoles: { y0: number; y1: number; q0: number; q1: number }[];
  /** Side window height range. */
  windowY: [number, number];
  loadPort: {
    deckR0: number;
    deckR1: number;
    deckTopY: number;
    deckWidth: number;
    deckThickness: number;
    seatR: number;
    opening: { width: number; y0: number; y1: number; centerY: number };
    doorPull: number;
    doorLower: number;
    doorPlateThickness: number;
    couplingPads: [number, number][];
  };
}

export function buildEfemParts(g: StationGeom, e: EfemSpec): void {
  const I = STATION_IDS;
  const J = STATION_JOINTS;
  const fy = e.floorY;
  const qc = e.qc;
  const W = e.width / 2;
  const pt = e.panelT;
  const fs = e.frameSize;
  const efemFloorTop = fy + EFEM_FLOOR_RAISE;
  const qL = qc - W;
  const qR = qc + W;
  // frame, feet, floor plate
  const frame: MeshData[] = [];
  for (const r of [e.r0 + fs / 2, e.r1 - fs / 2]) for (const q of [qL + fs / 2, qR - fs / 2]) frame.push(g.box(r - fs / 2, r + fs / 2, fy + 0.02, e.topY, q - fs / 2, q + fs / 2, 0.004));
  for (const y of [efemFloorTop - fs, e.topY - fs]) {
    for (const q of [qL + fs / 2, qR - fs / 2]) frame.push(g.box(e.r0, e.r1, y, y + fs, q - fs / 2, q + fs / 2, 0.004));
    for (const r of [e.r0 + fs / 2, e.r1 - fs / 2]) frame.push(g.box(r - fs / 2, r + fs / 2, y, y + fs, qL, qR, 0.004));
  }
  g.fixed("efem_frame", I.efem, "aluminum_anodized", mergeMeshData(frame), { cutaway: "keep" });
  const feet: MeshData[] = [];
  for (const r of [e.r0 + 0.06, e.r1 - 0.06]) for (const q of [qL + 0.06, qR - 0.06]) feet.push(g.cylY(0.025, fy, fy + 0.02, r, q, 16, 0.003));
  g.fixed("efem_feet", I.efem, "dark_steel", mergeMeshData(feet), { cutaway: "keep", castShadow: false, lod: "fine" });
  g.fixed("efem_floor", I.efem, "painted_dark", g.box(e.r0 + fs, e.r1 - fs, efemFloorTop - 0.012, efemFloorTop, qL + fs, qR - fs, 0.002), { cutaway: "keep", castShadow: false });
  // back wall with the transfer openings
  g.fixed("efem_back_wall", I.efem, "painted_offwhite", g.holedPlate(e.r0, e.r0 + pt, efemFloorTop, e.topY - fs, qL + fs, qR - fs, e.backHoles.map((h) => ({ ...h, q0: h.q0 + qc, q1: h.q1 + qc }))), { cutaway: "keep" });
  const LQ = e.lpQ ?? qc;
  // front wall around the load port module bay + kick plate
  const lp = e.loadPort;
  const bay = { y0: lp.deckTopY - 0.24, y1: lp.opening.y1 + 0.06, q0: LQ - lp.deckWidth / 2 - 0.01, q1: LQ + lp.deckWidth / 2 + 0.01 };
  g.fixed("efem_front_wall", I.efem, "painted_offwhite", g.holedPlate(e.r1 - pt, e.r1, efemFloorTop, e.topY - fs, qL + fs, qR - fs, [bay]), { cutaway: "keep" });
  g.fixed("efem_kick_plate", I.efem, "painted_dark", g.box(e.r1 - pt - 0.002, e.r1 + 0.004, fy + 0.02, efemFloorTop + 0.08, qL + fs, qR - fs, 0.002), { cutaway: "keep", castShadow: false });
  // side covers with a window (removable for inspection)
  for (const sgn of [-1, 1]) {
    const qa = sgn > 0 ? qR - pt : qL;
    const qb = sgn > 0 ? qR : qL + pt;
    const win = { y0: e.windowY[0], y1: e.windowY[1], r0: e.r0 + 0.12, r1: e.r1 - 0.12 };
    g.fixed(`efem_side_cover_${sgn > 0 ? "p" : "n"}`, I.efem, "painted_offwhite", g.framedSide(qa, qb, efemFloorTop, e.topY - fs, e.r0 + fs, e.r1 - fs, win), { cutaway: "keep", cover: true });
    const qg = sgn > 0 ? qR - pt * 0.5 : qL + pt * 0.5;
    g.fixed(`efem_side_window_${sgn > 0 ? "p" : "n"}`, I.efem, "quartz", g.box(win.r0, win.r1, win.y0, win.y1, qg - 0.001, qg + 0.001, 0.0005), { cutaway: "keep", cover: true, isGlass: true, castShadow: false, pickable: false });
    const hdl: MeshData[] = [];
    const qo = sgn > 0 ? qR : qL;
    for (const r of [e.r0 + 0.2, e.r1 - 0.2]) hdl.push(g.box(r - 0.01, r + 0.01, win.y0 - 0.12, win.y0 - 0.04, qo + sgn * 0.002, qo + sgn * 0.018, 0.003));
    g.fixed(`efem_side_handles_${sgn > 0 ? "p" : "n"}`, I.efem, "dark_steel", mergeMeshData(hdl), { cutaway: "keep", cover: true, castShadow: false, lod: "fine", pickable: false });
  }
  // signal tower
  g.fixed("efem_signal_tower", I.efem, "dark_steel", g.cylY(0.012, e.ffuTopY, e.ffuTopY + 0.12, e.r1 - 0.08, qR - 0.08, 16), { cutaway: "keep", castShadow: false, lod: "fine" });
  const lamps: MeshData[] = [];
  for (let k = 0; k < 3; k++) lamps.push(g.cylY(0.022, e.ffuTopY + 0.12 + k * 0.035, e.ffuTopY + 0.152 + k * 0.035, e.r1 - 0.08, qR - 0.08, 20, 0.003));
  g.fixed("efem_signal_lamps", I.efem, "safety_marking", mergeMeshData(lamps), { cutaway: "keep", castShadow: false, lod: "fine", pickable: false });
  // FFU
  const ffu = g.box(e.r0, e.r1, e.topY, e.ffuTopY, qL, qR, 0.006);
  const grille: MeshData[] = [];
  for (let k = 1; k < 12; k++) {
    const r = e.r0 + ((e.r1 - e.r0) * k) / 12;
    grille.push(g.box(r - 0.003, r + 0.003, e.ffuTopY, e.ffuTopY + 0.004, qL + 0.06, qR - 0.06, 0.001));
  }
  const motor = g.cylY(0.11, e.ffuTopY, e.ffuTopY + 0.06, (e.r0 + e.r1) / 2, qc, 32, 0.006);
  g.fixed("ffu_box", I.ffu, "painted_offwhite", mergeMeshData([ffu, motor]), { cutaway: "keep" });
  g.fixed("ffu_grille", I.ffu, "dark_steel", mergeMeshData(grille), { cutaway: "keep", castShadow: false, lod: "fine", pickable: false });
  // HMI on a swing arm at the operator side, outside the load port module so the FOUP hoisted by the OHT passes by
  const hq0 = LQ + lp.deckWidth / 2 + 0.005;
  const hq1 = qR + 0.01;
  const qh = (hq0 + hq1) / 2;
  const yh = fy + 1.48;
  const arm = g.tube([[e.r1 + 0.005, yh - 0.12, qh], [e.r1 + 0.09, yh - 0.12, qh], [e.r1 + 0.09, yh - 0.02, qh]], 0.012, 0.03);
  g.fixed("hmi_arm", I.hmi, "dark_steel", arm, { cutaway: "keep", castShadow: false });
  g.fixed("hmi_screen", I.hmi, "painted_offwhite", g.box(e.r1 + 0.075, e.r1 + 0.11, yh, yh + 0.27, hq0, hq1, 0.008), { cutaway: "keep" });
  g.fixed("hmi_glass", I.hmi, "painted_dark", g.box(e.r1 + 0.11, e.r1 + 0.112, yh + 0.02, yh + 0.25, hq0 + 0.02, hq1 - 0.02, 0.001), { cutaway: "keep", castShadow: false });
  // load port module: frame plate with the opening (flush with the front wall; the docked FOUP rim stops at its face),
  // deck, column, door guide rails, indicators
  const op = lp.opening;
  const dw = lp.deckWidth / 2;
  g.fixed("lp_frame_plate", I.loadPort, "painted_offwhite", g.holedPlate(e.r1 - 0.026, e.r1, bay.y0 + 0.001, bay.y1 - 0.001, bay.q0 + 0.001, bay.q1 - 0.001, [{ y0: op.y0, y1: op.y1, q0: LQ - op.width / 2, q1: LQ + op.width / 2 }]), { cutaway: "keep" });
  const deckY1 = lp.deckTopY - 0.012;
  g.fixed("lp_deck", I.loadPort, "stainless", g.box(lp.deckR0, lp.deckR1, deckY1 - lp.deckThickness, deckY1, LQ - dw, LQ + dw, 0.004), { cutaway: "keep" });
  g.fixed("lp_column", I.loadPort, "painted_offwhite", g.box(lp.deckR0 + 0.012, lp.deckR0 + 0.2, fy + 0.02, deckY1 - lp.deckThickness, LQ - dw + 0.04, LQ + dw - 0.04, 0.006), { cutaway: "keep" });
  // the pulled door slides down between two guide rails beside the opening, inside the door opener zone (outside the robot swing)
  const railR0 = e.r1 - lp.doorPull - lp.doorPlateThickness;
  const rails: MeshData[] = [];
  for (const sgn of [-1, 1]) rails.push(g.box(railR0, railR0 + lp.doorPlateThickness, op.y0 - lp.doorLower - 0.06, op.y1, LQ + sgn * (op.width / 2 + 0.004), LQ + sgn * (op.width / 2 + 0.024), 0.003));
  g.fixed("lp_opener_rail", I.loadPort, "dark_steel", mergeMeshData(rails), { cutaway: "keep", castShadow: false });
  // indicator panel above the opening: a white strip with a row of unlit status lenses (green, yellow, red, blue
  // pairs), as on the documentary load ports; lens colours carry no lit state
  g.fixed("lp_indicator_panel", I.loadPort, "polymer_white", g.box(e.r1, e.r1 + 0.006, op.y1 + 0.012, op.y1 + 0.05, LQ - 0.17, LQ + 0.17, 0.002), { cutaway: "keep", castShadow: false });
  const lens = (k: number) => g.box(e.r1 + 0.006, e.r1 + 0.01, op.y1 + 0.025, op.y1 + 0.037, LQ - 0.14 + k * 0.04 - 0.006, LQ - 0.14 + k * 0.04 + 0.006, 0.001);
  const lensRefs = ["indicator_green", "indicator_green", "safety_marking", "safety_marking", "marking_red", "marking_red", "indicator_blue", "indicator_blue"] as const;
  for (const ref of new Set(lensRefs)) {
    const md = mergeMeshData(lensRefs.map((r, k) => (r === ref ? lens(k) : null)).filter((m): m is MeshData => !!m));
    g.fixed(`lp_indicators_${ref}`, I.loadPort, ref, md, { cutaway: "keep", castShadow: false, lod: "fine", pickable: false });
  }
  // dock plate + kinematic pins (lp_dock); FOUP pad (px, pz) -> station (seat - px, -pz) because the FOUP +X faces the tool
  const dock = g.box(lp.seatR - 0.18, lp.seatR + 0.18, deckY1, lp.deckTopY, LQ - 0.17, LQ + 0.17, 0.003);
  const pins: MeshData[] = [];
  for (const [px, pz] of lp.couplingPads) pins.push(g.cylY(0.007, lp.deckTopY - 0.001, lp.deckTopY + 0.01, lp.seatR - px, LQ - pz, 16, 0.003));
  pins.push(g.box(lp.seatR - 0.02, lp.seatR + 0.02, lp.deckTopY, lp.deckTopY + 0.01, LQ - 0.005, LQ + 0.005, 0.002));
  g.fixed("lp_dock_plate", I.dock, "aluminum_anodized", dock, { cutaway: "keep", jointId: J.dock });
  g.fixed("lp_dock_pins", I.dock, "stainless", mergeMeshData(pins), { cutaway: "keep", jointId: J.dock, castShadow: false });
  // port door (opener) with latch keys
  const pd = g.box(e.r1 - lp.doorPlateThickness, e.r1 - 0.001, op.y0 + 0.006, op.y1 - 0.006, LQ - op.width / 2 + 0.006, LQ + op.width / 2 - 0.006, 0.004);
  const keys: MeshData[] = [];
  for (const q of [-0.1, 0.1]) keys.push(g.cylR(0.009, e.r1 - 0.002, e.r1 + 0.006, op.centerY, LQ + q, 16));
  for (const q of [-0.13, 0.13]) for (const yy of [op.y0 + 0.05, op.y1 - 0.05]) keys.push(g.cylR(0.006, e.r1 - 0.002, e.r1 + 0.004, yy, LQ + q, 12));
  g.fixed("lp_port_door", I.opener, "painted_offwhite", pd, { cutaway: "keep", jointId: J.doorLower });
  g.fixed("lp_port_door_keys", I.opener, "dark_steel", mergeMeshData(keys), { cutaway: "keep", jointId: J.doorLower, castShadow: false, lod: "fine" });
}

/**
 * Slit gate valve between the chamber port face and the load lock adapter: body with a through
 * opening, gate plate (moves down on `slit_gate`), pneumatic actuator, bonnet bolts, and the two limit
 * switch bodies of the existing gate status instrument (one instrument, one body bracket).
 * The gate seals on the load-lock side of the body and retreats into the bonnet; bonnet and actuator hang
 * outside the chamber's bottom flange (`slit.lowerR0`).
 */
export function buildSlitGateValve(sink: PartSink, S: HandlingStationLayout, doorThickness: number, gateTravel: number): void {
  const g = new StationGeom(S.az, sink);
  const sl = S.slit;
  const [vw, vh] = sl.valveSize;
  const r0 = sl.valveR0;
  const r1 = sl.valveR1;
  const yc = sl.centerY;
  const yb = yc - vh / 2;
  const gm = SLIT_GATE_MARGIN;
  const bonnetR0 = sl.lowerR0;
  const bonnetR1 = r1 - 0.01;
  const bonnetQ = Math.max(vw / 2 - 0.04, sl.width / 2 + 0.025);
  const actR = (bonnetR0 + bonnetR1) / 2;
  const body = g.framedPlate(r0, r1, yb, yc + vh / 2, -vw / 2, vw / 2, { y0: sl.y0, y1: sl.y1, q0: -sl.width / 2, q1: sl.width / 2 }, 0.005);
  const bonnet = g.box(bonnetR0, bonnetR1, yb - SLIT_BONNET_HEIGHT, yb, -bonnetQ, bonnetQ, 0.004);
  sink.fixed("slit_valve_body", STATION_IDS.slitValve, "aluminum_machined", mergeMeshData([body, bonnet]), { cutaway: "hide-in-sector", azimuth: S.az });
  const act = g.cylY(0.028, yb - 0.21, yb - SLIT_BONNET_HEIGHT, actR, 0, 32, 0.003);
  const rod = g.cylY(0.01, yb - 0.25, yb - 0.21, actR, 0, 16);
  // limit switch pair + cable of the gate status instrument (sensor body with bracket and cable)
  const swR = actR;
  const sw: MeshData[] = [g.box(swR - 0.012, swR + 0.012, yb - 0.2, yb - 0.06, 0.032, 0.036, 0.001)];
  for (const yy of [yb - 0.08, yb - 0.18]) sw.push(g.box(swR - 0.012, swR + 0.012, yy - 0.012, yy + 0.012, 0.036, 0.058, 0.002));
  // the cable leaves sideways (along q), inside the process enclosure
  const cable = g.tube([[swR, yb - 0.19, 0.058], [swR, yb - 0.27, 0.07], [swR, yb - 0.3, 0.13]], 0.003, 0.02, 8);
  sink.fixed("slit_valve_actuator", STATION_IDS.slitValve, "stainless", mergeMeshData([act, rod]), { cutaway: "hide-in-sector", azimuth: S.az, pickable: true });
  sink.fixed("slit_valve_switches", STATION_IDS.slitValve, "painted_dark", mergeMeshData([...sw, cable]), { cutaway: "hide-in-sector", azimuth: S.az, castShadow: false });
  const bolts: MeshData[] = [];
  for (let i = 0; i < 6; i++) bolts.push(g.cylR(0.006, r1, r1 + 0.006, i % 2 === 0 ? yc + vh / 2 - 0.02 : yc - vh / 2 + 0.02, -vw / 2 + 0.03 + Math.floor(i / 2) * ((vw - 0.06) / 2), 16));
  sink.fixed("slit_valve_bolts", STATION_IDS.slitValve, "dark_steel", mergeMeshData(bolts), { cutaway: "hide-in-sector", azimuth: S.az, pickable: false, castShadow: false, lod: "fine" });
  // gate plate (closed = covers the slit, seals on the load-lock side); its rod runs down the actuator axis
  const gr1 = r1 - SLIT_GATE_INSET;
  const gate = g.box(gr1 - doorThickness, gr1, sl.y0 - gm, sl.y1 + gm, -sl.width / 2 - 0.02, sl.width / 2 + 0.02, 0.002);
  const seal = g.box(gr1, gr1 + 0.002, sl.y0 - 0.008, sl.y1 + 0.008, -sl.width / 2 - 0.012, sl.width / 2 + 0.012, 0.0008);
  const gateRod = g.cylY(0.008, sl.y0 - gm - gateTravel, sl.y0 - gm, actR, 0, 12);
  sink.fixed("slit_gate_plate", STATION_IDS.slitGate, "aluminum_machined", mergeMeshData([gate, gateRod]), { cutaway: "hide-in-sector", azimuth: S.az, jointId: STATION_JOINTS.slitGate });
  sink.fixed("slit_gate_seal", STATION_IDS.slitGate, "rubber_membrane", seal, { cutaway: "hide-in-sector", azimuth: S.az, jointId: STATION_JOINTS.slitGate, castShadow: false, pickable: false, lod: "fine" });
}

/** Process enclosure (frame + removable panels + viewing window) and the rear facility interface. */
export function buildProcessEnclosureParts(sink: PartSink, floorY: number, e: ProcessEnclosureSpec, ids: { enclosure: string; facility: string }): void {
  const fy = floorY;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c = 0.003) => chamferedBox([Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)], Math.min(c, Math.abs(x1 - x0) / 4, (y1 - y0) / 4, Math.abs(z1 - z0) / 4), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
  const pt = 0.012;
  const fs = 0.04;
  const top = e.topY;
  // frame
  const frame: MeshData[] = [];
  for (const x of [e.x0 + fs / 2, e.x1 - fs / 2]) for (const z of [e.z0 + fs / 2, e.z1 - fs / 2]) frame.push(box(x - fs / 2, x + fs / 2, fy + 0.02, top, z - fs / 2, z + fs / 2, 0.004));
  for (const y of [fy + 0.08, top - fs]) {
    for (const z of [e.z0 + fs / 2, e.z1 - fs / 2]) frame.push(box(e.x0, e.x1, y, y + fs, z - fs / 2, z + fs / 2, 0.004));
    for (const x of [e.x0 + fs / 2, e.x1 - fs / 2]) frame.push(box(x - fs / 2, x + fs / 2, y, y + fs, e.z0, e.z1, 0.004));
  }
  sink.fixed("penc_frame", ids.enclosure, "aluminum_anodized", mergeMeshData(frame), { cutaway: "keep" });
  const feet: MeshData[] = [];
  for (const x of [e.x0 + 0.06, e.x1 - 0.06]) for (const z of [e.z0 + 0.06, e.z1 - 0.06]) feet.push(translateMeshData(revolveProfile(chamfRect(0, 0.025, fy, fy + 0.02, 0.003), { segments: 16 }), x, 0, z));
  sink.fixed("penc_feet", ids.enclosure, "dark_steel", mergeMeshData(feet), { cutaway: "keep", castShadow: false, lod: "fine" });
  // -Z panel with the viewing window (cover)
  const w = e.window;
  const zN0 = e.z0;
  const zN1 = e.z0 + pt;
  const nPanel = mergeMeshData([
    box(e.x0 + fs, e.x1 - fs, fy + 0.1, w.y0, zN0, zN1),
    box(e.x0 + fs, e.x1 - fs, w.y1, top - fs, zN0, zN1),
    box(e.x0 + fs, w.x0, w.y0, w.y1, zN0, zN1),
    box(w.x1, e.x1 - fs, w.y0, w.y1, zN0, zN1),
  ]);
  sink.fixed("penc_panel_front", ids.enclosure, "painted_offwhite", nPanel, { cutaway: "keep", cover: true });
  sink.fixed("penc_window", ids.enclosure, "quartz", box(w.x0, w.x1, w.y0, w.y1, zN0 + 0.004, zN0 + 0.008, 0.001), { cutaway: "keep", cover: true, isGlass: true, castShadow: false, pickable: false });
  // +Z maintenance panel pair (cover) with handles
  const zP0 = e.z1 - pt;
  const xm = (e.x0 + e.x1) / 2;
  sink.fixed("penc_panel_back", ids.enclosure, "painted_offwhite", mergeMeshData([box(e.x0 + fs, xm - 0.002, fy + 0.1, top - fs, zP0, e.z1), box(xm + 0.002, e.x1 - fs, fy + 0.1, top - fs, zP0, e.z1)]), { cutaway: "keep", cover: true });
  const handles: MeshData[] = [];
  for (const x of [xm - 0.06, xm + 0.06]) handles.push(box(x - 0.012, x + 0.012, fy + 0.9, fy + 1.05, e.z1, e.z1 + 0.018, 0.003));
  sink.fixed("penc_handles", ids.enclosure, "dark_steel", mergeMeshData(handles), { cutaway: "keep", cover: true, castShadow: false, lod: "fine", pickable: false });
  // station-side panel (cover) with the load-lock pass-through, +X rear panel (cover) with the facility cut-out
  const so = e.stationOpening;
  const sideX0 = Math.min(e.x0, e.x1) === e.x0 ? e.x0 : e.x1;
  const zc = so.centerZ ?? 0;
  const yA = Math.max(fy + 0.1, so.y0);
  const yB = Math.min(top - fs, so.y1);
  const stParts: MeshData[] = [];
  if (yA > fy + 0.1 + 1e-4) stParts.push(box(sideX0, sideX0 + pt, fy + 0.1, yA, e.z0 + fs, e.z1 - fs));
  if (top - fs > yB + 1e-4) stParts.push(box(sideX0, sideX0 + pt, yB, top - fs, e.z0 + fs, e.z1 - fs));
  if (zc - so.halfQ > e.z0 + fs + 1e-4) stParts.push(box(sideX0, sideX0 + pt, yA, yB, e.z0 + fs, zc - so.halfQ));
  if (e.z1 - fs > zc + so.halfQ + 1e-4) stParts.push(box(sideX0, sideX0 + pt, yA, yB, zc + so.halfQ, e.z1 - fs));
  const stPanel = mergeMeshData(stParts);
  sink.fixed("penc_panel_station", ids.enclosure, "painted_offwhite", stPanel, { cutaway: "keep", cover: true });
  const f = e.facility;
  const rear = mergeMeshData([
    box(e.x1 - pt, e.x1, fy + 0.1, f.y - 0.2, e.z0 + fs, e.z1 - fs),
    box(e.x1 - pt, e.x1, f.y + 0.2, top - fs, e.z0 + fs, e.z1 - fs),
    box(e.x1 - pt, e.x1, f.y - 0.2, f.y + 0.2, e.z0 + fs, f.z - 0.22),
    box(e.x1 - pt, e.x1, f.y - 0.2, f.y + 0.2, f.z + 0.22, e.z1 - fs),
  ]);
  sink.fixed("penc_panel_rear", ids.enclosure, "painted_offwhite", rear, { cutaway: "keep", cover: true });
  // top panel (cover), optionally with a square cut-out for an upstream source
  const tp: MeshData[] = [];
  const cut = e.topCut ?? (e.topCutHalf ? { x: 0, z: 0, half: e.topCutHalf } : null);
  if (cut) {
    const { x: cx, z: cz, half: h } = cut;
    tp.push(box(e.x0 + fs, e.x1 - fs, top - pt, top, e.z0 + fs, cz - h), box(e.x0 + fs, e.x1 - fs, top - pt, top, cz + h, e.z1 - fs), box(e.x0 + fs, cx - h, top - pt, top, cz - h, cz + h), box(cx + h, e.x1 - fs, top - pt, top, cz - h, cz + h));
  } else tp.push(box(e.x0 + fs, e.x1 - fs, top - pt, top, e.z0 + fs, e.z1 - fs));
  sink.fixed("penc_panel_top", ids.enclosure, "painted_offwhite", mergeMeshData(tp), { cutaway: "keep", cover: true });
  sink.fixed("penc_kick", ids.enclosure, "painted_dark", mergeMeshData([box(e.x0 + fs, e.x1 - fs, fy + 0.02, fy + 0.1, zN0 - 0.002, zN1), box(e.x0 + fs, e.x1 - fs, fy + 0.02, fy + 0.1, zP0, e.z1 + 0.002)]), { cutaway: "keep", castShadow: false });
  // facility interface (fixed bulkhead plate with gas, RF, exhaust, coolant and power entries)
  const fx = e.x1;
  const plate = box(fx - 0.004, fx + 0.008, f.y - 0.2, f.y + 0.2, f.z - 0.22, f.z + 0.22, 0.004);
  const fittings: MeshData[] = [];
  const along = (r: number, x0: number, x1: number, y: number, z: number) => {
    const md = revolveProfile(chamfRect(0, r, x0, x1, Math.min(0.002, (x1 - x0) / 3)), { segments: 20 });
    for (let i = 0; i < md.positions.length; i += 3) {
      const x = md.positions[i];
      const yy = md.positions[i + 1];
      const zz = md.positions[i + 2];
      md.positions[i] = yy;
      md.positions[i + 1] = zz + y;
      md.positions[i + 2] = x + z;
      const nx = md.normals[i];
      const ny = md.normals[i + 1];
      const nz = md.normals[i + 2];
      md.normals[i] = ny;
      md.normals[i + 1] = nz;
      md.normals[i + 2] = nx;
    }
    return md;
  };
  for (let k = 0; k < 3; k++) fittings.push(along(0.008, fx + 0.008, fx + 0.05, f.y + 0.12, f.z - 0.15 + k * 0.05));
  const rf = along(0.018, fx + 0.008, fx + 0.07, f.y + 0.02, f.z - 0.12);
  const cool = [along(0.01, fx + 0.008, fx + 0.06, f.y - 0.1, f.z + 0.05), along(0.01, fx + 0.008, fx + 0.06, f.y - 0.1, f.z + 0.1)];
  const exhaust = mergeMeshData([along(0.05, fx + 0.008, fx + 0.06, f.y + 0.02, f.z + 0.12), translateMeshData(revolveProfile(rectProfile(0.045, 0.05, f.y + 0.02, f.y + 0.6), { segments: 28, caps: false }), fx + 0.1, 0, f.z + 0.12)]);
  const power = box(fx + 0.008, fx + 0.06, f.y - 0.18, f.y - 0.12, f.z - 0.18, f.z - 0.08, 0.004);
  sink.fixed("facility_plate", ids.facility, "stainless", plate, { cutaway: "keep" });
  sink.fixed("facility_gas", ids.facility, "stainless", mergeMeshData(fittings), { cutaway: "keep", castShadow: false });
  sink.fixed("facility_rf_power", ids.facility, "painted_dark", mergeMeshData([rf, power]), { cutaway: "keep", castShadow: false });
  sink.fixed("facility_coolant", ids.facility, "polymer_gray", mergeMeshData(cool), { cutaway: "keep", castShadow: false });
  sink.fixed("facility_exhaust", ids.facility, "stainless", exhaust, { cutaway: "keep", castShadow: false });
}

/** Instance-frame point of the facility interface (exhaust duct top) for the environment's utility drops. */
/** Facility interface plate (front face center and outward normal, instance frame) for the bay utility drops. */
export function facilityInterfaceOf(e: ProcessEnclosureSpec): { center: [number, number, number]; normal: [number, number, number] } {
  return { center: [e.x1 + 0.008, e.facility.y, e.facility.z], normal: [1, 0, 0] };
}

export type { Mat };
