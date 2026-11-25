/**
 * Tactras based rectangular-cluster etch tool: layout in the instance frame (metres).
 * Origin on the PM-01 chamber axis at the ESC (chuck) top surface; +Y up; the handling station runs toward
 * -X through the transfer chamber, load lock and EFEM to load port LP1. The lower electrode is fixed: the
 * wafer is exchanged by the lift pins above it (no stage lift), so the station's stage offset is zero.
 * Every dimension comes from config/geometry/tactras-oxide-rie-v1.json (representative configuration).
 */
import rawConfig from "../../../config/geometry/tactras-oxide-rie-v1.json";
import { DEG, normalizeAngle, type AngularInterval, type PortPlacement, type StationLayout, type ValidationReport, type Vec3Tuple } from "../../config/geometry";
import { FOUP_INTERFACE } from "../handling/foupInterface";
import { deriveHandlingStation, validateHandlingStation, type ChamberHandlingInput, type HandlingStationConfig } from "../handling/stationLayout";
import type { PlasmaBounds } from "../../plasma/plasmaVolume";

export interface TactrasConfig {
  geometry_revision: string;
  template_id: string;
  title: string;
  source: { kind: "assumed" | "measured" | "vendor"; note: string; references: string[] };
  wafer: { diameter: number; thickness: number };
  chamber: { inner_diameter: number; wall_thickness: number; floor_top_y: number; floor_thickness: number; wall_top_y: number; floor_bore_diameter: number; top_flange_outer_diameter: number; top_flange_height: number; bottom_flange_outer_diameter: number; bottom_flange_height: number; liner_thickness: number; liner_clearance: number; liner_bottom_y: number; liner_top_y: number };
  lid: { thickness: number; diameter: number; bore_diameter: number; bolt_count: number; bolt_circle_diameter: number; bolt_head_diameter: number; bolt_head_height: number };
  upper_electrode: { note: string; gap_to_chuck: number; plate_diameter: number; plate_thickness: number; hole_pitch: number; hole_diameter: number; pattern_diameter: number; distribution_plate_thickness: number; distribution_plate_diameter: number; shield_ring_inner_diameter: number; shield_ring_outer_diameter: number; shield_ring_height: number; gas_inlet_diameter: number; gas_inlet_length: number };
  lower_electrode: {
    note: string;
    esc_diameter: number;
    esc_thickness: number;
    base_diameter: number;
    base_thickness: number;
    focus_ring_inner_diameter: number;
    focus_ring_outer_diameter: number;
    focus_ring_thickness: number;
    focus_ring_top_above_chuck: number;
    insulator_ring_inner_diameter: number;
    insulator_ring_outer_diameter: number;
    insulator_ring_height: number;
    ground_shield_diameter: number;
    ground_shield_height: number;
    pedestal_column_diameter: number;
    lift_pin_circle_diameter: number;
    lift_pin_diameter: number;
    lift_pin_stroke: number;
    he_line_diameter: number;
    coolant_line_diameter: number;
    rf_rod_diameter: number;
  };
  baffle: { inner_diameter: number; outer_diameter: number; y: number; thickness: number; slot_count: number; slot_fill: number };
  ports: {
    slit: { azimuth_deg: number; width: number; height: number; center_y: number; valve_body_size: Vec3Tuple; door_thickness: number; gate_travel: number };
    viewport: { azimuth_deg: number; center_y: number; bore_diameter: number; flange_diameter: number; flange_thickness: number; tube_length: number; window_diameter: number; window_thickness: number };
    pressure_tap: { azimuth_deg: number; center_y: number; bore_diameter: number; sensor_body_diameter: number; sensor_body_length: number; standoff_length: number };
    exhaust: { azimuth_deg: number; center_y: number; bore_diameter: number; flange_diameter: number; stub_length: number };
  };
  exhaust_line: { pipe_diameter: number; throttle_valve_body_length: number; throttle_valve_body_diameter: number; isolation_valve_size: Vec3Tuple; pump_size: Vec3Tuple; pump_center_y: number };
  peripherals: { rf_generator_size: Vec3Tuple; rf_generator_center: Vec3Tuple; matching_network_size: Vec3Tuple; matching_network_center: Vec3Tuple; gas_box_size: Vec3Tuple; gas_box_center: Vec3Tuple; mfc_block_size: Vec3Tuple; mfc_block_pitch: number; mfc_block_count: number; chiller_line_offset: [number, number] };
  frame: { leg_size: number; leg_radius: number; floor_y: number };
  station: HandlingStationConfig;
  tool: {
    note: string;
    pm01_box: { x0: number; x1: number; z0: number; z1: number; top_y: number };
    idle_modules: { moduleId: string; center: Vec3Tuple; size: Vec3Tuple; facing: Vec3Tuple }[];
    idle_load_ports_q: number[];
  };
}

export interface TactrasLayout {
  cfg: TactrasConfig;
  rInner: number;
  rOuter: number;
  rLinerIn: number;
  rLinerOut: number;
  floorTopY: number;
  floorBottomY: number;
  wallTopY: number;
  lidBottomY: number;
  lidTopY: number;
  rWafer: number;
  waferThickness: number;
  /** Upper electrode stack (grounded): plate bottom = gap above the chuck. */
  upper: { plateY0: number; plateY1: number; distY1: number; shieldY0: number; shieldY1: number };
  /** Lower electrode stack (RF powered). */
  lower: { escY0: number; baseY0: number; insulatorY0: number; shieldY0: number; columnY0: number; focusY0: number; focusY1: number };
  ports: Record<"slit" | "viewport" | "pressure_tap" | "exhaust", PortPlacement>;
  plasma: PlasmaBounds;
  station: StationLayout;
  mfcCenters: Vec3Tuple[];
  floorY: number;
  tool: { pm01: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }; idleModules: { moduleId: string; center: Vec3Tuple; size: Vec3Tuple; facing: Vec3Tuple }[]; idleLoadPortsQ: number[] };
}

export const TACTRAS_CONFIG = rawConfig as unknown as TactrasConfig;

function mkPort(id: PortPlacement["id"], rInner: number, azimuthDeg: number, centerY: number, hole: PortPlacement["hole"], throughLiner: boolean): PortPlacement {
  const az = normalizeAngle(azimuthDeg * DEG);
  const halfWidthArc = hole.kind === "circle" ? hole.radius * 1.35 + 0.012 : hole.width / 2 + 0.012;
  const halfAngle = Math.asin(Math.min(0.999, halfWidthArc / rInner));
  return { id, azimuth: az, centerY, hole, throughLiner, keepOut: { start: normalizeAngle(az - halfAngle), sweep: halfAngle * 2 } };
}

export function tactrasHandlingInput(cfg: TactrasConfig, rOuter: number): ChamberHandlingInput {
  const le = cfg.lower_electrode;
  return {
    azimuthRad: normalizeAngle(cfg.ports.slit.azimuth_deg * DEG),
    slitCenterY: cfg.ports.slit.center_y,
    slitWidth: cfg.ports.slit.width,
    slitHeight: cfg.ports.slit.height,
    portFaceR: rOuter + 0.012,
    valveBodySize: cfg.ports.slit.valve_body_size,
    bottomFlangeR: cfg.chamber.bottom_flange_outer_diameter / 2,
    slitGate: { thickness: cfg.ports.slit.door_thickness, travel: cfg.ports.slit.gate_travel },
    floorY: cfg.frame.floor_y,
    // fixed lower electrode: process and transfer heights are the same; the focus ring is the "edge ring"
    stage: { processTopY: 0, transferTopY: 0, edgeRingThickness: le.focus_ring_top_above_chuck, liftPinStroke: le.lift_pin_stroke, radius: le.base_diameter / 2, liftPinCircleRadius: le.lift_pin_circle_diameter / 2 },
  };
}

export function deriveTactrasLayout(cfg: TactrasConfig): TactrasLayout {
  const c = cfg.chamber;
  const rInner = c.inner_diameter / 2;
  const rOuter = rInner + c.wall_thickness;
  const rLinerOut = rInner - c.liner_clearance;
  const rLinerIn = rLinerOut - c.liner_thickness;
  const ue = cfg.upper_electrode;
  const le = cfg.lower_electrode;
  const plateY0 = ue.gap_to_chuck;
  const plateY1 = plateY0 + ue.plate_thickness;
  const distY1 = plateY1 + ue.distribution_plate_thickness;
  const ports = {
    slit: mkPort("slit", rInner, cfg.ports.slit.azimuth_deg, cfg.ports.slit.center_y, { kind: "rect", width: cfg.ports.slit.width, height: cfg.ports.slit.height }, true),
    viewport: mkPort("viewport", rInner, cfg.ports.viewport.azimuth_deg, cfg.ports.viewport.center_y, { kind: "circle", radius: cfg.ports.viewport.bore_diameter / 2 }, true),
    pressure_tap: mkPort("pressure_tap", rInner, cfg.ports.pressure_tap.azimuth_deg, cfg.ports.pressure_tap.center_y, { kind: "circle", radius: cfg.ports.pressure_tap.bore_diameter / 2 }, true),
    exhaust: mkPort("exhaust", rInner, cfg.ports.exhaust.azimuth_deg, cfg.ports.exhaust.center_y, { kind: "circle", radius: cfg.ports.exhaust.bore_diameter / 2 }, false),
  };
  const station = deriveHandlingStation(cfg.station, tactrasHandlingInput(cfg, rOuter), FOUP_INTERFACE);
  const p = cfg.peripherals;
  const mfcCenters: Vec3Tuple[] = [];
  for (let i = 0; i < p.mfc_block_count; i++) mfcCenters.push([p.gas_box_center[0] - ((p.mfc_block_count - 1) / 2 - i) * p.mfc_block_pitch, p.gas_box_center[1] + 0.02, p.gas_box_center[2] - p.gas_box_size[2] / 2 - p.mfc_block_size[2] / 2]);
  const t = cfg.tool;
  const floorY = cfg.frame.floor_y;
  return {
    cfg,
    rInner,
    rOuter,
    rLinerIn,
    rLinerOut,
    floorTopY: c.floor_top_y,
    floorBottomY: c.floor_top_y - c.floor_thickness,
    wallTopY: c.wall_top_y,
    lidBottomY: c.wall_top_y,
    lidTopY: c.wall_top_y + cfg.lid.thickness,
    rWafer: cfg.wafer.diameter / 2,
    waferThickness: cfg.wafer.thickness,
    upper: { plateY0, plateY1, distY1, shieldY0: plateY0 - 0.004, shieldY1: plateY0 - 0.004 + ue.shield_ring_height },
    lower: { escY0: -le.esc_thickness, baseY0: -le.esc_thickness - le.base_thickness, insulatorY0: -le.insulator_ring_height, shieldY0: -le.ground_shield_height - 0.01, columnY0: c.floor_top_y, focusY0: le.focus_ring_top_above_chuck - le.focus_ring_thickness, focusY1: le.focus_ring_top_above_chuck },
    ports,
    // glow between the chuck and the upper electrode; never beyond the focus ring / shield ring radius
    plasma: { bottomY: 0.004, topY: plateY0 - 0.004, radius: le.focus_ring_outer_diameter / 2 - 0.01, center: [0, (0.004 + plateY0 - 0.004) / 2, 0] },
    station,
    mfcCenters,
    floorY,
    tool: { pm01: { x0: t.pm01_box.x0, x1: t.pm01_box.x1, z0: t.pm01_box.z0, z1: t.pm01_box.z1, y0: floorY, y1: t.pm01_box.top_y }, idleModules: t.idle_modules.map((m) => ({ ...m, center: [m.center[0], floorY + m.size[1] / 2, m.center[2]] as Vec3Tuple })), idleLoadPortsQ: t.idle_load_ports_q },
  };
}

export const TACTRAS_LAYOUT: TactrasLayout = deriveTactrasLayout(TACTRAS_CONFIG);

export function tactrasKeepOuts(L: TactrasLayout): AngularInterval[] {
  return Object.values(L.ports).map((p) => p.keepOut);
}

export function validateTactrasConfig(cfg: TactrasConfig = TACTRAS_CONFIG): ValidationReport {
  const L = deriveTactrasLayout(cfg);
  const errors: string[] = [];
  const warnings: string[] = [];
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(`tactras: ${msg}`);
  };
  const le = cfg.lower_electrode;
  must(le.esc_diameter < cfg.wafer.diameter, "the ESC puck sits inside the wafer edge (wafer overhangs onto the focus ring)");
  must(le.focus_ring_inner_diameter >= le.esc_diameter && le.focus_ring_inner_diameter <= cfg.wafer.diameter + 0.002, "focus ring must surround the ESC under the wafer edge");
  must(L.upper.plateY0 > cfg.ports.slit.center_y + cfg.ports.slit.height / 2, "upper electrode must clear the transfer slit");
  must(L.station.planeY + 0.001 < L.upper.plateY0 - 0.01, "wafer on the blade must pass below the upper electrode");
  must(L.plasma.radius < L.rLinerIn, "plasma glow stays inside the liner");
  must(cfg.baffle.inner_diameter > le.insulator_ring_outer_diameter, "baffle must surround the lower electrode");
  must(L.lower.shieldY0 > L.floorTopY, "lower electrode stack must fit above the chamber floor");
  for (const p of Object.values(L.ports)) {
    if (!p.throughLiner) continue;
    must(p.centerY > cfg.chamber.liner_bottom_y && p.centerY < cfg.chamber.liner_top_y, `port ${p.id} must lie inside the liner height`);
  }
  const st = validateHandlingStation(L.station, tactrasHandlingInput(cfg, L.rOuter));
  errors.push(...st.errors);
  warnings.push(...st.warnings);
  must(L.station.tc !== null, "Tactras station needs the transfer chamber block");
  if (L.station.tc) {
    for (const m of L.tool.idleModules) {
      const z0 = m.center[2] - m.size[2] / 2;
      const z1 = m.center[2] + m.size[2] / 2;
      must(Math.min(Math.abs(z0), Math.abs(z1)) >= L.station.tc.width / 2 + 0.02, `${m.moduleId} must clear the transfer chamber`);
      must(m.center[0] + m.size[0] / 2 <= L.tool.pm01.x0 - 0.01 || Math.abs(m.center[2]) - m.size[2] / 2 >= L.tool.pm01.z1 + 0.01, `${m.moduleId} must clear PM-01`);
      must(m.center[0] - m.size[0] / 2 >= -L.station.efem.r0 + 0.01, `${m.moduleId} must stay behind the EFEM`);
    }
  }
  return { errors, warnings };
}
