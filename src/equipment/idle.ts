/**
 * Idle (home) poses of the tools that do not take part in the current scenario, so no robot is ever
 * shown in its authoring rest pose. Pure values; presentation only.
 */
import { CCP_STATION_PLAN } from "./ccp/handling";
import { cmpIdleJoints } from "./cmp/scenario";
import { OHT_LAYOUT } from "./oht/layout";
import { REMOTE_STATION_PLAN } from "./remote/handling";
import { stationIdleJoints } from "./handling/stationScenario";
import { PRODUCER_STATION_PLAN } from "./producer/handling";
import { TACTRAS_STATION_PLAN } from "./tactras/handling";

let cache: Record<string, Record<string, number>> | null = null;

export function idleToolPose(templateId: string): Record<string, number> {
  if (!cache) {
    cache = {
      producer_se_ccp_twin_300: stationIdleJoints(PRODUCER_STATION_PLAN),
      tactras_oxide_ccp_rie_300: stationIdleJoints(TACTRAS_STATION_PLAN),
      ccp_pecvd_single_wafer_300: stationIdleJoints(CCP_STATION_PLAN),
      remote_pecvd_upstream_icp: stationIdleJoints(REMOTE_STATION_PLAN),
      sti_cmp_rotary_single_platen: cmpIdleJoints(),
      oht_single_vehicle: { travel: OHT_LAYOUT.vehicle.parkS, hoist: 0, gripper_a: 0, gripper_b: 0 },
    };
  }
  return { ...(cache[templateId] ?? {}) };
}
