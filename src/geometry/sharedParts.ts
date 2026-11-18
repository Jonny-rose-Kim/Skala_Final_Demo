/**
 * Parametrized part generators shared by the templates added in the expansion (Remote ICP PECVD, STI CMP,
 * OHT, FOUP). They follow the CCP generator idioms (revolved sector parts with caps, azimuth-attached parts,
 * radial frames) but take explicit parameters so no template hard-codes another's dimensions.
 * The original CCP generator (chamberParts.ts) is unchanged.
 */
import type { AngularInterval } from "../config/geometry";
import { DEG, TAU } from "../config/geometry";
import type { CutawayBehavior, MaterialRef } from "../domain/types";
import { azimuthKept, toRadialFrame, type PartGeometry } from "./chamberParts";
import { waferHalfProfiles } from "./waferParts";
import {
  bellowsProfile,
  boxSectionCaps,
  chamferProfile,
  chamferedBox,
  clipToSector,
  circleProfile,
  createMeshData,
  filletProfile,
  mergeMeshData,
  portedShell,
  prismY,
  rectProfile,
  revolveProfile,
  rotateYMeshData,
  translateMeshData,
  tubeAlongPath,
  type MeshData,
  type RevolveProfile,
  type SectionBox,
  type ShellPort,
  type Vec2,
  type Vec3,
} from "./meshlib";

export type Mat = Exclude<MaterialRef, "none">;

export interface SectorOpts {
  segments?: number;
  pickable?: boolean;
  capProfile?: RevolveProfile | Vec2[];
  castShadow?: boolean;
  jointId?: string;
  axisXZ?: [number, number];
  isGlass?: boolean;
  lod?: "fine";
  cover?: boolean;
  presenceKey?: string;
}

export interface FixedOpts {
  cutaway: CutawayBehavior;
  azimuth?: number;
  pickable?: boolean;
  isGlass?: boolean;
  castShadow?: boolean;
  hideWhenExploded?: boolean;
  alwaysOpaque?: boolean;
  jointId?: string;
  axisXZ?: [number, number];
  stretch?: PartGeometry["stretch"];
  cover?: boolean;
  lod?: "fine";
  presenceKey?: string;
}

export type ClippedOpts = Omit<FixedOpts, "cutaway" | "azimuth" | "axisXZ" | "stretch">;

/** Collects parts with the same two idioms as the CCP generator. */
export class PartSink {
  readonly parts: PartGeometry[] = [];

  sector(key: string, assetId: string, materialRef: Mat, profile: RevolveProfile | Vec2[], opts: SectorOpts = {}): void {
    const prof: RevolveProfile = Array.isArray(profile) ? { outer: profile } : profile;
    const capP = opts.capProfile ? (Array.isArray(opts.capProfile) ? { outer: opts.capProfile } : opts.capProfile) : prof;
    this.parts.push({
      key,
      assetId,
      materialRef,
      pickable: opts.pickable ?? true,
      cutaway: "sector",
      castShadow: opts.castShadow ?? true,
      sectorDependent: true,
      capProfile: capP,
      jointId: opts.jointId,
      axisXZ: opts.axisXZ,
      isGlass: opts.isGlass,
      lod: opts.lod,
      cover: opts.cover,
      presenceKey: opts.presenceKey,
      build: (kept) => revolveProfile(prof, { segments: opts.segments ?? 128, ranges: kept, caps: false, uvScale: 1 }),
    });
  }

  /** Sector part with a custom builder (e.g. bolt rings that depend on kept ranges). */
  sectorCustom(key: string, assetId: string, materialRef: Mat, build: (kept: AngularInterval[]) => MeshData, opts: SectorOpts & { capProfile?: RevolveProfile | Vec2[] } = {}): void {
    const capP = opts.capProfile ? (Array.isArray(opts.capProfile) ? { outer: opts.capProfile } : opts.capProfile) : undefined;
    this.parts.push({
      key,
      assetId,
      materialRef,
      pickable: opts.pickable ?? true,
      cutaway: "sector",
      castShadow: opts.castShadow ?? true,
      sectorDependent: true,
      capProfile: capP,
      jointId: opts.jointId,
      axisXZ: opts.axisXZ,
      isGlass: opts.isGlass,
      lod: opts.lod,
      cover: opts.cover,
      presenceKey: opts.presenceKey,
      build,
    });
  }

  fixed(key: string, assetId: string, materialRef: Mat, md: MeshData, opts: FixedOpts): void {
    this.parts.push({
      key,
      assetId,
      materialRef,
      pickable: opts.pickable ?? true,
      cutaway: opts.cutaway,
      azimuth: opts.azimuth,
      isGlass: opts.isGlass,
      castShadow: opts.castShadow ?? true,
      hideWhenExploded: opts.hideWhenExploded,
      alwaysOpaque: opts.alwaysOpaque,
      jointId: opts.jointId,
      axisXZ: opts.axisXZ,
      stretch: opts.stretch,
      cover: opts.cover,
      lod: opts.lod,
      presenceKey: opts.presenceKey,
      sectorDependent: false,
      build: () => md,
    });
  }

  /**
   * Non-revolved part cut by the sector planes through the instance axis (carrier shells, plates).
   * `caps` lists the axis-aligned boxes that get section caps, or builds the caps itself.
   */
  clipped(key: string, assetId: string, materialRef: Mat, md: MeshData, caps: SectionBox[] | ((kept: AngularInterval[]) => MeshData) | null, opts: ClippedOpts = {}): void {
    this.parts.push({
      key,
      assetId,
      materialRef,
      pickable: opts.pickable ?? true,
      cutaway: "sector",
      // clipped about the instance axis: the authored coordinates are never shifted to a component axis
      axisXZ: [0, 0],
      isGlass: opts.isGlass,
      castShadow: opts.castShadow ?? true,
      hideWhenExploded: opts.hideWhenExploded,
      alwaysOpaque: opts.alwaysOpaque,
      jointId: opts.jointId,
      cover: opts.cover,
      lod: opts.lod,
      presenceKey: opts.presenceKey,
      sectorDependent: true,
      build: (kept) => clipToSector(md, kept),
      capBuild: caps ? (Array.isArray(caps) ? (kept) => boxSectionCaps(caps, kept) : caps) : undefined,
    });
  }
}

export const chamfRect = (r0: number, r1: number, y0: number, y1: number, c: number) => chamferProfile(rectProfile(r0, r1, y0, y1), c);

// ---------------------------------------------------------------------------------------------- chamber

export interface CylinderChamberParams {
  bodyAssetId: string;
  linerAssetId?: string;
  rInner: number;
  rOuter: number;
  floorTopY: number;
  floorBottomY: number;
  wallTopY: number;
  rTopFlange: number;
  topFlangeH: number;
  rBottomFlange: number;
  bottomFlangeH: number;
  rFloorBore: number;
  ports: ShellPort[];
  liner?: { rIn: number; rOut: number; y0: number; y1: number; ports: ShellPort[] };
  material?: Mat;
}

/** Cylindrical vacuum body (ported wall, top flange, floor with bottom flange) and optional liner. */
export function cylinderChamberParts(sink: PartSink, p: CylinderChamberParams): void {
  const mat = p.material ?? "aluminum_machined";
  sink.parts.push({
    key: "wall",
    assetId: p.bodyAssetId,
    materialRef: mat,
    pickable: true,
    cutaway: "sector",
    castShadow: true,
    sectorDependent: true,
    capProfile: { outer: rectProfile(p.rInner, p.rOuter, p.floorTopY, p.wallTopY) },
    build: (kept) => portedShell({ rIn: p.rInner, rOut: p.rOuter, y0: p.floorTopY, y1: p.wallTopY, ports: p.ports, ranges: kept, segments: 160, boreSegments: 32, caps: false }),
  });
  sink.sector("flange_top", p.bodyAssetId, mat, chamfRect(p.rOuter - 0.001, p.rTopFlange, p.wallTopY - p.topFlangeH, p.wallTopY, 0.004));
  const floorProfile: Vec2[] = chamferProfile(
    [
      [p.rFloorBore, p.floorBottomY],
      [p.rBottomFlange, p.floorBottomY],
      [p.rBottomFlange, p.floorBottomY + p.bottomFlangeH],
      [p.rOuter - 0.001, p.floorBottomY + p.bottomFlangeH],
      [p.rOuter - 0.001, p.floorTopY],
      [p.rFloorBore, p.floorTopY],
    ],
    0.004,
    (_, q) => Math.abs(q[0] - (p.rOuter - 0.001)) < 1e-9,
  );
  sink.sector("floor", p.bodyAssetId, mat, floorProfile);
  for (const port of p.ports) {
    if (port.hole.kind !== "circle") continue;
    const rBore = port.hole.radius;
    const rBoss = rBore + 0.012;
    const boss = toRadialFrame(revolveProfile(chamfRect(rBore, rBoss, p.rOuter - 0.012, p.rOuter + 0.014, 0.002), { segments: 64, caps: false }), port.azimuth, port.centerY);
    sink.fixed(`boss_${port.id}`, p.bodyAssetId, mat, boss, { cutaway: "hide-in-sector", azimuth: port.azimuth, pickable: true });
  }
  if (p.liner && p.linerAssetId) {
    const l = p.liner;
    sink.parts.push({
      key: "liner",
      assetId: p.linerAssetId,
      materialRef: "aluminum_anodized",
      pickable: true,
      cutaway: "sector",
      castShadow: true,
      sectorDependent: true,
      capProfile: { outer: rectProfile(l.rIn, l.rOut, l.y0, l.y1) },
      build: (kept) => portedShell({ rIn: l.rIn, rOut: l.rOut, y0: l.y0, y1: l.y1, ports: l.ports, ranges: kept, segments: 160, boreSegments: 32, caps: false }),
    });
  }
}

/** Slit port block: flat machined face on the cylindrical wall where the slit valve bolts on. */
export function slitPortBlock(sink: PartSink, assetId: string, p: { azimuth: number; centerY: number; width: number; height: number; rInner: number; rOuter: number; material?: Mat }): void {
  const halfW = p.width / 2 + 0.07;
  const blockFaceR = p.rOuter + 0.012;
  const innerR = p.rInner + 0.004;
  const arcPts: Vec2[] = [];
  const thetaW = Math.asin(Math.min(0.99, halfW / innerR));
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const th = -thetaW + (2 * thetaW * i) / n;
    arcPts.push([innerR * Math.sin(th), innerR * Math.cos(th)]);
  }
  const profile: Vec2[] = [...arcPts, [halfW, blockFaceR], [-halfW, blockFaceR]];
  const slitHalfW = p.width / 2;
  const yLo = p.centerY - p.height / 2;
  const yHi = p.centerY + p.height / 2;
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
  const lower = prismY(profile, p.centerY - 0.1, yLo, { capTop: true, capBottom: true });
  const upper = prismY(profile, yHi, p.centerY + 0.1, { capTop: true, capBottom: true });
  const sideA = prismY(sideProfile(1), yLo, yHi, { capTop: false, capBottom: false });
  const sideB = prismY(sideProfile(-1), yLo, yHi, { capTop: false, capBottom: false });
  const block = rotateYMeshData(mergeMeshData([lower, upper, sideA, sideB]), p.azimuth - Math.PI / 2);
  sink.fixed("slit_port_block", assetId, p.material ?? "aluminum_machined", block, { cutaway: "hide-in-sector", azimuth: p.azimuth });
}

export interface BoltedLidParams {
  assetId: string;
  rLid: number;
  rBore: number;
  lidBottomY: number;
  lidTopY: number;
  grooveR: number;
  boltCount: number;
  rBoltCircle: number;
  boltHeadR: number;
  boltHeadH: number;
  /** Raised boss around the bore on top (height, extra radius). */
  boreBoss?: { height: number; extraR: number };
}

/** Thick lid with o-ring groove, center bore and a bolt circle (bolts are decor, sector-dependent). */
export function boltedLidParts(sink: PartSink, p: BoltedLidParams): void {
  const gw = 0.008;
  const gd = 0.005;
  const rg = p.grooveR;
  const bossH = p.boreBoss?.height ?? 0.006;
  const bossR = p.rBore + (p.boreBoss?.extraR ?? 0.03);
  const lidProfile: Vec2[] = [
    [p.rBore, p.lidBottomY],
    [rg - gw / 2, p.lidBottomY],
    [rg - gw / 2, p.lidBottomY + gd],
    [rg + gw / 2, p.lidBottomY + gd],
    [rg + gw / 2, p.lidBottomY],
    [p.rLid, p.lidBottomY],
    [p.rLid, p.lidTopY],
    [bossR, p.lidTopY],
    [bossR, p.lidTopY + bossH],
    [p.rBore, p.lidTopY + bossH],
  ];
  const lidChamfered = chamferProfile(lidProfile, 0.005, (_, q) => Math.abs(q[1] - (p.lidBottomY + gd)) < 1e-9 || Math.abs(q[0] - (rg - gw / 2)) < 1e-9 || Math.abs(q[0] - (rg + gw / 2)) < 1e-9);
  sink.sector("lid", p.assetId, "aluminum_machined", lidChamfered, { segments: 160 });
  const boltAz: number[] = [];
  for (let i = 0; i < p.boltCount; i++) boltAz.push((i / p.boltCount) * TAU + 0.5 * DEG);
  const headProfile = chamferProfile(rectProfile(0, p.boltHeadR, 0, p.boltHeadH), 0.0015, (_, q) => q[1] < 1e-9);
  const hex: Vec2[] = [];
  for (let k = 0; k < 6; k++) hex.push([p.boltHeadR * 0.55 * Math.cos((k / 6) * TAU), p.boltHeadR * 0.55 * Math.sin((k / 6) * TAU)]);
  sink.sectorCustom(
    "lid_bolts",
    p.assetId,
    "dark_steel",
    (kept) => {
      const heads: MeshData[] = [];
      for (const az of boltAz) {
        if (!azimuthKept(az, kept)) continue;
        const h = revolveProfile(headProfile, { segments: 24 });
        translateMeshData(h, p.rBoltCircle, p.lidTopY, 0);
        heads.push(rotateYMeshData(h, az));
      }
      return heads.length ? mergeMeshData(heads) : createMeshData();
    },
    { pickable: false, castShadow: false },
  );
  sink.sectorCustom(
    "lid_bolt_sockets",
    p.assetId,
    "dark_steel",
    (kept) => {
      const socks: MeshData[] = [];
      for (const az of boltAz) {
        if (!azimuthKept(az, kept)) continue;
        const s = prismY(hex, p.lidTopY + p.boltHeadH - 0.005, p.lidTopY + p.boltHeadH + 0.0002, { capTop: true, capBottom: true });
        translateMeshData(s, p.rBoltCircle, 0, 0);
        socks.push(rotateYMeshData(s, az));
      }
      return socks.length ? mergeMeshData(socks) : createMeshData();
    },
    { pickable: false, castShadow: false },
  );
}

export interface HeatedStageParams {
  ids: { wafer: string; edgeRing: string; pedestal: string; heater: string; liftPins: string; shaft: string; bellows: string; thermocouple: string };
  rWafer: number;
  waferThickness: number;
  pedestal: { r: number; topY: number; bottomY: number; rEdgeRingIn: number; edgeRingThickness: number };
  heater: { rIn: number; rOut: number; y0: number; y1: number; rElement: number; turns: number };
  liftPins: { radius: number; r: number };
  shaft: { r: number; bottomY: number };
  rFloorBore: number;
  bellows: { rIn: number; rOut: number; y0: number; y1: number; convolutions: number };
  /** Stage lift and lift-pin joints (parts are authored at the process position, pins flush). */
  joints?: { stage: string; pins: string };
}

/** Wafer, ceramic edge ring, heated pedestal with heater rings, lift pins, shaft, bellows, TC sheath. */
export function heatedStageParts(sink: PartSink, p: HeatedStageParams): void {
  const ids = p.ids;
  const pd = p.pedestal;
  // stage lift: pedestal, heater, edge ring, shaft and thermocouple follow `stage`; pins (and the wafer resting on them) follow `pins`
  const js = p.joints?.stage;
  const jp = p.joints?.pins;
  const wh = waferHalfProfiles(p.rWafer, pd.topY, p.waferThickness, false);
  sink.sector("wafer", ids.wafer, "silicon_wafer", wh.back, { segments: 192, castShadow: false, jointId: jp });
  sink.sector("wafer_front", ids.wafer, "wafer_front", wh.front, { segments: 192, castShadow: false, jointId: jp });
  sink.sector("edge_ring", ids.edgeRing, "ceramic", chamfRect(pd.rEdgeRingIn, pd.r, pd.topY, pd.topY + pd.edgeRingThickness, 0.0008), { segments: 192, jointId: js });
  const pedOuter = filletProfile(rectProfile(0, pd.r, pd.bottomY, pd.topY), 0.005, 3, (_, q) => q[0] < 1e-9);
  const cavity = rectProfile(p.heater.rIn, p.heater.rOut, p.heater.y0, p.heater.y1);
  sink.sector("pedestal", ids.pedestal, "aluminum_machined", { outer: pedOuter, holes: [cavity] }, { segments: 160, jointId: js });
  const rings: Vec2[][] = [];
  const h = p.heater;
  const span = h.rOut - h.rIn - 2 * (h.rElement + 0.004);
  for (let k = 0; k < h.turns; k++) {
    const R = h.rIn + h.rElement + 0.004 + (span * k) / Math.max(1, h.turns - 1);
    rings.push(circleProfile(R, (h.y0 + h.y1) / 2, h.rElement, 14));
  }
  sink.sectorCustom("heater_rings", ids.heater, "nichrome", (kept) => mergeMeshData(rings.map((r) => revolveProfile(r, { segments: 128, ranges: kept, caps: true, smoothAngleDeg: 60 }))), { castShadow: false, capProfile: { outer: rings[0], holes: [] }, jointId: js });
  // lift pins: tops flush with the stage surface at value 0; their drive is not drawn (no room for a hoop under the
  // lowered stage)
  const pinAz = [30 * DEG, 150 * DEG, 270 * DEG];
  for (let i = 0; i < pinAz.length; i++) {
    const pin = revolveProfile(chamfRect(0, p.liftPins.r, pd.bottomY - 0.008, pd.topY, 0.0008), { segments: 16 });
    translateMeshData(pin, p.liftPins.radius, 0, 0);
    rotateYMeshData(pin, pinAz[i]);
    sink.fixed(`lift_pin_${i}`, ids.liftPins, "ceramic", pin, { cutaway: "hide-in-sector", azimuth: pinAz[i], castShadow: false, jointId: jp });
  }
  const shaft: Vec2[] = [
    [0, p.shaft.bottomY],
    [p.shaft.r + 0.03, p.shaft.bottomY],
    [p.shaft.r + 0.03, p.shaft.bottomY + 0.012],
    [p.shaft.r, p.shaft.bottomY + 0.012],
    [p.shaft.r, pd.bottomY + 0.002],
    [0, pd.bottomY + 0.002],
  ];
  sink.sector("shaft", ids.shaft, "stainless", chamferProfile(shaft, 0.003, (_, q) => q[0] < 1e-9), { segments: 96, jointId: js });
  const b = p.bellows;
  // bellows: top flange fixed to the floor bore; the convolutions stretch about the top as the stage lowers; the bottom flange is clamped to the shaft
  sink.parts.push({
    key: "bellows",
    assetId: ids.bellows,
    materialRef: "stainless",
    pickable: true,
    cutaway: "sector",
    castShadow: true,
    sectorDependent: true,
    capProfile: { outer: bellowsProfile(b.rIn, b.rOut, b.y0, b.y1, b.convolutions, 0.0015) },
    stretch: js ? { baseLength: b.y1 - b.y0, jointId: js, anchor: [0, b.y1, 0], sign: -1 } : undefined,
    build: (kept) => revolveProfile(bellowsProfile(b.rIn, b.rOut, b.y0, b.y1, b.convolutions, 0.0015), { segments: 96, ranges: kept, caps: false, uvScale: 1 }),
  });
  sink.sector("bellows_flange_top", ids.bellows, "stainless", chamfRect(b.rIn - 0.004, p.rFloorBore + 0.03, b.y1 - 0.012, b.y1, 0.002), { segments: 96 });
  sink.sector("bellows_flange_bottom", ids.shaft, "stainless", chamfRect(p.shaft.r + 0.0005, b.rOut + 0.012, b.y0 - 0.012, b.y0, 0.002), { segments: 96, jointId: js });
  sink.sector("thermocouple_sheath", ids.thermocouple, "stainless", rectProfile(0, 0.003, p.shaft.bottomY - 0.06, pd.topY - 0.008), { segments: 16, castShadow: false, jointId: js });
  sink.sector("thermocouple_connector", ids.thermocouple, "dark_steel", chamfRect(0, 0.011, p.shaft.bottomY - 0.095, p.shaft.bottomY - 0.06, 0.002), { segments: 24, castShadow: false, jointId: js });
}

export interface ExhaustLineParams {
  ids: { port: string; throttle: string; isolation: string; foreline: string; pump: string };
  azimuth: number;
  centerY: number;
  rOuter: number;
  rBore: number;
  rFlange: number;
  stubLength: number;
  throttleLength: number;
  rThrottleBody: number;
  isolationSize: Vec3;
  pumpSize: Vec3;
  pumpCenterY: number;
  pipeR: number;
}

/** Exhaust port stub + flange, throttle valve with actuator, foreline, isolation valve, pump (same as CCP). */
export function exhaustLineParts(sink: PartSink, p: ExhaustLineParams): void {
  const s0 = p.rOuter + 0.014;
  const s1 = p.rOuter + p.stubLength;
  const stub = revolveProfile(rectProfile(p.rBore, p.rBore + 0.005, s0 - 0.002, s1), { segments: 64, caps: false });
  const flange = revolveProfile(chamfRect(p.rBore + 0.004, p.rFlange, s1 - 0.014, s1, 0.002), { segments: 64 });
  sink.fixed("exhaust_port", p.ids.port, "aluminum_machined", toRadialFrame(mergeMeshData([stub, flange]), p.azimuth, p.centerY), { cutaway: "hide-in-sector", azimuth: p.azimuth });
  const t0 = s1 + 0.002;
  const t1 = t0 + p.throttleLength;
  const body = revolveProfile(chamfRect(p.rBore, p.rThrottleBody, t0 + 0.014, t1 - 0.014, 0.003), { segments: 64 });
  const fl1 = revolveProfile(chamfRect(p.rBore, p.rFlange, t0, t0 + 0.014, 0.002), { segments: 64 });
  const fl2 = revolveProfile(chamfRect(p.rBore, p.rFlange, t1 - 0.014, t1, 0.002), { segments: 64 });
  const throttle = toRadialFrame(mergeMeshData([body, fl1, fl2]), p.azimuth, p.centerY);
  const actuator = chamferedBox([0.09, 0.075, 0.07], 0.004, [(t0 + t1) / 2, p.centerY + p.rThrottleBody + 0.034, 0]);
  const actuatorStem = revolveProfile(rectProfile(0, 0.008, p.centerY + p.rThrottleBody - 0.01, p.centerY + p.rThrottleBody + 0.002), { segments: 16 });
  translateMeshData(actuatorStem, (t0 + t1) / 2, 0, 0);
  sink.fixed("throttle_body", p.ids.throttle, "stainless", throttle, { cutaway: "hide-in-sector", azimuth: p.azimuth });
  sink.fixed("throttle_actuator", p.ids.throttle, "painted_housing", rotateYMeshData(mergeMeshData([actuator, actuatorStem]), p.azimuth), { cutaway: "hide-in-sector", azimuth: p.azimuth, pickable: true });
  const sP = t1 + 0.08;
  const [pw, ph, pd] = p.pumpSize;
  const pumpTopY = p.pumpCenterY + ph / 2;
  const path: Vec3[] = [
    [t1 - 0.002, p.centerY, 0],
    [sP, p.centerY, 0],
    [sP, pumpTopY + 0.02, 0],
  ];
  const pipe = tubeAlongPath(path, p.pipeR, { segments: 32, cornerRadius: 0.07 });
  const inletFlange = revolveProfile(chamfRect(p.pipeR, p.pipeR + 0.02, pumpTopY, pumpTopY + 0.014, 0.002), { segments: 48 });
  translateMeshData(inletFlange, sP, 0, 0);
  sink.fixed("foreline", p.ids.foreline, "stainless", rotateYMeshData(mergeMeshData([pipe, inletFlange]), p.azimuth), { cutaway: "keep" });
  const [ivw, ivh, ivd] = p.isolationSize;
  const ivY = p.centerY - 0.2;
  const ivBody = chamferedBox([ivw, ivh, ivd], 0.004, [sP, ivY, 0]);
  const ivAct = revolveProfile(chamfRect(0, 0.03, 0, 0.12, 0.003), { segments: 32 });
  for (let i = 0; i < ivAct.positions.length; i += 3) {
    const y = ivAct.positions[i + 1];
    const z = ivAct.positions[i + 2];
    ivAct.positions[i + 1] = -z + ivY;
    ivAct.positions[i + 2] = y + ivd / 2;
    ivAct.positions[i] += sP;
    const ny = ivAct.normals[i + 1];
    const nz = ivAct.normals[i + 2];
    ivAct.normals[i + 1] = -nz;
    ivAct.normals[i + 2] = ny;
  }
  sink.fixed("isolation_valve", p.ids.isolation, "stainless", rotateYMeshData(mergeMeshData([ivBody, ivAct]), p.azimuth), { cutaway: "keep" });
  const pump = chamferedBox([pw, ph, pd], 0.008, [sP, p.pumpCenterY, 0]);
  const pumpExhaust = revolveProfile(chamfRect(0, 0.02, 0, 0.06, 0.002), { segments: 24 });
  toRadialFrame(pumpExhaust, 0, p.pumpCenterY + 0.05);
  translateMeshData(pumpExhaust, sP + pw / 2, 0, 0);
  const pumpMotor = revolveProfile(chamfRect(0, 0.07, 0, 0.12, 0.004), { segments: 48 });
  toRadialFrame(pumpMotor, 0, p.pumpCenterY - 0.05);
  translateMeshData(pumpMotor, sP + pw / 2, 0, 0);
  sink.fixed("pump", p.ids.pump, "painted_housing", rotateYMeshData(mergeMeshData([pump, pumpExhaust, pumpMotor]), p.azimuth), { cutaway: "keep" });
}

export interface SlitValveParams {
  assetId: string;
  azimuth: number;
  centerY: number;
  rOuter: number;
  width: number;
  height: number;
  valveBodySize: Vec3;
  doorThickness: number;
}

export function slitValveParts(sink: PartSink, p: SlitValveParams): void {
  const [vw, vh, vd] = p.valveBodySize;
  const faceS = p.rOuter + 0.012;
  const body = chamferedBox([vw, vh, vd], 0.006, [0, p.centerY, faceS + vd / 2]);
  const doorPlate = chamferedBox([p.width + 0.04, p.height + 0.03, p.doorThickness], 0.002, [0, p.centerY, faceS + 0.012]);
  const actuator = revolveProfile(chamfRect(0, 0.028, p.centerY - vh / 2 - 0.16, p.centerY - vh / 2 + 0.002, 0.003), { segments: 32 });
  translateMeshData(actuator, 0, 0, faceS + vd / 2);
  const actuatorRod = revolveProfile(rectProfile(0, 0.01, p.centerY - vh / 2 - 0.2, p.centerY - vh / 2 - 0.16), { segments: 16 });
  translateMeshData(actuatorRod, 0, 0, faceS + vd / 2);
  const bolts: MeshData[] = [];
  for (let i = 0; i < 6; i++) {
    const b = revolveProfile(chamfRect(0, 0.006, 0, 0.006, 0.001), { segments: 16 });
    toRadialFrame(b, Math.PI / 2, p.centerY + (i % 2 === 0 ? vh / 2 - 0.02 : -vh / 2 + 0.02));
    translateMeshData(b, -vw / 2 + 0.03 + Math.floor(i / 2) * ((vw - 0.06) / 2), 0, faceS + vd);
    bolts.push(b);
  }
  const rot = p.azimuth - Math.PI / 2;
  sink.fixed("slit_valve_body", p.assetId, "aluminum_machined", rotateYMeshData(mergeMeshData([body, doorPlate]), rot), { cutaway: "hide-in-sector", azimuth: p.azimuth });
  sink.fixed("slit_valve_actuator", p.assetId, "stainless", rotateYMeshData(mergeMeshData([actuator, actuatorRod]), rot), { cutaway: "hide-in-sector", azimuth: p.azimuth, pickable: true });
  sink.fixed("slit_valve_bolts", p.assetId, "dark_steel", rotateYMeshData(mergeMeshData(bolts), rot), { cutaway: "hide-in-sector", azimuth: p.azimuth, pickable: false, castShadow: false });
}

export interface ViewportParams {
  assetId: string;
  azimuth: number;
  centerY: number;
  rOuter: number;
  rBore: number;
  rFlange: number;
  flangeT: number;
  tubeLength: number;
  rWindow: number;
  windowT: number;
  keyPrefix?: string;
}

/** Viewport tube, flange, retainer ring, 8 bolts and a quartz window (same structure as the CCP). */
export function viewportParts(sink: PartSink, p: ViewportParams): void {
  const k = p.keyPrefix ?? "viewport";
  const tubeEnd = p.rOuter + p.tubeLength;
  const vTube = revolveProfile(rectProfile(p.rBore, p.rBore + 0.005, p.rOuter + 0.012, tubeEnd - 0.012), { segments: 64, caps: false });
  const vFlange = revolveProfile(chamfRect(p.rWindow - 0.005, p.rFlange, tubeEnd - p.flangeT, tubeEnd, 0.002), { segments: 64 });
  const vRetainer = revolveProfile(chamfRect(p.rWindow - 0.004, p.rFlange - 0.012, tubeEnd, tubeEnd + 0.008, 0.0015), { segments: 64 });
  const vBolts: MeshData[] = [];
  for (let i = 0; i < 8; i++) {
    const b = revolveProfile(chamfRect(0, 0.0045, tubeEnd + 0.008, tubeEnd + 0.013, 0.0008), { segments: 12 });
    translateMeshData(b, p.rFlange - 0.009, 0, 0);
    vBolts.push(rotateYMeshData(b, (i / 8) * TAU));
  }
  const window = revolveProfile(rectProfile(0, p.rWindow, tubeEnd - 0.011, tubeEnd - 0.011 + p.windowT), { segments: 64 });
  sink.fixed(`${k}_hardware`, p.assetId, "stainless", toRadialFrame(mergeMeshData([vTube, vFlange, vRetainer]), p.azimuth, p.centerY), { cutaway: "hide-in-sector", azimuth: p.azimuth });
  sink.fixed(`${k}_bolts`, p.assetId, "dark_steel", toRadialFrame(mergeMeshData(vBolts), p.azimuth, p.centerY), { cutaway: "hide-in-sector", azimuth: p.azimuth, pickable: false, castShadow: false });
  sink.fixed(`${k}_window`, p.assetId, "quartz", toRadialFrame(window, p.azimuth, p.centerY), { cutaway: "hide-in-sector", azimuth: p.azimuth, isGlass: true, castShadow: false });
}

export interface PressureGaugeParams {
  assetId: string;
  azimuth: number;
  centerY: number;
  rOuter: number;
  rTap: number;
  rBody: number;
  bodyLength: number;
  standoffLength: number;
  keyPrefix?: string;
}

/** Gauge body outside the wall on a standoff tube: body != measurement point (the tap inside). */
export function pressureGaugeParts(sink: PartSink, p: PressureGaugeParams): void {
  const k = p.keyPrefix ?? "pressure_sensor";
  const standoff = revolveProfile(rectProfile(p.rTap, p.rTap + 0.0025, p.rOuter + 0.012, p.rOuter + p.standoffLength), { segments: 32, caps: false });
  const bodyStart = p.rOuter + p.standoffLength;
  const sensorBody = revolveProfile(chamfRect(0, p.rBody, bodyStart, bodyStart + p.bodyLength, 0.004), { segments: 48 });
  const sensorNut = revolveProfile(chamfRect(p.rTap + 0.0025, 0.014, bodyStart - 0.02, bodyStart, 0.002), { segments: 24 });
  const sensorCable = revolveProfile(rectProfile(0, 0.005, bodyStart + p.bodyLength, bodyStart + p.bodyLength + 0.03), { segments: 12 });
  sink.fixed(k, p.assetId, "stainless", toRadialFrame(mergeMeshData([standoff, sensorBody, sensorNut]), p.azimuth, p.centerY), { cutaway: "hide-in-sector", azimuth: p.azimuth });
  sink.fixed(`${k}_cable`, p.assetId, "dark_steel", toRadialFrame(sensorCable, p.azimuth, p.centerY), { cutaway: "hide-in-sector", azimuth: p.azimuth, pickable: false, castShadow: false });
}

/** Four-leg support frame with braces (same look as the CCP frame). */
export function frameParts(sink: PartSink, assetId: string, p: { legSize: number; legR: number; yTop: number; yBottom: number; centerXZ?: [number, number] }): void {
  const leg = p.legSize;
  const pieces: MeshData[] = [];
  const cx0 = p.centerXZ?.[0] ?? 0;
  const cz0 = p.centerXZ?.[1] ?? 0;
  for (let k = 0; k < 4; k++) {
    const az = (45 + 90 * k) * DEG;
    pieces.push(chamferedBox([leg, p.yTop - p.yBottom, leg], 0.003, [cx0 + p.legR * Math.cos(az), (p.yTop + p.yBottom) / 2, cz0 + p.legR * Math.sin(az)]));
  }
  const braceY = p.yBottom + 0.12;
  const half = p.legR * Math.SQRT1_2;
  for (const [cx, cz, w, d] of [
    [half, 0, leg, 2 * half],
    [-half, 0, leg, 2 * half],
    [0, half, 2 * half, leg],
    [0, -half, 2 * half, leg],
  ] as const) {
    pieces.push(chamferedBox([w, leg * 0.8, d], 0.002, [cx0 + cx, braceY, cz0 + cz]));
    pieces.push(chamferedBox([w, leg * 0.8, d], 0.002, [cx0 + cx, p.yTop - leg * 0.4 - 0.002, cz0 + cz]));
  }
  sink.fixed("frame", assetId, "painted_housing", mergeMeshData(pieces), { cutaway: "keep" });
}

export interface PanelParams {
  assetId: string;
  size: Vec3;
  center: Vec3;
  /** Face normal direction of the MFC side: -z (toward the chamber) by default. */
  mfc?: { assetId: string; size: Vec3; centers: Vec3[]; ownIndex: number };
  bracket?: MeshData;
  keyPrefix?: string;
}

/** Painted enclosure (gas / precursor panel) with an inset front and MFC blocks; block `ownIndex` is its own asset. */
export function panelParts(sink: PartSink, p: PanelParams): void {
  const k = p.keyPrefix ?? "panel";
  const [gw, gh, gd] = p.size;
  const [gx, gy, gz] = p.center;
  const panel = chamferedBox([gw, gh, gd], 0.006, [gx, gy, gz]);
  const inset = chamferedBox([gw - 0.03, gh - 0.03, 0.004], 0.001, [gx, gy, gz - gd / 2 - 0.001]);
  const pieces = [panel, inset];
  if (p.bracket) pieces.push(p.bracket);
  sink.fixed(k, p.assetId, "painted_housing", mergeMeshData(pieces), { cutaway: "keep" });
  if (p.mfc) {
    const slots: MeshData[] = [];
    p.mfc.centers.forEach((c, i) => {
      if (i === p.mfc!.ownIndex) sink.fixed(`${k}_mfc_own`, p.mfc!.assetId, "stainless", chamferedBox(p.mfc!.size, 0.002, c), { cutaway: "keep" });
      else slots.push(chamferedBox(p.mfc!.size, 0.002, c));
    });
    if (slots.length) sink.fixed(`${k}_mfc_slots`, p.assetId, "stainless", mergeMeshData(slots), { cutaway: "keep" });
  }
}

/** Helical coil around +Y (radius R, tube radius r, turns, pitch) starting at y0, with radial leads at `leadAzimuth`. */
export function helicalCoil(R: number, r: number, turns: number, pitch: number, y0: number, leadAzimuth: number, leadLength: number, segmentsPerTurn = 48): MeshData {
  const path: Vec3[] = [];
  const n = Math.max(2, Math.round(turns * segmentsPerTurn));
  // lead in
  path.push([Math.cos(leadAzimuth) * (R + leadLength), y0, Math.sin(leadAzimuth) * (R + leadLength)]);
  for (let i = 0; i <= n; i++) {
    const a = leadAzimuth + (i / segmentsPerTurn) * TAU;
    const y = y0 + (i / n) * turns * pitch;
    path.push([Math.cos(a) * R, y, Math.sin(a) * R]);
  }
  const yEnd = y0 + turns * pitch;
  path.push([Math.cos(leadAzimuth) * (R + leadLength), yEnd, Math.sin(leadAzimuth) * (R + leadLength)]);
  return tubeAlongPath(path, r, { segments: 12, caps: true });
}
