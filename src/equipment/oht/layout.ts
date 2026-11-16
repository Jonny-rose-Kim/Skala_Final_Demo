/**
 * OHT bay geometry: straight ceiling rail along +Z, one vehicle, belt hoist and gripper. The FOUP
 * dimensions used by the gripper geometry live here too (the carrier template reads them).
 * Units: meters. Frame: +Y up, origin at the fab floor under the rail center line.
 */
import rawConfig from "../../../config/geometry/oht-bay-v1.json";
import type { Vec3Tuple, ValidationReport } from "../../config/geometry";

export interface OhtGeometryConfig {
  $schema_id: string;
  geometry_revision: string;
  template_id: string;
  title: string;
  source: { kind: "assumed" | "measured" | "vendor"; note: string; references: string[] };
  units: "m";
  rail: { z0: number; z1: number; bottom_y: number; height: number; width: number; flange_width: number; flange_thickness: number; hanger_pitch: number; hanger_radius: number; ceiling_y: number; ceiling_pad_size: number };
  vehicle: { body_size: Vec3Tuple; body_top_gap: number; bogie_size: Vec3Tuple; bogie_spacing: number; wheel_radius: number; wheel_width: number; yoke_size: Vec3Tuple; front_sensor_size: Vec3Tuple; travel_reference_z: number; park_position_z: number };
  hoist: { stroke: number; belt_count: number; belt_offsets: [number, number][]; belt_width: number; belt_thickness: number; belt_base_length: number; gripper_plate_size: Vec3Tuple; finger_size: Vec3Tuple; finger_open_gap: number; finger_closed_gap: number; finger_lip: number };
  foup: { body_size: Vec3Tuple; door_thickness: number; door_inset: number; flange_size: Vec3Tuple; flange_neck_height: number; flange_neck_radius: number; coupling_pad_size: number; coupling_pad_height: number; coupling_pad_positions: [number, number][]; slot_count: number };
  station: { approach_clearance: number; lateral_tolerance: number };
}

export interface OhtLayout {
  cfg: OhtGeometryConfig;
  rail: { z0: number; z1: number; length: number; bottomY: number; topY: number };
  vehicle: { bodyY0: number; bodyY1: number; bodyTopY: number; bogieY: number; size: Vec3Tuple; parkS: number };
  hoist: { originY: number; stroke: number; plateTopY: number; plateBottomY: number; fingerBottomY: number; retractedExtension: number };
  /** FOUP seat relative to the hoist frame when the gripper is engaged (seat = flange top - flange stack height). */
  carrierSeatInHoistFrame: Vec3Tuple;
  foup: { seatToFlangeTop: number; flangeTopToPlate: number; bodyTopY: number; flangeTopY: number };
  gripper: { openHalfGap: number; closedHalfGap: number };
}

export function loadOhtConfig(): OhtGeometryConfig {
  return rawConfig as unknown as OhtGeometryConfig;
}

export function deriveOhtLayout(cfg: OhtGeometryConfig): OhtLayout {
  const r = cfg.rail;
  const v = cfg.vehicle;
  const h = cfg.hoist;
  const f = cfg.foup;
  const bogieY = r.bottom_y - v.bogie_size[1] / 2 + r.flange_thickness; // bogie straddles the bottom flange
  const bodyY1 = r.bottom_y - v.body_top_gap;
  const bodyY0 = bodyY1 - v.body_size[1];
  const originY = bodyY0; // belt anchor at the body underside
  const plateTopY = originY - h.belt_base_length;
  const plateBottomY = plateTopY - h.gripper_plate_size[1];
  const fingerBottomY = plateBottomY - h.finger_size[1];
  const seatToFlangeTop = f.body_size[1] + f.flange_neck_height + f.flange_size[1];
  return {
    cfg,
    rail: { z0: r.z0, z1: r.z1, length: r.z1 - r.z0, bottomY: r.bottom_y, topY: r.bottom_y + r.height },
    vehicle: { bodyY0, bodyY1, bodyTopY: bodyY1, bogieY, size: v.body_size, parkS: v.park_position_z - r.z0 },
    hoist: { originY, stroke: h.stroke, plateTopY, plateBottomY, fingerBottomY, retractedExtension: 0 },
    carrierSeatInHoistFrame: [0, plateBottomY - seatToFlangeTop - originY, 0],
    foup: { seatToFlangeTop, flangeTopToPlate: 0, bodyTopY: f.body_size[1], flangeTopY: seatToFlangeTop },
    gripper: { openHalfGap: h.finger_open_gap / 2, closedHalfGap: h.finger_closed_gap / 2 },
  };
}

/** Pose of the vehicle travel frame for a path distance s (rail-aligned; straight rail = no yaw). */
export function ohtPathPose(L: OhtLayout, _jointId: string, s: number): { position: Vec3Tuple; yawRad: number } {
  const ss = Math.min(Math.max(s, 0), L.rail.length);
  return { position: [0, L.vehicle.bogieY, L.rail.z0 + ss], yawRad: 0 };
}

/** Path distance and lateral offset of a point given in the OHT instance frame. */
export function projectOnRail(L: OhtLayout, local: Vec3Tuple): { s: number; lateral: number } {
  return { s: local[2] - L.rail.z0, lateral: local[0] };
}

/** Hoist extension needed to seat / pick a carrier whose seat is at local height y. */
export function hoistExtensionForSeat(L: OhtLayout, seatY: number): number {
  return L.hoist.originY + L.carrierSeatInHoistFrame[1] - seatY;
}

export function validateOhtConfig(cfg: OhtGeometryConfig): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const L = deriveOhtLayout(cfg);
  const must = (ok: boolean, msg: string) => {
    if (!ok) errors.push(msg);
  };
  must(cfg.$schema_id === "pecvd-twin.oht-geometry-config/1", "schema id mismatch");
  must(L.rail.length > 1, "rail must have a usable length");
  must(cfg.vehicle.park_position_z >= cfg.rail.z0 && cfg.vehicle.park_position_z <= cfg.rail.z1, "park position must lie on the rail");
  must(cfg.hoist.finger_open_gap > cfg.foup.flange_size[0] + 0.02, "open fingers must clear the FOUP flange");
  must(cfg.hoist.finger_closed_gap < cfg.foup.flange_size[0] - 0.01, "closed fingers must reach under the FOUP flange");
  must(cfg.hoist.finger_closed_gap > cfg.foup.flange_neck_radius * 2 + 0.01, "closed fingers must clear the flange neck");
  must(cfg.hoist.gripper_plate_size[0] < cfg.vehicle.body_size[0] && cfg.hoist.gripper_plate_size[2] < cfg.vehicle.body_size[2], "gripper plate must fit under the vehicle body");
  must(L.hoist.fingerBottomY > 0, "gripper must hang above the floor at the retracted pose");
  must(cfg.hoist.stroke > 0.5, "hoist stroke must be meaningful");
  for (const [x, z] of cfg.hoist.belt_offsets) must(Math.abs(x) < cfg.hoist.gripper_plate_size[0] / 2 && Math.abs(z) < cfg.hoist.gripper_plate_size[2] / 2, "belt attachments must lie on the gripper plate");
  must(cfg.foup.body_size[0] + 0.1 < cfg.vehicle.body_size[2] + 0.4, "FOUP width versus vehicle informational");
  return { errors, warnings };
}

export const OHT_CONFIG: OhtGeometryConfig = loadOhtConfig();
export const OHT_LAYOUT: OhtLayout = deriveOhtLayout(OHT_CONFIG);
