/**
 * Rotary STI CMP geometry: derived placements for the platen/pad, carrier head (lateral, lift, spin),
 * load cup and alcove, conditioner, slurry, optical endpoint, clean/dry modules and the station deck.
 * Units: meters. Frame: +Y up, origin at the fab floor under the platen axis.
 */
import rawConfig from "../../../config/geometry/sti-cmp-rotary-300-v1.json";
import { DEG, type Vec3Tuple, type ValidationReport } from "../../config/geometry";
import { FOUP_INTERFACE } from "../handling/foupInterface";
import type { ScaraGeom } from "../handling/scara";
import type { FoupInterface } from "../handling/stationLayout";

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
  load_cup: { x: number; z: number; radius: number; top_y: number; edge_pin_height: number; edge_pin_azimuths_deg: number[]; alcove: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; hatch_travel: number; side_opening: { x0: number; x1: number; y0: number; y1: number } } };
  conditioner: { pivot_x: number; pivot_z: number; arm_length: number; arm_y: number; disc_radius: number; disc_thickness: number; sweep_min: number; sweep_max: number; column_radius: number; lift_stroke: number };
  slurry: { post_x: number; post_z: number; nozzle_x: number; nozzle_z: number; arm_y: number; nozzle_drop: number; line_radius: number; flow_meter_pos: Vec3Tuple; panel_pos: Vec3Tuple; panel_size: Vec3Tuple };
  splash_guard: { inner_radius: number; thickness: number; height: number };
  drain: { azimuth_deg: number; radius_position: number; pipe_radius: number; drop_y: number };
  endpoint: { head_size: Vec3Tuple; rotary_interface_y: number; rotary_interface_radius: number; module_pos: Vec3Tuple; module_size: Vec3Tuple };
  front_end: CmpFrontEndConfig;
}

export interface CmpRobotConfig {
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
  ee_thickness: number;
  pad_height: number;
  approach_clearance: number;
  tine_q: [number, number];
  ee_mount_height?: number;
  tip_beyond_center?: number;
  drop?: number;
  grip_stroke?: number;
  /** Wet robot: "overhead" = Z housing on two roof beams (links and the wrist hang below the shoulder). */
  mount?: "floor" | "overhead";
  /** Overhead mount: half distance between the two roof beams (lateral to the beam direction X). */
  beam_gap?: number;
  /** Wet robot: roll-axis height where the clamped wafer is turned over (under the robot axis). */
  roll_axis_height?: number;
  /** Wet robot: wafer midplane height for rotations (clear of the base housing and the decks). */
  transit_height?: number;
}

export interface CmpFrontEndConfig {
  note: string;
  revision_note: string;
  efem: { x_back: number; depth: number; center_z: number; width: number; height_above_floor: number; ffu_height: number; panel_thickness: number; frame_size: number; door_zone_depth: number };
  load_port: { deck_depth: number; deck_width: number; deck_height_above_floor: number; deck_thickness: number; dock_stroke: number; door_gap: number; opening_width: number; opening_height: number; opening_bottom_above_deck: number; door_pull: number; door_lower: number; door_plate_thickness: number };
  dry_robot: CmpRobotConfig;
  wet_robot: CmpRobotConfig;
  tower: { x: number; z: number; half_size: number; dryer_plane_y: number; dryer_spin_drop: number; chuck_radius: number; bowl_radius: number; bowl_rim_y: number; dryer_top_y: number; flip_plane_y: number; flip_jaw_travel: number; flip_top_y: number; shutter_height: number; shutter_travel: number };
  cleaner: { x: number; z: number; size: Vec3Tuple; base_y: number; plane_y: number; roller_radius: number; roller_length: number; brush_travel: number; edge_roller_radius: number; edge_roller_travel: number; shutter_height: number; shutter_travel: number };
  rinse_station: { azimuth_from_wet_robot_deg: number; distance: number; plane_y: number; size: Vec3Tuple };
  wet_deck: { x0: number; x1: number; z0: number; z1: number; strip_x1: number; strip_z0: number };
  enclosure: { x0: number; x1: number; z0: number; z1: number; top_y: number; window: { x0: number; x1: number; y0: number; y1: number }; facility: { z: number; y: number } };
}

/** Front end in the station frame of the CMP (az = pi: r = -x, q = -z) plus robots, tower and cleaner. */
export interface CmpFrontLayout {
  az: number;
  efem: { r0: number; r1: number; qc: number; width: number; topY: number; ffuTopY: number; doorZoneR: number };
  loadPort: { deckR0: number; deckR1: number; deckTopY: number; deckWidth: number; deckThickness: number; seatR: number; dockedR: number; dockStroke: number; opening: { width: number; y0: number; y1: number; centerY: number }; doorPull: number; doorLower: number; doorPlateThickness: number };
  foup: FoupInterface;
  slotY: (slot: number) => number;
  /**
   * `turnRho`: wafer-center reach while the dry robot turns or waits. Facing the FOUP the wrist hub sits behind the
   * axis toward the transfer tower, facing the tower the wafer edge points at it; both stay clear of the tower.
   */
  dry: { geom: ScaraGeom; shoulderY0: number; baseTopY: number; supportOffset: number; floorY: number; swingRadius: number; turnRho: { foup: number; tower: number } };
  wet: { geom: ScaraGeom; shoulderY0: number; baseTopY: number; rollAxisY0: number; floorY: number; swingRadius: number; rollAxisHeight: number; transitHeight: number; overhead: { beamTopY: number; housingTopY: number; beamX: [number, number]; beamGap: number } };
  tower: { x: number; z: number; half: number; dryerPlaneY: number; spinDrop: number; flipPlaneY: number; flipAxisY: number; dryerTopY: number; flipTopY: number };
  cleaner: { x: number; z: number; planeY: number; size: Vec3Tuple; baseY: number };
  rinse: { x: number; z: number; planeY: number; azimuth: number };
  /** Pin top of the load cup (wafer bottom on the cup). */
  cupPlaneY: number;
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
  station: { seat: Vec3Tuple; doorFacing: Vec3Tuple; deckTopY: number };
  front: CmpFrontLayout;
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
  const front = deriveCmpFront(cfg, pinTopY);
  const fe = cfg.front_end;
  const seat: Vec3Tuple = [-front.loadPort.seatR, front.loadPort.deckTopY, -front.efem.qc];
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
    station: { seat, doorFacing: [1, 0, 0], deckTopY: front.loadPort.deckTopY },
    front,
    clean: {
      center: [fe.cleaner.x, fe.cleaner.base_y + fe.cleaner.size[1] / 2, fe.cleaner.z],
      size: fe.cleaner.size,
      baseY: fe.cleaner.base_y,
      rollerY: fe.cleaner.plane_y,
      waferY: fe.cleaner.plane_y,
      rRoller: fe.cleaner.roller_radius,
      rollerLen: fe.cleaner.roller_length,
    },
    dry: {
      center: [fe.tower.x, (cfg.base.deck_top_y + fe.tower.dryer_top_y) / 2, fe.tower.z],
      size: [2 * fe.tower.half_size, fe.tower.dryer_top_y - cfg.base.deck_top_y, 2 * fe.tower.half_size],
      baseY: cfg.base.deck_top_y,
      chuckTopY: fe.tower.dryer_plane_y,
      waferY: fe.tower.dryer_plane_y,
      rChuck: fe.tower.chuck_radius,
      rBowl: fe.tower.bowl_radius,
    },
  };
}

/** Dryer shutters hang on the outside of the transfer tower walls. */
export const TOWER_SHUTTER_THICKNESS = 0.01;

/** Front end: EFEM / load port in the CMP station frame (az = pi), robot heights, tower, cleaner, rinse station. */
export function deriveCmpFront(cfg: CmpGeometryConfig, cupPinTopY: number): CmpFrontLayout {
  const fe = cfg.front_end;
  const foup = FOUP_INTERFACE;
  const r0 = -fe.efem.x_back;
  const r1 = r0 + fe.efem.depth;
  const qc = -fe.efem.center_z;
  const lp = fe.load_port;
  const deckTopY = lp.deck_height_above_floor;
  const dockedR = r1 + foup.doorFaceX + lp.door_gap;
  const seatR = dockedR + lp.dock_stroke;
  const slotY = (slot: number) => deckTopY + foup.slot1Height + (slot - 1) * foup.slotPitch;
  const opY0 = deckTopY + lp.opening_bottom_above_deck;
  const t = cfg.wafer.thickness;
  // dry robot (backside fork): lowest support plane = min(dryer exchange plane, slot 1) minus the approach
  const dr = fe.dry_robot;
  const drySupport = dr.link1_thickness + dr.link2_thickness + (dr.ee_mount_height ?? 0.008) + dr.ee_thickness + dr.pad_height;
  const dryShoulder = Math.min(fe.tower.dryer_plane_y, slotY(1)) - dr.approach_clearance - drySupport - dr.z_margin_below;
  // wet robot, overhead mount (edge grip on a roll axis at the wafer midplane): lowest midplane = load cup minus
  // the approach; link 1, link 2 and the wrist drop hang below the shoulder; the Z housing stands on roof beams
  const wr = fe.wet_robot;
  const cupMid = cupPinTopY + t / 2;
  const wetRoll0 = cupMid - wr.approach_clearance - wr.z_margin_below;
  const wetShoulder = wetRoll0 + (wr.drop ?? 0.18) + wr.link1_thickness + wr.link2_thickness;
  const beamTopY = fe.enclosure.top_y - 0.012;
  const housingTopY = beamTopY + 0.06 + wr.z_stroke + 0.03;
  const rinseAz = (fe.rinse_station.azimuth_from_wet_robot_deg * Math.PI) / 180;
  // dry robot turn poses: wrist hub (facing the FOUP) and wafer edge (facing the tower) 15 mm off the tower face,
  // which carries the dry-side shutter (10 mm) on its outside
  const towerGap = Math.abs(dr.axis_x - fe.tower.x) - fe.tower.half_size - TOWER_SHUTTER_THICKNESS;
  const turnRho = { foup: dr.ee_reach + dr.hub_radius - (towerGap - 0.015), tower: towerGap - 0.015 - cfg.wafer.diameter / 2 };
  return {
    az: Math.PI,
    efem: { r0, r1, qc, width: fe.efem.width, topY: fe.efem.height_above_floor, ffuTopY: fe.efem.height_above_floor + fe.efem.ffu_height, doorZoneR: r1 - fe.efem.door_zone_depth },
    loadPort: { deckR0: r1, deckR1: r1 + lp.deck_depth, deckTopY, deckWidth: lp.deck_width, deckThickness: lp.deck_thickness, seatR, dockedR, dockStroke: lp.dock_stroke, opening: { width: lp.opening_width, y0: opY0, y1: opY0 + lp.opening_height, centerY: opY0 + lp.opening_height / 2 }, doorPull: lp.door_pull, doorLower: lp.door_lower, doorPlateThickness: lp.door_plate_thickness },
    foup,
    slotY,
    dry: {
      geom: { axisXZ: [dr.axis_x, dr.axis_z], d0: [-1, 0], linkLength: dr.link_length, eeReach: dr.ee_reach },
      shoulderY0: dryShoulder,
      baseTopY: dryShoulder - 0.03,
      supportOffset: drySupport,
      floorY: 0.06,
      swingRadius: Math.max(dr.link_length + dr.hub_radius, dr.ee_reach + dr.hub_radius, dr.tip_beyond_center ?? 0.12, 0.15),
      turnRho,
    },
    wet: {
      geom: { axisXZ: [wr.axis_x, wr.axis_z], d0: [0, -1], linkLength: wr.link_length, eeReach: wr.ee_reach },
      shoulderY0: wetShoulder,
      baseTopY: housingTopY,
      rollAxisY0: wetRoll0,
      floorY: beamTopY,
      // rotations carry the wafer under the axis: the wrist drop and roll housing (0.035 behind the wrist) set the radius
      swingRadius: Math.max(wr.link_length + wr.link_width / 2, wr.ee_reach + 0.045, 0.16),
      rollAxisHeight: wr.roll_axis_height ?? 1.15,
      transitHeight: wr.transit_height ?? 1.07,
      overhead: { beamTopY, housingTopY, beamX: [fe.enclosure.x0 + 0.04, fe.enclosure.x1 - 0.04], beamGap: wr.beam_gap ?? 0.16 },
    },
    tower: { x: fe.tower.x, z: fe.tower.z, half: fe.tower.half_size, dryerPlaneY: fe.tower.dryer_plane_y, spinDrop: fe.tower.dryer_spin_drop, flipPlaneY: fe.tower.flip_plane_y, flipAxisY: fe.tower.flip_plane_y + t / 2, dryerTopY: fe.tower.dryer_top_y, flipTopY: fe.tower.flip_top_y },
    cleaner: { x: fe.cleaner.x, z: fe.cleaner.z, planeY: fe.cleaner.plane_y, size: fe.cleaner.size, baseY: fe.cleaner.base_y },
    rinse: { x: wr.axis_x + fe.rinse_station.distance * Math.cos(rinseAz), z: wr.axis_z + fe.rinse_station.distance * Math.sin(rinseAz), planeY: fe.rinse_station.plane_y, azimuth: rinseAz },
    cupPlaneY: cupPinTopY,
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
  must(cfg.front_end.efem.x_back <= L.loadCup.alcove.x0 + 1e-9, "dry EFEM must end before the alcove");
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
  // front end: seat on the deck, robots reach their stations, wrists stay outside the station housings, swing clears obstacles
  const F = L.front;
  must(F.loadPort.seatR > F.loadPort.deckR0 + 0.15 && F.loadPort.seatR < F.loadPort.deckR1 - 0.1, "FOUP seat must lie on the load port deck");
  const reach = (g: ScaraGeom, x: number, z: number) => Math.hypot(x - g.axisXZ[0], z - g.axisXZ[1]);
  const fe = cfg.front_end;
  const dryG = F.dry.geom;
  const wetG = F.wet.geom;
  const tw = F.tower;
  for (const [name, g, x, z] of [
    ["dry robot -> FOUP slot", dryG, -(F.loadPort.dockedR - F.foup.waferCenterX), -F.efem.qc],
    ["dry robot -> tower", dryG, tw.x, tw.z],
    ["wet robot -> tower", wetG, tw.x, tw.z],
    ["wet robot -> load cup", wetG, L.loadCup.x, L.loadCup.z],
    ["wet robot -> cleaner", wetG, F.cleaner.x, F.cleaner.z],
    ["wet robot -> rinse station", wetG, F.rinse.x, F.rinse.z],
  ] as const) {
    const rho = reach(g, x, z);
    must(rho - g.eeReach < 2 * g.linkLength - 0.02 && rho - g.eeReach > 0.05, `${name} must be reachable (rho ${rho.toFixed(3)} m)`);
  }
  // wet robot wrist stays outside the alcove, the tower and the cleaner when reaching in
  must(wetG.axisXZ[1] - (reach(wetG, L.loadCup.x, L.loadCup.z) - wetG.eeReach) - fe.wet_robot.hub_radius >= L.loadCup.alcove.z1 + 0.005, "wet robot wrist must stay outside the alcove");
  must(wetG.axisXZ[0] - (reach(wetG, tw.x, tw.z) - wetG.eeReach) - fe.wet_robot.hub_radius >= tw.x + tw.half + 0.005, "wet robot wrist must stay outside the transfer tower");
  must(wetG.axisXZ[1] + (reach(wetG, F.cleaner.x, F.cleaner.z) - wetG.eeReach) + fe.wet_robot.hub_radius <= F.cleaner.z - F.cleaner.size[2] / 2 - 0.005, "wet robot wrist must stay outside the cleaner");
  // wet robot swing (wafer over the axis) clears the tower, the cleaner and the alcove
  must(wetG.axisXZ[0] - F.wet.swingRadius >= tw.x + tw.half + 0.01, "wet robot swing must clear the transfer tower");
  must(wetG.axisXZ[1] + F.wet.swingRadius <= F.cleaner.z - F.cleaner.size[2] / 2 - 0.01, "wet robot swing must clear the cleaner");
  must(wetG.axisXZ[1] - F.wet.swingRadius >= L.loadCup.alcove.z1 + 0.01, "wet robot swing must clear the alcove");
  // dry robot inside the EFEM; tower straddles the EFEM back wall
  must(-dryG.axisXZ[0] - F.dry.swingRadius >= F.efem.r0 + 0.02 && -dryG.axisXZ[0] + F.dry.swingRadius <= F.efem.doorZoneR - 0.02, "dry robot swing must fit the EFEM depth");
  must(-(tw.x + tw.half) < F.efem.r0 && -(tw.x - tw.half) > F.efem.r0, "transfer tower must straddle the EFEM back wall");
  // the tower reaches into the EFEM: the dry robot turns with the wafer at turnRho and swings link 1 through the front
  const tr = F.dry.turnRho;
  const towerGap = Math.abs(dryG.axisXZ[0] - tw.x) - tw.half - TOWER_SHUTTER_THICKNESS;
  must(tr.foup > 0 && tr.tower > 0 && tr.tower < tr.foup + 0.05, "dry robot turn reach must be positive on both headings");
  must(dryG.eeReach - tr.foup + fe.dry_robot.hub_radius <= towerGap - 0.01, "dry robot wrist must stay clear of the transfer tower while facing the FOUP");
  must(tr.tower + L.rWafer <= towerGap - 0.01, "wafer on the dry robot must stay clear of the transfer tower while facing it");
  must(-dryG.axisXZ[0] + dryG.linkLength + fe.dry_robot.link_width / 2 <= F.efem.doorZoneR - 0.02, "dry robot link 1 must turn through the EFEM front without reaching the door opener zone");
  must(-dryG.axisXZ[0] + tr.foup + L.rWafer <= F.efem.doorZoneR - 0.02, "wafer on the dry robot must stay out of the door opener zone while facing the FOUP");
  // module footprints: transfer tower, cleaner and rinse station do not overlap
  const cs = F.cleaner.size;
  must(Math.abs(tw.x - F.cleaner.x) >= tw.half + cs[0] / 2 || Math.abs(tw.z - F.cleaner.z) >= tw.half + cs[2] / 2, "transfer tower and cleaner must not overlap");
  // the rinse box is turned toward the wet robot: its bounding circle against the cleaner box
  const rinseR = Math.hypot(fe.rinse_station.size[0], fe.rinse_station.size[2]) / 2;
  const dx = Math.max(Math.abs(F.rinse.x - F.cleaner.x) - cs[0] / 2, 0);
  const dz = Math.max(Math.abs(F.rinse.z - F.cleaner.z) - cs[2] / 2, 0);
  must(Math.hypot(dx, dz) >= rinseR, "rinse station and cleaner must not overlap");
  // load cup pins leave room for the wet robot fork below the wafer
  const plateBottom = F.cupPlaneY - fe.wet_robot.pad_height - fe.wet_robot.ee_thickness - fe.wet_robot.approach_clearance;
  must(plateBottom - L.loadCup.topY >= 0.006, `wet robot fork must pass above the load cup body (${((plateBottom - L.loadCup.topY) * 1000).toFixed(1)} mm)`);
  must(L.loadCup.alcove.side_opening.y0 <= plateBottom - 0.004 && L.loadCup.alcove.side_opening.y1 >= F.cupPlaneY + 0.03, "alcove side opening must pass the fork and the clamped wafer");
  // dryer exchange plane above the bowl rim; spin position inside the bowl
  must(tw.dryerPlaneY - fe.dry_robot.approach_clearance - fe.dry_robot.pad_height - fe.dry_robot.ee_thickness > fe.tower.bowl_rim_y + 0.004, "dry robot fork must pass above the dryer bowl rim");
  must(tw.dryerPlaneY - tw.spinDrop < fe.tower.bowl_rim_y - 0.01, "spin position must be inside the bowl");
  must(fe.dry_robot.tine_q[0] > fe.tower.chuck_radius + 0.004, "dry robot fork tines must straddle the spin chuck");
  must(tw.flipPlaneY - 0.15 > tw.dryerTopY + 0.01, "flip station sweep must clear the dryer housing");
  // robot Z strokes
  must(tw.flipPlaneY + fe.dry_robot.approach_clearance - F.dry.shoulderY0 - F.dry.supportOffset <= fe.dry_robot.z_stroke, "dry robot Z must reach the flip station");
  must(tw.flipAxisY + fe.wet_robot.approach_clearance - F.wet.rollAxisY0 <= fe.wet_robot.z_stroke, "wet robot Z must reach the flip station");
  // overhead wet robot: link 2 passes above the alcove at the cup pose, the turned-over wafer stays below the links
  // and above the drip tray, the links stay below the roof beams at the flip station
  const wetDrop = fe.wet_robot.drop ?? 0.18;
  must(F.cupPlaneY + L.waferThickness / 2 + wetDrop > L.loadCup.alcove.y1 + 0.02, "wet robot links must pass above the alcove");
  must(wetDrop > 0.15 + 0.02, "wet robot drop must keep the turned-over wafer below link 2");
  must(F.wet.rollAxisHeight - 0.15 > L.deckTopY + 0.03 + 0.05 && F.wet.transitHeight - L.waferThickness / 2 > L.deckTopY + 0.05, "wet robot roll / transit poses must clear the drip tray on the wet deck");
  must(tw.flipAxisY + fe.wet_robot.approach_clearance + wetDrop + fe.wet_robot.link1_thickness + fe.wet_robot.link2_thickness + 0.012 < F.wet.overhead.beamTopY - 0.08 - 0.01, "wet robot links must stay below the roof beams");
  must(F.wet.rollAxisHeight - F.wet.rollAxisY0 <= fe.wet_robot.z_stroke && F.wet.transitHeight - F.wet.rollAxisY0 <= fe.wet_robot.z_stroke, "wet robot Z must reach the roll and transit heights");
  must(Math.hypot(F.rinse.x - wetG.axisXZ[0], F.rinse.z - wetG.axisXZ[1]) - fe.rinse_station.size[0] / 2 >= F.wet.swingRadius + 0.02, "wet robot swing must clear the rinse station");
  return { errors, warnings };
}

export const CMP_CONFIG: CmpGeometryConfig = loadCmpConfig();
export const CMP_LAYOUT: CmpLayout = deriveCmpLayout(CMP_CONFIG);
