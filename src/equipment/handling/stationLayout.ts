/**
 * Shared wafer-handling station of the chamber-type tools (CCP PECVD, Remote ICP PECVD):
 *
 *   load port (dock plate, FOUP door opener) | EFEM with atmospheric SCARA robot | load lock with
 *   support pins, atmospheric door and a two-stage vacuum transfer blade | slit valve | process chamber
 *
 * Everything is laid out along the slit azimuth in a station frame (r = radial distance from the
 * chamber axis, q = lateral offset, y = instance height) and derived from the versioned `station`
 * config block of the tool plus the chamber's slit / stage kinematics and the FOUP interface.
 * The values are generic design assumptions; validation checks that a 300 mm wafer, the blade, the
 * pins and the gate retreat fit, that the robot reaches the FOUP slot and the load lock, and that the
 * wafer passes only through openings.
 */
import type { ValidationReport, Vec3Tuple } from "../../config/geometry";
import type { ScaraGeom } from "./scara";

export interface HandlingStationConfig {
  note: string;
  revision_note?: string;
  gap_from_slit_valve: number;
  /** Vacuum transfer plane (wafer bottom on the blade) below the slit center. */
  transfer_plane_below_slit_center: number;
  load_lock: {
    length: number;
    width: number;
    wall_thickness: number;
    floor_thickness: number;
    lid_thickness: number;
    /** Interior bottom below / top above the transfer plane. */
    interior_below_plane: number;
    interior_above_plane: number;
    /** Wafer center distance from the interior face of the vacuum-side wall. */
    wafer_offset_from_vacuum_wall: number;
    support_pins: { r_offsets: number[]; q_offsets: number[]; diameter: number; raise_above_plane: number; drop_below_plane: number };
    vacuum_opening: { width: number; height: number };
    atm_door: { opening_width: number; opening_height: number; frame_depth: number; gate_travel: number; gate_thickness: number };
    pump_port_diameter: number;
    leg_size: number;
  };
  vacuum_blade: {
    thickness: number;
    width: number;
    pad_height: number;
    root_to_pocket: number;
    tip_beyond_pocket: number;
    carriage_length: number;
    carriage_width: number;
    carriage_thickness: number;
    stage_length: number;
    stage_width: number;
    stage_thickness: number;
    stage_rear_margin: number;
    rail_width: number;
    rail_height: number;
  };
  efem: { depth: number; width: number; height_above_floor: number; ffu_height: number; panel_thickness: number; frame_size: number; door_zone_depth: number };
  /**
   * Optional vacuum transfer chamber between the slit valve and the load lock (cluster tools). The blade
   * stage then rides on a linear shuttle that crosses it; without this block the load lock sits right at
   * the slit valve and the station is the single-chamber layout of the CCP / Remote tools.
   */
  transfer_chamber?: { length: number; width: number; wall_thickness: number; floor_thickness: number; lid_thickness: number; shuttle_rail_q: number };
  atm_robot: {
    axis_offset_from_back_wall: number;
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
  };
  load_port: {
    deck_depth: number;
    deck_width: number;
    deck_height_above_floor: number;
    deck_thickness: number;
    dock_stroke: number;
    door_gap: number;
    opening_width: number;
    opening_height: number;
    opening_bottom_above_deck: number;
    door_pull: number;
    door_lower: number;
    door_plate_thickness: number;
  };
}

/** Chamber data the station needs (slit and stage kinematics). */
export interface ChamberHandlingInput {
  azimuthRad: number;
  slitCenterY: number;
  slitWidth: number;
  slitHeight: number;
  /** Radial position of the machined slit port face on the chamber wall. */
  portFaceR: number;
  valveBodySize: Vec3Tuple;
  /** Outer radius of the chamber's bottom flange: the valve bonnet and actuator below the body stay outside it. */
  bottomFlangeR: number;
  /** Slit gate plate thickness and its travel (down = open). */
  slitGate: { thickness: number; travel: number };
  /** Fab floor height in the instance frame. */
  floorY: number;
  stage: { processTopY: number; transferTopY: number; edgeRingThickness: number; liftPinStroke: number; radius: number; liftPinCircleRadius: number };
}

/** FOUP interface (carrier frame: origin at the seat, door facing +X). */
export interface FoupInterface {
  bodySize: Vec3Tuple;
  doorFaceX: number;
  doorThickness: number;
  waferCenterX: number;
  slotPitch: number;
  slot1Height: number;
  slotCount: number;
  openingSize: [number, number];
  openingBottomY: number;
  couplingPads: [number, number][];
}

export interface HandlingStationLayout {
  cfg: HandlingStationConfig;
  az: number;
  u: [number, number];
  p: [number, number];
  floorY: number;
  /** Wafer bottom when the wafer rides on the vacuum blade (pad top). */
  planeY: number;
  /** `lowerR0`: inner radius of the bonnet and gate actuator under the valve body (clear of the chamber bottom flange). */
  slit: { centerY: number; width: number; height: number; y0: number; y1: number; portFaceR: number; valveR0: number; valveR1: number; valveSize: Vec3Tuple; lowerR0: number };
  adapter: { r0: number; r1: number };
  ll: {
    r0: number;
    r1: number;
    innerR0: number;
    innerR1: number;
    width: number;
    innerWidth: number;
    wall: number;
    bottomY: number;
    innerBottomY: number;
    innerTopY: number;
    topY: number;
    centerR: number;
    pins: [number, number][];
    pinRadius: number;
    pinDropTop: number;
    pinRaiseTop: number;
    pinStroke: number;
    vacOpening: { width: number; y0: number; y1: number };
  };
  atmDoor: { r0: number; r1: number; planeR: number; width: number; y0: number; y1: number; centerY: number; gateTravel: number; gateThickness: number };
  /** Vacuum transfer chamber (null = load lock directly at the slit valve). */
  tc: { r0: number; r1: number; innerR0: number; width: number; innerWidth: number; wall: number; bottomY: number; topY: number; railQ: number } | null;
  blade: {
    bladeY0: number;
    bladeY1: number;
    carriageY0: number;
    carriageY1: number;
    stageY0: number;
    stageY1: number;
    railY0: number;
    railY1: number;
    pocketRestR: number;
    rootRestR: number;
    stageRestR0: number;
    stageRestR1: number;
    s1max: number;
    s2max: number;
    /** Linear shuttle travel across the transfer chamber (0 without one). */
    shuttleMax: number;
    /** Total pocket travel from the load lock to the chamber axis. */
    stroke: number;
    halfWidth: number;
  };
  efem: { r0: number; r1: number; width: number; topY: number; ffuTopY: number; doorZoneR: number };
  robot: {
    axisR: number;
    axisXZ: [number, number];
    scara: ScaraGeom;
    shoulderY0: number;
    baseTopY: number;
    zStroke: number;
    /** Wafer support plane (pad top) above the shoulder plane. */
    supportOffset: number;
    hubRadius: number;
    swingRadius: number;
  };
  loadPort: {
    deckR0: number;
    deckR1: number;
    deckTopY: number;
    deckWidth: number;
    deckThickness: number;
    seatR: number;
    dockedR: number;
    dockStroke: number;
    opening: { width: number; y0: number; y1: number; centerY: number };
    doorPull: number;
    doorLower: number;
    doorPlateThickness: number;
  };
  foup: FoupInterface;
  /** Undocked FOUP seat (station frame -> instance frame) and the direction the FOUP door faces. */
  seat: Vec3Tuple;
  doorFacing: Vec3Tuple;
  /** Reserved-slot wafer bottom height (instance frame) for a slot index (1-based). */
  slotY: (slot: number) => number;
  /** Task-space targets of the atmospheric robot. */
  targets: { foupRho: number; llRho: number; foupTheta: number; llTheta: number };
}

/** Slit valve: bonnet height under the body, gate overlap above / below the slit, gate inset from the body's load-lock face. */
export const SLIT_BONNET_HEIGHT = 0.05;
export const SLIT_GATE_MARGIN = 0.015;
export const SLIT_GATE_INSET = 0.012;

/** Station frame (r, y, q) -> instance frame. */
export function stationPoint(S: { u: [number, number]; p: [number, number] }, r: number, y: number, q: number): Vec3Tuple {
  return [r * S.u[0] + q * S.p[0], y, r * S.u[1] + q * S.p[1]];
}

export function deriveHandlingStation(cfg: HandlingStationConfig, ch: ChamberHandlingInput, foup: FoupInterface): HandlingStationLayout {
  const az = ch.azimuthRad;
  const u: [number, number] = [Math.cos(az), Math.sin(az)];
  const p: [number, number] = [-Math.sin(az), Math.cos(az)];
  const planeY = ch.slitCenterY - cfg.transfer_plane_below_slit_center;
  const vb = cfg.vacuum_blade;
  const llc = cfg.load_lock;
  // slit valve + adapter
  const valveR0 = ch.portFaceR;
  const valveR1 = valveR0 + ch.valveBodySize[2];
  const adapterR1 = valveR1 + cfg.gap_from_slit_valve;
  // optional vacuum transfer chamber between the adapter and the load lock
  const tcc = cfg.transfer_chamber;
  const tcLen = tcc ? tcc.length : 0;
  // load lock body
  const llR0 = adapterR1 + tcLen;
  const llR1 = llR0 + llc.length;
  const innerR0 = llR0 + llc.wall_thickness;
  const innerR1 = llR1 - llc.wall_thickness;
  const centerR = innerR0 + llc.wafer_offset_from_vacuum_wall;
  const innerBottomY = planeY - llc.interior_below_plane;
  const innerTopY = planeY + llc.interior_above_plane;
  // blade stack under the transfer plane (wafer bottom = pad top = planeY)
  const bladeY1 = planeY - vb.pad_height;
  const bladeY0 = bladeY1 - vb.thickness;
  const carriageY1 = bladeY0;
  const carriageY0 = carriageY1 - vb.carriage_thickness;
  const stageY1 = carriageY0;
  const stageY0 = stageY1 - vb.stage_thickness;
  const railY1 = stageY0;
  const railY0 = railY1 - vb.rail_height;
  // telescopic blade: carriage rides on stage 1; at full extension the pocket reaches the chamber axis
  const rootRestR = centerR + vb.root_to_pocket;
  const stageRestR1 = rootRestR + vb.carriage_length / 2 + vb.stage_rear_margin;
  const stageRestR0 = stageRestR1 - vb.stage_length;
  const s2max = rootRestR - vb.carriage_length / 2 - stageRestR0;
  const stroke = centerR;
  const shuttleMax = tcLen;
  const s1max = stroke - shuttleMax - s2max;
  // atmospheric door frame on the EFEM side of the load lock
  const ad = llc.atm_door;
  const atmR0 = llR1;
  const atmR1 = llR1 + ad.frame_depth;
  // EFEM
  const efemR0 = atmR1;
  const efemR1 = efemR0 + cfg.efem.depth;
  const efemTopY = ch.floorY + cfg.efem.height_above_floor;
  // atmospheric robot
  const ar = cfg.atm_robot;
  const axisR = efemR0 + ar.axis_offset_from_back_wall;
  const supportOffset = ar.link1_thickness + ar.link2_thickness + ar.ee_mount_height + ar.ee_thickness + ar.pad_height;
  // load port and FOUP seat
  const lp = cfg.load_port;
  const deckTopY = ch.floorY + lp.deck_height_above_floor;
  const dockedR = efemR1 + foup.doorFaceX + lp.door_gap;
  const seatR = dockedR + lp.dock_stroke;
  const slotY = (slot: number) => deckTopY + foup.slot1Height + (slot - 1) * foup.slotPitch;
  // pins in the load lock (value 0 = drop height below the plane, max = raise height)
  const pins: [number, number][] = [];
  for (const dr of llc.support_pins.r_offsets) for (const dq of llc.support_pins.q_offsets) pins.push([centerR + dr, dq]);
  const pinDropTop = planeY - llc.support_pins.drop_below_plane;
  const pinRaiseTop = planeY + llc.support_pins.raise_above_plane;
  // robot shoulder height: the lowest support plane needed (load lock place, approach below) minus the margin
  const ac = ar.approach_clearance;
  const lowest = Math.min(pinRaiseTop - ac, slotY(1) - ac);
  const shoulderY0 = lowest - supportOffset - ar.z_margin_below;
  const axisXZ: [number, number] = [axisR * u[0], axisR * u[1]];
  const scara: ScaraGeom = { axisXZ, d0: [u[0], u[1]], linkLength: ar.link_length, eeReach: ar.ee_reach };
  const swingRadius = Math.max(ar.link_length + ar.hub_radius, ar.ee_reach + ar.hub_radius, ar.tip_beyond_center, 0.15);
  // door opening of the EFEM front plate (load port side)
  const opY0 = deckTopY + lp.opening_bottom_above_deck;
  // the fork and the raised wafer pass the door around the raised pin height
  const atmDoorCenterY = pinRaiseTop + (0.000775 - ar.pad_height - ar.ee_thickness) / 2;
  const seat = stationPoint({ u, p }, seatR, deckTopY, 0);
  return {
    cfg,
    az,
    u,
    p,
    floorY: ch.floorY,
    planeY,
    slit: { centerY: ch.slitCenterY, width: ch.slitWidth, height: ch.slitHeight, y0: ch.slitCenterY - ch.slitHeight / 2, y1: ch.slitCenterY + ch.slitHeight / 2, portFaceR: ch.portFaceR, valveR0, valveR1, valveSize: ch.valveBodySize, lowerR0: Math.max(valveR0 + 0.01, ch.bottomFlangeR + 0.004) },
    adapter: { r0: valveR1, r1: adapterR1 },
    ll: {
      r0: llR0,
      r1: llR1,
      innerR0,
      innerR1,
      width: llc.width,
      innerWidth: llc.width - 2 * llc.wall_thickness,
      wall: llc.wall_thickness,
      bottomY: innerBottomY - llc.floor_thickness,
      innerBottomY,
      innerTopY,
      topY: innerTopY + llc.lid_thickness,
      centerR,
      pins,
      pinRadius: llc.support_pins.diameter / 2,
      pinDropTop,
      pinRaiseTop,
      pinStroke: pinRaiseTop - pinDropTop,
      vacOpening: { width: llc.vacuum_opening.width, y0: ch.slitCenterY - llc.vacuum_opening.height / 2, y1: ch.slitCenterY + llc.vacuum_opening.height / 2 },
    },
    tc: tcc
      ? { r0: adapterR1, r1: adapterR1 + tcLen, innerR0: adapterR1 + tcc.wall_thickness, width: tcc.width, innerWidth: tcc.width - 2 * tcc.wall_thickness, wall: tcc.wall_thickness, bottomY: innerBottomY - tcc.floor_thickness, topY: innerTopY + tcc.lid_thickness, railQ: tcc.shuttle_rail_q }
      : null,
    atmDoor: { r0: atmR0, r1: atmR1, planeR: (atmR0 + atmR1) / 2, width: ad.opening_width, y0: atmDoorCenterY - ad.opening_height / 2, y1: atmDoorCenterY + ad.opening_height / 2, centerY: atmDoorCenterY, gateTravel: ad.gate_travel, gateThickness: ad.gate_thickness },
    blade: { bladeY0, bladeY1, carriageY0, carriageY1, stageY0, stageY1, railY0, railY1, pocketRestR: centerR, rootRestR, stageRestR0, stageRestR1, s1max, s2max, shuttleMax, stroke, halfWidth: vb.width / 2 },
    efem: { r0: efemR0, r1: efemR1, width: cfg.efem.width, topY: efemTopY, ffuTopY: efemTopY + cfg.efem.ffu_height, doorZoneR: efemR1 - cfg.efem.door_zone_depth },
    robot: { axisR, axisXZ, scara, shoulderY0, baseTopY: shoulderY0 - 0.03, zStroke: ar.z_stroke, supportOffset, hubRadius: ar.hub_radius, swingRadius },
    loadPort: {
      deckR0: efemR1,
      deckR1: efemR1 + lp.deck_depth,
      deckTopY,
      deckWidth: lp.deck_width,
      deckThickness: lp.deck_thickness,
      seatR,
      dockedR,
      dockStroke: lp.dock_stroke,
      opening: { width: lp.opening_width, y0: opY0, y1: opY0 + lp.opening_height, centerY: opY0 + lp.opening_height / 2 },
      doorPull: lp.door_pull,
      doorLower: lp.door_lower,
      doorPlateThickness: lp.door_plate_thickness,
    },
    foup,
    seat,
    doorFacing: [-u[0], 0, -u[1]],
    slotY,
    targets: { foupRho: dockedR - foup.waferCenterX - axisR, llRho: axisR - centerR, foupTheta: 0, llTheta: Math.PI },
  };
}

/** Robot Z joint value that puts the wafer support plane at height y. */
export function robotZForPlane(S: HandlingStationLayout, y: number): number {
  return y - S.robot.shoulderY0 - S.robot.supportOffset;
}

/** Docked FOUP wafer center radial position (FOUP door faces the tool: carrier +X maps to -r). */
export function foupWaferR(S: HandlingStationLayout, docked: boolean): number {
  return (docked ? S.loadPort.dockedR : S.loadPort.seatR) - S.foup.waferCenterX;
}

export function validateHandlingStation(S: HandlingStationLayout, ch: ChamberHandlingInput): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(`station: ${msg}`);
  };
  const should = (ok: boolean, msg: string) => {
    if (!ok) warnings.push(`station: ${msg}`);
  };
  const W = 0.15; // 300 mm wafer radius
  const ar = S.cfg.atm_robot;
  const ll = S.ll;
  const bl = S.blade;
  must(ll.r0 >= S.slit.valveR1 + 0.002, "load lock must clear the slit valve body");
  // load lock holds the wafer, the retracted blade and the gate retreat
  must(ll.centerR - W - ll.innerR0 >= 0.03, `load lock interior must clear the wafer on the vacuum side (${((ll.centerR - W - ll.innerR0) * 1000).toFixed(0)} mm)`);
  must(ll.innerR1 - (ll.centerR + W) >= 0.03, "load lock interior must clear the wafer on the atmospheric side");
  must(ll.innerWidth >= 2 * W + 0.06, "load lock interior must be wider than the wafer with 30 mm clearance per side");
  must(bl.stageRestR0 >= ll.innerR0 - 1e-9 && bl.stageRestR1 <= ll.innerR1 + 1e-9, "retracted blade stage must fit inside the load lock");
  must(bl.s2max > 0 && bl.s1max > 0 && bl.s1max <= S.cfg.vacuum_blade.stage_length, "blade stage strokes must be positive and within the stage length");
  must(bl.rootRestR + S.cfg.vacuum_blade.carriage_length / 2 <= ll.innerR1 - 0.005, "retracted blade carriage must stay inside the load lock");
  if (S.tc) {
    const tc = S.tc;
    must(tc.innerWidth >= 2 * W + 0.06, "transfer chamber interior must be wider than the wafer with 30 mm clearance per side");
    must(tc.railQ - 0.012 > S.cfg.vacuum_blade.stage_width / 2 && tc.railQ + 0.012 < tc.innerWidth / 2 - 0.005, "shuttle rails must lie between the blade stage and the transfer chamber walls");
    must(bl.shuttleMax > 0 && bl.s1max > 0.02, "shuttle and stage 1 must both have a positive stroke");
    must(tc.innerR0 <= S.slit.valveR1 + S.cfg.gap_from_slit_valve + tc.wall + 1e-9, "transfer chamber must start at the slit valve adapter");
  }
  // vertical stack through the slit and over the stage at the transfer position
  must(bl.stageY0 >= S.slit.y0 + 0.003, `blade stage must pass above the slit bottom (${((bl.stageY0 - S.slit.y0) * 1000).toFixed(1)} mm)`);
  must(S.planeY + 0.000775 <= S.slit.y1 - 0.01, "wafer on the blade must pass below the slit top");
  must(bl.railY0 >= ll.innerBottomY - 1e-9, "blade rail must sit on the load lock floor");
  const stageTop = ch.stage.transferTopY + ch.stage.edgeRingThickness;
  must(bl.stageY0 - stageTop >= 0.005, `blade stack must clear the stage at the transfer position (${((bl.stageY0 - stageTop) * 1000).toFixed(1)} mm)`);
  const contact = S.planeY - ch.stage.transferTopY;
  must(contact > 0.002 && contact < ch.stage.liftPinStroke - 0.003, "chamber lift pins must take the wafer off the blade within their stroke");
  must(S.slit.portFaceR > ch.stage.radius, "slit port must be outside the stage");
  // slit valve: bonnet and actuator hang outside the chamber bottom flange; the open gate retreats into the bonnet
  const sl = S.slit;
  const bodyBottom = sl.centerY - sl.valveSize[1] / 2;
  const gateR0 = sl.valveR1 - SLIT_GATE_INSET - ch.slitGate.thickness;
  must(sl.valveR1 - 0.01 - sl.lowerR0 >= 0.04, `slit valve bonnet needs room outside the chamber bottom flange (${((sl.valveR1 - 0.01 - sl.lowerR0) * 1000).toFixed(0)} mm)`);
  must(gateR0 >= sl.lowerR0 + 0.002, "slit gate must retreat inside the bonnet, outside the chamber bottom flange");
  must(sl.y0 - SLIT_GATE_MARGIN - ch.slitGate.travel >= bodyBottom - SLIT_BONNET_HEIGHT + 0.003, "open slit gate must stay inside the bonnet");
  must(sl.y1 + SLIT_GATE_MARGIN - ch.slitGate.travel <= sl.y0 + 1e-9, "open slit gate must clear the slit");
  // lift pins vs blade footprint in the chamber (pins at 30/150/270 deg on the pin circle)
  for (const deg of [30, 150, 270]) {
    const a = (deg * Math.PI) / 180;
    const lat = Math.abs(ch.stage.liftPinCircleRadius * Math.sin(a - S.az));
    const along = ch.stage.liftPinCircleRadius * Math.cos(a - S.az);
    if (along > -0.15 && along < 0.15 + S.cfg.vacuum_blade.tip_beyond_pocket) must(lat - 0.002 > bl.halfWidth + 0.004, `blade must pass beside the chamber lift pin at ${deg} deg`);
  }
  // load lock pins vs blade and robot fork
  for (const [, q] of ll.pins) {
    must(Math.abs(q) - ll.pinRadius > bl.halfWidth + 0.004, "load lock pins must stay outside the blade");
    must(Math.abs(q) + ll.pinRadius < ar.tine_q[0] - 0.004 || Math.abs(q) - ll.pinRadius > ar.tine_q[1] + 0.004, "load lock pins must stay clear of the robot fork tines");
  }
  must(ll.pinDropTop < S.planeY - 0.001 && ll.pinRaiseTop > S.planeY + 0.008, "load lock pins must pass the blade plane in both directions");
  // robot fork between the blade and the raised wafer
  const forkBottomMin = ll.pinRaiseTop - ar.approach_clearance - ar.pad_height - ar.ee_thickness;
  must(forkBottomMin - S.planeY >= 0.004, `robot fork must stay above the blade while placing (${((forkBottomMin - S.planeY) * 1000).toFixed(1)} mm)`);
  // atmospheric door opening covers the fork and the wafer during pick / place
  const waferTopMax = ll.pinRaiseTop + ar.approach_clearance + 0.000775;
  must(S.atmDoor.y0 <= forkBottomMin - 0.004 && S.atmDoor.y1 >= waferTopMax + 0.004, "atmospheric door opening must cover the fork and the wafer");
  must(S.atmDoor.y0 >= ll.innerBottomY && S.atmDoor.y1 <= ll.innerTopY, "atmospheric door opening must lie inside the load lock interior");
  must(S.atmDoor.gateTravel >= S.atmDoor.y1 - S.atmDoor.y0 + 0.01, "atmospheric gate must retreat below its opening");
  must(S.atmDoor.width >= 2 * W + 0.03, "atmospheric door must pass the wafer");
  must(waferTopMax <= ll.innerTopY - 0.004, "raised wafer and fork must fit under the load lock lid");
  must(ll.vacOpening.y0 <= bl.stageY0 - 0.002 && ll.vacOpening.y1 >= S.planeY + 0.003, "vacuum-side opening must pass the blade stack and the wafer");
  // robot reach and swing
  const reachLL = S.robot.axisR - ll.centerR;
  const reachFoup = foupWaferR(S, true) - S.robot.axisR;
  const L = ar.link_length;
  for (const [name, rho] of [
    ["load lock", reachLL],
    ["FOUP slot", reachFoup],
  ] as const) {
    must(rho - ar.ee_reach < 2 * L - 0.02 && rho - ar.ee_reach > -2 * L + 0.02, `robot must reach the ${name} (rho ${rho.toFixed(3)} m)`);
  }
  must(S.robot.axisR - reachLL + ar.ee_reach - ar.hub_radius >= S.efem.r0 + 0.004, "robot wrist must stay inside the EFEM when reaching into the load lock");
  must(S.robot.axisR + (reachFoup - ar.ee_reach) + ar.hub_radius <= S.efem.r1 - 0.004, "robot wrist must stay inside the EFEM when reaching into the FOUP");
  must(S.robot.axisR - S.robot.swingRadius >= S.efem.r0 + 0.02, "robot swing must clear the EFEM back wall");
  must(S.robot.axisR + S.robot.swingRadius <= S.efem.doorZoneR - 0.02, "robot swing must clear the door opener zone");
  must(S.robot.swingRadius + 0.02 <= S.efem.width / 2, "robot swing must fit the EFEM width");
  const zLL = ll.pinRaiseTop + ar.approach_clearance - S.robot.shoulderY0 - S.robot.supportOffset;
  const zSlot = S.slotY(S.foup.slotCount) + ar.approach_clearance - S.robot.shoulderY0 - S.robot.supportOffset;
  must(zLL <= S.robot.zStroke && zSlot <= S.robot.zStroke, "robot Z stroke must cover the load lock and every FOUP slot");
  must(S.robot.baseTopY > S.floorY + 0.3, "robot base must stand on the EFEM floor");
  // load port and FOUP
  must(S.loadPort.seatR > S.loadPort.deckR0 + 0.15 && S.loadPort.seatR < S.loadPort.deckR1 - 0.1, "FOUP seat must lie on the load port deck");
  const foupOpenY0 = S.loadPort.deckTopY + S.foup.openingBottomY;
  must(S.loadPort.opening.y0 <= foupOpenY0 + 0.002 && S.loadPort.opening.y1 >= foupOpenY0 + S.foup.openingSize[1] - 0.002, "EFEM front opening must cover the FOUP door opening");
  must(S.loadPort.doorLower >= S.loadPort.opening.y1 - S.loadPort.opening.y0 + 0.02, "door opener must lower the door below the opening");
  must(S.loadPort.doorPull + S.loadPort.doorPlateThickness <= S.cfg.efem.door_zone_depth + 1e-9, "pulled port door and its guide rails must stay inside the door opener zone");
  must(S.efem.topY > S.loadPort.opening.y1 + 0.3, "EFEM must be taller than the load port opening");
  should(S.cfg.efem.height_above_floor < 2.3, "EFEM taller than usual; check OHT clearance");
  return { errors, warnings };
}
