/**
 * Scenario registry: standalone sequences per template and the linked Route A/B demonstrations.
 * Equipment modules register their definitions; the UI lists what the loaded fixture can run.
 */
import type { ScenarioDefinition } from "./scenario";

const registry = new Map<string, ScenarioDefinition>();
const order: string[] = [];

export function registerScenario(def: ScenarioDefinition): void {
  if (!registry.has(def.id)) order.push(def.id);
  registry.set(def.id, def);
}

export function getScenario(id: string): ScenarioDefinition | undefined {
  return registry.get(id);
}

export function listScenarios(): ScenarioDefinition[] {
  return order.map((id) => registry.get(id)!).filter(Boolean);
}

/** Scenarios runnable with the given instances (ids and template ids). */
export function availableScenarios(instances: { instanceId: string; templateId: string }[]): ScenarioDefinition[] {
  const ids = new Set(instances.map((i) => i.instanceId));
  const templates = new Set(instances.map((i) => i.templateId));
  return listScenarios().filter((s) => s.requiredInstanceIds.every((id) => ids.has(id)) && s.requiredTemplateIds.every((t) => templates.has(t)));
}

export function standaloneScenarioFor(templateId: string): ScenarioDefinition | undefined {
  return listScenarios().find((s) => s.kind === "standalone" && s.templateId === templateId);
}
