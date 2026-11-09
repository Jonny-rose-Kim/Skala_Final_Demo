/**
 * Geometry configuration: the single versioned source of truth for the representative
 * CCP PECVD chamber dimensions. All derived placements (electrode stack heights, port
 * positions, plasma volume bounds, explode offsets) are computed from this config in
 * `deriveChamberLayout` so the same spacing is never hard-coded in several files.
 *
 * Units: meters. Frame: +Y up, left-handed (Babylon default), origin at the chamber axis on the
 * inner floor top surface. Azimuth phi (deg) runs from +X toward +Z.
 */
import rawConfig from "../../config/geometry/ccp-pecvd-300-v1.json";

export type Vec3Tuple = [number, number, number];

export interface GeometryConfig {
  $schema_id: string;
  geometry_revision: string;
  template_id: string;
  title: string;
  source: { kind: "assumed" | "measured" | "vendor"; note: string; references: string[] };
  units: "m";
  coordinate_system: Record<string, string>;
  wafer: { diameter: number; thickness: number };
  chamber: {
    inner_diameter: number;
    wall_thickness: number;
    inner_height: number;
    floor_thickness: number;
    floor_bore_diameter: number;
    top_flange_outer_diameter: number;
    top_flange_height: number;
    bottom_flange_outer_diameter: number;
    bottom_flange_height: number;
    lid_thickness: number;
    lid_diameter: number;
    lid_bore_diameter: number;
    lid_oring_groove_diameter: number;
    bolt_count: number;
    bolt_circle_diameter: number;
    bolt_head_diameter: number;
    bolt_head_height: number;
    liner_thickness: number;
    liner_clearance: number;
    liner_bottom_y: number;
    liner_top_y: number;
  };
  electrodes: {
    gap: number;
    upper_electrode_diameter: number;
    faceplate_thickness: number;
    plenum_height: number;
    plenum_diameter: number;
    backing_plate_thickness: number;
    blocker_plate_diameter: number;
    blocker_plate_thickness: number;
    hole_diameter: number;
    hole_pitch: number;
    hole_pattern_diameter: number;
    edge_insulator_thickness: number;
    isolator_ring_inner_diameter: number;
    isolator_ring_outer_diameter: number;
    rf_stem_outer_diameter: number;
    rf_stem_inner_diameter: number;
    rf_stem_top_y: number;
    feedthrough_bushing_outer_diameter: number;
    feedthrough_bushing_top_y: number;
  };
  pedestal: {
    diameter: number;
    body_height: number;
    process_top_y: number;
    transfer_top_y: number;
    shaft_diameter: number;
    shaft_bottom_y: number;
    heater_cavity_inner_diameter: number;
    heater_cavity_outer_diameter: number;
    heater_cavity_height: number;
    heater_element_diameter: number;
    heater_turns: number;
    edge_ring_inner_diameter: number;
    edge_ring_thickness: number;
    lift_pin_count: number;
    lift_pin_circle_diameter: number;
    lift_pin_diameter: number;
    lift_pin_stroke: number;
    bellows_outer_diameter: number;
    bellows_inner_diameter: number;
    bellows_top_y: number;
    bellows_bottom_y: number;
    bellows_convolutions: number;
  };
  ports: {
    slit: { azimuth_deg: number; width: number; height: number; center_y: number; valve_body_size: Vec3Tuple; door_thickness: number };
    viewport: {
      azimuth_deg: number;
      center_y: number;
      bore_diameter: number;
      flange_diameter: number;
      flange_thickness: number;
      tube_length: number;
      window_diameter: number;
      window_thickness: number;
    };
    pressure_tap: {
      azimuth_deg: number;
      center_y: number;
      bore_diameter: number;
      sensor_body_diameter: number;
      sensor_body_length: number;
      standoff_length: number;
    };
    exhaust: { azimuth_deg: number; center_y: number; bore_diameter: number; flange_diameter: number; stub_length: number };
    gas_inlet: {
      tube_outer_diameter: number;
      tube_inner_diameter: number;
      top_y: number;
      isolator_tube_y0: number;
      isolator_tube_y1: number;
      isolator_tube_diameter: number;
    };
  };
  pumping_baffle: { inner_diameter: number; outer_diameter: number; y: number; thickness: number; slot_count: number; slot_fill: number };
  exhaust_line: {
    pipe_diameter: number;
    throttle_valve_body_length: number;
    throttle_valve_body_diameter: number;
    isolation_valve_size: Vec3Tuple;
    drop_to_y: number;
    pump_size: Vec3Tuple;
    pump_center_y: number;
  };
  peripherals: {
    matching_network_size: Vec3Tuple;
    matching_network_center: Vec3Tuple;
    rf_generator_size: Vec3Tuple;
    rf_generator_center: Vec3Tuple;
    gas_panel_size: Vec3Tuple;
    gas_panel_center: Vec3Tuple;
    frame_leg_size: number;
    frame_leg_radius: number;
    frame_bottom_y: number;
  };
}

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function normalizeAngle(rad: number): number {
  let a = rad % TAU;
  if (a < 0) a += TAU;
  return a;
}

/** Angular interval [start, start + sweep] (radians, sweep > 0). */
export interface AngularInterval {
  start: number;
  sweep: number;
}

export interface PortPlacement {
  id: "slit" | "viewport" | "pressure_tap" | "exhaust";
  azimuth: number; // rad
  centerY: number;
  /** Through-wall keep-out interval used by the cutaway sector snapping (radians). */
  keepOut: AngularInterval;
  /** Hole description on the wall surface. */
  hole:
    | { kind: "circle"; radius: number }
    | { kind: "rect"; width: number; height: number };
  /** Whether the liner also needs this opening. */
  throughLiner: boolean;
}

export interface ChamberLayout {
  cfg: GeometryConfig;
  rInner: number;
  rOuter: number;
  rLinerIn: number;
  rLinerOut: number;
  rTopFlange: number;
  rBottomFlange: number;
  rLid: number;
  rLidBore: number;
  rBoltCircle: number;
  rFloorBore: number;
  floorBottomY: number;
  floorTopY: number;
  wallTopY: number;
  topFlangeBottomY: number;
  lidBottomY: number;
  lidTopY: number;
  rWafer: number;
  waferThickness: number;
  pedestalTopY: number;
  pedestalBottomY: number;
  waferBottomY: number;
  waferTopY: number;
  faceplateBottomY: number;
  faceplateTopY: number;
  plenumTopY: number;
  backingTopY: number;
  isolatorBottomY: number;
  isolatorTopY: number;
  rFaceplate: number;
  rPlenum: number;
  rHolePattern: number;
  rBlocker: number;
  blockerY: number;
  rIsolatorIn: number;
  rIsolatorOut: number;
  rEdgeInsulatorIn: number;
  rEdgeInsulatorOut: number;
  rStemOuter: number;
  rStemInner: number;
  stemTopY: number;
  rBushing: number;
  bushingBottomY: number;
  bushingTopY: number;
  rGasTube: number;
  rGasTubeInner: number;
  gasTubeTopY: number;
  rPedestal: number;
  rShaft: number;
  shaftBottomY: number;
  rEdgeRingIn: number;
  rEdgeRingOut: number;
  edgeRingTopY: number;
  liftPinRadius: number;
  liftPinCount: number;
  heater: { rIn: number; rOut: number; y0: number; y1: number; rElement: number; turns: number };
  bellows: { rOut: number; rIn: number; y0: number; y1: number; convolutions: number };
  baffle: { rIn: number; rOut: number; y0: number; y1: number; slots: number; fill: number };
  transferWaferTopY: number;
  plasma: { bottomY: number; topY: number; radius: number; center: Vec3Tuple };
  ports: Record<PortPlacement["id"], PortPlacement>;
}

export function loadGeometryConfig(): GeometryConfig {
  return rawConfig as unknown as GeometryConfig;
}

export function azimuthToXZ(azimuth: number, r: number): { x: number; z: number } {
  return { x: r * Math.cos(azimuth), z: r * Math.sin(azimuth) };
}

/** Compute every derived placement from the configuration (no scene dependency). */
export function deriveChamberLayout(cfg: GeometryConfig): ChamberLayout {
  const c = cfg.chamber;
  const e = cfg.electrodes;
  const p = cfg.pedestal;
  const rInner = c.inner_diameter / 2;
  const rOuter = rInner + c.wall_thickness;
  const rLinerOut = rInner - c.liner_clearance;
  const rLinerIn = rLinerOut - c.liner_thickness;
  const floorTopY = 0;
  const floorBottomY = -c.floor_thickness;
  const wallTopY = c.inner_height;
  const lidBottomY = wallTopY;
  const lidTopY = lidBottomY + c.lid_thickness;

  const pedestalTopY = p.process_top_y;
  const pedestalBottomY = pedestalTopY - p.body_height;
  const waferBottomY = pedestalTopY;
  const waferTopY = waferBottomY + cfg.wafer.thickness;
  const faceplateBottomY = waferTopY + e.gap;
  const faceplateTopY = faceplateBottomY + e.faceplate_thickness;
  const plenumTopY = faceplateTopY + e.plenum_height;
  const backingTopY = plenumTopY + e.backing_plate_thickness;

  const rFaceplate = e.upper_electrode_diameter / 2;
  const rStemOuter = e.rf_stem_outer_diameter / 2;
  const rBushing = e.feedthrough_bushing_outer_diameter / 2;

  const mk = (id: PortPlacement["id"], azimuthDeg: number, centerY: number, hole: PortPlacement["hole"], throughLiner: boolean): PortPlacement => {
    const az = normalizeAngle(azimuthDeg * DEG);
    // Angular half extent on the inner wall plus a margin at least as large as the mesh generator's patch.
    const halfWidthArc = hole.kind === "circle" ? hole.radius * 1.35 + 0.012 : hole.width / 2 + 0.012;
    const halfAngle = Math.asin(Math.min(0.999, halfWidthArc / rInner));
    return { id, azimuth: az, centerY, hole, throughLiner, keepOut: { start: normalizeAngle(az - halfAngle), sweep: halfAngle * 2 } };
  };
  const ports: ChamberLayout["ports"] = {
    slit: mk("slit", cfg.ports.slit.azimuth_deg, cfg.ports.slit.center_y, { kind: "rect", width: cfg.ports.slit.width, height: cfg.ports.slit.height }, true),
    viewport: mk("viewport", cfg.ports.viewport.azimuth_deg, cfg.ports.viewport.center_y, { kind: "circle", radius: cfg.ports.viewport.bore_diameter / 2 }, true),
    pressure_tap: mk("pressure_tap", cfg.ports.pressure_tap.azimuth_deg, cfg.ports.pressure_tap.center_y, { kind: "circle", radius: cfg.ports.pressure_tap.bore_diameter / 2 }, true),
    exhaust: mk("exhaust", cfg.ports.exhaust.azimuth_deg, cfg.ports.exhaust.center_y, { kind: "circle", radius: cfg.ports.exhaust.bore_diameter / 2 }, false),
  };

  const heaterY1 = pedestalTopY - 0.010;
  const heaterY0 = heaterY1 - p.heater_cavity_height;

  return {
    cfg,
    rInner,
    rOuter,
    rLinerIn,
    rLinerOut,
    rTopFlange: c.top_flange_outer_diameter / 2,
    rBottomFlange: c.bottom_flange_outer_diameter / 2,
    rLid: c.lid_diameter / 2,
    rLidBore: c.lid_bore_diameter / 2,
    rBoltCircle: c.bolt_circle_diameter / 2,
    rFloorBore: c.floor_bore_diameter / 2,
    floorBottomY,
    floorTopY,
    wallTopY,
    topFlangeBottomY: wallTopY - c.top_flange_height,
    lidBottomY,
    lidTopY,
    rWafer: cfg.wafer.diameter / 2,
    waferThickness: cfg.wafer.thickness,
    pedestalTopY,
    pedestalBottomY,
    waferBottomY,
    waferTopY,
    faceplateBottomY,
    faceplateTopY,
    plenumTopY,
    backingTopY,
    isolatorBottomY: backingTopY,
    isolatorTopY: lidBottomY,
    rFaceplate,
    rPlenum: e.plenum_diameter / 2,
    rHolePattern: e.hole_pattern_diameter / 2,
    rBlocker: e.blocker_plate_diameter / 2,
    blockerY: faceplateTopY + e.plenum_height * 0.5,
    rIsolatorIn: e.isolator_ring_inner_diameter / 2,
    rIsolatorOut: e.isolator_ring_outer_diameter / 2,
    rEdgeInsulatorIn: rFaceplate,
    rEdgeInsulatorOut: rFaceplate + e.edge_insulator_thickness,
    rStemOuter,
    rStemInner: e.rf_stem_inner_diameter / 2,
    stemTopY: e.rf_stem_top_y,
    rBushing,
    bushingBottomY: lidBottomY - 0.004,
    bushingTopY: e.feedthrough_bushing_top_y,
    rGasTube: cfg.ports.gas_inlet.tube_outer_diameter / 2,
    rGasTubeInner: cfg.ports.gas_inlet.tube_inner_diameter / 2,
    gasTubeTopY: cfg.ports.gas_inlet.top_y,
    rPedestal: p.diameter / 2,
    rShaft: p.shaft_diameter / 2,
    shaftBottomY: p.shaft_bottom_y,
    rEdgeRingIn: p.edge_ring_inner_diameter / 2,
    rEdgeRingOut: p.diameter / 2,
    edgeRingTopY: pedestalTopY + p.edge_ring_thickness,
    liftPinRadius: p.lift_pin_circle_diameter / 2,
    liftPinCount: p.lift_pin_count,
    heater: {
      rIn: p.heater_cavity_inner_diameter / 2,
      rOut: p.heater_cavity_outer_diameter / 2,
      y0: heaterY0,
      y1: heaterY1,
      rElement: p.heater_element_diameter / 2,
      turns: p.heater_turns,
    },
    bellows: {
      rOut: p.bellows_outer_diameter / 2,
      rIn: p.bellows_inner_diameter / 2,
      y0: p.bellows_bottom_y,
      y1: p.bellows_top_y,
      convolutions: p.bellows_convolutions,
    },
    baffle: {
      rIn: cfg.pumping_baffle.inner_diameter / 2,
      rOut: cfg.pumping_baffle.outer_diameter / 2,
      y0: cfg.pumping_baffle.y,
      y1: cfg.pumping_baffle.y + cfg.pumping_baffle.thickness,
      slots: cfg.pumping_baffle.slot_count,
      fill: cfg.pumping_baffle.slot_fill,
    },
    transferWaferTopY: p.transfer_top_y + p.lift_pin_stroke + cfg.wafer.thickness,
    plasma: {
      bottomY: waferTopY,
      topY: faceplateBottomY,
      radius: rFaceplate,
      center: [0, (waferTopY + faceplateBottomY) / 2, 0],
    },
    ports,
  };
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

function intervalsOverlap(a: AngularInterval, b: AngularInterval): boolean {
  // Compare on the unwrapped circle by testing both relative offsets.
  const d = normalizeAngle(b.start - a.start);
  if (d < a.sweep) return true;
  const d2 = normalizeAngle(a.start - b.start);
  return d2 < b.sweep;
}

/** Validate geometric consistency. Errors describe impossible assemblies; warnings describe unusual values. */
export function validateGeometryConfig(cfg: GeometryConfig): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const L = deriveChamberLayout(cfg);
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(msg);
  };
  const should = (ok: boolean, msg: string) => {
    if (!ok) warnings.push(msg);
  };

  must(cfg.$schema_id === "pecvd-twin.geometry-config/1", "schema id mismatch");
  must(cfg.wafer.diameter > 0 && cfg.wafer.thickness > 0, "wafer dimensions must be positive");
  must(cfg.wafer.diameter < cfg.pedestal.diameter, "wafer must be smaller than the pedestal");
  must(cfg.pedestal.edge_ring_inner_diameter > cfg.wafer.diameter, "edge ring inner diameter must clear the wafer");
  must(cfg.pedestal.edge_ring_inner_diameter < cfg.pedestal.diameter, "edge ring must sit on the pedestal");
  must(cfg.electrodes.gap > 0, "electrode gap must be positive (the plasma volume needs real space)");
  should(cfg.electrodes.gap >= 0.008 && cfg.electrodes.gap <= 0.030, "electrode gap outside the common 8-30 mm range");
  must(L.rFaceplate <= L.rLinerIn - 0.01, "showerhead must clear the liner");
  must(L.rHolePattern < L.rFaceplate - 0.005, "hole pattern must stay inside the faceplate");
  must(L.rHolePattern >= L.rWafer, "hole pattern should cover the wafer");
  must(L.isolatorTopY - L.isolatorBottomY >= 0.008, "ceramic isolator ring between backing plate and lid needs >= 8 mm height");
  must(L.rIsolatorIn > L.rBushing, "isolator ring must clear the RF feedthrough bushing");
  must(L.rIsolatorOut <= L.rFaceplate + cfg.electrodes.edge_insulator_thickness, "isolator ring must stay within the showerhead footprint");
  must(L.rStemOuter < L.rBushing, "RF stem must fit inside the feedthrough bushing");
  must(Math.abs(L.rBushing - L.rLidBore) < 1e-9, "feedthrough bushing must fill the lid bore");
  must(L.rStemInner > L.rGasTube + 0.004, "gas tube must fit inside the RF stem bore with clearance");
  must(cfg.ports.gas_inlet.isolator_tube_y0 > L.stemTopY, "gas isolator tube must start above the RF stem top");
  must(L.rPedestal < L.baffle.rIn, "pedestal must pass through the pumping baffle opening");
  must(L.baffle.rOut <= L.rLinerIn + 0.002 || L.baffle.y1 < cfg.chamber.liner_bottom_y, "pumping baffle must not intersect the liner");
  must(L.baffle.rOut <= L.rInner, "pumping baffle must fit inside the chamber");
  must(L.rLinerOut + cfg.chamber.liner_clearance <= L.rInner + 1e-9, "liner must fit inside the wall");
  must(cfg.chamber.liner_top_y < L.wallTopY && cfg.chamber.liner_bottom_y > L.baffle.y1, "liner must sit between baffle and lid");
  must(L.rShaft < L.rFloorBore, "pedestal shaft must pass through the floor bore");
  must(L.bellows.rOut < L.rFloorBore + 0.02, "bellows must align with the floor bore region");
  must(L.bellows.rIn > L.rShaft, "bellows must clear the shaft");

  // Pedestal extents
  must(L.pedestalBottomY > L.baffle.y1, "pedestal body (process position) must sit above the pumping baffle");
  must(cfg.pedestal.transfer_top_y < cfg.pedestal.process_top_y, "transfer position must be below the process position");

  // Slit vs transfer height
  const slit = cfg.ports.slit;
  const slitBottom = slit.center_y - slit.height / 2;
  const slitTop = slit.center_y + slit.height / 2;
  must(slitBottom > L.baffle.y1 + 0.004, "slit opening must be above the pumping baffle");
  must(slitTop < cfg.chamber.liner_top_y, "slit opening must be inside the liner height");
  must(L.transferWaferTopY > slitBottom + 0.006 && L.transferWaferTopY < slitTop - 0.012, "wafer transfer plane must pass through the slit opening with clearance");
  must(slit.width < 2 * L.rInner * 0.8, "slit width too large for the chamber");

  // Ports within wall height and non-overlapping keep-outs
  const portList = Object.values(L.ports);
  for (const port of portList) {
    const half = port.hole.kind === "circle" ? port.hole.radius : port.hole.height / 2;
    must(port.centerY - half >= L.floorTopY + 0.004, `port ${port.id} bore must stay above the inner floor`);
    must(port.centerY + half <= L.wallTopY - 0.004, `port ${port.id} bore must stay below the lid seat`);
    if (port.throughLiner) {
      must(port.centerY - half > cfg.chamber.liner_bottom_y && port.centerY + half < cfg.chamber.liner_top_y, `port ${port.id} must be inside the liner span`);
    }
  }
  const exhaust = L.ports.exhaust;
  const exhaustTop = exhaust.centerY + (exhaust.hole.kind === "circle" ? exhaust.hole.radius : exhaust.hole.height / 2);
  must(exhaustTop <= L.baffle.y0 - 0.002, "exhaust port must stay below the pumping baffle");
  for (let i = 0; i < portList.length; i++) {
    for (let j = i + 1; j < portList.length; j++) {
      if (intervalsOverlap(portList[i].keepOut, portList[j].keepOut)) {
        warnings.push(`ports ${portList[i].id} and ${portList[j].id} overlap in azimuth; cutaway snapping treats them as one keep-out`);
      }
    }
  }

  // Lid / flange
  must(L.rBoltCircle > L.rOuter + cfg.chamber.bolt_head_diameter && L.rBoltCircle < L.rLid - cfg.chamber.bolt_head_diameter, "bolt circle must lie on the flange between wall and lid edge");
  must(L.rTopFlange <= L.rLid, "lid must cover the top flange");
  must(cfg.chamber.lid_oring_groove_diameter / 2 > L.rInner + 0.01 && cfg.chamber.lid_oring_groove_diameter / 2 < L.rBoltCircle - 0.01, "o-ring groove must be between the bore and bolt circle");

  return { errors, warnings };
}

export const GEOMETRY_CONFIG: GeometryConfig = loadGeometryConfig();
export const CHAMBER_LAYOUT: ChamberLayout = deriveChamberLayout(GEOMETRY_CONFIG);
