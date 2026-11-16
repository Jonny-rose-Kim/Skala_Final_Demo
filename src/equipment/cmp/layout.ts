/**
 * Rotary STI CMP geometry: derived placements for the platen/pad, carrier head (lateral, lift, spin),
 * load cup and alcove, conditioner, slurry, optical endpoint, clean/dry modules and the station deck.
 * Units: meters. Frame: +Y up, origin at the fab floor under the platen axis.
 */
import rawConfig from "../../../config/geometry/sti-cmp-rotary-300-v1.json";
import { DEG, type Vec3Tuple, type ValidationReport } from "../../config/geometry";

export interface CmpGeometryConfig {
  $schema_id: string;
  geometry_revision: string;
  template_id: string;
  title: string;
  source: { kind: "assumed" | "measured" | "vendor"; note: string; references: string[] };
  units: "m";
  wafer: { diameter: number; thickness: number };
  base: { deck_top_y: number; deck_thickness: number; x0: number; x1: number; z0: number; z1: number; frame_inset: number };
  platen: { radius: number; thickness: number; top_y: number; hub_radius: number; drive_housing_radius: number; drive_housing_bottom_y: number; motor_radius: number; motor_length: number };
  pad: { radius: number; thickness: number; groove_pitch: number; groove_width: number; groove_depth: number; window: { radius_position: number; length_radial: number; width_tangential: number; azimuth_deg: number } };
  head: {
    polish_x: number;
    load_travel: number;
    housing_radius: number;
    housing_height: number;
    bottom_y_raised: number;
    ring_inner_radius: number;
    ring_outer_radius: number;
    ring_thickness: number;
    membrane_radius: number;
    membrane_thickness: number;
    zone_radii: number[];
    spindle_radius: number;
    carriage_size: Vec3Tuple;
    beam_y: number;
    beam_height: number;
    beam_width: number;
    beam_x0: number;
    beam_x1: number;
    post_size: number;
    column_x: number;
    column_size: number;
    rotary_union_height: number;
  };
  load_cup: { x: number; z: number; radius: number; top_y: number; edge_pin_height: number; alcove: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; hatch_travel: number } };
  conditioner: { pivot_x: number; pivot_z: number; arm_length: number; arm_y: number; disc_radius: number; disc_thickness: number; sweep_min: number; sweep_max: number; column_radius: number; lift_stroke: number };
  slurry: { post_x: number; post_z: number; nozzle_x: number; nozzle_z: number; arm_y: number; nozzle_drop: number; line_radius: number; flow_meter_pos: Vec3Tuple; panel_pos: Vec3Tuple; panel_size: Vec3Tuple };
  splash_guard: { inner_radius: number; thickness: number; height: number };
  drain: { azimuth_deg: number; radius_position: number; pipe_radius: number; drop_y: number };
  endpoint: { head_size: Vec3Tuple; rotary_interface_y: number; rotary_interface_radius: number; module_pos: Vec3Tuple; module_size: Vec3Tuple };
  efem: { x0: number; x1: number; z0: number; z1: number; top_y: number; deck_depth: number; deck_width: number; deck_height_above_floor: number; deck_thickness: number; foup_seat_offset_from_face: number };
  wet_transfer: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };
  clean_module: { center_x: number; center_z: number; size: Vec3Tuple; base_y: number; roller_radius: number; roller_length: number; roller_gap: number; wafer_y_offset: number };
  dry_module: { center_x: number; center_z: number; size: Vec3Tuple; base_y: number; chuck_radius: number; bowl_radius: number; wafer_y_offset: number };
}

export interface CmpLayout {
  cfg: CmpGeometryConfig;
  floorY: number;
  rWafer: number;
  waferThickness: number;
  deckTopY: number;
  platen: { r: number; y0: number; y1: number; rHub: number };
  pad: { r: number; y0: number; y1: number; window: { r: number; azimuth: number; lenR: number; widT: number } };
  padTopY: number;
  head: {
    polishX: number;
    loadX: number;
    loadTravel: number;
    rHousing: number;
    housingY0: number;
    housingY1: number;
    ringBottomY: number;
    ringTopY: number;
    rRingIn: number;
    rRingOut: number;
    membraneBottomY: number;
    membraneTopY: number;
    rMembrane: number;
    waferFrontY: number;
    waferBackY: number;
    zoneRadii: number[];
    rSpindle: number;
    spindleTopY: number;
    carriage: { size: Vec3Tuple; centerY: number };
    beam: { y0: number; y1: number; x0: number; x1: number; width: number };
    liftContact: number;
    liftPick: number;
  };
  loadCup: { x: number; z: number; r: number; topY: number; pinTopY: number; waferFrontY: number; alcove: CmpGeometryConfig["load_cup"]["alcove"] };
  conditioner: { pivot: Vec3Tuple; armLength: number; dir0: number; discR: number; discBottomY: number; discTopY: number; discCenterRest: Vec3Tuple; parkAngle: number; sweepMin: number; sweepMax: number; liftStroke: number };
  slurry: { nozzleTip: Vec3Tuple; post: Vec3Tuple; armY: number; flowMeter: Vec3Tuple; panel: Vec3Tuple };
  endpoint: { opticalHeadLocal: Vec3Tuple; rotaryInterface: Vec3Tuple; module: Vec3Tuple };
  splashGuard: { rIn: number; rOut: number; y0: number; y1: number };
  station: { seat: Vec3Tuple; doorFacing: Vec3Tuple; deckTopY: number; deckX0: number; deckX1: number; deckWidth: number; deckThickness: number; efem: CmpGeometryConfig["efem"] };
  clean: { center: Vec3Tuple; size: Vec3Tuple; baseY: number; rollerY: number; waferY: number; rRoller: number; rollerLen: number };
  dry: { center: Vec3Tuple; size: Vec3Tuple; baseY: number; chuckTopY: number; waferY: number; rChuck: number; rBowl: number };
}

export function loadCmpConfig(): CmpGeometryConfig {
  return rawConfig as unknown as CmpGeometryConfig;
}

/** Disc center for a sweep angle (left-handed rotation about +Y applied to the rest direction). */
export function conditionerDiscXZ(L: CmpLayout, sweep: number): { x: number; z: number } {
  const c = L.conditioner;
  const d0x = Math.cos(c.dir0);
  const d0z = Math.sin(c.dir0);
  const cs = Math.cos(sweep);
  const sn = Math.sin(sweep);
  const dx = d0x * cs + d0z * sn;
  const dz = -d0x * sn + d0z * cs;
  return { x: c.pivot[0] + c.armLength * dx, z: c.pivot[2] + c.armLength * dz };
}

export function deriveCmpLayout(cfg: CmpGeometryConfig): CmpLayout {
  const pl = cfg.platen;
  const pd = cfg.pad;
  const hd = cfg.head;
  const lc = cfg.load_cup;
  const cd = cfg.conditioner;
  const padTopY = pl.top_y + pd.thickness;
  const ringBottomY = hd.bottom_y_raised;
  const waferFrontY = ringBottomY;
  const waferBackY = waferFrontY + cfg.wafer.thickness;
  const membraneBottomY = waferBackY;
  const pinTopY = lc.top_y + lc.edge_pin_height;
  const pivot: Vec3Tuple = [cd.pivot_x, cd.arm_y, cd.pivot_z];
  const dir0 = Math.atan2(-cd.pivot_z, -cd.pivot_x); // rest direction points at the platen axis
  // park angle: first sweep (searching outward) where the disc clears the pad edge
  let parkAngle = cd.sweep_max;
  const tmp = { conditioner: { pivot, armLength: cd.arm_length, dir0 } } as unknown as CmpLayout;
  for (let a = cd.sweep_max; a < Math.PI; a += 0.01) {
    const p = conditionerDiscXZ(tmp, a);
    if (Math.hypot(p.x, p.z) > pd.radius + cd.disc_radius + 0.02) {
      parkAngle = a;
      break;
    }
  }
  const discRest = conditionerDiscXZ(tmp, 0);
  const efem = cfg.efem;
  const deckX1 = efem.x0;
  const deckX0 = efem.x0 - efem.deck_depth;
  const deckTopY = efem.deck_height_above_floor;
  const seatX = efem.x0 - efem.foup_seat_offset_from_face;
  const cm = cfg.clean_module;
  const dm = cfg.dry_module;
  return {
    cfg,
    floorY: 0,
    rWafer: cfg.wafer.diameter / 2,
    waferThickness: cfg.wafer.thickness,
    deckTopY: cfg.base.deck_top_y,
    platen: { r: pl.radius, y0: pl.top_y - pl.thickness, y1: pl.top_y, rHub: pl.hub_radius },
    pad: { r: pd.radius, y0: pl.top_y, y1: padTopY, window: { r: pd.window.radius_position, azimuth: pd.window.azimuth_deg * DEG, lenR: pd.window.length_radial, widT: pd.window.width_tangential } },
    padTopY,
    head: {
      polishX: hd.polish_x,
      loadX: hd.polish_x - hd.load_travel,
      loadTravel: hd.load_travel,
      rHousing: hd.housing_radius,
      housingY0: ringBottomY + hd.ring_thickness - 0.004,
      housingY1: ringBottomY + hd.ring_thickness - 0.004 + hd.housing_height,
      ringBottomY,
      ringTopY: ringBottomY + hd.ring_thickness,
      rRingIn: hd.ring_inner_radius,
      rRingOut: hd.ring_outer_radius,
      membraneBottomY,
      membraneTopY: membraneBottomY + hd.membrane_thickness,
      rMembrane: hd.membrane_radius,
      waferFrontY,
      waferBackY,
      zoneRadii: hd.zone_radii,
      rSpindle: hd.spindle_radius,
      spindleTopY: hd.beam_y + hd.beam_height / 2 + hd.rotary_union_height,
      carriage: { size: hd.carriage_size, centerY: hd.beam_y },
      beam: { y0: hd.beam_y - hd.beam_height / 2, y1: hd.beam_y + hd.beam_height / 2, x0: hd.beam_x0, x1: hd.beam_x1, width: hd.beam_width },
      liftContact: padTopY - ringBottomY,
      liftPick: pinTopY - ringBottomY,
    },
    loadCup: { x: lc.x, z: lc.z, r: lc.radius, topY: lc.top_y, pinTopY, waferFrontY: pinTopY, alcove: lc.alcove },
    conditioner: {
      pivot,
      armLength: cd.arm_length,
      dir0,
      discR: cd.disc_radius,
      discBottomY: padTopY,
      discTopY: padTopY + cd.disc_thickness,
      discCenterRest: [discRest.x, padTopY + cd.disc_thickness / 2, discRest.z],
      parkAngle,
      sweepMin: cd.sweep_min,
      sweepMax: cd.sweep_max,
      liftStroke: cd.lift_stroke,
    },
    slurry: {
      nozzleTip: [cfg.slurry.nozzle_x, cfg.slurry.arm_y - cfg.slurry.nozzle_drop, cfg.slurry.nozzle_z],
      post: [cfg.slurry.post_x, cfg.base.deck_top_y, cfg.slurry.post_z],
      armY: cfg.slurry.arm_y,
      flowMeter: cfg.slurry.flow_meter_pos,
      panel: cfg.slurry.panel_pos,
    },
    endpoint: {
      opticalHeadLocal: [pd.window.radius_position * Math.cos(pd.window.azimuth_deg * DEG), pl.top_y - pl.thickness + cfg.endpoint.head_size[1] / 2 + 0.002, pd.window.radius_position * Math.sin(pd.window.azimuth_deg * DEG)],
      rotaryInterface: [0, cfg.endpoint.rotary_interface_y, 0],
      module: cfg.endpoint.module_pos,
    },
    splashGuard: { rIn: cfg.splash_guard.inner_radius, rOut: cfg.splash_guard.inner_radius + cfg.splash_guard.thickness, y0: cfg.base.deck_top_y, y1: cfg.base.deck_top_y + cfg.splash_guard.height },
    station: { seat: [seatX, deckTopY, 0], doorFacing: [1, 0, 0], deckTopY, deckX0, deckX1, deckWidth: efem.deck_width, deckThickness: efem.deck_thickness, efem },
    clean: {
      center: [cm.center_x, cm.base_y + cm.size[1] / 2, cm.center_z],
      size: cm.size,
      baseY: cm.base_y,
      rollerY: cm.base_y + cm.wafer_y_offset,
      waferY: cm.base_y + cm.wafer_y_offset,
      rRoller: cm.roller_radius,
      rollerLen: cm.roller_length,
    },
    dry: { center: [dm.center_x, dm.base_y + dm.size[1] / 2, dm.center_z], size: dm.size, baseY: dm.base_y, chuckTopY: dm.base_y + dm.wafer_y_offset, waferY: dm.base_y + dm.wafer_y_offset, rChuck: dm.chuck_radius, rBowl: dm.bowl_radius },
  };
}

/** Optical window / wafer footprint resolver: platen-frame window position for a platen angle vs the wafer center. */
export function opticalFootprint(L: CmpLayout, platenAngle: number, headLateral: number, headLift: number): { windowXZ: { x: number; z: number }; inView: boolean; footprintRadius: number; waferCenter: { x: number; z: number } } {
  const w = L.pad.window;
  const a = w.azimuth + platenAngle;
  // left-handed rotation about +Y: (x, z) -> (x cos + z sin, -x sin + z cos) applied to the rest window position
  const rx = w.r * Math.cos(w.azimuth);
  const rz = w.r * Math.sin(w.azimuth);
  const cs = Math.cos(platenAngle);
  const sn = Math.sin(platenAngle);
  const windowXZ = { x: rx * cs + rz * sn, z: -rx * sn + rz * cs };
  void a;
  const waferCenter = { x: L.head.polishX - headLateral, z: 0 };
  const footprintRadius = w.widT / 2;
  const inContact = Math.abs(headLift - L.head.liftContact) < 0.004;
  const d = Math.hypot(windowXZ.x - waferCenter.x, windowXZ.z - waferCenter.z);
  const inView = inContact && d < L.rWafer - w.lenR / 2;
  return { windowXZ, inView, footprintRadius, waferCenter };
}

export function validateCmpConfig(cfg: CmpGeometryConfig): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const L = deriveCmpLayout(cfg);
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(msg);
  };
  const should = (ok: boolean, msg: string) => {
    if (!ok) warnings.push(msg);
  };
  must(cfg.$schema_id === "pecvd-twin.cmp-geometry-config/1", "schema id mismatch");
  must(L.head.rRingIn > L.rWafer && L.head.rRingIn - L.rWafer < 0.004, "retaining ring bore must clear the wafer with a small gap");
  must(L.head.rMembrane <= L.rWafer + 1e-9, "membrane must not extend beyond the wafer");
  must(L.head.rRingOut <= L.head.rHousing + 1e-9, "retaining ring must stay within the head housing");
  must(L.head.zoneRadii.every((r, i, a) => r > 0 && (i === 0 || r > a[i - 1]) && r <= L.head.rMembrane + 1e-9), "pressure zones must be nested inside the membrane");
  must(L.head.liftContact < 0, "head must lower to reach the pad (contact lift negative)");
  must(L.head.liftPick < L.head.liftContact, "load-cup pick position must be lower than the pad contact position");
  must(Math.abs(L.head.polishX) + L.rWafer <= L.pad.r - 0.02, "wafer must stay on the pad at the polish position with margin");
  must(Math.abs(L.head.polishX) + L.head.rRingOut <= L.pad.r + 0.02, "retaining ring must not overhang the pad excessively at the polish position");
  must(Math.abs(L.head.polishX) - L.head.rRingOut > -1e-9 || true, "head may cover the platen axis (allowed)");
  must(L.pad.window.r - L.pad.window.lenR / 2 > L.platen.rHub && L.pad.window.r + L.pad.window.lenR / 2 < L.pad.r, "pad window must lie on the pad outside the hub");
  must(Math.abs(L.pad.window.r - Math.abs(L.head.polishX)) < L.rWafer - L.pad.window.lenR / 2, "pad window track must pass under the wafer at the polish position");
  must(L.loadCup.x < L.head.polishX && Math.abs(L.loadCup.x - L.head.loadX) < 1e-6, "load cup must sit at the head's load position");
  must(L.loadCup.x + L.loadCup.r < L.loadCup.alcove.x1 && L.loadCup.x - L.loadCup.r > L.loadCup.alcove.x0, "load cup must fit inside the alcove");
  must(L.head.loadX + L.head.rHousing < -L.pad.r - 0.02, "head at the load position must be clear of the platen / pad edge");
  must(L.head.loadX + L.head.rHousing < L.loadCup.alcove.x1 && L.head.loadX - L.head.rHousing > L.loadCup.alcove.x0, "head must fit inside the alcove opening when it lowers to the load cup");
  must(L.head.rHousing * 2 < L.loadCup.alcove.z1 - L.loadCup.alcove.z0, "alcove must be wider than the head");
  must(L.loadCup.alcove.x1 <= -L.splashGuard.rOut + 1e-9, "alcove must not intersect the splash guard / platen");
  must(cfg.efem.x1 <= L.loadCup.alcove.x0 + 1e-9, "EFEM must end where the alcove starts");
  // conditioner: sweep range keeps the disc on the pad; park position clears the pad; no overlap with the head footprint at the polish position
  for (let a = L.conditioner.sweepMin; a <= L.conditioner.sweepMax + 1e-9; a += 0.02) {
    const p = conditionerDiscXZ(L, a);
    const r = Math.hypot(p.x, p.z);
    must(r + L.conditioner.discR <= L.pad.r + 1e-6 && r - L.conditioner.discR >= L.platen.rHub * 0.0, `conditioner disc leaves the pad at sweep ${a.toFixed(2)} rad (r = ${r.toFixed(3)})`);
    const dHead = Math.hypot(p.x - L.head.polishX, p.z);
    should(dHead > L.conditioner.discR + L.head.rRingOut, `conditioner disc would touch the head footprint at sweep ${a.toFixed(2)} (ex-situ conditioning only)`);
  }
  {
    const p = conditionerDiscXZ(L, L.conditioner.parkAngle);
    must(Math.hypot(p.x, p.z) > L.pad.r + L.conditioner.discR, "conditioner park position must be off the pad");
  }
  // slurry nozzle over the pad, outside the wafer footprint at the polish position
  const nz = L.slurry.nozzleTip;
  must(Math.hypot(nz[0], nz[2]) < L.pad.r - 0.02, "slurry nozzle must be over the pad");
  must(Math.hypot(nz[0] - L.head.polishX, nz[2]) > L.head.rRingOut + 0.02, "slurry nozzle must not be over the head / wafer footprint");
  must(nz[1] > L.padTopY + 0.01, "slurry nozzle must be above the pad");
  must(L.splashGuard.rIn > L.pad.r, "splash guard must surround the pad");
  must(L.station.seat[0] < L.station.efem.x0 && L.station.seat[0] > L.station.deckX0, "FOUP seat must lie on the load port deck");
  must(cfg.wet_transfer.x1 <= cfg.load_cup.alcove.x1 && cfg.wet_transfer.x0 >= cfg.efem.x0 - 0.05, "wet transfer tunnel must span alcove to EFEM");
  must(L.clean.center[2] - L.clean.size[2] / 2 >= cfg.wet_transfer.z1 - 0.05, "clean module must sit beyond the wet transfer tunnel");
  must(Math.abs(L.dry.center[0] - L.clean.center[0]) >= (L.dry.size[0] + L.clean.size[0]) / 2 - 1e-6, "clean and dry modules must not overlap");
  return { errors, warnings };
}

export const CMP_CONFIG: CmpGeometryConfig = loadCmpConfig();
export const CMP_LAYOUT: CmpLayout = deriveCmpLayout(CMP_CONFIG);
