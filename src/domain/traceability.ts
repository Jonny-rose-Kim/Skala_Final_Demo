/**
 * Minimum wafer traceability contract for a future RCA service, and the agent event contract.
 *
 * Time domains are explicit: `presentationTimeSec` is the demonstration clock of this frontend; `eventTime` is
 * the plant / data time of a real record and is null until a data source is bound. Nothing in the preview
 * issues a production log id: `processRunId` stays null (unbound) and `provenance` says "demo".
 */
import type { ProcessRouteDef } from "./materialFlow";

export interface ToolScopeRef {
  instanceId: string;
  moduleId?: string;
  chamberId?: string;
}

export interface WaferTraceContext {
  provenance: "demo" | "bound";
  lotId: string | null;
  waferId: string;
  carrierId: string | null;
  slotId: string | null;
  routeId: string | null;
  routeRevision: string | null;
  stepId: string | null;
  recipeId: string | null;
  recipeRevision: string | null;
  /** Real run id from MES / tool logs; null in the demonstration (never invented). */
  processRunId: string | null;
  tool: ToolScopeRef | null;
  /** Plant event time (ISO 8601) of the record; null while unbound. */
  eventTime: string | null;
  /** Demonstration clock (seconds); not a plant time. */
  presentationTimeSec: number;
}

/** Trace context of the demonstration route at a presentation time (stepId from the route evaluator). */
export function demoTrace(route: ProcessRouteDef, stepId: string | null, t: number, recipeRevision: (recipeId: string) => string | null): WaferTraceContext {
  const step = route.steps.find((s) => s.stepId === stepId) ?? null;
  return {
    provenance: "demo",
    lotId: route.lotId,
    waferId: route.waferId,
    carrierId: route.carrierId,
    slotId: route.slotId,
    routeId: route.routeId,
    routeRevision: route.revision,
    stepId: step?.stepId ?? null,
    recipeId: step?.recipeId ?? null,
    recipeRevision: step?.recipeId ? recipeRevision(step.recipeId) : null,
    processRunId: null,
    tool: step?.instanceId ? { instanceId: step.instanceId, moduleId: step.moduleId, chamberId: step.chamberId } : null,
    eventTime: null,
    presentationTimeSec: t,
  };
}
