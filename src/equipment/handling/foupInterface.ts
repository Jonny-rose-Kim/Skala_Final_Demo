/**
 * FOUP interface used by the tool stations (door face, slot pitch, coupling pads). The values live in the
 * versioned OHT bay config (`foup` block) together with the carrier dimensions the gripper uses, so the
 * tools, the OHT and the carrier template read one source.
 */
import ohtRaw from "../../../config/geometry/oht-bay-v1.json";
import type { FoupInterface } from "./stationLayout";

interface RawFoup {
  body_size: [number, number, number];
  door_face_x: number;
  door_thickness: number;
  wafer_center_x: number;
  slot_pitch: number;
  slot1_height: number;
  slot_count: number;
  opening_size: [number, number];
  opening_bottom_y: number;
  coupling_pad_positions: [number, number][];
}

export function foupInterface(): FoupInterface {
  const f = (ohtRaw as unknown as { foup: RawFoup }).foup;
  return {
    bodySize: f.body_size,
    doorFaceX: f.door_face_x,
    doorThickness: f.door_thickness,
    waferCenterX: f.wafer_center_x,
    slotPitch: f.slot_pitch,
    slot1Height: f.slot1_height,
    slotCount: f.slot_count,
    openingSize: f.opening_size,
    openingBottomY: f.opening_bottom_y,
    couplingPads: f.coupling_pad_positions,
  };
}

export const FOUP_INTERFACE: FoupInterface = foupInterface();
