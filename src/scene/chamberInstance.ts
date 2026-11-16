/**
 * Compatibility module: the CCP-specific ChamberInstance became the template-generic EquipmentInstance.
 * The names below are kept so existing imports, tests and the asset manifest keep working.
 */
export { EquipmentInstance as ChamberInstance, type InstanceMeshMetadata, type EffectSet, type EffectFrameContext } from "./equipmentInstance";

/** Assets treated as "shell" (housings) by the x-ray mode in the CCP template. */
export const SHELL_ASSETS = new Set([
  "chamber_body",
  "lid",
  "chamber_liner",
  "slit_valve",
  "exhaust_port",
  "throttle_valve",
  "isolation_valve",
  "foreline",
  "vacuum_pump",
  "matching_network",
  "gas_panel",
  "rf_generator",
  "frame",
  "viewport",
  "pressure_sensor",
  "efem_enclosure",
  "load_port",
]);
