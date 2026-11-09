/**
 * Procedural part generators for the representative CCP PECVD chamber. Every part is derived from the
 * ChamberLayout (itself derived from the versioned geometry config). Parts that revolve around the
 * chamber axis are regenerated for the cutaway sector and expose a planar cap profile; parts attached
 * at an azimuth are hidden when their azimuth falls inside the removed sector.
 */
import type { AngularInterval, ChamberLayout } from "../config/geometry";
import { DEG, TAU, normalizeAngle } from "../config/geometry";
import type { CutawayBehavior, MaterialRef } from "../domain/types";
import {
  bellowsProfile,
  chamferProfile,
  chamferedBox,
  circleProfile,
  createMeshData,
  filletProfile,
  flatStrap,
  mergeMeshData,
  perforatedDisc,
  portedShell,
  prismY,
  rectProfile,
  revolveProfile,
  rotateYMeshData,
  roundedRect,
  translateMeshData,
  tubeAlongPath,
  type MeshData,
  type RevolveProfile,
  type ShellPort,
  type Vec2,
  type Vec3,
} from "./meshlib";

export interface PartGeometry {
  key: string;
  assetId: string;
  materialRef: Exclude<MaterialRef, "none">;
  pickable: boolean;
  cutaway: CutawayBehavior;
  azimuth?: number;
  isGlass?: boolean;
  castShadow: boolean;
  /** Connection-like decoration hidden in the exploded view. */
  hideWhenExploded?: boolean;
  /** Build the surface mesh for the kept angular ranges (ignored for non-sector parts). */
  build: (kept: AngularInterval[]) => MeshData;
  /** Planar section profile for separate cap meshes (sector parts only). */
  capProfile?: RevolveProfile;
  sectorDependent: boolean;
}

export function spokeRanges(slots: number, solidFraction: number, phase = 0): AngularInterval[] {
  const out: AngularInterval[] = [];
  const step = TAU / slots;
  for (let i = 0; i < slots; i++) out.push({ start: normalizeAngle(i * step + phase), sweep: step * solidFraction });
  return out;
}

/** Intersect two sets of angular intervals on the circle. */
export function intersectRanges(a: AngularInterval[], b: AngularInterval[]): AngularInterval[] {
  const out: AngularInterval[] = [];
  for (const p of a) {
    for (const q of b) {
      const qs = normalizeAngle(q.start - p.start);
      for (const s of [qs, qs - TAU]) {
        const lo = Math.max(0, s);
        const hi = Math.min(p.sweep, s + q.sweep);
        if (hi > lo + 1e-9) out.push({ start: normalizeAngle(p.start + lo), sweep: hi - lo });
      }
    }
  }
  return out;
}

/** Is the azimuth inside any kept range? */
export function azimuthKept(az: number, kept: AngularInterval[]): boolean {
  return kept.some((r) => normalizeAngle(az - r.start) <= r.sweep + 1e-9);
}

/**
 * Re-orient a mesh built around +Y into a radial frame: local x -> tangent, local y -> radial distance,
 * local z -> world up; then lift by `centerY`.
 */
export function toRadialFrame(md: MeshData, az: number, centerY: number): MeshData {
  const c = Math.cos(az);
  const s = Math.sin(az);
  const map = (arr: number[], translate: boolean) => {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      const y = arr[i + 1];
      const z = arr[i + 2];
      arr[i] = -x * s + y * c;
      arr[i + 1] = z + (translate ? centerY : 0);
      arr[i + 2] = x * c + y * s;
    }
  };
  map(md.positions, true);
  map(md.normals, false);
  return md;
}

const chamfRect = (r0: number, r1: number, y0: number, y1: number, c: number) => chamferProfile(rectProfile(r0, r1, y0, y1), c);

export function buildChamberParts(L: ChamberLayout): PartGeometry[] {
  const parts: PartGeometry[] = [];
  const cfg = L.cfg;
  const ports = L.ports;
  const shellPorts: ShellPort[] = Object.values(ports).map((p) => ({ id: p.id, azimuth: p.azimuth, centerY: p.centerY, hole: p.hole }));
  const linerPorts = shellPorts.filter((p) => ports[p.id as keyof typeof ports].throughLiner);

  const sector = (key: string, assetId: string, materialRef: Exclude<MaterialRef, "none">, profile: RevolveProfile | Vec2[], opts: { segments?: number; pickable?: boolean; capProfile?: RevolveProfile | Vec2[]; castShadow?: boolean } = {}) => {
    const prof: RevolveProfile = Array.isArray(profile) ? { outer: profile } : profile;
    const capP = opts.capProfile ? (Array.isArray(opts.capProfile) ? { outer: opts.capProfile } : opts.capProfile) : prof;
    parts.push({
      key,
      assetId,
      materialRef,
      pickable: opts.pickable ?? true,
      cutaway: "sector",
      castShadow: opts.castShadow ?? true,
      sectorDependent: true,
      capProfile: capP,
      build: (kept) => revolveProfile(prof, { segments: opts.segments ?? 128, ranges: kept, caps: false, uvScale: 1 }),
    });
  };
  const fixed = (key: string, assetId: string, materialRef: Exclude<MaterialRef, "none">, md: MeshData, opts: { cutaway: CutawayBehavior; azimuth?: number; pickable?: boolean; isGlass?: boolean; castShadow?: boolean; hideWhenExploded?: boolean }) => {
    parts.push({
      key,
      assetId,
      materialRef,
      pickable: opts.pickable ?? true,
      cutaway: opts.cutaway,
      azimuth: opts.azimuth,
      isGlass: opts.isGlass,
      castShadow: opts.castShadow ?? true,
      hideWhenExploded: opts.hideWhenExploded,
      sectorDependent: false,
      build: () => md,
    });
  };

  // ------------------------------------------------------------------ chamber body
  parts.push({
    key: "wall",
    assetId: "chamber_body",
    materialRef: "aluminum_machined",
    pickable: true,
    cutaway: "sector",
    castShadow: true,
    sectorDependent: true,
    capProfile: { outer: rectProfile(L.rInner, L.rOuter, L.floorTopY, L.wallTopY) },
    build: (kept) => portedShell({ rIn: L.rInner, rOut: L.rOuter, y0: L.floorTopY, y1: L.wallTopY, ports: shellPorts, ranges: kept, segments: 160, boreSegments: 32, caps: false }),
  });
  sector("flange_top", "chamber_body", "aluminum_machined", chamfRect(L.rOuter - 0.001, L.rTopFlange, L.topFlangeBottomY, L.wallTopY, 0.004));
  {
    const bfh = cfg.chamber.bottom_flange_height;
    const floorProfile: Vec2[] = chamferProfile(
      [
        [L.rFloorBore, L.floorBottomY],
        [L.rBottomFlange, L.floorBottomY],
        [L.rBottomFlange, L.floorBottomY + bfh],
        [L.rOuter - 0.001, L.floorBottomY + bfh],
        [L.rOuter - 0.001, L.floorTopY],
        [L.rFloorBore, L.floorTopY],
      ],
      0.004,
      (_, p) => Math.abs(p[0] - (L.rOuter - 0.001)) < 1e-9,
    );
    sector("floor", "chamber_body", "aluminum_machined", floorProfile);
  }
  // Slit port block: flat machined face on the cylindrical wall where the slit valve bolts on.
  {
    const slit = ports.slit;
    const halfW = cfg.ports.slit.width / 2 + 0.07;
    const blockFaceR = L.rOuter + 0.012;
    const innerR = L.rInner + 0.004;
    const arcPts: Vec2[] = [];
    const thetaW = Math.asin(Math.min(0.99, halfW / innerR));
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const th = -thetaW + (2 * thetaW * i) / n;
      // local frame: x = tangent, z = radial
      arcPts.push([innerR * Math.sin(th), innerR * Math.cos(th)]);
    }
    const profile: Vec2[] = [...arcPts, [halfW, blockFaceR], [-halfW, blockFaceR]];
    const slitHalfW = cfg.ports.slit.width / 2;
    const yLo = slit.centerY - cfg.ports.slit.height / 2;
    const yHi = slit.centerY + cfg.ports.slit.height / 2;
    const blockY0 = slit.centerY - 0.1;
    const blockY1 = slit.centerY + 0.1;
    const sideProfile = (sign: number): Vec2[] => {
      const pts: Vec2[] = [];
      const thA = Math.asin(Math.min(0.99, (sign > 0 ? slitHalfW : -halfW) / innerR));
      const thB = Math.asin(Math.min(0.99, (sign > 0 ? halfW : -slitHalfW) / innerR));
      for (let i = 0; i <= 8; i++) {
        const th = thA + ((thB - thA) * i) / 8;
        pts.push([innerR * Math.sin(th), innerR * Math.cos(th)]);
      }
      pts.push([sign > 0 ? halfW : -slitHalfW, blockFaceR], [sign > 0 ? slitHalfW : -halfW, blockFaceR]);
      return pts;
    };
    const lower = prismY(profile, blockY0, yLo, { capTop: true, capBottom: true });
    const upper = prismY(profile, yHi, blockY1, { capTop: true, capBottom: true });
    const sideA = prismY(sideProfile(1), yLo, yHi, { capTop: false, capBottom: false });
    const sideB = prismY(sideProfile(-1), yLo, yHi, { capTop: false, capBottom: false });
    const block = rotateYMeshData(mergeMeshData([lower, upper, sideA, sideB]), slit.azimuth - Math.PI / 2);
    fixed("slit_port_block", "chamber_body", "aluminum_machined", block, { cutaway: "hide-in-sector", azimuth: slit.azimuth });
  }
  // Port bosses (welded port stubs) for circular ports belong to the body.
  for (const id of ["viewport", "pressure_tap", "exhaust"] as const) {
    const p = ports[id];
    const rBore = (p.hole as { radius: number }).radius;
    const rBoss = id === "exhaust" ? cfg.ports.exhaust.flange_diameter / 2 - 0.01 : id === "viewport" ? rBore + 0.016 : rBore + 0.008;
    const boss = toRadialFrame(revolveProfile(chamfRect(rBore, rBoss, L.rOuter - 0.012, L.rOuter + 0.014, 0.002), { segments: 64, caps: false }), p.azimuth, p.centerY);
    fixed(`boss_${id}`, "chamber_body", "aluminum_machined", boss, { cutaway: "hide-in-sector", azimuth: p.azimuth, pickable: true });
  }

  // ------------------------------------------------------------------ liner & baffle
  parts.push({
    key: "liner",
    assetId: "chamber_liner",
    materialRef: "aluminum_anodized",
    pickable: true,
    cutaway: "sector",
    castShadow: true,
    sectorDependent: true,
    capProfile: { outer: rectProfile(L.rLinerIn, L.rLinerOut, cfg.chamber.liner_bottom_y, cfg.chamber.liner_top_y) },
    build: (kept) => portedShell({ rIn: L.rLinerIn, rOut: L.rLinerOut, y0: cfg.chamber.liner_bottom_y, y1: cfg.chamber.liner_top_y, ports: linerPorts, ranges: kept, segments: 160, boreSegments: 32, caps: false }),
  });
  {
    const b = L.baffle;
    const spokes = spokeRanges(b.slots, 1 - cfg.pumping_baffle.slot_fill, 0.02);
    const hubIn = rectProfile(b.rIn, b.rIn + 0.014, b.y0, b.y1);
    const hubOut = rectProfile(b.rOut - 0.014, b.rOut, b.y0, b.y1);
    const spokeProfile = rectProfile(b.rIn + 0.012, b.rOut - 0.012, b.y0, b.y1);
    parts.push({
      key: "baffle_spokes",
      assetId: "pumping_baffle",
      materialRef: "aluminum_anodized",
      pickable: true,
      cutaway: "sector",
      castShadow: true,
      sectorDependent: true,
      build: (kept) => revolveProfile(spokeProfile, { segments: 160, ranges: intersectRanges(spokes, kept), caps: true, smoothAngleDeg: 10 }),
    });
    sector("baffle_hub_in", "pumping_baffle", "aluminum_anodized", hubIn, { segments: 160 });
    sector("baffle_hub_out", "pumping_baffle", "aluminum_anodized", hubOut, { segments: 160 });
  }

  // ------------------------------------------------------------------ lid + bolts
  {
    const gw = 0.008;
    const gd = 0.005;
    const rg = cfg.chamber.lid_oring_groove_diameter / 2;
    const lidProfile: Vec2[] = [
      [L.rLidBore, L.lidBottomY],
      [rg - gw / 2, L.lidBottomY],
      [rg - gw / 2, L.lidBottomY + gd],
      [rg + gw / 2, L.lidBottomY + gd],
      [rg + gw / 2, L.lidBottomY],
      [L.rLid, L.lidBottomY],
      [L.rLid, L.lidTopY],
      [L.rLidBore + 0.03, L.lidTopY],
      [L.rLidBore + 0.03, L.lidTopY + 0.006],
      [L.rLidBore, L.lidTopY + 0.006],
    ];
    const lidChamfered = chamferProfile(lidProfile, 0.005, (_, p) => Math.abs(p[1] - (L.lidBottomY + gd)) < 1e-9 || (Math.abs(p[0] - (rg - gw / 2)) < 1e-9) || Math.abs(p[0] - (rg + gw / 2)) < 1e-9);
    sector("lid", "lid", "aluminum_machined", lidChamfered, { segments: 160 });
    const boltAz: number[] = [];
    for (let i = 0; i < cfg.chamber.bolt_count; i++) boltAz.push((i / cfg.chamber.bolt_count) * TAU + 0.5 * DEG);
    const headR = cfg.chamber.bolt_head_diameter / 2;
    const headH = cfg.chamber.bolt_head_height;
    const headProfile = chamferProfile(rectProfile(0, headR, 0, headH), 0.0015, (_, p) => p[1] < 1e-9);
    const hex: Vec2[] = [];
    for (let k = 0; k < 6; k++) hex.push([headR * 0.55 * Math.cos((k / 6) * TAU), headR * 0.55 * Math.sin((k / 6) * TAU)]);
    const buildBolts = (kept: AngularInterval[]) => {
      const heads: MeshData[] = [];
      for (const az of boltAz) {
        if (!azimuthKept(az, kept)) continue;
        const h = revolveProfile(headProfile, { segments: 24 });
        translateMeshData(h, L.rBoltCircle, L.lidTopY, 0);
        heads.push(rotateYMeshData(h, az));
      }
      return heads.length ? mergeMeshData(heads) : createMeshData();
    };
    const buildSockets = (kept: AngularInterval[]) => {
      const socks: MeshData[] = [];
      for (const az of boltAz) {
        if (!azimuthKept(az, kept)) continue;
        const s = prismY(hex, L.lidTopY + headH - 0.005, L.lidTopY + headH + 0.0002, { capTop: true, capBottom: true });
        translateMeshData(s, L.rBoltCircle, 0, 0);
        socks.push(rotateYMeshData(s, az));
      }
      return socks.length ? mergeMeshData(socks) : createMeshData();
    };
    parts.push({ key: "lid_bolts", assetId: "lid", materialRef: "dark_steel", pickable: false, cutaway: "sector", castShadow: false, sectorDependent: true, build: buildBolts });
    parts.push({ key: "lid_bolt_sockets", assetId: "lid", materialRef: "dark_steel", pickable: false, cutaway: "sector", castShadow: false, sectorDependent: true, build: buildSockets });
  }

  // ------------------------------------------------------------------ frame
  {
    const leg = cfg.peripherals.frame_leg_size;
    const legR = cfg.peripherals.frame_leg_radius;
    const yTop = L.floorBottomY + cfg.chamber.bottom_flange_height - 0.001;
    const yBot = cfg.peripherals.frame_bottom_y;
    const pieces: MeshData[] = [];
    for (let k = 0; k < 4; k++) {
      const az = (45 + 90 * k) * DEG;
      pieces.push(chamferedBox([leg, yTop - yBot, leg], 0.003, [legR * Math.cos(az), (yTop + yBot) / 2, legR * Math.sin(az)]));
    }
    // cross braces near the bottom and a top ring frame under the flange
    const braceY = yBot + 0.12;
    const half = legR * Math.SQRT1_2;
    for (const [cx, cz, w, d] of [
      [half, 0, leg, 2 * half],
      [-half, 0, leg, 2 * half],
      [0, half, 2 * half, leg],
      [0, -half, 2 * half, leg],
    ] as const) {
      pieces.push(chamferedBox([w, leg * 0.8, d], 0.002, [cx, braceY, cz]));
      pieces.push(chamferedBox([w, leg * 0.8, d], 0.002, [cx, yTop - leg * 0.4 - 0.002, cz]));
    }
    fixed("frame", "frame", "painted_housing", mergeMeshData(pieces), { cutaway: "keep" });
  }

  // ------------------------------------------------------------------ gas distribution
  {
    const gp = cfg.peripherals;
    const [gw, gh, gd] = gp.gas_panel_size;
    const [gx, gy, gz] = gp.gas_panel_center;
    const panel = chamferedBox([gw, gh, gd], 0.006, [gx, gy, gz]);
    // front panel inset with three MFC blocks
    const inset = chamferedBox([gw - 0.03, gh - 0.03, 0.004], 0.001, [gx, gy, gz - gd / 2 - 0.001]);
    const mfcs: MeshData[] = [];
    for (let i = 0; i < 3; i++) mfcs.push(chamferedBox([0.045, 0.09, 0.02], 0.002, [gx - 0.055 + i * 0.055, gy + 0.03, gz - gd / 2 - 0.012]));
    const bracket = chamferedBox([0.06, 0.03, gz - gd / 2 - L.rOuter + 0.03], 0.002, [0, gy, (gz - gd / 2 + L.rOuter - 0.03) / 2]);
    fixed("gas_panel", "gas_panel", "painted_housing", mergeMeshData([panel, inset, bracket]), { cutaway: "keep" });
    fixed("gas_panel_mfcs", "gas_panel", "stainless", mergeMeshData(mfcs), { cutaway: "keep", pickable: true });

    const topY = L.gasTubeTopY;
    const linePath: Vec3[] = [
      [0, topY + 0.004, 0],
      [0, topY + 0.06, 0],
      [0, topY + 0.06, gz],
      [0, gy + gh / 2 - 0.002, gz],
    ];
    fixed("gas_line", "gas_line", "stainless", tubeAlongPath(linePath, L.rGasTube, { segments: 20, cornerRadius: 0.035 }), { cutaway: "keep", castShadow: false });

    // Inlet: feed tube (hollow) from the plenum ceiling to the fitting, ceramic isolator section, VCR fitting nut.
    const gi = cfg.ports.gas_inlet;
    sector("feed_tube", "gas_inlet", "stainless", rectProfile(L.rGasTubeInner, L.rGasTube, L.plenumTopY - 0.002, topY), { segments: 40 });
    sector("gas_isolator", "gas_inlet", "ceramic", chamfRect(L.rGasTube + 0.0004, gi.isolator_tube_diameter / 2, gi.isolator_tube_y0, gi.isolator_tube_y1, 0.0015), { segments: 48 });
    sector("gas_fitting", "gas_inlet", "stainless", chamfRect(L.rGasTube + 0.0004, 0.011, topY - 0.022, topY, 0.002), { segments: 24 });
    // small clamp ring where the tube exits the stem
    sector("feed_clamp", "gas_inlet", "stainless", chamfRect(L.rGasTube + 0.0004, L.rGasTube + 0.006, L.stemTopY + 0.002, L.stemTopY + 0.012, 0.001), { segments: 32 });

    // Backing plate with plenum recess
    const rBore = L.rGasTube + 0.0015;
    const backing: Vec2[] = [
      [rBore, L.plenumTopY],
      [L.rPlenum, L.plenumTopY],
      [L.rPlenum, L.faceplateTopY],
      [L.rFaceplate, L.faceplateTopY],
      [L.rFaceplate, L.backingTopY],
      [rBore, L.backingTopY],
    ];
    sector("backing_plate", "showerhead_backing_plate", "aluminum_machined", chamferProfile(backing, 0.003, (_, p) => Math.abs(p[0] - rBore) < 1e-9 || Math.abs(p[0] - L.rPlenum) < 1e-9), { segments: 160 });

    const bt = cfg.electrodes.blocker_plate_thickness;
    sector("blocker", "plenum_blocker_plate", "aluminum_machined", chamfRect(0, L.rBlocker, L.blockerY - bt / 2, L.blockerY + bt / 2, 0.001), { segments: 96 });
    const postAz = [90 * DEG, 210 * DEG, 330 * DEG];
    parts.push({
      key: "blocker_posts",
      assetId: "plenum_blocker_plate",
      materialRef: "aluminum_machined",
      pickable: false,
      cutaway: "sector",
      castShadow: false,
      sectorDependent: true,
      build: (kept) => {
        const posts: MeshData[] = [];
        for (const az of postAz) {
          if (!azimuthKept(az, kept)) continue;
          const post = revolveProfile(rectProfile(0, 0.003, L.blockerY + bt / 2, L.plenumTopY), { segments: 12 });
          translateMeshData(post, L.rBlocker * 0.72, 0, 0);
          posts.push(rotateYMeshData(post, az));
        }
        return posts.length ? mergeMeshData(posts) : createMeshData();
      },
    });

    parts.push({
      key: "faceplate",
      assetId: "showerhead_faceplate",
      materialRef: "aluminum_machined",
      pickable: true,
      cutaway: "sector",
      castShadow: true,
      sectorDependent: true,
      capProfile: { outer: rectProfile(0, L.rFaceplate, L.faceplateBottomY, L.faceplateTopY) },
      build: (kept) =>
        perforatedDisc({
          radius: L.rFaceplate,
          y0: L.faceplateBottomY,
          y1: L.faceplateTopY,
          holeRadius: cfg.electrodes.hole_diameter / 2,
          pitch: cfg.electrodes.hole_pitch,
          patternRadius: L.rHolePattern,
          holeSegments: 10,
          rimSegments: 160,
          ranges: kept,
          caps: false,
        }),
    });
  }

  // ------------------------------------------------------------------ RF assembly
  {
    const stem: Vec2[] = [
      [L.rStemInner, L.backingTopY],
      [L.rStemOuter + 0.022, L.backingTopY],
      [L.rStemOuter + 0.022, L.backingTopY + 0.008],
      [L.rStemOuter, L.backingTopY + 0.008],
      [L.rStemOuter, L.stemTopY],
      [L.rStemInner, L.stemTopY],
    ];
    sector("rf_stem", "rf_stem", "aluminum_machined", chamferProfile(stem, 0.002, (_, p) => Math.abs(p[0] - L.rStemInner) < 1e-9 && Math.abs(p[1] - L.backingTopY) < 1e-9), { segments: 96 });
    const bushing: Vec2[] = [
      [L.rStemOuter + 0.0005, L.bushingBottomY],
      [L.rBushing, L.bushingBottomY],
      [L.rBushing, L.lidTopY + 0.006],
      [L.rBushing + 0.018, L.lidTopY + 0.006],
      [L.rBushing + 0.018, L.bushingTopY],
      [L.rStemOuter + 0.0005, L.bushingTopY],
    ];
    sector("bushing", "rf_feedthrough_bushing", "ceramic", chamferProfile(bushing, 0.002), { segments: 96 });
    sector("isolator_ring", "showerhead_isolator", "ceramic", chamfRect(L.rIsolatorIn, L.rIsolatorOut, L.isolatorBottomY, L.isolatorTopY, 0.003), { segments: 160 });
    sector("edge_insulator", "edge_insulator_ring", "ceramic", chamfRect(L.rEdgeInsulatorIn + 0.0002, L.rEdgeInsulatorOut, L.faceplateBottomY + 0.001, L.backingTopY, 0.002), { segments: 160 });

    const mn = cfg.peripherals;
    const [mw, mh, md] = mn.matching_network_size;
    const [mx, my, mz] = mn.matching_network_center;
    const matchBox = chamferedBox([mw, mh, md], 0.006, [mx, my, mz]);
    const lidGap = chamferedBox([mw - 0.04, 0.012, md - 0.04], 0.002, [mx, L.lidTopY + 0.006, mz]);
    const connector = revolveProfile(chamfRect(0, 0.016, 0, 0.03, 0.002), { segments: 24 });
    toRadialFrame(connector, 0, my + 0.03);
    translateMeshData(connector, mx + mw / 2, 0, 0);
    const handle = chamferedBox([0.12, 0.012, 0.012], 0.002, [mx, my + mh / 2 + 0.02, mz]);
    const handlePosts = mergeMeshData([chamferedBox([0.012, 0.03, 0.012], 0.001, [mx - 0.05, my + mh / 2 + 0.01, mz]), chamferedBox([0.012, 0.03, 0.012], 0.001, [mx + 0.05, my + mh / 2 + 0.01, mz])]);
    fixed("match_box", "matching_network", "painted_housing", mergeMeshData([matchBox, lidGap]), { cutaway: "hide-in-sector", azimuth: 0 });
    fixed("match_details", "matching_network", "stainless", mergeMeshData([connector, handle, handlePosts]), { cutaway: "hide-in-sector", azimuth: 0, pickable: true, castShadow: false });

    const strapY = L.stemTopY - 0.014;
    const strap = flatStrap(
      [
        [L.rStemOuter - 0.004, strapY, 0],
        [mx - mw / 2 + 0.012, strapY, 0],
      ],
      0.032,
      0.003,
    );
    const strapClamp = revolveProfile(chamfRect(L.rStemOuter + 0.0004, L.rStemOuter + 0.012, strapY - 0.012, strapY + 0.012, 0.002), { segments: 64 });
    fixed("rf_strap", "rf_strap", "copper", mergeMeshData([strap, strapClamp]), { cutaway: "hide-in-sector", azimuth: 0, castShadow: false });

    const [gw, gh, gd] = mn.rf_generator_size;
    const [gx, gy, gz] = mn.rf_generator_center;
    const gen = chamferedBox([gw, gh, gd], 0.006, [gx, gy, gz]);
    const genFace = chamferedBox([0.004, gh - 0.03, gd - 0.03], 0.001, [gx - gw / 2 - 0.001, gy, gz]);
    const coaxPath: Vec3[] = [
      [gx - 0.1, gy + gh / 2, gz],
      [gx - 0.1, my + 0.03, gz],
      [mx + mw / 2 + 0.03, my + 0.03, gz],
    ];
    const coax = tubeAlongPath(coaxPath, 0.009, { segments: 16, cornerRadius: 0.05 });
    fixed("rf_generator", "rf_generator", "painted_housing", mergeMeshData([gen, genFace]), { cutaway: "keep" });
    fixed("rf_coax", "rf_generator", "dark_steel", coax, { cutaway: "keep", castShadow: false, hideWhenExploded: true });
  }

  // ------------------------------------------------------------------ wafer support
  {
    sector("wafer", "wafer", "silicon_wafer", rectProfile(0, L.rWafer, L.waferBottomY, L.waferTopY), { segments: 192, castShadow: false });
    sector("edge_ring", "edge_ring", "ceramic", chamfRect(L.rEdgeRingIn, L.rEdgeRingOut, L.pedestalTopY, L.edgeRingTopY, 0.0008), { segments: 192 });
    const pedOuter = filletProfile(rectProfile(0, L.rPedestal, L.pedestalBottomY, L.pedestalTopY), 0.005, 3, (_, p) => p[0] < 1e-9);
    const cavity = rectProfile(L.heater.rIn, L.heater.rOut, L.heater.y0, L.heater.y1);
    sector("pedestal", "pedestal", "aluminum_machined", { outer: pedOuter, holes: [cavity] }, { segments: 160 });
    // heater rings
    const rings: Vec2[][] = [];
    const h = L.heater;
    const span = h.rOut - h.rIn - 2 * (h.rElement + 0.004);
    for (let k = 0; k < h.turns; k++) {
      const R = h.rIn + h.rElement + 0.004 + (span * k) / Math.max(1, h.turns - 1);
      rings.push(circleProfile(R, (h.y0 + h.y1) / 2, h.rElement, 14));
    }
    parts.push({
      key: "heater_rings",
      assetId: "pedestal_heater",
      materialRef: "nichrome",
      pickable: true,
      cutaway: "sector",
      castShadow: false,
      sectorDependent: true,
      capProfile: { outer: rings[0], holes: [] },
      build: (kept) => mergeMeshData(rings.map((r) => revolveProfile(r, { segments: 128, ranges: kept, caps: true, smoothAngleDeg: 60 }))),
    });
    // lift pins (3) + lift ring
    const pinR = cfg.pedestal.lift_pin_diameter / 2;
    const pinAz = [30 * DEG, 150 * DEG, 270 * DEG];
    for (let i = 0; i < pinAz.length; i++) {
      const pin = revolveProfile(chamfRect(0, pinR, L.pedestalBottomY - 0.036, L.pedestalTopY - 0.0015, 0.0008), { segments: 16 });
      translateMeshData(pin, L.liftPinRadius, 0, 0);
      rotateYMeshData(pin, pinAz[i]);
      fixed(`lift_pin_${i}`, "lift_pins", "ceramic", pin, { cutaway: "hide-in-sector", azimuth: pinAz[i], castShadow: false });
    }
    sector("lift_ring", "lift_pins", "stainless", chamfRect(L.liftPinRadius - 0.014, L.liftPinRadius + 0.014, L.pedestalBottomY - 0.042, L.pedestalBottomY - 0.036, 0.001), { segments: 128 });
    const shaft: Vec2[] = [
      [0, L.shaftBottomY],
      [L.rShaft + 0.03, L.shaftBottomY],
      [L.rShaft + 0.03, L.shaftBottomY + 0.012],
      [L.rShaft, L.shaftBottomY + 0.012],
      [L.rShaft, L.pedestalBottomY + 0.002],
      [0, L.pedestalBottomY + 0.002],
    ];
    sector("shaft", "pedestal_shaft", "stainless", chamferProfile(shaft, 0.003, (_, p) => p[0] < 1e-9), { segments: 96 });
    const b = L.bellows;
    sector("bellows", "bellows", "stainless", bellowsProfile(b.rIn, b.rOut, b.y0, b.y1, b.convolutions, 0.0015), { segments: 96 });
    sector("bellows_flange_top", "bellows", "stainless", chamfRect(b.rIn - 0.004, L.rFloorBore + 0.03, b.y1 - 0.012, b.y1, 0.002), { segments: 96 });
    sector("bellows_flange_bottom", "bellows", "stainless", chamfRect(L.rShaft + 0.0005, b.rOut + 0.012, b.y0 - 0.012, b.y0, 0.002), { segments: 96 });
    sector("thermocouple_sheath", "thermocouple", "stainless", rectProfile(0, 0.003, L.shaftBottomY - 0.06, L.pedestalTopY - 0.008), { segments: 16, castShadow: false });
    sector("thermocouple_connector", "thermocouple", "dark_steel", chamfRect(0, 0.011, L.shaftBottomY - 0.095, L.shaftBottomY - 0.06, 0.002), { segments: 24, castShadow: false });
  }

  // ------------------------------------------------------------------ vacuum / exhaust
  {
    const ex = ports.exhaust;
    const exc = cfg.ports.exhaust;
    const rBore = exc.bore_diameter / 2;
    const rFl = exc.flange_diameter / 2;
    const s0 = L.rOuter + 0.014;
    const s1 = L.rOuter + exc.stub_length;
    const stub = revolveProfile(rectProfile(rBore, rBore + 0.005, s0 - 0.002, s1), { segments: 64, caps: false });
    const flange = revolveProfile(chamfRect(rBore + 0.004, rFl, s1 - 0.014, s1, 0.002), { segments: 64 });
    const exhaustPort = toRadialFrame(mergeMeshData([stub, flange]), ex.azimuth, ex.centerY);
    fixed("exhaust_port", "exhaust_port", "aluminum_machined", exhaustPort, { cutaway: "hide-in-sector", azimuth: ex.azimuth });

    const tv = cfg.exhaust_line;
    const rBody = tv.throttle_valve_body_diameter / 2;
    const t0 = s1 + 0.002;
    const t1 = t0 + tv.throttle_valve_body_length;
    const body = revolveProfile(chamfRect(rBore, rBody, t0 + 0.014, t1 - 0.014, 0.003), { segments: 64 });
    const fl1 = revolveProfile(chamfRect(rBore, rFl, t0, t0 + 0.014, 0.002), { segments: 64 });
    const fl2 = revolveProfile(chamfRect(rBore, rFl, t1 - 0.014, t1, 0.002), { segments: 64 });
    const throttle = toRadialFrame(mergeMeshData([body, fl1, fl2]), ex.azimuth, ex.centerY);
    const actuator = chamferedBox([0.09, 0.075, 0.07], 0.004, [(t0 + t1) / 2, ex.centerY + rBody + 0.034, 0]);
    const actuatorStem = revolveProfile(rectProfile(0, 0.008, ex.centerY + rBody - 0.01, ex.centerY + rBody + 0.002), { segments: 16 });
    translateMeshData(actuatorStem, (t0 + t1) / 2, 0, 0);
    const act = rotateYMeshData(mergeMeshData([actuator, actuatorStem]), ex.azimuth);
    fixed("throttle_body", "throttle_valve", "stainless", throttle, { cutaway: "hide-in-sector", azimuth: ex.azimuth });
    fixed("throttle_actuator", "throttle_valve", "painted_housing", act, { cutaway: "hide-in-sector", azimuth: ex.azimuth, pickable: true });

    // Foreline: horizontal from throttle outlet to an elbow, then down to the pump inlet.
    const sP = t1 + 0.08;
    const [pw, ph, pd] = tv.pump_size;
    const pumpTopY = tv.pump_center_y + ph / 2;
    const pipeR = tv.pipe_diameter / 2;
    const path: Vec3[] = [
      [t1 - 0.002, ex.centerY, 0],
      [sP, ex.centerY, 0],
      [sP, pumpTopY + 0.02, 0],
    ];
    const pipe = tubeAlongPath(path, pipeR, { segments: 32, cornerRadius: 0.07 });
    const inletFlange = revolveProfile(chamfRect(pipeR, pipeR + 0.02, pumpTopY, pumpTopY + 0.014, 0.002), { segments: 48 });
    translateMeshData(inletFlange, sP, 0, 0);
    fixed("foreline", "foreline", "stainless", rotateYMeshData(mergeMeshData([pipe, inletFlange]), ex.azimuth), { cutaway: "keep" });

    const [ivw, ivh, ivd] = tv.isolation_valve_size;
    const ivY = ex.centerY - 0.2;
    const ivBody = chamferedBox([ivw, ivh, ivd], 0.004, [sP, ivY, 0]);
    const ivActuator = revolveProfile(chamfRect(0, 0.03, 0, 0.12, 0.003), { segments: 32 });
    // actuator points tangentially (+local z after radial frame) : build along +Y then rotate to +Z
    const ivAct = (() => {
      const m = ivActuator;
      for (let i = 0; i < m.positions.length; i += 3) {
        const y = m.positions[i + 1];
        const z = m.positions[i + 2];
        m.positions[i + 1] = -z + ivY;
        m.positions[i + 2] = y + ivd / 2 - 0.004;
        m.positions[i] += sP;
      }
      for (let i = 0; i < m.normals.length; i += 3) {
        const y = m.normals[i + 1];
        const z = m.normals[i + 2];
        m.normals[i + 1] = -z;
        m.normals[i + 2] = y;
      }
      return m;
    })();
    fixed("isolation_valve", "isolation_valve", "stainless", rotateYMeshData(mergeMeshData([ivBody, ivAct]), ex.azimuth), { cutaway: "keep" });

    const pump = chamferedBox([pw, ph, pd], 0.008, [sP, tv.pump_center_y, 0]);
    const pumpExhaust = revolveProfile(chamfRect(0, 0.02, 0, 0.06, 0.002), { segments: 24 });
    toRadialFrame(pumpExhaust, 0, tv.pump_center_y + 0.05);
    translateMeshData(pumpExhaust, sP + pw / 2, 0, 0);
    const pumpMotor = revolveProfile(chamfRect(0, 0.07, 0, 0.12, 0.004), { segments: 48 });
    toRadialFrame(pumpMotor, 0, tv.pump_center_y - 0.05);
    translateMeshData(pumpMotor, sP + pw / 2, 0, 0);
    fixed("pump", "vacuum_pump", "painted_housing", rotateYMeshData(mergeMeshData([pump, pumpExhaust, pumpMotor]), ex.azimuth), { cutaway: "keep" });
  }

  // ------------------------------------------------------------------ access & inspection
  {
    const slit = ports.slit;
    const sc = cfg.ports.slit;
    const [vw, vh, vd] = sc.valve_body_size;
    const faceS = L.rOuter + 0.012;
    const body = chamferedBox([vw, vh, vd], 0.006, [0, slit.centerY, faceS + vd / 2]);
    const doorPlate = chamferedBox([sc.width + 0.04, sc.height + 0.03, sc.door_thickness], 0.002, [0, slit.centerY, faceS + 0.012]);
    const actuator = revolveProfile(chamfRect(0, 0.028, slit.centerY - vh / 2 - 0.16, slit.centerY - vh / 2 + 0.002, 0.003), { segments: 32 });
    translateMeshData(actuator, 0, 0, faceS + vd / 2);
    const actuatorRod = revolveProfile(rectProfile(0, 0.01, slit.centerY - vh / 2 - 0.2, slit.centerY - vh / 2 - 0.16), { segments: 16 });
    translateMeshData(actuatorRod, 0, 0, faceS + vd / 2);
    // bolt pattern on the valve body face (decor)
    const bolts: MeshData[] = [];
    for (let i = 0; i < 6; i++) {
      const b = revolveProfile(chamfRect(0, 0.006, 0, 0.006, 0.001), { segments: 16 });
      toRadialFrame(b, Math.PI / 2, slit.centerY + (i % 2 === 0 ? vh / 2 - 0.02 : -vh / 2 + 0.02));
      translateMeshData(b, -vw / 2 + 0.03 + Math.floor(i / 2) * ((vw - 0.06) / 2), 0, faceS + vd);
      bolts.push(b);
    }
    const rot = slit.azimuth - Math.PI / 2;
    fixed("slit_valve_body", "slit_valve", "aluminum_machined", rotateYMeshData(mergeMeshData([body, doorPlate]), rot), { cutaway: "hide-in-sector", azimuth: slit.azimuth });
    fixed("slit_valve_actuator", "slit_valve", "stainless", rotateYMeshData(mergeMeshData([actuator, actuatorRod]), rot), { cutaway: "hide-in-sector", azimuth: slit.azimuth, pickable: true });
    fixed("slit_valve_bolts", "slit_valve", "dark_steel", rotateYMeshData(mergeMeshData(bolts), rot), { cutaway: "hide-in-sector", azimuth: slit.azimuth, pickable: false, castShadow: false });

    const vp = ports.viewport;
    const vc = cfg.ports.viewport;
    const rBore = vc.bore_diameter / 2;
    const tubeEnd = L.rOuter + vc.tube_length;
    const vTube = revolveProfile(rectProfile(rBore, rBore + 0.005, L.rOuter + 0.012, tubeEnd - 0.012), { segments: 64, caps: false });
    const vFlange = revolveProfile(chamfRect(vc.window_diameter / 2 - 0.005, vc.flange_diameter / 2, tubeEnd - vc.flange_thickness, tubeEnd, 0.002), { segments: 64 });
    const vRetainer = revolveProfile(chamfRect(vc.window_diameter / 2 - 0.004, vc.flange_diameter / 2 - 0.012, tubeEnd, tubeEnd + 0.008, 0.0015), { segments: 64 });
    const vBolts: MeshData[] = [];
    for (let i = 0; i < 8; i++) {
      const b = revolveProfile(chamfRect(0, 0.0045, tubeEnd + 0.008, tubeEnd + 0.013, 0.0008), { segments: 12 });
      translateMeshData(b, vc.flange_diameter / 2 - 0.009, 0, 0);
      vBolts.push(rotateYMeshData(b, (i / 8) * TAU));
    }
    const window = revolveProfile(rectProfile(0, vc.window_diameter / 2, tubeEnd - 0.011, tubeEnd - 0.011 + vc.window_thickness), { segments: 64 });
    fixed("viewport_hardware", "viewport", "stainless", toRadialFrame(mergeMeshData([vTube, vFlange, vRetainer]), vp.azimuth, vp.centerY), { cutaway: "hide-in-sector", azimuth: vp.azimuth });
    fixed("viewport_bolts", "viewport", "dark_steel", toRadialFrame(mergeMeshData(vBolts), vp.azimuth, vp.centerY), { cutaway: "hide-in-sector", azimuth: vp.azimuth, pickable: false, castShadow: false });
    fixed("viewport_window", "viewport", "quartz", toRadialFrame(window, vp.azimuth, vp.centerY), { cutaway: "hide-in-sector", azimuth: vp.azimuth, isGlass: true, castShadow: false });

    const pt = ports.pressure_tap;
    const pc = cfg.ports.pressure_tap;
    const rTap = pc.bore_diameter / 2;
    const standoff = revolveProfile(rectProfile(rTap, rTap + 0.0025, L.rOuter + 0.012, L.rOuter + pc.standoff_length), { segments: 32, caps: false });
    const bodyStart = L.rOuter + pc.standoff_length;
    const sensorBody = revolveProfile(chamfRect(0, pc.sensor_body_diameter / 2, bodyStart, bodyStart + pc.sensor_body_length, 0.004), { segments: 48 });
    const sensorNut = revolveProfile(chamfRect(rTap + 0.0025, 0.014, bodyStart - 0.02, bodyStart, 0.002), { segments: 24 });
    const sensorCable = revolveProfile(rectProfile(0, 0.005, bodyStart + pc.sensor_body_length, bodyStart + pc.sensor_body_length + 0.03), { segments: 12 });
    fixed("pressure_sensor", "pressure_sensor", "stainless", toRadialFrame(mergeMeshData([standoff, sensorBody, sensorNut]), pt.azimuth, pt.centerY), { cutaway: "hide-in-sector", azimuth: pt.azimuth });
    fixed("pressure_sensor_cable", "pressure_sensor", "dark_steel", toRadialFrame(sensorCable, pt.azimuth, pt.centerY), { cutaway: "hide-in-sector", azimuth: pt.azimuth, pickable: false, castShadow: false });
  }

  return parts;
}

/** Plasma proxy cylinder (slightly larger than the volume for the soft halo). */
export function plasmaProxyMesh(L: ChamberLayout, haloMargin: number): MeshData {
  const r = L.plasma.radius + haloMargin + 0.002;
  return revolveProfile(rectProfile(0, r, L.plasma.bottomY, L.plasma.topY), { segments: 96 });
}

/** Rounded rectangle utility re-export for UI-free consumers. */
export { roundedRect };
