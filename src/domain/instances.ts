import instancesConfig from "../../config/equipment/instances.json";
import type { EquipmentInstanceDef } from "./types";

/** Scenario seed: the demonstration bay (configuration, not code). */
export const DEFAULT_INSTANCES: EquipmentInstanceDef[] = instancesConfig.default as EquipmentInstanceDef[];

const FIXTURES = instancesConfig.fixtures as unknown as Record<string, EquipmentInstanceDef[]>;

/** Dev fixture: two instances of the same template with non-colliding ids. */
export const TWO_CHAMBER_FIXTURE: EquipmentInstanceDef[] = FIXTURES["two-chambers"];

/** Named dev fixtures (`?fixture=<name>`); undefined for unknown names. */
export function instanceFixture(name: string): EquipmentInstanceDef[] | undefined {
  return FIXTURES[name];
}

export function fixtureNames(): string[] {
  return Object.keys(FIXTURES);
}

export const INSTANCES_CONFIG_REVISION: string = instancesConfig.config_revision;

/** Globally unique scene key for a component of an instance. */
export function sceneKey(instanceId: string, assetId: string): string {
  return `${instanceId}::${assetId}`;
}

/** Bay environment config name of an instance set (default bay or a fixture). */
export function environmentFor(fixture: string | undefined): string {
  const env = (instancesConfig as unknown as { environments?: Record<string, string> }).environments ?? {};
  return (fixture && env[fixture]) || env.default || "fab-bay-v2";
}
