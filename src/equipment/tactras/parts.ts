/**
 * Procedural parts of the Tactras based tool: the representative oxide CCP-RIE process module PM-01
 * (coaxial stack, so one sector cutaway shows the upper electrode, the plasma gap, the wafer on the ESC, the
 * focus ring, the cooled base, the backside He / coolant / RF feeds and the pump-out path) plus the shared
 * handling station with the transfer-chamber shuttle. Exterior skins and idle modules come from the GLB.
 * No geometry here encodes an RF frequency, a bias, a gas recipe or an etch rate.
 */
import { DEG, azimuthToXZ } from "../../config/geometry";
import { intersectRanges, spokeRanges, toRadialFrame, type PartGeometry } from "../../geometry/chamberParts";
import { chamferedBox, mergeMeshData, perforatedDisc, rectProfile, revolveProfile, translateMeshData, tubeAlongPath, type MeshData, type ShellPort, type Vec3 } from "../../geometry/meshlib";
import { PartSink, boltedLidParts, chamfRect, cylinderChamberParts, exhaustLineParts, frameParts, pressureGaugeParts, slitPortBlock, viewportParts } from "../../geometry/sharedParts";
import { waferHalfProfiles } from "../../geometry/waferParts";
import { buildSlitGateValve, buildStationParts } from "../handling/stationParts";
import type { TactrasLayout } from "./layout";

export const TACTRAS_PINS_JOINT = "lift_pins_z";

export function buildTactrasParts(L: TactrasLayout): PartGeometry[] {
  const sink = new PartSink();
  const cfg = L.cfg;
  const ports = L.ports;
  const ue = cfg.upper_electrode;
  const le = cfg.lower_electrode;
  const shellPorts: ShellPort[] = Object.values(ports).map((p) => ({ id: p.id, azimuth: p.azimuth, centerY: p.centerY, hole: p.hole }));
  const linerPorts = shellPorts.filter((p) => ports[p.id as keyof typeof ports].throughLiner);

  // ------------------------------------------------------------------ vacuum body, liner, lid, frame
  cylinderChamberParts(sink, {
    bodyAssetId: "chamber_body",
    linerAssetId: "chamber_liner",
    rInner: L.rInner,
    rOuter: L.rOuter,
    floorTopY: L.floorTopY,
    floorBottomY: L.floorBottomY,
    wallTopY: L.wallTopY,
    rTopFlange: cfg.chamber.top_flange_outer_diameter / 2,
    topFlangeH: cfg.chamber.top_flange_height,
    rBottomFlange: cfg.chamber.bottom_flange_outer_diameter / 2,
    bottomFlangeH: cfg.chamber.bottom_flange_height,
    rFloorBore: cfg.chamber.floor_bore_diameter / 2,
    ports: shellPorts,
    liner: { rIn: L.rLinerIn, rOut: L.rLinerOut, y0: cfg.chamber.liner_bottom_y, y1: cfg.chamber.liner_top_y, ports: linerPorts },
  });
  slitPortBlock(sink, "chamber_body", { azimuth: ports.slit.azimuth, centerY: ports.slit.centerY, width: cfg.ports.slit.width, height: cfg.ports.slit.height, rInner: L.rInner, rOuter: L.rOuter });
  boltedLidParts(sink, {
    assetId: "lid",
    rLid: cfg.lid.diameter / 2,
    rBore: cfg.lid.bore_diameter / 2,
    lidBottomY: L.lidBottomY,
    lidTopY: L.lidTopY,
    grooveR: L.rOuter - 0.012,
    boltCount: cfg.lid.bolt_count,
    rBoltCircle: cfg.lid.bolt_circle_diameter / 2,
    boltHeadR: cfg.lid.bolt_head_diameter / 2,
    boltHeadH: cfg.lid.bolt_head_height,
    boreBoss: { height: 0.008, extraR: 0.02 },
  });
  frameParts(sink, "frame", { legSize: cfg.frame.leg_size, legR: cfg.frame.leg_radius, yTop: L.floorBottomY + cfg.chamber.bottom_flange_height - 0.001, yBottom: L.floorY + 0.002 });

  // ------------------------------------------------------------------ upper electrode (grounded) and gas inlet
  {
    const u = L.upper;
    sink.sectorCustom(
      "ue_plate",
      "upper_electrode_plate",
      "silicon_wafer",
      (kept) => perforatedDisc({ radius: ue.plate_diameter / 2, y0: u.plateY0, y1: u.plateY1, holeRadius: ue.hole_diameter / 2, pitch: ue.hole_pitch, patternRadius: ue.pattern_diameter / 2, ranges: kept, uvScale: 2 }),
      { capProfile: rectProfile(0, ue.plate_diameter / 2, u.plateY0, u.plateY1) },
    );
    // cooled gas-distribution plate with an internal plenum (visible in the section)
    sink.sector("ue_distribution", "gas_distribution_plate", "aluminum_anodized", { outer: chamfRect(0, ue.distribution_plate_diameter / 2, u.plateY1, u.distY1, 0.002), holes: [rectProfile(0.02, ue.pattern_diameter / 2, u.plateY1 + 0.006, u.plateY1 + 0.014)] }, { segments: 128 });
    sink.sector("ue_shield", "upper_shield_ring", "ceramic", chamfRect(ue.shield_ring_inner_diameter / 2, ue.shield_ring_outer_diameter / 2, u.shieldY0, u.shieldY1, 0.002), { segments: 128 });
    // stand-off between the distribution plate and the grounded lid
    sink.sector("ue_standoff", "gas_distribution_plate", "aluminum_machined", rectProfile(ue.distribution_plate_diameter / 2 - 0.03, ue.distribution_plate_diameter / 2 - 0.012, u.distY1, L.lidBottomY), { segments: 96 });
    const r = ue.gas_inlet_diameter / 2;
    sink.sector("gas_inlet_tube", "gas_inlet", "stainless", rectProfile(r - 0.002, r, u.distY1, L.lidTopY + ue.gas_inlet_length), { segments: 32 });
    sink.sector("gas_inlet_fitting", "gas_inlet", "stainless", chamfRect(r, r + 0.012, L.lidTopY + ue.gas_inlet_length - 0.03, L.lidTopY + ue.gas_inlet_length, 0.002), { segments: 32 });
  }

  // ------------------------------------------------------------------ lower electrode (RF powered, fixed) and wafer
  {
    const lo = L.lower;
    sink.sector("esc", "esc_puck", "ceramic", chamfRect(0, le.esc_diameter / 2, lo.escY0, 0, 0.0008), { segments: 160 });
    // cooled base plate with the coolant channel and the He distribution groove cut in the section
    sink.sector(
      "base",
      "lower_electrode_base",
      "aluminum_machined",
      { outer: chamfRect(0, le.base_diameter / 2, lo.baseY0, lo.escY0, 0.002), holes: [rectProfile(0.04, 0.06, lo.baseY0 + 0.015, lo.baseY0 + 0.03), rectProfile(0.09, 0.11, lo.baseY0 + 0.015, lo.baseY0 + 0.03), rectProfile(0.14, 0.16, lo.baseY0 + 0.015, lo.baseY0 + 0.03)] },
      { segments: 160 },
    );
    sink.sector("focus_ring", "focus_ring", "ceramic", chamfRect(le.focus_ring_inner_diameter / 2, le.focus_ring_outer_diameter / 2, lo.focusY0, lo.focusY1, 0.0008), { segments: 160 });
    sink.sector("insulator", "lower_insulator_ring", "ceramic", chamfRect(le.insulator_ring_inner_diameter / 2, le.insulator_ring_outer_diameter / 2, lo.insulatorY0, lo.focusY0, 0.002), { segments: 128 });
    sink.sector("ground_shield", "ground_shield", "aluminum_machined", rectProfile(le.ground_shield_diameter / 2 - 0.006, le.ground_shield_diameter / 2, lo.shieldY0, lo.insulatorY0 + 0.03), { segments: 128 });
    sink.sector("column", "lower_electrode_column", "aluminum_machined", rectProfile(le.pedestal_column_diameter / 2 - 0.012, le.pedestal_column_diameter / 2, L.floorTopY, lo.baseY0), { segments: 96 });
    // the column's bottom flange closes the floor bore (vacuum boundary under the lower electrode)
    sink.sector("column_flange", "lower_electrode_column", "aluminum_machined", chamfRect(le.pedestal_column_diameter / 2 - 0.012, cfg.chamber.floor_bore_diameter / 2 + 0.03, L.floorBottomY - 0.02, L.floorBottomY, 0.002), { segments: 96 });
    // wafer on the ESC (moves with the lift pins during transfer); the wafer edge overhangs onto the focus ring
    const w = waferHalfProfiles(L.rWafer, 0, L.waferThickness, false);
    sink.sector("wafer", "wafer", "silicon_wafer", w.back, { jointId: TACTRAS_PINS_JOINT, segments: 160, castShadow: false });
    sink.sector("wafer_front", "wafer", "wafer_front", w.front, { jointId: TACTRAS_PINS_JOINT, segments: 160, castShadow: false });
    // lift pins through the base (top flush with the ESC at value 0) and their lifter below the floor
    const pinR = le.lift_pin_diameter / 2;
    const pinCircle = le.lift_pin_circle_diameter / 2;
    for (const azDeg of [30, 150, 270]) {
      const az = azDeg * DEG;
      const xz = azimuthToXZ(az, pinCircle);
      const pin = translateMeshData(revolveProfile(chamfRect(0, pinR, lo.baseY0 - 0.05, -0.0004, 0.0004), { segments: 12 }), xz.x, 0, xz.z);
      sink.fixed(`lift_pin_${azDeg}`, "lift_pins", "ceramic", pin, { cutaway: "hide-in-sector", azimuth: az, jointId: TACTRAS_PINS_JOINT, castShadow: false });
    }
    const lifter = revolveProfile(chamfRect(0.03, 0.12, L.floorBottomY - 0.06, L.floorBottomY - 0.045, 0.002), { segments: 64 });
    sink.clipped("pin_lifter", "lift_pins", "stainless", lifter, null, { castShadow: false });
    // backside He line and coolant supply / return (pass through the column into the base plate)
    const he = le.he_line_diameter / 2;
    const heLine = tubeAlongPath([[0.03, lo.baseY0 + 0.004, 0.0], [0.03, L.floorBottomY - 0.12, 0.0], [0.45, L.floorBottomY - 0.12, 0.0], [0.45, L.floorY + 0.25, 0.0]] as Vec3[], he, { segments: 12, cornerRadius: 0.03 });
    sink.clipped("he_line", "backside_he_line", "stainless", heLine, null, { castShadow: false });
    const cl = le.coolant_line_diameter / 2;
    const co = cfg.peripherals.chiller_line_offset;
    const coolant: MeshData[] = [];
    for (const dz of [-0.04, 0.04]) coolant.push(tubeAlongPath([[0.06, lo.baseY0 + 0.012, dz], [0.06, L.floorBottomY - 0.16, dz], [0.5 + co[0], L.floorBottomY - 0.16, dz + co[1]], [0.5 + co[0], L.floorY + 0.2, dz + co[1]]] as Vec3[], cl, { segments: 14, cornerRadius: 0.04 }));
    sink.clipped("coolant_lines", "coolant_lines", "polymer_gray", mergeMeshData(coolant), null, { castShadow: false });
    // RF feed rod from the bottom-mounted matching network to the base plate
    const rod = revolveProfile(rectProfile(0, le.rf_rod_diameter / 2, cfg.peripherals.matching_network_center[1] + cfg.peripherals.matching_network_size[1] / 2, lo.baseY0), { segments: 32 });
    sink.clipped("rf_rod", "rf_feed_rod", "copper", rod, null, { castShadow: false });
  }

  // ------------------------------------------------------------------ pump-out baffle and exhaust path
  {
    const b = cfg.baffle;
    sink.sectorCustom("baffle", "pumping_baffle", "aluminum_anodized", (kept) => revolveProfile(chamfRect(b.inner_diameter / 2, b.outer_diameter / 2, b.y - b.thickness / 2, b.y + b.thickness / 2, 0.001), { segments: 192, ranges: intersectRanges(kept, spokeRanges(b.slot_count, b.slot_fill)) }), { capProfile: rectProfile(b.inner_diameter / 2, b.outer_diameter / 2, b.y - b.thickness / 2, b.y + b.thickness / 2) });
    const ex = ports.exhaust;
    const xl = cfg.exhaust_line;
    exhaustLineParts(sink, {
      ids: { port: "exhaust_port", throttle: "throttle_valve", isolation: "isolation_valve", foreline: "foreline", pump: "vacuum_pump" },
      azimuth: ex.azimuth,
      centerY: ex.centerY,
      rOuter: L.rOuter,
      rBore: cfg.ports.exhaust.bore_diameter / 2,
      rFlange: cfg.ports.exhaust.flange_diameter / 2,
      stubLength: cfg.ports.exhaust.stub_length,
      throttleLength: xl.throttle_valve_body_length,
      rThrottleBody: xl.throttle_valve_body_diameter / 2,
      isolationSize: xl.isolation_valve_size,
      pumpSize: xl.pump_size,
      pumpCenterY: xl.pump_center_y,
      pipeR: xl.pipe_diameter / 2,
    });
  }

  // ------------------------------------------------------------------ viewport with the (empty) OES mount, pressure gauge
  {
    const vp = ports.viewport;
    const v = cfg.ports.viewport;
    viewportParts(sink, { assetId: "viewport", azimuth: vp.azimuth, centerY: vp.centerY, rOuter: L.rOuter, rBore: v.bore_diameter / 2, rFlange: v.flange_diameter / 2, flangeT: v.flange_thickness, tubeLength: v.tube_length, rWindow: v.window_diameter / 2, windowT: v.window_thickness });
    // fiber-adapter bracket for an optional OES head: the bracket exists, no spectrometer is installed
    const r0 = L.rOuter + v.tube_length + 0.012;
    // built in the radial frame (x tangent, y radial, z up), then placed at the viewport azimuth
    const plate = chamferedBox([0.05, 0.012, 0.12], 0.002, [0, r0 + 0.006, 0]);
    const shelf = chamferedBox([0.05, 0.07, 0.012], 0.002, [0, r0 + 0.04, -0.054]);
    const fiberPort = revolveProfile(chamfRect(0, 0.011, r0 + 0.012, r0 + 0.04, 0.002), { segments: 20 });
    sink.fixed("oes_mount", "oes_mount", "aluminum_anodized", toRadialFrame(mergeMeshData([plate, shelf, fiberPort]), vp.azimuth, vp.centerY), { cutaway: "hide-in-sector", azimuth: vp.azimuth });
    const pt = ports.pressure_tap;
    const pc = cfg.ports.pressure_tap;
    pressureGaugeParts(sink, { assetId: "pressure_sensor", azimuth: pt.azimuth, centerY: pt.centerY, rOuter: L.rOuter, rTap: pc.bore_diameter / 2, rBody: pc.sensor_body_diameter / 2, bodyLength: pc.sensor_body_length, standoffLength: pc.standoff_length });
  }

  // ------------------------------------------------------------------ gas box, MFCs, gas line; RF generator and bottom match
  {
    const p = cfg.peripherals;
    sink.fixed("gas_box", "gas_box", "painted_housing", chamferedBox(p.gas_box_size, 0.006, p.gas_box_center), { cutaway: "keep" });
    const names = ["mfc_cf4", "mfc_o2", "mfc_ar"];
    L.mfcCenters.forEach((c, i) => sink.fixed(`mfc_${i}`, names[i] ?? `mfc_${i}`, "stainless", chamferedBox(p.mfc_block_size, 0.003, c), { cutaway: "keep" }));
    const inletTop = L.lidTopY + cfg.upper_electrode.gas_inlet_length;
    const gl = tubeAlongPath([[p.gas_box_center[0], p.gas_box_center[1] + p.gas_box_size[1] / 2, p.gas_box_center[2]], [p.gas_box_center[0], inletTop + 0.05, p.gas_box_center[2]], [0, inletTop + 0.05, 0], [0, inletTop, 0]] as Vec3[], 0.005, { segments: 12, cornerRadius: 0.03 });
    sink.fixed("gas_line", "gas_line", "stainless", gl, { cutaway: "keep", castShadow: false });
    sink.fixed("rf_generator", "rf_generator", "painted_housing", chamferedBox(p.rf_generator_size, 0.006, p.rf_generator_center), { cutaway: "keep" });
    const m = p.matching_network_center;
    sink.clipped("match_box", "matching_network", "painted_housing", chamferedBox(p.matching_network_size, 0.006, m), null, {});
    const coax = tubeAlongPath([[p.rf_generator_center[0] - p.rf_generator_size[0] / 2, p.rf_generator_center[1], p.rf_generator_center[2]], [m[0] + 0.2, p.rf_generator_center[1], p.rf_generator_center[2]], [m[0] + 0.2, m[1], m[2] - 0.1], [m[0] + p.matching_network_size[0] / 2, m[1], m[2]]] as Vec3[], 0.012, { segments: 14, cornerRadius: 0.05 });
    sink.fixed("rf_coax", "rf_generator", "dark_steel", coax, { cutaway: "keep", castShadow: false });
  }

  // ------------------------------------------------------------------ transfer gate and the handling station
  buildSlitGateValve(sink, L.station, cfg.ports.slit.door_thickness, cfg.ports.slit.gate_travel);
  buildStationParts(sink, L.station, { waferThickness: L.waferThickness });

  // rear facility interface of PM-01 (gas / RF power / exhaust / coolant / He)
  {
    const t = L.tool.pm01;
    const zc = (t.z0 + t.z1) / 2;
    const plate = chamferedBox([0.04, 0.7, 0.9], 0.004, [t.x1 + 0.02, L.floorY + 0.75, zc]);
    const fittings: MeshData[] = [];
    for (let i = 0; i < 5; i++) fittings.push(chamferedBox([0.06, 0.06, 0.06], 0.004, [t.x1 + 0.07, L.floorY + 0.55 + i * 0.1, zc - 0.25 + (i % 2) * 0.5]));
    sink.fixed("facility_plate", "facility_interface", "stainless", plate, { cutaway: "keep" });
    sink.fixed("facility_fittings", "facility_interface", "stainless", mergeMeshData(fittings), { cutaway: "keep", castShadow: false, lod: "fine" });
  }
  return sink.parts;
}
