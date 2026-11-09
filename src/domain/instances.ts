import instancesConfig from "../../config/equipment/instances.json";
import type { EquipmentInstanceDef } from "./types";

/** Scenario seed: one detailed chamber (configuration, not code). */
export const DEFAULT_INSTANCES: EquipmentInstanceDef[] = instancesConfig.default as EquipmentInstanceDef[];

/** Dev fixture: two instances of the same template with non-colliding ids. */
export const TWO_CHAMBER_FIXTURE: EquipmentInstanceDef[] = instancesConfig.fixtures["two-chambers"] as EquipmentInstanceDef[];

export const INSTANCES_CONFIG_REVISION: string = instancesConfig.config_revision;

/** Globally unique scene key for a component of an instance. */
export function sceneKey(instanceId: string, assetId: string): string {
  return `${instanceId}::${assetId}`;
}
