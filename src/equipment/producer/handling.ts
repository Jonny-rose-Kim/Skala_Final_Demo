/**
 * Producer cell A handling plan: the shared station sequence (with the transfer-chamber shuttle) bound to
 * the cell's pedestal lift, lift pins and slit gate, and the demonstration's reserved FOUP slot.
 */
import { DEMO_RESERVED_SLOT } from "../../domain/materialFlow";
import { slotIndex } from "../foup/index";
import { chamberKinematics, planStation, type StationPlan } from "../handling/stationSequence";
import { PRODUCER_LAYOUT } from "./layout";

const cfg = PRODUCER_LAYOUT.cfg;

export const PRODUCER_STATION_PLAN: StationPlan = planStation(
  PRODUCER_LAYOUT.station,
  chamberKinematics(PRODUCER_LAYOUT.station, "pedestal_z", cfg.pedestal.process_top_y, cfg.pedestal.transfer_top_y, cfg.pedestal.lift_pin_stroke, cfg.ports.slit.gate_travel),
  slotIndex(DEMO_RESERVED_SLOT.slotId),
);
