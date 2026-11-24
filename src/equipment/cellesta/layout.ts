/**
 * CELLESTA-i MD based single-wafer wet clean tool: layout in the instance frame (metres).
 * Origin on the PM-01 spin axis at the wafer support plane (process height); +Y up; the front end is
 * toward -X. Dry FOUP -> EFEM robot -> pass station -> transfer robot -> PM-01 spin chuck; clean, rinse and
 * the IPA / atmosphere-related drying happen inside PM-01, and the transfer robot takes the wafer out dry.
 * All dimensions come from config/geometry/cellesta-i-md-v1.json (representative configuration).
 */
import rawConfig from "../../../config/geometry/cellesta-i-md-v1.json";
import { DEG, type ValidationReport, type Vec3Tuple } from "../../config/geometry";
import { FOUP_INTERFACE } from "../handling/foupInterface";
import type { FoupInterface } from "../handling/stationLayout";
import { scaraSwingRadius, type ScaraGeom } from "../handling/scara";

interface RobotCfg {
  axis_x: number;
  axis_z: number;
  base_radius: number;
  column_radius: number;
  z_stroke: number;
  z_margin_below: number;
  link_length: number;
  link_width: number;
  link1_thickness: number;
  link2_thickness: number;
  hub_radius: number;
  ee_reach: number;
  ee_mount_height: number;
  ee_thickness: number;
  pad_height: number;
  approach_clearance: number;
  tine_q: [number, number];
  tip_beyond_center: number;
}

export interface CellestaConfig {
  geometry_revision: string;
  template_id: string;
  title: string;
  source: { kind: "assumed" | "measured" | "vendor"; note: string; references: string[] };
  wafer: { diameter: number; thickness: number };
  floor_y: number;
  process_module: {
    box: { x0: number; x1: number; z0: number; z1: number; top_y: number };
    shutter: { width: number; height: number; center_y: number; travel: number; thickness: number };
    cup: { inner_radius: number; wall_thickness: number; outer_radius: number; bottom_y: number; floor_thickness: number; rim_y: number; partition_radius: number; partition_top_y: number; note: string };
    guard: { inner_radius: number; outer_radius: number; lip_height: number; skirt_bottom_y: number; levels: { transfer: number; chemical: number; rinse: number }; note: string };
    chuck: { hub_radius: number; hub_thickness: number; support_pin_radius: number; support_pin_count: number; support_pin_height: number; edge_pin_radius: number; spindle_radius: number; motor_radius: number; motor_y0: number; motor_y1: number };
    arm: { pivot: Vec3Tuple; length: number; arm_height: number; nozzle_drop: number; park_deg: number; center_deg: number; sweep_edge_deg: number; column_radius: number; nozzles: string[] };
    supply: { manifold_center: Vec3Tuple; manifold_size: Vec3Tuple; filter_center: Vec3Tuple; filter_radius: number; filter_height: number };
    drain: { outer_x: number; inner_x: number; z: number; radius: number };
    exhaust: { duct_radius: number; x: number; z: number };
  };
  front_end: {
    efem: { x_back: number; depth: number; center_z: number; width: number; height_above_floor: number; ffu_height: number; panel_thickness: number; frame_size: number; door_zone_depth: number };
    load_port: { deck_depth: number; deck_width: number; deck_height_above_floor: number; deck_thickness: number; dock_stroke: number; door_gap: number; opening_width: number; opening_height: number; opening_bottom_above_deck: number; door_pull: number; door_lower: number; door_plate_thickness: number };
    load_ports_z: number[];
    active_load_port_index: number;
    atm_robot: RobotCfg;
    pass_station: { x: number; z: number; plane_y: number; half_x: number; half_z: number; pin_radius: number; pin_q: number; pin_r: number[]; housing_y0: number; housing_y1: number };
    transfer_robot: RobotCfg;
    corridor: { x0: number; x1: number; half_z: number; top_y: number };
  };
  tool: {
    note: string;
    idle_modules: { moduleId: string; center: Vec3Tuple; size: Vec3Tuple; facing: Vec3Tuple }[];
    chemical_cabinet: { x0: number; x1: number; z0: number; z1: number; height: number };
    tower: { x0: number; x1: number; z0: number; z1: number; height: number };
  };
}

export interface RobotLayout {
  geom: ScaraGeom;
  cfg: RobotCfg;
  shoulderY0: number;
  baseTopY: number;
  supportOffset: number;
  floorY: number;
  swingRadius: number;
}

export interface CellestaLayout {
  cfg: CellestaConfig;
  floorY: number;
  rWafer: number;
  waferThickness: number;
  /** Station frame of the front end (az = pi: r = -x, q = -z). */
  az: number;
  efem: { r0: number; r1: number; qc: number; lpQ: number; width: number; topY: number; ffuTopY: number; doorZoneR: number };
  loadPort: { deckR0: number; deckR1: number; deckTopY: number; deckWidth: number; deckThickness: number; seatR: number; dockedR: number; dockStroke: number; opening: { width: number; y0: number; y1: number; centerY: number }; doorPull: number; doorLower: number; doorPlateThickness: number };
  foup: FoupInterface;
  slotY: (slot: number) => number;
  seat: Vec3Tuple;
  doorFacing: Vec3Tuple;
  /** FOUP wafer center (docked) in the instance frame. */
  foupWafer: [number, number];
  atm: RobotLayout;
  tr: RobotLayout;
  pass: { x: number; z: number; planeY: number };
  pm: CellestaConfig["process_module"];
  /** Nozzle head position (x, z) for an arm angle (rad, about +Y at the pivot; 0 = over the spin axis). */
  nozzleAt: (angleRad: number) => [number, number];
  armRestDir: [number, number];
  tool: CellestaConfig["tool"];
}

export const CELLESTA_CONFIG = rawConfig as unknown as CellestaConfig;

function robot(c: RobotCfg, lowestPlane: number, floorY: number, d0: [number, number]): RobotLayout {
  const supportOffset = c.link1_thickness + c.link2_thickness + c.ee_mount_height + c.ee_thickness + c.pad_height;
  const shoulderY0 = lowestPlane - c.approach_clearance - supportOffset - c.z_margin_below;
  const geom: ScaraGeom = { axisXZ: [c.axis_x, c.axis_z], d0, linkLength: c.link_length, eeReach: c.ee_reach };
  return { geom, cfg: c, shoulderY0, baseTopY: shoulderY0 - 0.03, supportOffset, floorY, swingRadius: scaraSwingRadius(geom, c.hub_radius, 0.15, c.tip_beyond_center) };
}

export function deriveCellestaLayout(cfg: CellestaConfig): CellestaLayout {
  const fe = cfg.front_end;
  const foup = FOUP_INTERFACE;
  const floorY = cfg.floor_y;
  const r0 = -fe.efem.x_back;
  const r1 = r0 + fe.efem.depth;
  const lp = fe.load_port;
  const activeZ = fe.load_ports_z[fe.active_load_port_index];
  const deckTopY = floorY + lp.deck_height_above_floor;
  const dockedR = r1 + foup.doorFaceX + lp.door_gap;
  const seatR = dockedR + lp.dock_stroke;
  const slotY = (slot: number) => deckTopY + foup.slot1Height + (slot - 1) * foup.slotPitch;
  const opY0 = deckTopY + lp.opening_bottom_above_deck;
  const ps = fe.pass_station;
  const atm = robot(fe.atm_robot, Math.min(ps.plane_y, slotY(1)), floorY, [-1, 0]);
  const tr = robot(fe.transfer_robot, Math.min(ps.plane_y, 0), floorY, [1, 0]);
  const arm = cfg.process_module.arm;
  const pv = arm.pivot;
  // arm rest direction: from the pivot toward the spin axis (angle 0 puts the nozzle over the axis)
  const toAxis: [number, number] = [-pv[0], -pv[2]];
  const n = Math.hypot(toAxis[0], toAxis[1]);
  const armRestDir: [number, number] = [toAxis[0] / n, toAxis[1] / n];
  const nozzleAt = (a: number): [number, number] => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Babylon rotation about +Y: (x, z) -> (x c + z s, -x s + z c)
    const d: [number, number] = [armRestDir[0] * c + armRestDir[1] * s, -armRestDir[0] * s + armRestDir[1] * c];
    return [pv[0] + d[0] * arm.length, pv[2] + d[1] * arm.length];
  };
  return {
    cfg,
    floorY,
    rWafer: cfg.wafer.diameter / 2,
    waferThickness: cfg.wafer.thickness,
    az: Math.PI,
    efem: { r0, r1, qc: -fe.efem.center_z, lpQ: -activeZ, width: fe.efem.width, topY: floorY + fe.efem.height_above_floor, ffuTopY: floorY + fe.efem.height_above_floor + fe.efem.ffu_height, doorZoneR: r1 - fe.efem.door_zone_depth },
    loadPort: { deckR0: r1, deckR1: r1 + lp.deck_depth, deckTopY, deckWidth: lp.deck_width, deckThickness: lp.deck_thickness, seatR, dockedR, dockStroke: lp.dock_stroke, opening: { width: lp.opening_width, y0: opY0, y1: opY0 + lp.opening_height, centerY: opY0 + lp.opening_height / 2 }, doorPull: lp.door_pull, doorLower: lp.door_lower, doorPlateThickness: lp.door_plate_thickness },
    foup,
    slotY,
    seat: [-seatR, deckTopY, activeZ],
    doorFacing: [1, 0, 0],
    foupWafer: [-(dockedR - foup.waferCenterX), activeZ],
    atm,
    tr,
    pass: { x: ps.x, z: ps.z, planeY: ps.plane_y },
    pm: cfg.process_module,
    nozzleAt,
    armRestDir,
    tool: cfg.tool,
  };
}

export const CELLESTA_LAYOUT: CellestaLayout = deriveCellestaLayout(CELLESTA_CONFIG);

/** Arm angle (rad) of a named arm position. */
export function armAngle(L: CellestaLayout, which: "park" | "center" | "edge"): number {
  const a = L.pm.arm;
  return (which === "park" ? a.park_deg : which === "center" ? a.center_deg : a.sweep_edge_deg) * DEG;
}

export function validateCellestaConfig(cfg: CellestaConfig = CELLESTA_CONFIG): ValidationReport {
  const L = deriveCellestaLayout(cfg);
  const errors: string[] = [];
  const warnings: string[] = [];
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(`cellesta: ${msg}`);
  };
  const W = L.rWafer;
  const pm = L.pm;
  const reach = (g: ScaraGeom, x: number, z: number) => Math.hypot(x - g.axisXZ[0], z - g.axisXZ[1]);
  for (const [name, r, x, z] of [
    ["EFEM robot -> FOUP slot", L.atm, L.foupWafer[0], L.foupWafer[1]],
    ["EFEM robot -> pass station", L.atm, L.pass.x, L.pass.z],
    ["transfer robot -> pass station", L.tr, L.pass.x, L.pass.z],
    ["transfer robot -> PM-01 chuck", L.tr, 0, 0],
  ] as const) {
    const rho = reach(r.geom, x, z);
    must(rho - r.geom.eeReach < 2 * r.geom.linkLength - 0.02 && rho - r.geom.eeReach > 0.05, `${name} must be reachable (rho ${rho.toFixed(3)} m)`);
  }
  // only the end effector enters PM-01: the wrist (hub) stays outside the shutter face while placing
  const wristX = L.tr.geom.axisXZ[0] + (reach(L.tr.geom, 0, 0) - L.tr.geom.eeReach) + L.tr.cfg.hub_radius;
  must(wristX <= pm.box.x0 - 0.005, `transfer robot wrist must stay outside PM-01 (wrist ${(wristX * 1000).toFixed(0)} mm vs shutter ${(pm.box.x0 * 1000).toFixed(0)} mm)`);
  must(pm.shutter.width >= 2 * W + 0.04, "PM-01 shutter must pass the wafer with 20 mm per side");
  must(pm.shutter.center_y - pm.shutter.height / 2 <= -0.012 && pm.shutter.center_y + pm.shutter.height / 2 >= 0.03, "PM-01 shutter opening must pass the end effector and the wafer");
  // cup / guard / chuck geometry around the wafer
  must(pm.chuck.support_pin_radius < W && pm.chuck.edge_pin_radius > W - 0.002 && pm.chuck.edge_pin_radius < W + 0.004, "chuck support pins under the wafer edge, edge pins at the edge");
  must(pm.guard.inner_radius > W + 0.008, "splash guard must clear the wafer edge");
  must(pm.guard.levels.transfer + pm.guard.lip_height < -0.02, "guard top must drop below the transfer plane (end effector path) for transfer");
  must(pm.guard.levels.chemical + pm.guard.lip_height > 0.02, "guard must rise above the wafer for the chemical step");
  must(pm.cup.inner_radius > pm.guard.outer_radius - 0.002 && pm.cup.rim_y > pm.guard.levels.chemical + pm.guard.lip_height, "guard must move inside the cup");
  // nozzle parks outside the cup and sweeps over the wafer
  const park = L.nozzleAt(armAngle(L, "park"));
  must(Math.hypot(park[0], park[1]) > pm.cup.outer_radius + 0.02, "nozzle park position must be outside the cup");
  const center = L.nozzleAt(armAngle(L, "center"));
  must(Math.hypot(center[0], center[1]) < 0.01, "arm center angle must put the nozzle over the spin axis");
  const edge = L.nozzleAt(armAngle(L, "edge"));
  must(Math.hypot(edge[0], edge[1]) < W && Math.hypot(edge[0], edge[1]) > W - 0.05, "arm edge angle must put the nozzle near the wafer edge");
  // pass station straddles the EFEM back wall; robots swing inside their spaces
  must(L.pass.x - cfg.front_end.pass_station.half_x < -L.efem.r0 && L.pass.x + cfg.front_end.pass_station.half_x > -L.efem.r0, "pass station must straddle the EFEM back wall");
  must(L.atm.geom.axisXZ[0] - L.atm.swingRadius >= -L.efem.r1 + 0.02 && L.atm.geom.axisXZ[0] + L.atm.swingRadius <= -L.efem.r0 - 0.02, "EFEM robot swing must fit the EFEM depth");
  must(L.tr.geom.axisXZ[0] - L.tr.swingRadius >= cfg.front_end.pass_station.x + cfg.front_end.pass_station.half_x + 0.01, "transfer robot swing must clear the pass station housing");
  must(L.tr.geom.axisXZ[0] + L.tr.swingRadius <= pm.box.x0 - 0.01, "transfer robot swing must clear PM-01");
  must(L.loadPort.seatR > L.loadPort.deckR0 + 0.15 && L.loadPort.seatR < L.loadPort.deckR1 - 0.1, "FOUP seat must lie on the load port deck");
  return { errors, warnings };
}
