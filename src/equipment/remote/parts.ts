/**
 * Procedural parts of the Remote ICP PECVD template. Everything derives from RemoteLayout. The source
 * stack (transport section, dielectric tube, coil, housing) is coaxial with the chamber, so the same
 * azimuthal sector cutaway reveals tube/coil, transport path, injection ring and stage in one section.
 */
import { DEG, TAU, azimuthToXZ } from "../../config/geometry";
import type { PartGeometry } from "../../geometry/chamberParts";
import { buildStationParts, toRadialFrame } from "../../geometry/chamberParts";
import { chamferProfile, chamferedBox, mergeMeshData, rectProfile, revolveProfile, rotateYMeshData, translateMeshData, tubeAlongPath, type MeshData, type ShellPort, type Vec2, type Vec3 } from "../../geometry/meshlib";
import { PartSink, boltedLidParts, chamfRect, cylinderChamberParts, exhaustLineParts, frameParts, heatedStageParts, helicalCoil, panelParts, pressureGaugeParts, slitPortBlock, slitValveParts, viewportParts } from "../../geometry/sharedParts";
import type { RemoteLayout } from "./layout";

export function buildRemoteParts(L: RemoteLayout): PartGeometry[] {
  const sink = new PartSink();
  const cfg = L.cfg;
  const ports = L.ports;
  const shellPorts: ShellPort[] = Object.values(ports).map((p) => ({ id: p.id, azimuth: p.azimuth, centerY: p.centerY, hole: p.hole }));
  const linerPorts = shellPorts.filter((p) => ports[p.id as keyof typeof ports].throughLiner);

  // ------------------------------------------------------------------ process chamber
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
    rFloorBore: L.rFloorBore,
    ports: shellPorts,
    liner: { rIn: L.rLinerIn, rOut: L.rLinerOut, y0: cfg.chamber.liner_bottom_y, y1: cfg.chamber.liner_top_y, ports: linerPorts },
  });
  slitPortBlock(sink, "chamber_body", { azimuth: ports.slit.azimuth, centerY: ports.slit.centerY, width: cfg.ports.slit.width, height: cfg.ports.slit.height, rInner: L.rInner, rOuter: L.rOuter });
  boltedLidParts(sink, {
    assetId: "lid",
    rLid: L.rLid,
    rBore: L.rLidBore,
    lidBottomY: L.lidBottomY,
    lidTopY: L.lidTopY,
    grooveR: cfg.chamber.lid_oring_groove_diameter / 2,
    boltCount: cfg.chamber.bolt_count,
    rBoltCircle: cfg.chamber.bolt_circle_diameter / 2,
    boltHeadR: cfg.chamber.bolt_head_diameter / 2,
    boltHeadH: cfg.chamber.bolt_head_height,
    boreBoss: { height: 0.006, extraR: L.transport.rFlange - L.rLidBore + 0.004 },
  });
  frameParts(sink, "frame", { legSize: cfg.peripherals.frame_leg_size, legR: cfg.peripherals.frame_leg_radius, yTop: L.floorBottomY + cfg.chamber.bottom_flange_height - 0.001, yBottom: cfg.peripherals.frame_bottom_y });

  // ------------------------------------------------------------------ heated stage
  heatedStageParts(sink, {
    ids: { wafer: "wafer", edgeRing: "edge_ring", pedestal: "stage", heater: "stage_heater", liftPins: "lift_pins", shaft: "stage_shaft", bellows: "bellows", thermocouple: "thermocouple" },
    rWafer: L.rWafer,
    waferThickness: L.waferThickness,
    pedestal: { r: L.rStage, topY: L.stageTopY, bottomY: L.stageBottomY, rEdgeRingIn: cfg.stage.edge_ring_inner_diameter / 2, edgeRingThickness: cfg.stage.edge_ring_thickness },
    heater: L.heater,
    liftPins: { radius: cfg.stage.lift_pin_circle_diameter / 2, r: cfg.stage.lift_pin_diameter / 2 },
    shaft: { r: L.rShaft, bottomY: cfg.stage.shaft_bottom_y },
    rFloorBore: L.rFloorBore,
    bellows: L.bellows,
  });

  // ------------------------------------------------------------------ precursor injection ring (passive)
  {
    const r = L.ring;
    const section = chamfRect(r.rIn, r.rOut, r.y0, r.y1, 0.002);
    sink.sector("ring_body", "injection_ring", "aluminum_anodized", section, { segments: 160 });
    // inward-facing holes: small sector-dependent nozzle stubs on the inner face (decor)
    const holes = cfg.injection_ring.hole_count;
    sink.sectorCustom(
      "ring_holes",
      "injection_ring",
      "dark_steel",
      (kept) => {
        const out: MeshData[] = [];
        for (let i = 0; i < holes; i++) {
          const az = (i / holes) * TAU + 0.3 * DEG;
          if (!kept.some((k) => ((az - k.start) % TAU + TAU) % TAU <= k.sweep)) continue;
          const stub = revolveProfile(rectProfile(0, cfg.injection_ring.hole_diameter * 1.4, 0, 0.004), { segments: 8 });
          toRadialFrame(stub, az, (r.y0 + r.y1) / 2);
          translateMeshData(stub, 0, 0, 0);
          // move inward: toRadialFrame placed it along +radial at radius 0..0.004 -> shift to the inner face
          const c = Math.cos(az);
          const s = Math.sin(az);
          for (let k = 0; k < stub.positions.length; k += 3) {
            stub.positions[k] += c * (r.rIn - 0.004);
            stub.positions[k + 2] += s * (r.rIn - 0.004);
          }
          out.push(stub);
        }
        return out.length ? mergeMeshData(out) : { positions: [], normals: [], uvs: [], indices: [] };
      },
      { pickable: false, castShadow: false },
    );
    // hanger posts from the lid (3)
    for (const azDeg of [60, 180, 300]) {
      const az = azDeg * DEG;
      const post = revolveProfile(rectProfile(0, 0.004, r.y1 - 0.001, L.lidBottomY + 0.001), { segments: 12 });
      translateMeshData(post, (r.rIn + r.rOut) / 2, 0, 0);
      sink.fixed(`ring_post_${azDeg}`, "injection_ring", "stainless", rotateYMeshData(post, az), { cutaway: "hide-in-sector", azimuth: az, pickable: false, castShadow: false });
    }
    // feed: lid feedthrough fitting + vertical drop to the ring
    const feedXZ = azimuthToXZ(r.feedAzimuth, r.feedPortR);
    const fitting = revolveProfile(chamfRect(0, 0.012, L.lidTopY + 0.006, L.lidTopY + 0.05, 0.002), { segments: 24 });
    const nut = revolveProfile(chamfRect(0, 0.016, L.lidTopY + 0.05, L.lidTopY + 0.062, 0.002), { segments: 24 });
    const drop = revolveProfile(rectProfile(0, r.rFeedTube, r.y1 - 0.002, L.lidBottomY + 0.002), { segments: 16 });
    const feed = mergeMeshData([fitting, nut, drop]);
    translateMeshData(feed, feedXZ.x, 0, feedXZ.z);
    sink.fixed("feed_port", "precursor_feed_port", "stainless", feed, { cutaway: "hide-in-sector", azimuth: r.feedAzimuth });
  }

  // ------------------------------------------------------------------ transport section
  {
    const t = L.transport;
    sink.sector("transport_tube", "transport_section", "aluminum_machined", rectProfile(t.rIn, t.rOut, t.y0 + t.flangeT, t.y1 - t.flangeT), { segments: 96 });
    sink.sector("transport_flange_bottom", "transport_section", "aluminum_machined", chamfRect(t.rIn, t.rFlange, t.y0, t.y0 + t.flangeT, 0.002), { segments: 96 });
    sink.sector("transport_flange_top", "transport_section", "aluminum_machined", chamfRect(t.rIn, t.rFlange, t.y1 - t.flangeT, t.y1, 0.002), { segments: 96 });
    // bolt ring decor on both flanges
    const boltAz = Array.from({ length: 8 }, (_, i) => (i / 8) * TAU + 0.2);
    sink.sectorCustom(
      "transport_bolts",
      "transport_section",
      "dark_steel",
      (kept) => {
        const out: MeshData[] = [];
        for (const az of boltAz) {
          if (!kept.some((k) => ((az - k.start) % TAU + TAU) % TAU <= k.sweep)) continue;
          for (const y of [t.y0 + t.flangeT, t.y1]) {
            const b = revolveProfile(chamfRect(0, 0.005, y, y + 0.006, 0.001), { segments: 12 });
            translateMeshData(b, t.rFlange - 0.012, 0, 0);
            out.push(rotateYMeshData(b, az));
          }
        }
        return out.length ? mergeMeshData(out) : { positions: [], normals: [], uvs: [], indices: [] };
      },
      { pickable: false, castShadow: false },
    );
    // candidate source pressure tap: a blanked port boss (Not installed)
    const tapXZ = azimuthToXZ(t.candidateTapAzimuth, 1);
    const boss = toRadialFrame(revolveProfile(chamfRect(0, 0.011, t.rOut - 0.002, t.rOut + 0.016, 0.0015), { segments: 24 }), t.candidateTapAzimuth, t.candidateTapY);
    void tapXZ;
    sink.fixed("candidate_tap_boss", "transport_section", "aluminum_machined", boss, { cutaway: "hide-in-sector", azimuth: t.candidateTapAzimuth, pickable: true, castShadow: false });
  }

  // ------------------------------------------------------------------ dielectric tube + coil + housing
  {
    const tb = L.tube;
    sink.sector("quartz_tube", "discharge_tube", "quartz", rectProfile(tb.rIn, tb.rOut, tb.y0 + 0.004, tb.y1 - 0.004), { segments: 96, castShadow: false, isGlass: true });
    // tube end flanges (metal clamps that hold the quartz)
    sink.sector("tube_clamp_bottom", "discharge_tube", "stainless", chamfRect(tb.rIn, tb.rOut + 0.016, tb.y0, tb.y0 + 0.014, 0.002), { segments: 96 });
    sink.sector("tube_clamp_top", "discharge_tube", "stainless", chamfRect(tb.rIn, tb.rOut + 0.016, tb.y1 - 0.014, tb.y1, 0.002), { segments: 96 });
    const co = L.coil;
    const coil = helicalCoil(co.R, co.r, co.turns, co.pitch, co.y0, co.leadAzimuth, co.leadLength, 56);
    sink.fixed("coil", "induction_coil", "copper", coil, { cutaway: "hide-in-sector", azimuth: co.leadAzimuth + Math.PI, castShadow: false });
    const h = L.housing;
    sink.sector("housing_wall", "source_housing", "aluminum_machined", rectProfile(h.rIn, h.rOut, h.y0 + 0.012, h.y1 - h.capT), { segments: 128 });
    sink.sector("housing_base", "source_housing", "aluminum_machined", chamfRect(L.transport.rFlange + 0.002, h.rOut + 0.012, h.y0, h.y0 + 0.012, 0.002), { segments: 128 });
    sink.sector("housing_cap", "source_housing", "aluminum_machined", chamfRect(L.gasFitting.r + 0.002, h.rOut + 0.012, h.y1 - h.capT, h.y1, 0.003), { segments: 128 });
    // source gas inlet fitting at the cap center and the tube's top closure
    const gf = L.gasFitting;
    sink.sector("tube_top_cap", "discharge_tube", "stainless", chamfRect(gf.r + 0.001, tb.rOut + 0.016, tb.y1, tb.y1 + 0.01, 0.002), { segments: 96 });
    sink.sector("gas_fitting_body", "source_gas_inlet", "stainless", chamfRect(gf.r, 0.011, gf.y0 - 0.002, gf.y0 + 0.03, 0.002), { segments: 24 });
    sink.sector("gas_fitting_tube", "source_gas_inlet", "stainless", rectProfile(gf.r * 0.7, gf.r, tb.y1 - 0.002, gf.y1), { segments: 24 });
    // source viewport (on the housing, looking into the tube) + OES body
    const sv = L.sourceViewport;
    viewportParts(sink, { assetId: "source_viewport", azimuth: sv.azimuth, centerY: sv.centerY, rOuter: h.rOut, rBore: sv.rBore, rFlange: sv.rFlange, flangeT: 0.012, tubeLength: sv.tubeLength, rWindow: sv.rBore + 0.01, windowT: 0.006, keyPrefix: "source_viewport" });
    const oesStart = h.rOut + sv.tubeLength + 0.012;
    const oesBody = revolveProfile(chamfRect(0, sv.rOes, oesStart, oesStart + sv.oesLength, 0.004), { segments: 32 });
    const oesCable = revolveProfile(rectProfile(0, 0.004, oesStart + sv.oesLength, oesStart + sv.oesLength + 0.04), { segments: 12 });
    sink.fixed("oes_body", "oes_spectrometer", "painted_dark", toRadialFrame(oesBody, sv.azimuth, sv.centerY), { cutaway: "hide-in-sector", azimuth: sv.azimuth });
    sink.fixed("oes_cable", "oes_spectrometer", "dark_steel", toRadialFrame(oesCable, sv.azimuth, sv.centerY), { cutaway: "hide-in-sector", azimuth: sv.azimuth, pickable: false, castShadow: false });
    // coolant fittings (supply / return) on the housing
    const cl = L.coolant;
    const fittings: MeshData[] = [];
    for (const y of cl.ys) {
      const f = revolveProfile(chamfRect(0, cl.r, h.rOut - 0.002, h.rOut + 0.05, 0.002), { segments: 20 });
      const hose = revolveProfile(rectProfile(0, cl.r * 0.8, h.rOut + 0.05, h.rOut + 0.11), { segments: 16 });
      fittings.push(toRadialFrame(mergeMeshData([f, hose]), cl.azimuth, y));
    }
    sink.fixed("coolant_fittings", "coolant_fittings", "stainless", mergeMeshData(fittings), { cutaway: "hide-in-sector", azimuth: cl.azimuth, castShadow: false });
  }

  // ------------------------------------------------------------------ source power
  {
    const gp = cfg.peripherals;
    const [mw, mh, md] = gp.source_match_box_size;
    const [mx, my, mz] = gp.source_match_box_center;
    const matchBox = chamferedBox([mw, mh, md], 0.006, [mx, my, mz]);
    const bracket = chamferedBox([mx - mw / 2 - L.housing.rOut + 0.01, 0.02, 0.06], 0.002, [(L.housing.rOut + mx - mw / 2) / 2, my - mh / 2 + 0.02, mz]);
    sink.fixed("match_box", "source_match_box", "painted_housing", mergeMeshData([matchBox, bracket]), { cutaway: "hide-in-sector", azimuth: 0 });
    const co = L.coil;
    const leadR = co.R + co.r + co.leadLength;
    const leads: MeshData[] = [];
    for (const y of [co.y0, co.y1]) {
      const path: Vec3[] = [
        [leadR - 0.004, y, 0],
        [mx - mw / 2 + 0.01, y, 0],
      ];
      leads.push(tubeAlongPath(path, 0.006, { segments: 12 }));
      // feedthrough insulator where the lead crosses the housing wall
      const ins = toRadialFrame(revolveProfile(chamfRect(0.007, 0.014, L.housing.rOut - 0.004, L.housing.rOut + 0.012, 0.0015), { segments: 24 }), 0, y);
      sink.fixed(`lead_insulator_${y.toFixed(3)}`, "coil_leads", "ceramic", ins, { cutaway: "hide-in-sector", azimuth: 0, pickable: false, castShadow: false });
    }
    sink.fixed("leads", "coil_leads", "copper", mergeMeshData(leads), { cutaway: "hide-in-sector", azimuth: 0, castShadow: false });
    const [gw, gh, gd] = gp.source_rf_generator_size;
    const [gx, gy, gz] = gp.source_rf_generator_center;
    const gen = chamferedBox([gw, gh, gd], 0.006, [gx, gy, gz]);
    const genFace = chamferedBox([0.004, gh - 0.03, gd - 0.03], 0.001, [gx - gw / 2 - 0.001, gy, gz]);
    const coaxPath: Vec3[] = [
      [gx - 0.1, gy + gh / 2, gz],
      [gx - 0.1, my - 0.02, gz],
      [mx + mw / 2 + 0.02, my - 0.02, gz],
    ];
    sink.fixed("rf_generator", "source_rf_generator", "painted_housing", mergeMeshData([gen, genFace]), { cutaway: "keep" });
    sink.fixed("rf_coax", "source_rf_generator", "dark_steel", tubeAlongPath(coaxPath, 0.009, { segments: 16, cornerRadius: 0.05 }), { cutaway: "keep", castShadow: false, hideWhenExploded: true });
  }

  // ------------------------------------------------------------------ source gas panel + line, precursor panel + line
  {
    const gp = cfg.peripherals;
    const sp = gp.source_gas_panel_center;
    const bracketS = chamferedBox([0.06, 0.03, sp[2] - gp.source_gas_panel_size[2] / 2 - L.housing.rOut + 0.03], 0.002, [0, sp[1], (sp[2] - gp.source_gas_panel_size[2] / 2 + L.housing.rOut - 0.03) / 2]);
    panelParts(sink, { assetId: "source_gas_panel", size: gp.source_gas_panel_size, center: sp, mfc: { assetId: "mfc_source", size: L.sourceMfc.size, centers: L.sourceMfc.centers, ownIndex: 0 }, bracket: bracketS, keyPrefix: "source_gas_panel" });
    const gf = L.gasFitting;
    const sLine: Vec3[] = [
      [0, gf.y1 - 0.004, 0],
      [0, gf.y1 + 0.05, 0],
      [0, gf.y1 + 0.05, sp[2]],
      [0, sp[1] + gp.source_gas_panel_size[1] / 2 - 0.002, sp[2]],
    ];
    sink.fixed("source_gas_line", "source_gas_line", "stainless", tubeAlongPath(sLine, gf.r, { segments: 20, cornerRadius: 0.035 }), { cutaway: "keep", castShadow: false });
    const pp = gp.precursor_panel_center;
    const bracketP = chamferedBox([0.06, 0.03, Math.abs(pp[2]) - gp.precursor_panel_size[2] / 2 - L.rOuter + 0.03], 0.002, [0, pp[1], -(Math.abs(pp[2]) - gp.precursor_panel_size[2] / 2 + L.rOuter - 0.03) / 2]);
    panelParts(sink, { assetId: "precursor_panel", size: gp.precursor_panel_size, center: pp, mfc: { assetId: "mfc_precursor", size: L.precursorMfc.size, centers: L.precursorMfc.centers, ownIndex: 0 }, bracket: bracketP, keyPrefix: "precursor_panel" });
    const feedXZ = azimuthToXZ(L.ring.feedAzimuth, L.ring.feedPortR);
    const pLine: Vec3[] = [
      [pp[0], pp[1] + gp.precursor_panel_size[1] / 2 - 0.002, pp[2]],
      [pp[0], L.lidTopY + 0.11, pp[2]],
      [feedXZ.x, L.lidTopY + 0.11, feedXZ.z],
      [feedXZ.x, L.lidTopY + 0.064, feedXZ.z],
    ];
    sink.fixed("precursor_line", "precursor_line", "stainless", tubeAlongPath(pLine, L.ring.rFeedTube, { segments: 16, cornerRadius: 0.03 }), { cutaway: "keep", castShadow: false });
  }

  // ------------------------------------------------------------------ vacuum / exhaust
  exhaustLineParts(sink, {
    ids: { port: "exhaust_port", throttle: "throttle_valve", isolation: "isolation_valve", foreline: "foreline", pump: "vacuum_pump" },
    azimuth: ports.exhaust.azimuth,
    centerY: ports.exhaust.centerY,
    rOuter: L.rOuter,
    rBore: cfg.ports.exhaust.bore_diameter / 2,
    rFlange: cfg.ports.exhaust.flange_diameter / 2,
    stubLength: cfg.ports.exhaust.stub_length,
    throttleLength: cfg.exhaust_line.throttle_valve_body_length,
    rThrottleBody: cfg.exhaust_line.throttle_valve_body_diameter / 2,
    isolationSize: cfg.exhaust_line.isolation_valve_size,
    pumpSize: cfg.exhaust_line.pump_size,
    pumpCenterY: cfg.exhaust_line.pump_center_y,
    pipeR: cfg.exhaust_line.pipe_diameter / 2,
  });

  // ------------------------------------------------------------------ access & inspection
  slitValveParts(sink, { assetId: "slit_valve", azimuth: ports.slit.azimuth, centerY: ports.slit.centerY, rOuter: L.rOuter, width: cfg.ports.slit.width, height: cfg.ports.slit.height, valveBodySize: cfg.ports.slit.valve_body_size, doorThickness: cfg.ports.slit.door_thickness });
  viewportParts(sink, {
    assetId: "viewport",
    azimuth: ports.viewport.azimuth,
    centerY: ports.viewport.centerY,
    rOuter: L.rOuter,
    rBore: cfg.ports.viewport.bore_diameter / 2,
    rFlange: cfg.ports.viewport.flange_diameter / 2,
    flangeT: cfg.ports.viewport.flange_thickness,
    tubeLength: cfg.ports.viewport.tube_length,
    rWindow: cfg.ports.viewport.window_diameter / 2,
    windowT: cfg.ports.viewport.window_thickness,
  });
  pressureGaugeParts(sink, {
    assetId: "pressure_sensor",
    azimuth: ports.pressure_tap.azimuth,
    centerY: ports.pressure_tap.centerY,
    rOuter: L.rOuter,
    rTap: cfg.ports.pressure_tap.bore_diameter / 2,
    rBody: cfg.ports.pressure_tap.sensor_body_diameter / 2,
    bodyLength: cfg.ports.pressure_tap.sensor_body_length,
    standoffLength: cfg.ports.pressure_tap.standoff_length,
  });

  // ------------------------------------------------------------------ station shell
  buildStationParts({ station: L.station, slitValveSize: cfg.ports.slit.valve_body_size, slitCenterY: cfg.ports.slit.center_y }, (key, assetId, materialRef, md, opts) => sink.fixed(key, assetId, materialRef, md, opts));

  return sink.parts;
}

/** Profile helpers re-exported for tests. */
export { chamferProfile, type Vec2 };
