/**
 * Typed contract for a future anomaly-detection / prediction / RCA agent service, and the adapter that maps
 * an event target onto the 3D twin (instance + asset ids) for Focus and highlight. No agent, model or data
 * stream exists in this repository; nothing here computes a confidence, an RUL or a defect probability, and
 * an RCA candidate is never marked as the confirmed cause by the frontend.
 *
 * Time: `eventTime`, `generatedAt` and evidence windows are plant / data times (ISO 8601), never the
 * demonstration's presentation_time.
 */
import type { ComponentScope, EquipmentInstanceDef, EquipmentTemplate } from "./types";

/** What an event is about. `component` names a template asset (assetId) inside the tool. */
export interface TargetScope {
  level: "tool" | "module" | "chamber" | "component";
  instanceId: string;
  moduleId?: string;
  chamberId?: string;
  assetId?: string;
}

export interface EvidenceRef {
  channelId: string;
  window: { from: string; to: string };
  timeDomain: "wall_clock" | "replay_time" | "simulation_time";
  noteKo?: string;
}

export interface AgentSource {
  providerKind: "agent_service" | "rule_engine" | "model" | "manual";
  providerId: string;
  version?: string;
}

interface AgentEventBase {
  eventId: string;
  source: AgentSource;
  eventTime: string;
  target: TargetScope;
  channelIds: string[];
  evidence: EvidenceRef[];
}

export interface DetectionEvent extends AgentEventBase {
  kind: "detection";
  /** raised = anomaly present; cleared = the same anomaly resolved (removes its highlight). */
  state: "raised" | "cleared";
  severity: "info" | "warning" | "major" | "critical";
  anomalyType?: string;
}

export interface PredictionEvent extends AgentEventBase {
  kind: "prediction";
  generatedAt: string;
  horizon: { from: string; to: string };
  predicted: { quantity: string; unit?: string; interval?: [number, number] };
  model: { modelId: string; version: string };
  /** Only when the provider supplies it, with its own meaning (e.g. "90 % prediction interval"). */
  uncertainty?: { meaning: string; value?: number };
}

export interface RcaCandidate {
  target: TargetScope;
  rank: number;
  statement: string;
  supporting: EvidenceRef[];
  contradicting: EvidenceRef[];
}

export interface RcaEvent extends AgentEventBase {
  kind: "rca";
  subject: { waferIds?: string[]; lotIds?: string[]; processRunIds?: string[] };
  candidates: RcaCandidate[];
  /** The frontend never confirms a cause; a confirmed flag can only come from the provider's own review. */
  confirmedByProvider: boolean;
}

export type AgentEvent = DetectionEvent | PredictionEvent | RcaEvent;

/** Resolved 3D target: the instance and the template assets that represent the scope. */
export interface ResolvedTarget {
  instanceId: string;
  assetIds: string[];
  /** Why the resolution is partial (e.g. a geometry-only module has no internal assets). */
  noteKo?: string;
}

function inScope(s: ComponentScope | undefined, t: TargetScope): boolean {
  if (!s) return false;
  if (t.moduleId && s.moduleId !== t.moduleId) return false;
  if (t.chamberId && s.chamberId !== t.chamberId) return false;
  return true;
}

/** Map an event target onto the instance's template assets (tool -> exterior / all, module, chamber, component). */
export function resolveTarget(t: TargetScope, instances: EquipmentInstanceDef[], templateOf: (templateId: string) => EquipmentTemplate<unknown> | undefined): ResolvedTarget | null {
  const inst = instances.find((i) => i.instanceId === t.instanceId);
  const tpl = inst ? templateOf(inst.templateId) : undefined;
  if (!inst || !tpl) return null;
  const selectable = tpl.components.filter((c) => c.selectable && c.kind !== "effect");
  switch (t.level) {
    case "component": {
      const c = selectable.find((x) => x.assetId === t.assetId);
      return c ? { instanceId: inst.instanceId, assetIds: [c.assetId] } : null;
    }
    case "chamber":
    case "module": {
      const ids = selectable.filter((c) => inScope(c.scope, t)).map((c) => c.assetId);
      if (ids.length) return { instanceId: inst.instanceId, assetIds: ids };
      const mod = tpl.modules?.find((m) => m.moduleId === t.moduleId);
      return mod ? { instanceId: inst.instanceId, assetIds: [], noteKo: "Geometry-only module: 내부 asset이 없다" } : null;
    }
    case "tool":
      return { instanceId: inst.instanceId, assetIds: selectable.filter((c) => c.shell || c.kind === "enclosure").map((c) => c.assetId) };
  }
}

/**
 * Highlight policy (diagnosis vs selection):
 *  - The user's selection / hover highlight wins on any mesh it covers; diagnosis colours the rest.
 *  - detection: stays until a `cleared` event with the same eventId arrives or the user dismisses it.
 *  - prediction: stays until the horizon end (plant time) or dismissal.
 *  - rca: stays until dismissed; candidates are shown ranked, none is marked confirmed by the frontend.
 * Severity only selects the colour; it is never derived from data in the frontend.
 */
export interface DiagnosisHighlight {
  eventId: string;
  kind: AgentEvent["kind"];
  severity: DetectionEvent["severity"] | "prediction" | "rca";
  targets: ResolvedTarget[];
  /** Plant-time expiry (prediction horizon end); null = until cleared / dismissed. */
  expiresAt: string | null;
}

export function diagnosisFor(e: AgentEvent, instances: EquipmentInstanceDef[], templateOf: (templateId: string) => EquipmentTemplate<unknown> | undefined): DiagnosisHighlight | null {
  if (e.kind === "detection" && e.state === "cleared") return null;
  const scopes = e.kind === "rca" ? e.candidates.slice().sort((a, b) => a.rank - b.rank).map((c) => c.target) : [e.target];
  const targets = scopes.map((s) => resolveTarget(s, instances, templateOf)).filter((x): x is ResolvedTarget => !!x);
  if (!targets.length) return null;
  return { eventId: e.eventId, kind: e.kind, severity: e.kind === "detection" ? e.severity : e.kind, targets, expiresAt: e.kind === "prediction" ? e.horizon.to : null };
}
