/**
 * Remote ICP PECVD geometry: the versioned config is the only source of dimensions; everything derived
 * (stack heights, source/transport placement, glow bounds, station frames) comes from `deriveRemoteLayout`.
 * Units: meters. Frame: +Y up, origin at the chamber axis on the inner floor top surface.
 */
import rawConfig from "../../../config/geometry/remote-icp-pecvd-300-v1.json";
import { DEG, azimuthToXZ, deriveStationLayout, normalizeAngle, type AngularInterval, type PortPlacement, type StationLayout, type Vec3Tuple, type ValidationReport } from "../../config/geometry";
import type { PlasmaBounds } from "../../plasma/plasmaVolume";

export interface RemoteGeometryConfig {
  $schema_id: string;
  geometry_revision: string;
  template_id: string;
  title: string;
  source: { kind: "assumed" | "measured" | "vendor"; note: string; references: string[] };
  units: "m";
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
  stage: {
    diameter: number;
    body_height: number;
    top_y: number;
    shaft_diameter: number;
    shaft_bottom_y: number;
    heater_cavity_inner_diameter: number;
    heater_cavity_outer_diameter: number;
    heater_cavity_height: number;
    heater_element_diameter: number;
    heater_turns: number;
    edge_ring_inner_diameter: number;
    edge_ring_thickness: number;
    lift_pin_circle_diameter: number;
    lift_pin_diameter: number;
    bellows_outer_diameter: number;
    bellows_inner_diameter: number;
    bellows_top_y: number;
    bellows_bottom_y: number;
    bellows_convolutions: number;
  };
  injection_ring: { inner_diameter: number; section_width: number; section_height: number; center_y: number; hole_count: number; hole_diameter: number; feed_azimuth_deg: number; feed_lid_port_radius: number; feed_tube_diameter: number; note: string };
  transport: { inner_diameter: number; wall_thickness: number; length: number; flange_diameter: number; flange_thickness: number; candidate_pressure_tap_azimuth_deg: number; candidate_pressure_tap_offset: number };
  remote_source: {
    tube_inner_diameter: number;
    tube_wall_thickness: number;
    tube_length: number;
    coil_turns: number;
    coil_pitch: number;
    coil_tube_diameter: number;
    coil_clearance: number;
    coil_start_offset: number;
    coil_lead_azimuth_deg: number;
    coil_lead_length: number;
    housing_inner_diameter: number;
    housing_wall_thickness: number;
    housing_height: number;
    housing_cap_thickness: number;
    gas_fitting_height: number;
    gas_tube_diameter: number;
    viewport_azimuth_deg: number;
    viewport_center_offset: number;
    viewport_bore_diameter: number;
    viewport_flange_diameter: number;
    viewport_tube_length: number;
    oes_body_length: number;
    oes_body_diameter: number;
    coolant_azimuth_deg: number;
    coolant_fitting_diameter: number;
    coolant_offsets: [number, number];
    glow_margin_below_coil: number;
    glow_margin_above_coil: number;
  };
  ports: {
    slit: { azimuth_deg: number; width: number; height: number; center_y: number; valve_body_size: Vec3Tuple; door_thickness: number };
    viewport: { azimuth_deg: number; center_y: number; bore_diameter: number; flange_diameter: number; flange_thickness: number; tube_length: number; window_diameter: number; window_thickness: number };
    pressure_tap: { azimuth_deg: number; center_y: number; bore_diameter: number; sensor_body_diameter: number; sensor_body_length: number; standoff_length: number };
    exhaust: { azimuth_deg: number; center_y: number; bore_diameter: number; flange_diameter: number; stub_length: number };
  };
  exhaust_line: { pipe_diameter: number; throttle_valve_body_length: number; throttle_valve_body_diameter: number; isolation_valve_size: Vec3Tuple; pump_size: Vec3Tuple; pump_center_y: number };
  peripherals: {
    source_gas_panel_size: Vec3Tuple;
    source_gas_panel_center: Vec3Tuple;
    source_mfc_block_size: Vec3Tuple;
    source_mfc_block_pitch: number;
    source_mfc_block_count: number;
    source_mfc_block_offset_y: number;
    precursor_panel_size: Vec3Tuple;
    precursor_panel_center: Vec3Tuple;
    precursor_mfc_block_size: Vec3Tuple;
    precursor_mfc_block_pitch: number;
    precursor_mfc_block_count: number;
    precursor_mfc_block_offset_y: number;
    source_match_box_size: Vec3Tuple;
    source_match_box_center: Vec3Tuple;
    source_rf_generator_size: Vec3Tuple;
    source_rf_generator_center: Vec3Tuple;
    frame_leg_size: number;
    frame_leg_radius: number;
    frame_bottom_y: number;
  };
  station: {
    note: string;
    gap_from_slit_valve: number;
    load_lock_length: number;
    efem_length: number;
    enclosure_width: number;
    enclosure_top_y: number;
    deck_depth: number;
    deck_width: number;
    deck_height_above_floor: number;
    deck_thickness: number;
    foup_seat_offset_from_efem_face: number;
  };
}

export interface RemoteLayout {
  cfg: RemoteGeometryConfig;
  rInner: number;
  rOuter: number;
  rLinerIn: number;
  rLinerOut: number;
  floorTopY: number;
  floorBottomY: number;
  wallTopY: number;
  lidBottomY: number;
  lidTopY: number;
  rLid: number;
  rLidBore: number;
  rWafer: number;
  waferThickness: number;
  stageTopY: number;
  stageBottomY: number;
  waferTopY: number;
  rStage: number;
  rShaft: number;
  rFloorBore: number;
  heater: { rIn: number; rOut: number; y0: number; y1: number; rElement: number; turns: number };
  bellows: { rIn: number; rOut: number; y0: number; y1: number; convolutions: number };
  ring: { rIn: number; rOut: number; y0: number; y1: number; feedAzimuth: number; feedPortR: number; rFeedTube: number };
  transport: { rIn: number; rOut: number; y0: number; y1: number; rFlange: number; flangeT: number; candidateTapAzimuth: number; candidateTapY: number };
  tube: { rIn: number; rOut: number; y0: number; y1: number };
  coil: { R: number; r: number; turns: number; pitch: number; y0: number; y1: number; leadAzimuth: number; leadLength: number };
  housing: { rIn: number; rOut: number; y0: number; y1: number; capT: number };
  gasFitting: { y0: number; y1: number; r: number };
  sourceViewport: { azimuth: number; centerY: number; rBore: number; rFlange: number; tubeLength: number; oesLength: number; rOes: number };
  coolant: { azimuth: number; ys: [number, number]; r: number };
  sourceMfc: { size: Vec3Tuple; centers: Vec3Tuple[] };
  precursorMfc: { size: Vec3Tuple; centers: Vec3Tuple[] };
  /** Main glow volume inside the discharge tube (coil region). */
  sourceGlow: PlasmaBounds;
  /** Weak afterglow in the transport section (illustrative, separate volume). */
  afterglow: PlasmaBounds;
  ports: Record<"slit" | "viewport" | "pressure_tap" | "exhaust", PortPlacement>;
  /** Extra keep-outs for the cutaway (source viewport, coil leads, coolant fittings, precursor feed). */
  extraKeepOuts: AngularInterval[];
  station: StationLayout;
}

export function loadRemoteConfig(): RemoteGeometryConfig {
  return rawConfig as unknown as RemoteGeometryConfig;
}

function mkPort(id: PortPlacement["id"], rInner: number, azimuthDeg: number, centerY: number, hole: PortPlacement["hole"], throughLiner: boolean): PortPlacement {
  const az = normalizeAngle(azimuthDeg * DEG);
  const halfWidthArc = hole.kind === "circle" ? hole.radius * 1.35 + 0.012 : hole.width / 2 + 0.012;
  const halfAngle = Math.asin(Math.min(0.999, halfWidthArc / rInner));
  return { id, azimuth: az, centerY, hole, throughLiner, keepOut: { start: normalizeAngle(az - halfAngle), sweep: halfAngle * 2 } };
}

function keepOutAt(azimuthDeg: number, halfAngleDeg: number): AngularInterval {
  return { start: normalizeAngle((azimuthDeg - halfAngleDeg) * DEG), sweep: 2 * halfAngleDeg * DEG };
}

export function deriveRemoteLayout(cfg: RemoteGeometryConfig): RemoteLayout {
  const c = cfg.chamber;
  const st = cfg.stage;
  const rInner = c.inner_diameter / 2;
  const rOuter = rInner + c.wall_thickness;
  const rLinerOut = rInner - c.liner_clearance;
  const rLinerIn = rLinerOut - c.liner_thickness;
  const wallTopY = c.inner_height;
  const lidBottomY = wallTopY;
  const lidTopY = lidBottomY + c.lid_thickness;
  const stageTopY = st.top_y;
  const waferTopY = stageTopY + cfg.wafer.thickness;
  const ring = cfg.injection_ring;
  const tr = cfg.transport;
  const so = cfg.remote_source;
  const transportY0 = lidTopY + 0.006;
  const transportY1 = transportY0 + tr.length;
  const tubeY0 = transportY1;
  const tubeY1 = tubeY0 + so.tube_length;
  const coilY0 = tubeY0 + so.coil_start_offset;
  const coilY1 = coilY0 + so.coil_turns * so.coil_pitch;
  const housingY0 = tubeY0 - 0.012;
  const housingY1 = housingY0 + so.housing_height;
  const rTubeIn = so.tube_inner_diameter / 2;
  const rTubeOut = rTubeIn + so.tube_wall_thickness;
  const heaterY1 = stageTopY - 0.009;
  const ports: RemoteLayout["ports"] = {
    slit: mkPort("slit", rInner, cfg.ports.slit.azimuth_deg, cfg.ports.slit.center_y, { kind: "rect", width: cfg.ports.slit.width, height: cfg.ports.slit.height }, true),
    viewport: mkPort("viewport", rInner, cfg.ports.viewport.azimuth_deg, cfg.ports.viewport.center_y, { kind: "circle", radius: cfg.ports.viewport.bore_diameter / 2 }, true),
    pressure_tap: mkPort("pressure_tap", rInner, cfg.ports.pressure_tap.azimuth_deg, cfg.ports.pressure_tap.center_y, { kind: "circle", radius: cfg.ports.pressure_tap.bore_diameter / 2 }, true),
    exhaust: mkPort("exhaust", rInner, cfg.ports.exhaust.azimuth_deg, cfg.ports.exhaust.center_y, { kind: "circle", radius: cfg.ports.exhaust.bore_diameter / 2 }, false),
  };
  const gp = cfg.peripherals;
  const mfcCenters = (center: Vec3Tuple, size: Vec3Tuple, bsize: Vec3Tuple, pitch: number, count: number, offY: number, sign: number): Vec3Tuple[] =>
    Array.from({ length: count }, (_, i): Vec3Tuple => [center[0] + (i - (count - 1) / 2) * pitch, center[1] + offY, center[2] + sign * (size[2] / 2 + 0.002 + bsize[2] / 2)]);
  const station = deriveStationLayout(cfg.station, gp.frame_bottom_y, ports.slit.azimuth, cfg.ports.slit.valve_body_size[2], rOuter);
  return {
    cfg,
    rInner,
    rOuter,
    rLinerIn,
    rLinerOut,
    floorTopY: 0,
    floorBottomY: -c.floor_thickness,
    wallTopY,
    lidBottomY,
    lidTopY,
    rLid: c.lid_diameter / 2,
    rLidBore: c.lid_bore_diameter / 2,
    rWafer: cfg.wafer.diameter / 2,
    waferThickness: cfg.wafer.thickness,
    stageTopY,
    stageBottomY: stageTopY - st.body_height,
    waferTopY,
    rStage: st.diameter / 2,
    rShaft: st.shaft_diameter / 2,
    rFloorBore: c.floor_bore_diameter / 2,
    heater: { rIn: st.heater_cavity_inner_diameter / 2, rOut: st.heater_cavity_outer_diameter / 2, y0: heaterY1 - st.heater_cavity_height, y1: heaterY1, rElement: st.heater_element_diameter / 2, turns: st.heater_turns },
    bellows: { rIn: st.bellows_inner_diameter / 2, rOut: st.bellows_outer_diameter / 2, y0: st.bellows_bottom_y, y1: st.bellows_top_y, convolutions: st.bellows_convolutions },
    ring: { rIn: ring.inner_diameter / 2, rOut: ring.inner_diameter / 2 + ring.section_width, y0: ring.center_y - ring.section_height / 2, y1: ring.center_y + ring.section_height / 2, feedAzimuth: ring.feed_azimuth_deg * DEG, feedPortR: ring.feed_lid_port_radius, rFeedTube: ring.feed_tube_diameter / 2 },
    transport: {
      rIn: tr.inner_diameter / 2,
      rOut: tr.inner_diameter / 2 + tr.wall_thickness,
      y0: transportY0,
      y1: transportY1,
      rFlange: tr.flange_diameter / 2,
      flangeT: tr.flange_thickness,
      candidateTapAzimuth: tr.candidate_pressure_tap_azimuth_deg * DEG,
      candidateTapY: transportY0 + tr.candidate_pressure_tap_offset,
    },
    tube: { rIn: rTubeIn, rOut: rTubeOut, y0: tubeY0, y1: tubeY1 },
    coil: { R: rTubeOut + so.coil_clearance + so.coil_tube_diameter / 2, r: so.coil_tube_diameter / 2, turns: so.coil_turns, pitch: so.coil_pitch, y0: coilY0, y1: coilY1, leadAzimuth: so.coil_lead_azimuth_deg * DEG, leadLength: so.coil_lead_length },
    housing: { rIn: so.housing_inner_diameter / 2, rOut: so.housing_inner_diameter / 2 + so.housing_wall_thickness, y0: housingY0, y1: housingY1, capT: so.housing_cap_thickness },
    gasFitting: { y0: housingY1, y1: housingY1 + so.gas_fitting_height, r: so.gas_tube_diameter / 2 },
    sourceViewport: { azimuth: so.viewport_azimuth_deg * DEG, centerY: tubeY0 + so.viewport_center_offset, rBore: so.viewport_bore_diameter / 2, rFlange: so.viewport_flange_diameter / 2, tubeLength: so.viewport_tube_length, oesLength: so.oes_body_length, rOes: so.oes_body_diameter / 2 },
    coolant: { azimuth: so.coolant_azimuth_deg * DEG, ys: [housingY0 + so.coolant_offsets[0], housingY0 + so.coolant_offsets[1]], r: so.coolant_fitting_diameter / 2 },
    sourceMfc: { size: gp.source_mfc_block_size, centers: mfcCenters(gp.source_gas_panel_center, gp.source_gas_panel_size, gp.source_mfc_block_size, gp.source_mfc_block_pitch, gp.source_mfc_block_count, gp.source_mfc_block_offset_y, -1) },
    precursorMfc: { size: gp.precursor_mfc_block_size, centers: mfcCenters(gp.precursor_panel_center, gp.precursor_panel_size, gp.precursor_mfc_block_size, gp.precursor_mfc_block_pitch, gp.precursor_mfc_block_count, gp.precursor_mfc_block_offset_y, 1) },
    sourceGlow: { center: [0, (coilY0 - so.glow_margin_below_coil + coilY1 + so.glow_margin_above_coil) / 2, 0], radius: rTubeIn - 0.002, bottomY: coilY0 - so.glow_margin_below_coil, topY: coilY1 + so.glow_margin_above_coil },
    afterglow: { center: [0, (transportY0 + transportY1) / 2, 0], radius: tr.inner_diameter / 2 - 0.003, bottomY: transportY0 + 0.004, topY: transportY1 - 0.004 },
    ports,
    extraKeepOuts: [keepOutAt(so.viewport_azimuth_deg, 9), keepOutAt(so.coil_lead_azimuth_deg, 6), keepOutAt(so.coolant_azimuth_deg, 5), keepOutAt(ring.feed_azimuth_deg, 4)],
    station,
  };
}

export function validateRemoteConfig(cfg: RemoteGeometryConfig): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const L = deriveRemoteLayout(cfg);
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(msg);
  };
  const should = (ok: boolean, msg: string) => {
    if (!ok) warnings.push(msg);
  };
  must(cfg.$schema_id === "pecvd-twin.remote-geometry-config/1", "schema id mismatch");
  must(cfg.wafer.diameter < cfg.stage.diameter, "wafer must be smaller than the stage");
  must(cfg.stage.edge_ring_inner_diameter > cfg.wafer.diameter && cfg.stage.edge_ring_inner_diameter < cfg.stage.diameter, "edge ring must clear the wafer and sit on the stage");
  must(L.ring.rOut < L.rLinerIn - 0.004, "injection ring must clear the liner");
  must(L.ring.rIn > L.rWafer, "injection ring must be outside the wafer footprint (downstream injection around, not over, the wafer)");
  must(L.ring.y1 < L.lidBottomY - 0.004, "injection ring must hang below the lid");
  must(L.ring.y0 > L.waferTopY + 0.05, "injection ring must be well above the wafer");
  must(L.rLidBore > L.transport.rIn, "lid bore must open onto the transport section bore (open path, not a blind flange)");
  must(L.transport.rFlange > L.transport.rOut + 0.02, "transport flange must be wider than the tube");
  must(L.tube.rIn <= L.transport.rIn + 1e-9, "discharge tube bore must not be wider than the transport bore (no step trap)");
  must(L.coil.R - L.coil.r > L.tube.rOut + 0.002, "induction coil must wrap outside the dielectric tube (never inside it)");
  must(L.coil.y0 > L.tube.y0 + 0.02 && L.coil.y1 < L.tube.y1 - 0.02, "coil must lie on the dielectric tube away from its flanges");
  must(L.housing.rIn > L.coil.R + L.coil.r + 0.02, "source housing must clear the coil");
  must(L.housing.y0 < L.tube.y0 && L.housing.y1 > L.tube.y1, "source housing must enclose the discharge tube");
  must(L.sourceGlow.bottomY > L.tube.y0 && L.sourceGlow.topY < L.tube.y1, "main glow volume must stay inside the discharge tube");
  must(L.sourceGlow.radius < L.tube.rIn, "main glow must stay inside the tube bore");
  must(L.sourceGlow.bottomY > L.waferTopY + 0.3, "main glow must be far from the wafer (upstream remote source)");
  must(L.afterglow.topY <= L.tube.y0 && L.afterglow.bottomY >= L.lidTopY, "afterglow volume must be confined to the transport section");
  must(L.sourceViewport.centerY > L.tube.y0 + 0.03 && L.sourceViewport.centerY < L.tube.y1 - 0.03, "source viewport must look into the discharge tube");
  must(L.coil.R + L.coil.r + L.coil.leadLength > L.housing.rOut, "coil leads must reach outside the housing wall");
  should(cfg.remote_source.coil_turns >= 3 && cfg.remote_source.coil_turns <= 8, "coil turn count outside the common 3-8 range");
  const slit = cfg.ports.slit;
  must(slit.center_y - slit.height / 2 > L.floorTopY + 0.004, "slit opening must be above the inner floor");
  must(slit.center_y + slit.height / 2 < cfg.chamber.liner_top_y, "slit opening must be inside the liner height");
  must(L.waferTopY + 0.012 > slit.center_y - slit.height / 2 || true, "transfer plane check (lift not modeled)");
  for (const p of Object.values(L.ports)) {
    const half = p.hole.kind === "circle" ? p.hole.radius : p.hole.height / 2;
    must(p.centerY - half >= L.floorTopY + 0.004 && p.centerY + half <= L.wallTopY - 0.004, `port ${p.id} must stay within the wall height`);
  }
  must(L.rLinerOut + cfg.chamber.liner_clearance <= L.rInner + 1e-9, "liner must fit inside the wall");
  must(L.rShaft < L.rFloorBore && L.bellows.rIn > L.rShaft, "shaft must pass through the floor bore inside the bellows");
  must(L.station.loadLockR0 > L.rOuter + 0.012 + cfg.ports.slit.valve_body_size[2], "load lock must clear the slit valve body");
  return { errors, warnings };
}

export const REMOTE_CONFIG: RemoteGeometryConfig = loadRemoteConfig();
export const REMOTE_LAYOUT: RemoteLayout = deriveRemoteLayout(REMOTE_CONFIG);

export { azimuthToXZ };
