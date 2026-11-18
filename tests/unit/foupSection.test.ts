import { describe, expect, it } from "vitest";
import "../../src/equipment/index";
import { TAU, type AngularInterval } from "../../src/config/geometry";
import { listBundles } from "../../src/domain/registry";
import { DEFAULT_INSTANCES } from "../../src/domain/instances";
import { DEMO_CARRIER, DEMO_WAFER } from "../../src/domain/materialFlow";
import { boxSectionCaps, checkWindingConsistency, chamferedBox, clipToSector, meshDataBounds, revolveCaps, type MeshData } from "../../src/geometry/meshlib";
import { resolveCutaway } from "../../src/presentation/cutaway";
import { getScenario } from "../../src/presentation/scenarioRegistry";
import type { ScenarioContext, StationWorldFrame } from "../../src/presentation/scenario";
import { FOUP_SECTION, foupSlotId, foupSlotY } from "../../src/equipment/foup/index";
import { OHT_LAYOUT } from "../../src/equipment/oht/layout";

const FULL: AngularInterval[] = [{ start: 0, sweep: TAU }];
const section = resolveCutaway({ enabled: true, ...FOUP_SECTION }, []);
const deg = (d: number) => (d * Math.PI) / 180;

function area(md: MeshData): number {
  let a = 0;
  for (let t = 0; t < md.indices.length; t += 3) {
    const p = [0, 1, 2].map((k) => md.indices[t + k] * 3).map((i) => [md.positions[i], md.positions[i + 1], md.positions[i + 2]]);
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    a += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return a;
}

/** Flat 2 m x 2 m plate at y = 0 split into two triangles (both facing up). */
function plate(): MeshData {
  return {
    positions: [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

describe("sector clipping of non-revolved parts", () => {
  it("keeps exactly the kept wedge of a plate (narrow and wide kept sectors)", () => {
    expect(checkWindingConsistency(plate()).inconsistent).toBe(0);
    const narrow = clipToSector(plate(), [{ start: deg(30), sweep: deg(90) }]);
    expect(area(narrow)).toBeCloseTo(1, 6);
    expect(checkWindingConsistency(narrow).inconsistent).toBe(0);
    const wide = clipToSector(plate(), resolveCutaway({ enabled: true, azimuthDeg: 270, sweepDeg: 90 }, []).kept);
    expect(area(wide)).toBeCloseTo(3, 6);
    expect(checkWindingConsistency(wide).inconsistent).toBe(0);
    // no vertex strictly inside the removed quadrant (azimuth 225..315 deg)
    for (let i = 0; i < wide.positions.length; i += 3) {
      const r = Math.hypot(wide.positions[i], wide.positions[i + 2]);
      if (r < 1e-9) continue;
      const az = (Math.atan2(wide.positions[i + 2], wide.positions[i]) + TAU) % TAU;
      expect(az > deg(225) + 1e-6 && az < deg(315) - 1e-6, `vertex at ${(az * 180) / Math.PI} deg`).toBe(false);
    }
  });

  it("returns a fresh copy for the full circle (the scene translates built meshes in place)", () => {
    const src = plate();
    const out = clipToSector(src, FULL);
    expect(out.indices.length).toBe(src.indices.length);
    expect(out.positions).not.toBe(src.positions);
    out.positions[0] = 99;
    expect(src.positions[0]).toBe(-1);
  });

  it("cuts a box through the axis and caps the cut with outward-facing rectangles", () => {
    const md = chamferedBox([0.4, 0.1, 0.3], 0.002, [0, 0.05, 0]);
    const cut = clipToSector(md, section.kept);
    const b = meshDataBounds(cut);
    expect(b.min[0]).toBeGreaterThan(-1e-9);
    expect(b.max[0]).toBeCloseTo(0.2, 9);
    expect(checkWindingConsistency(cut).inconsistent).toBe(0);
    const caps = boxSectionCaps([{ min: [-0.2, 0, -0.15], max: [0.2, 0.1, 0.15] }], section.kept);
    expect(area(caps)).toBeCloseTo(0.1 * 0.3, 9);
    expect(checkWindingConsistency(caps).inconsistent).toBe(0);
    for (let i = 0; i < caps.positions.length; i += 3) {
      expect(Math.abs(caps.positions[i])).toBeLessThan(1e-9);
      // the removed half is x < 0: caps face it
      expect(caps.normals[i]).toBeCloseTo(-1, 9);
    }
    expect(boxSectionCaps([{ min: [0.05, 0, -0.1], max: [0.2, 0.1, 0.1] }], section.kept).indices.length).toBe(0);
  });
});

describe("FOUP section view", () => {
  const bundle = listBundles().find((b) => b.template.templateId === "foup_carrier_300")!;
  const parts = bundle.buildParts(bundle.layout);
  const f = OHT_LAYOUT.cfg.foup;

  it("every part builds valid meshes assembled and cut, and follows the joint of its component", () => {
    const comps = new Map(bundle.template.components.map((c) => [c.assetId, c]));
    for (const p of parts) {
      expect(p.cutaway, p.key).toBe("sector");
      expect(p.jointId ?? comps.get(p.assetId)!.jointId, p.key).toBe(comps.get(p.assetId)!.jointId);
      for (const kept of [FULL, section.kept]) {
        const md = p.build(kept);
        expect(md.indices.length % 3, p.key).toBe(0);
        for (const v of md.positions) expect(Number.isFinite(v), p.key).toBe(true);
        expect(checkWindingConsistency(md).inconsistent, `${p.key} winding`).toBe(0);
      }
    }
  });

  it("the default section removes the back half through the seat axis and caps the shell, ribs, handles, flange and base", () => {
    expect(bundle.cutawayDefault).toEqual(FOUP_SECTION);
    for (const p of parts) {
      const b = meshDataBounds(p.build(section.kept));
      expect(b.min[0], p.key).toBeGreaterThan(-1e-6);
    }
    const shell = meshDataBounds(parts.find((p) => p.key === "shell")!.build(section.kept));
    expect(shell.max[0]).toBeCloseTo(f.door_face_x, 9);
    for (const key of ["shell", "handles", "slot_ribs", "flange", "coupling"]) {
      const p = parts.find((x) => x.key === key)!;
      expect(p.capBuild, key).toBeDefined();
      const caps = p.capBuild!(section.kept);
      expect(caps.indices.length, `${key} caps`).toBeGreaterThan(0);
      expect(checkWindingConsistency(caps).inconsistent, `${key} cap winding`).toBe(0);
      for (let i = 0; i < caps.positions.length; i += 3) expect(Math.abs(caps.positions[i]), `${key} cap on the cut plane`).toBeLessThan(1e-9);
      expect(p.capBuild!(FULL).indices.length).toBe(0);
    }
    // the door lies in the kept front half; a sector whose boundary runs along +X cuts and caps it
    const door = parts.find((x) => x.key === "door")!;
    expect(door.capBuild!(section.kept).indices.length).toBe(0);
    const front = resolveCutaway({ enabled: true, azimuthDeg: 45, sweepDeg: 90 }, []);
    expect(door.capBuild!(front.kept).indices.length).toBeGreaterThan(0);
  });

  it("has one wafer per slot, keyed by the slot id, resting on its rib pair and cut with the shell", () => {
    const wafers = parts.filter((p) => p.assetId === "foup_wafer");
    expect(wafers.length).toBe(2 * f.slot_count);
    const ribTops = new Set<string>();
    for (let k = 1; k <= f.slot_count; k++) ribTops.add(foupSlotY(OHT_LAYOUT, k).toFixed(6));
    for (let k = 1; k <= f.slot_count; k++) {
      const halves = wafers.filter((p) => p.presenceKey === foupSlotId(k));
      expect(halves.length, `slot ${k}`).toBe(2);
      const b = halves.map((p) => meshDataBounds(p.build(FULL)));
      const bottom = Math.min(...b.map((x) => x.min[1]));
      const top = Math.max(...b.map((x) => x.max[1]));
      expect(bottom).toBeCloseTo(foupSlotY(OHT_LAYOUT, k), 9);
      expect(top - bottom).toBeCloseTo(DEMO_WAFER.thicknessM, 9);
      expect(ribTops.has(bottom.toFixed(6))).toBe(true);
      expect(Math.max(...b.map((x) => x.max[0]))).toBeCloseTo(f.wafer_center_x + DEMO_WAFER.diameterM / 2, 6);
      // sector parts with their own section caps
      for (const p of halves) expect(revolveCaps(p.capProfile!, section.kept).indices.length).toBeGreaterThan(0);
    }
    expect(foupSlotId(13)).toBe("slot-13");
    expect(Object.keys(DEMO_CARRIER.initialSlots).every((id) => wafers.some((p) => p.presenceKey === id))).toBe(true);
  });
});

describe("FOUP slot map and wafer presentation", () => {
  const stations: Record<string, StationWorldFrame> = {};
  for (const def of DEFAULT_INSTANCES) {
    const st = listBundles().find((x) => x.template.templateId === def.templateId)?.template.station;
    if (!st) continue;
    const id = `LP.${def.instanceId}`;
    stations[id] = { stationId: id, instanceId: def.instanceId, seatWorld: [def.position[0] + st.seatLocal[0], def.position[1] + st.seatLocal[1], def.position[2] + st.seatLocal[2]], yawRad: Math.atan2(st.doorFacingLocal[0], st.doorFacingLocal[2]), doorFacing: st.doorFacingLocal };
  }
  const ctx: ScenarioContext = { instances: DEFAULT_INSTANCES, stations };

  it("the FOUP presents its slot wafer exactly while the slot map says the slot is occupied (OHT and handling demos)", () => {
    for (const id of ["oht-transfer-v1", "ccp-handling-cycle-v1", "sti-cmp-cycle-v2"]) {
      const def = getScenario(id)!;
      for (let t = 0; t < def.scenario.durationSec; t += 0.5) {
        const p = def.evaluate(t, 7, t, ctx);
        const occupied = Object.values(p.carriers["FOUP-01"].slots).filter(Boolean).length;
        expect(occupied, `${id} t=${t}`).toBe(p.instances["FOUP-01"].presentedWaferId ? 1 : 0);
        expect(p.wafers["W-01"].holder.kind === "carrier_slot", `${id} t=${t}`).toBe(occupied === 1);
      }
    }
  });
});
