/**
 * Tactras PM-01 handling plan: the shared station sequence with the transfer-chamber shuttle; the lower
 * electrode is fixed, so the stage offset is zero and only the lift pins exchange the wafer.
 */
import { DEMO_RESERVED_SLOT } from "../../domain/materialFlow";
import { slotIndex } from "../foup/index";
import { chamberKinematics, planStation, type StationPlan } from "../handling/stationSequence";
import { TACTRAS_LAYOUT } from "./layout";

const le = TACTRAS_LAYOUT.cfg.lower_electrode;

/** Joint id the station writes the (zero) stage offset to; the template has no such joint on purpose. */
export const TACTRAS_FIXED_STAGE = "lower_electrode_fixed";

export const TACTRAS_STATION_PLAN: StationPlan = planStation(TACTRAS_LAYOUT.station, chamberKinematics(TACTRAS_LAYOUT.station, TACTRAS_FIXED_STAGE, 0, 0, le.lift_pin_stroke, TACTRAS_LAYOUT.cfg.ports.slit.gate_travel), slotIndex(DEMO_RESERVED_SLOT.slotId));
