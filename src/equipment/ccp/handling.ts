/**
 * CCP handling plan: the shared station sequence bound to the CCP chamber kinematics (pedestal lift,
 * lift pins, slit gate) and the demonstration's reserved FOUP slot.
 */
import { CHAMBER_LAYOUT } from "../../config/geometry";
import { DEMO_RESERVED_SLOT } from "../../domain/materialFlow";
import { slotIndex } from "../foup/index";
import { chamberKinematics, planStation, type StationPlan } from "../handling/stationSequence";

const cfg = CHAMBER_LAYOUT.cfg;

export const CCP_STATION_PLAN: StationPlan = planStation(
  CHAMBER_LAYOUT.station,
  chamberKinematics(CHAMBER_LAYOUT.station, "pedestal_z", cfg.pedestal.process_top_y, cfg.pedestal.transfer_top_y, cfg.pedestal.lift_pin_stroke, cfg.ports.slit.gate_travel),
  slotIndex(DEMO_RESERVED_SLOT.slotId),
);
