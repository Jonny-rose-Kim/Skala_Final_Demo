import { describe, expect, it } from "vitest";
import "../../src/equipment/index";
import { listBundles, getBundle } from "../../src/domain/registry";
import { DEFAULT_INSTANCES, instanceFixture } from "../../src/domain/instances";
import { CURRENT_RECIPES, ROUTE_DEP_ETCH_CLEAN } from "../../src/domain/materialFlow";
import { diagnosisFor, resolveTarget, type AgentEvent } from "../../src/domain/agentContract";
import { availableScenarios, getScenario } from "../../src/presentation/scenarioRegistry";
import type { PreviewState } from "../../src/presentation/preview";
import type { ScenarioContext, StationWorldFrame } from "../../src/presentation/scenario";
import { ROUTE_TL } from "../../src/equipment/routes/current";
import { CELLESTA_PLAN } from "../../src/equipment/cellesta/scenario";
import { cellestaProcessAt, CELLESTA_JOINTS, CELLESTA_PROCESS_DURATION } from "../../src/equipment/cellesta/sequence";
import { armAngle, validateCellestaConfig } from "../../src/equipment/cellesta/layout";
import { evaluateTrack, trackHandoffs } from "../../src/presentation/motionTrack";

function stationsFor(instances = DEFAULT_INSTANCES): Record<string, StationWorldFrame> {
  const out: Record<string, StationWorldFrame> = {};
  for (const def of instances) {
    const st = getBundle(def.templateId)?.template.station;
    if (!st) continue;
    const [lx, ly, lz] = st.seatLocal;
    const id = `LP.${def.instanceId}`;
    out[id] = { stationId: id, instanceId: def.instanceId, seatWorld: [def.position[0] + lx, def.position[1] + ly, def.position[2] + lz], yawRad: Math.atan2(st.doorFacingLocal[0], st.doorFacingLocal[2]), doorFacing: st.doorFacingLocal };
  }
  return out;
}

const ctx: ScenarioContext = { instances: DEFAULT_INSTANCES, stations: stationsFor() };
const W = ROUTE_DEP_ETCH_CLEAN.waferId;
const F = ROUTE_DEP_ETCH_CLEAN.carrierId;
const route = getScenario("route-dep-etch-clean-v1")!;
const LEGACY_HOLDERS = new Set(["cmp_head", "load_cup", "flip_station", "clean_module", "dry_module"]);
const LEGACY_STATUS = new Set(["polishing", "cleared", "overpolish_illustration"]);

function sample(def = route, step = 0.1): { t: number; p: PreviewState }[] {
  const out: { t: number; p: PreviewState }[] = [];
  for (let t = 0; t <= def.scenario.durationSec; t += step) out.push({ t, p: def.evaluate(t, 7, t, ctx) });
  return out;
}
const SAMPLES = sample();

describe("current bay registry and defaults", () => {
  it("the default bay is the new equipment set; the old instance ids are only in the legacy fixture", () => {
    expect(DEFAULT_INSTANCES.map((d) => d.instanceId)).toEqual(["PRODUCER-01", "ETCH-01", "CLEAN-01", "OHT-01", "FOUP-01"]);
    const ids = new Set(DEFAULT_INSTANCES.map((d) => d.instanceId));
    for (const old of ["PECVD-01.CH-A", "REMOTE-01", "CMP-01"]) expect(ids.has(old)).toBe(false);
    expect(instanceFixture("legacy-v1")!.map((d) => d.instanceId)).toContain("CMP-01");
  });
  it("only the current scenarios are offered in the default bay (no Remote / CMP / legacy route)", () => {
    const offered = availableScenarios(DEFAULT_INSTANCES).map((s) => s.id);
    expect(offered).toEqual(["route-dep-etch-clean-v1", "producer-deposition-cycle-v1", "tactras-etch-cycle-v1", "cellesta-clean-cycle-v1", "clw08v2-transfer-v1"]);
  });
  it("current templates declare their model reference, module hierarchy and representative status", () => {
    for (const id of ["producer_se_ccp_twin_300", "tactras_oxide_ccp_rie_300", "cellesta_i_md_clean_300"]) {
      const t = getBundle(id)!.template;
      expect(t.lifecycle).toBe("current");
      expect(t.reference?.vendor).toBeTruthy();
      expect(t.modules?.some((m) => m.activity === "active")).toBe(true);
      expect(t.modules?.some((m) => m.activity === "geometry_only")).toBe(true);
      expect(t.displayName).toMatch(/representative/);
    }
  });
  it("each tool has exactly one load-port station; idle load ports are components without a station", () => {
    for (const d of DEFAULT_INSTANCES.filter((x) => x.templateId !== "foup_carrier_300" && x.templateId !== "clw08v2_oht")) {
      const t = getBundle(d.templateId)!.template;
      expect(t.station).toBeDefined();
      expect(t.components.some((c) => c.assetId === "idle_load_ports" && c.scope?.activity === "idle")).toBe(true);
    }
    expect(Object.keys(ctx.stations).sort()).toEqual(["LP.CLEAN-01", "LP.ETCH-01", "LP.PRODUCER-01"]);
  });
});

describe("route RT-DEP-ETCH-CLEAN v1 (preview invariants)", () => {
  it("W-01 has exactly one holder and is presented on exactly one asset at every time", () => {
    for (const { t, p } of SAMPLES) {
      expect(Object.keys(p.wafers), `t=${t.toFixed(1)}`).toEqual([W]);
      const presenting = Object.values(p.instances).filter((i) => i.presentedWaferId === W);
      expect(presenting.length, `t=${t.toFixed(1)} ${p.phaseId}`).toBe(1);
      const inSlot = p.wafers[W].holder.kind === "carrier_slot";
      expect(p.carriers[F].slots[ROUTE_DEP_ETCH_CLEAN.slotId] === W, `t=${t.toFixed(1)}`).toBe(inSlot);
      if (inSlot) expect(presenting[0].instanceId).toBe(F);
      expect(p.blockedReason).toBeNull();
    }
  });
  it("the OHT carries only a closed FOUP and never holds the wafer", () => {
    for (const { t, p } of SAMPLES) {
      const c = p.carriers[F];
      if (c.holder.kind === "gripper") {
        expect(c.doorOpen, `t=${t.toFixed(1)}`).toBe(false);
        expect(p.wafers[W].holder.kind).toBe("carrier_slot");
      }
      expect(p.wafers[W].holder.instanceId === "OHT-01").toBe(false);
    }
  });
  it("a wet wafer never goes back into the FOUP, and robots only take a dry wafer out of the clean module", () => {
    let seenWet = false;
    for (const { t, p } of SAMPLES) {
      const w = p.wafers[W];
      if (w.wetState && w.wetState !== "dry") seenWet = true;
      if (w.holder.kind === "carrier_slot") expect(w.wetState ?? "dry", `t=${t.toFixed(1)}`).toBe("dry");
      if (t > ROUTE_TL.clean.processEnd && w.holder.kind === "end_effector") expect(w.wetState ?? "dry", `t=${t.toFixed(1)}`).toBe("dry");
    }
    expect(seenWet).toBe(true);
  });
  it("no Remote / CMP semantics remain in the active route (phases, holders, film statuses, labels)", () => {
    for (const ph of route.scenario.phases) expect(["ccp", "remote", "cmp"]).not.toContain(ph.equipment);
    for (const { p } of SAMPLES) {
      expect(LEGACY_HOLDERS.has(p.wafers[W].holder.kind)).toBe(false);
      expect(LEGACY_STATUS.has(p.wafers[W].film.status)).toBe(false);
      expect(p.wafers[W].film.nitrideExposed).toBe(false);
    }
    const labels = route.scenario.phases.map((p) => `${p.label} ${p.labelKo}`).join(" ");
    expect(labels).not.toMatch(/CMP|polish|slurry|Remote ICP/i);
  });
  it("each step owns its film change: oxide in deposition, mask at the end of lithography, etch only in the etch, strip only in the strip, clean never touches mask or oxide", () => {
    const at = (t: number) => route.evaluate(t, 7, t, ctx).wafers[W].film;
    const ox = (t: number) => at(t).layers.find((l) => l.role === "target_oxide")?.presentFraction ?? 0;
    expect(ox(ROUTE_TL.dep.processStart - 0.1)).toBe(0);
    expect(ox(ROUTE_TL.dep.processEnd + 0.1)).toBe(1);
    // no pattern appears during the OHT leg or before the lithography step ends
    for (let t = ROUTE_TL.dep.unloadEnd; t < ROUTE_TL.litho[1] - 0.05; t += 0.2) expect(at(t).pattern).toBeUndefined();
    for (let t = ROUTE_TL.leg1[0]; t < ROUTE_TL.leg1[1]; t += 0.5) {
      expect(at(t).pattern?.mask).toBe("retained");
      expect(at(t).pattern?.exposedOxideRemaining).toBe(1);
    }
    expect(at(ROUTE_TL.etch.processEnd + 0.1).pattern?.exposedOxideRemaining).toBe(0);
    expect(at(ROUTE_TL.etch.processEnd + 0.1).pattern?.mask).toBe("retained");
    expect(at(ROUTE_TL.strip[1] + 0.1).pattern?.mask).toBe("removed");
    expect(at(ROUTE_TL.strip[1] + 0.1).pattern?.maskRemovedByStepId).toBe("S50_EXTERNAL_RESIST_STRIP");
    const before = at(ROUTE_TL.clean.processStart - 0.1);
    for (let t = ROUTE_TL.clean.processStart; t <= ROUTE_TL.total; t += 0.5) {
      const f = at(t);
      expect(f.pattern?.mask).toBe(before.pattern?.mask);
      expect(f.pattern?.exposedOxideRemaining).toBe(before.pattern?.exposedOxideRemaining);
      expect(f.layers.find((l) => l.role === "target_oxide")?.presentFraction).toBe(1);
    }
    const end = at(ROUTE_TL.total);
    expect(end.pattern?.residue).toBe("reduced");
    expect(end.status).toBe("complete");
  });
  it("is a pure function of time: reverse scrub reproduces poses, holders and wafer state", () => {
    for (const t of [12.3, 98.7, 151.2, 262.4, 300.1]) {
      const a = route.evaluate(t, 7, t, ctx);
      route.evaluate(5, 7, 5, ctx);
      route.evaluate(290, 7, 290, ctx);
      expect(route.evaluate(t, 7, t, ctx)).toEqual(a);
    }
  });
  it("the two OHT legs are planned separately and the vehicle never jumps between them", () => {
    const s = (t: number) => route.evaluate(t, 7, t, ctx).instances["OHT-01"].joints.travel;
    expect(Math.abs(s(ROUTE_TL.leg1[1] - 0.01) - s(ROUTE_TL.leg2[0] + 0.01))).toBeLessThan(1e-3);
    let prev = s(0);
    for (let t = 0.05; t <= ROUTE_TL.total; t += 0.05) {
      const cur = s(t);
      expect(Math.abs(cur - prev), `t=${t.toFixed(2)}`).toBeLessThan(0.05);
      prev = cur;
    }
    const g1 = route.evaluate((ROUTE_TL.leg1[0] + ROUTE_TL.leg1[1]) / 2, 7, 0, ctx).carriers[F];
    const g2 = route.evaluate((ROUTE_TL.leg2[0] + ROUTE_TL.leg2[1]) / 2, 7, 0, ctx).carriers[F];
    expect(g1.holder.kind).toBe("gripper");
    expect(g2.holder.kind).toBe("gripper");
    expect(route.evaluate(ROUTE_TL.leg1[1] - 0.01, 7, 0, ctx).carriers[F].holder).toEqual({ kind: "station", id: "LP.ETCH-01" });
    expect(route.evaluate(ROUTE_TL.leg2[1] - 0.01, 7, 0, ctx).carriers[F].holder).toEqual({ kind: "station", id: "LP.CLEAN-01" });
  });
  it("trace context keeps demo provenance: no run id and no plant event time are invented", () => {
    for (const { p } of SAMPLES) {
      expect(p.trace?.provenance).toBe("demo");
      expect(p.trace?.processRunId).toBeNull();
      expect(p.trace?.eventTime).toBeNull();
      expect(p.trace?.waferId).toBe(W);
    }
    expect(route.evaluate(150, 7, 150, ctx).trace?.tool).toEqual({ instanceId: "ETCH-01", moduleId: "PM-01", chamberId: "CH-01" });
  });
});

describe("CELLESTA PM-01 sequence", () => {
  const plan = CELLESTA_PLAN;
  it("config validates (reach, wrist outside PM-01, guard / cup / nozzle park geometry)", () => {
    expect(validateCellestaConfig().errors).toEqual([]);
  });
  it("handoffs (FOUP <-> EFEM robot <-> pass station <-> transfer robot <-> chuck) happen inside Z motions", () => {
    for (const [steps, init] of [[plan.load, plan.loadInitial], [plan.unload, plan.unloadInitial]] as const) {
      const ev = trackHandoffs(steps, init);
      expect(ev.length).toBe(4);
      for (const e of ev) {
        const st = evaluateTrack(steps, init, e.t);
        const ch = e.stepId.startsWith("atm") ? "aZ" : "tZ";
        expect(Math.abs(evaluateTrack(steps, init, e.t + 0.01).values[ch] - st.values[ch])).toBeGreaterThan(0);
      }
    }
  });
  it("the shutter opens only with the spindle stopped, the nozzle parked and the guard down", () => {
    for (const [steps, init, dur] of [[plan.load, plan.loadInitial, plan.loadDuration], [plan.unload, plan.unloadInitial, plan.unloadDuration]] as const) {
      for (let t = 0; t <= dur; t += 0.05) {
        const v = evaluateTrack(steps, init, t).values;
        if (v.shutter > 1e-4) expect(v.guard).toBe(plan.guard.transfer);
      }
    }
    for (let t = 0; t <= CELLESTA_PROCESS_DURATION; t += 0.05) {
      const s = cellestaProcessAt(plan, t);
      // during the process the shutter stays closed and the robot is outside (holder: chuck)
      if (s.transferReady) {
        expect(s.rpm).toBe(0);
        expect(s.joints[CELLESTA_JOINTS.arm]).toBeCloseTo(armAngle(plan.L, "park"), 9);
        expect(s.joints[CELLESTA_JOINTS.guard]).toBeCloseTo(plan.guard.transfer, 9);
        expect(s.wetState).toBe("dry");
      }
    }
    const end = cellestaProcessAt(plan, CELLESTA_PROCESS_DURATION);
    expect(end.transferReady).toBe(true);
    // the chuck stops on a whole turn, so the unload pose (spin = 0) is continuous with the process end
    expect(Math.abs(Math.sin(end.joints[CELLESTA_JOINTS.spin]))).toBeLessThan(1e-9);
  });
  it("dispensing media are named roles only (chemical / UPW / IPA), never a recipe", () => {
    const media = new Set<string>();
    for (let t = 0; t <= CELLESTA_PROCESS_DURATION; t += 0.1) media.add(cellestaProcessAt(plan, t).dispensing);
    expect([...media].sort()).toEqual(["", "chemical", "ipa", "upw"]);
  });
});

describe("measurement seeds of the current bay", () => {
  const ids = ["producer_se_ccp_twin_300", "tactras_oxide_ccp_rie_300", "cellesta_i_md_clean_300", "clw08v2_oht"];
  it("nothing is installed, nothing is bound, and every derived channel lists its inputs", () => {
    for (const id of ids) {
      const s = getBundle(id)!.measurement;
      expect(s.sourceBindings).toEqual([]);
      expect(s.instruments.every((i) => i.installationStatus === "planned" || i.installationStatus === "candidate"), id).toBe(true);
      for (const c of s.channels) if (c.channelRole === "derived_estimate") expect(c.instrumentId === null && (c.derivedFrom?.length ?? 0) > 0, c.channelId).toBe(true);
    }
  });
  it("setpoints / commands are separate channels from the measured value of the same quantity", () => {
    const s = getBundle("tactras_oxide_ccp_rie_300")!.measurement;
    const p = s.channels.filter((c) => c.channelId.startsWith("tactras.ch.chamber_pressure"));
    expect(p.map((c) => c.channelRole).sort()).toEqual(["measurement", "setpoint"]);
    const oes = s.channels.filter((c) => c.channelId.startsWith("tactras.ch.oes"));
    expect(oes.map((c) => c.channelRole).sort()).toEqual(["derived_estimate", "measurement"]);
  });
  it("moving sensor points follow their joint (pedestal temperature, nozzle position, hoist)", () => {
    const pt = (tid: string, id: string) => getBundle(tid)!.measurement.points.find((p) => p.pointId === id)!;
    expect(pt("producer_se_ccp_twin_300", "producer.mp.pedestal_temperature").frameJointId).toBe("pedestal_z");
    expect(pt("cellesta_i_md_clean_300", "cellesta.mp.nozzle_position").frameJointId).toBe("dispense_arm");
    expect(pt("clw08v2_oht", "clw.mp.hoist").frameJointId).toBe("hoist");
  });
  it("there is no dryness sensor and no legacy Remote / CMP channel id in the new seeds", () => {
    for (const id of ids) for (const c of getBundle(id)!.measurement.channels) {
      expect(c.channelId).not.toMatch(/dry(ness)?\b|remote\.|cmp\./);
    }
  });
});

describe("GLB sources", () => {
  it("every manifest node binds to an asset (and joint) of its template; required sources point at public/models", () => {
    for (const b of listBundles().filter((x) => x.glb)) {
      const assets = new Set(b.template.components.map((c) => c.assetId));
      const joints = new Set(b.template.joints.map((j) => j.jointId));
      expect(b.glb!.url).toBe(`/models/${b.template.templateId}.glb`);
      for (const n of b.glb!.manifest.nodes) {
        expect(assets.has(n.assetId), `${b.template.templateId}: ${n.partKey}`).toBe(true);
        if (n.jointId) expect(joints.has(n.jointId), n.partKey).toBe(true);
      }
      expect(new Set(b.glb!.manifest.nodes.map((n) => n.partKey)).size).toBe(b.glb!.manifest.nodes.length);
    }
  });
});

describe("agent contract adapter", () => {
  const tpl = (id: string) => getBundle(id)?.template;
  it("resolves tool / module / chamber / component targets to real assets", () => {
    expect(resolveTarget({ level: "component", instanceId: "ETCH-01", assetId: "esc_puck" }, DEFAULT_INSTANCES, tpl)?.assetIds).toEqual(["esc_puck"]);
    const cellA = resolveTarget({ level: "chamber", instanceId: "PRODUCER-01", moduleId: "MOD-01", chamberId: "CELL-A" }, DEFAULT_INSTANCES, tpl)!;
    expect(cellA.assetIds).toContain("pedestal");
    expect(cellA.assetIds).not.toContain("cellb_pedestal");
    const geo = resolveTarget({ level: "module", instanceId: "ETCH-01", moduleId: "PM-03" }, DEFAULT_INSTANCES, tpl)!;
    expect(geo.assetIds).toEqual(["pm03_enclosure"]);
    expect(resolveTarget({ level: "component", instanceId: "ETCH-01", assetId: "no_such_part" }, DEFAULT_INSTANCES, tpl)).toBeNull();
  });
  it("a cleared detection removes the highlight; RCA candidates are ranked and never confirmed by the frontend", () => {
    const base = { eventId: "e1", source: { providerKind: "agent_service" as const, providerId: "x" }, eventTime: "2027-01-01T00:00:00Z", target: { level: "component" as const, instanceId: "CLEAN-01", assetId: "spin_chuck" }, channelIds: [], evidence: [] };
    expect(diagnosisFor({ ...base, kind: "detection", state: "cleared", severity: "major" }, DEFAULT_INSTANCES, tpl)).toBeNull();
    const rca: AgentEvent = { ...base, kind: "rca", subject: { waferIds: ["W-01"] }, confirmedByProvider: false, candidates: [{ target: { level: "component", instanceId: "CLEAN-01", assetId: "dispense_arm" }, rank: 2, statement: "b", supporting: [], contradicting: [] }, { target: { level: "component", instanceId: "CLEAN-01", assetId: "spin_chuck" }, rank: 1, statement: "a", supporting: [], contradicting: [] }] };
    const d = diagnosisFor(rca, DEFAULT_INSTANCES, tpl)!;
    expect(d.targets.map((t) => t.assetIds[0])).toEqual(["spin_chuck", "dispense_arm"]);
    expect(d.expiresAt).toBeNull();
  });
});

describe("recipes of the current route", () => {
  it("every process / transport / external step references a recipe of the current set with a revision", () => {
    for (const s of ROUTE_DEP_ETCH_CLEAN.steps) {
      const r = CURRENT_RECIPES.find((x) => x.recipeId === s.recipeId);
      expect(r, s.stepId).toBeDefined();
      expect(r!.revision).toBeTruthy();
    }
    expect(CURRENT_RECIPES.some((r) => r.operation === "cmp")).toBe(false);
  });
});
