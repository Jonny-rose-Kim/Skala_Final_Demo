/**
 * SceneHost: owns the Babylon engine/scene lifecycle for the Visual Inspection mode and applies the
 * PresentationState to the scene imperatively. React never recreates the scene; per-frame values stay
 * in the renderer and are published to the store at a low rate.
 *
 * One scene holds every equipment instance of the bay (CCP, Remote ICP PECVD, STI CMP, OHT, FOUP). One
 * presentation clock drives one selected scenario whose PreviewState (joint poses, holders, film state,
 * effects) is applied to all instances each frame. Heavy effects stay on the active instance.
 */
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Layers/effectLayerSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader";
import "@babylonjs/core/Culling/ray";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import type { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { CHAMBER_LAYOUT, DEG, floorTopY, type ChamberLayout, type Vec3Tuple } from "../config/geometry";
import "../equipment/index";
import { getBundle, listBundles, measurementIndex, validateAllBundles, type EquipmentBundle } from "../domain/registry";
import { DEFAULT_INSTANCES, instanceFixture } from "../domain/instances";
import type { EquipmentInstanceDef } from "../domain/types";
import { revolveProfile, rectProfile, type Vec2 } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import { createCleanroomEnvironment } from "../materials/environment";
import { MaterialLibrary } from "../materials/materialLibrary";
import { createProceduralTextures, type ProceduralTextureSet } from "../materials/proceduralTextures";
import { resolveCutaway, type ResolvedCutaway, FULL } from "../presentation/cutaway";
import { holdPointSec, phaseAt, type ScenarioContext, type ScenarioDefinition, type StationWorldFrame } from "../presentation/scenario";
import { getScenario, standaloneScenarioFor } from "../presentation/scenarioRegistry";
import { colorPresetById, usePresentationStore, type PresentationState, type LoadedInstanceInfo } from "../presentation/store";
import type { PreviewState } from "../presentation/preview";
import { VisualClock } from "../presentation/visualClock";
import { LabelsOverlay } from "../interaction/labels";
import { PickingController } from "../interaction/picking";
import { cameraPresets, type CameraPreset } from "./cameraPresets";
import { EquipmentInstance, type InstanceMeshMetadata } from "./equipmentInstance";
import { createEffects } from "./effectsRegistry";
import { createCanvas, readForceWebGL2, tryCreateWebGL2, tryCreateWebGPU, type CreatedEngine } from "./engineFactory";
import { LightingRig } from "./lighting";
import { MeasurementOverlay } from "./measurementOverlay";
import { FabEnvironment, facilityDropFor, type FacilityDrop } from "./fabEnvironment";
import { QUALITY, QualityManager, RenderPipeline } from "./renderPipeline";

export interface SceneHostOptions {
  fixture?: string | null;
  forceWebGL2?: boolean;
  plasmaDebugDepth?: boolean;
  flipDepthY?: boolean;
}

interface World {
  created: CreatedEngine;
  scene: Scene;
  camera: ArcRotateCamera;
  env: HDRCubeTexture;
  textures: ProceduralTextureSet;
  materials: MaterialLibrary;
  lighting: LightingRig;
  instances: Map<string, EquipmentInstance>;
  stations: Record<string, StationWorldFrame>;
  depth: DepthRenderer;
  pipeline: RenderPipeline;
  highlight: HighlightLayer;
  picking: PickingController;
  labels: LabelsOverlay;
  markers: MeasurementOverlay;
  ground: Mesh;
  backdrop: Mesh;
  resizeObserver: ResizeObserver;
  bayCenter: Vector3;
  bayRadius: number;
  instrumentation: SceneInstrumentation;
  /** World bounding center of every static instance (distance LOD). */
  lodCenters: Map<string, Vector3>;
  /** Visual-only bay surroundings (floor tiles, ceiling, walls, utility chase). */
  environment: FabEnvironment;
}

/** True when a sphere touches the segment a-b. */
function segmentSphereHit(a: Vector3, b: Vector3, c: Vector3, r: number): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + abx * t - c.x;
  const dy = a.y + aby * t - c.y;
  const dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Half-circle profile for a backdrop sphere (revolved around +Y). */
function backdropProfile(radius: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push([Math.max(0, radius * Math.cos(a)), radius * Math.sin(a)]);
  }
  pts.push([0, radius * 0.999], [0, -radius * 0.999]);
  return pts;
}

const NO_CUT = resolveCutaway({ enabled: false, azimuthDeg: 0, sweepDeg: 0 }, []);

const FAMILY_LABEL: Record<string, string> = { CCP_PECVD: "CCP PECVD", REMOTE_PECVD: "Remote ICP PECVD", STI_CMP_ROTARY: "Rotary STI CMP", OHT: "OHT", CARRIER: "FOUP" };

export class SceneHost {
  private world: World | null = null;
  private container: HTMLElement | null = null;
  readonly clock = new VisualClock(18, null);
  private unsubscribe: (() => void) | null = null;
  private lastState: PresentationState | null = null;
  private cutawayTimer: number | null = null;
  private pendingCut: ResolvedCutaway | null = null;
  private appliedCut: ResolvedCutaway = NO_CUT;
  private readonly quality = new QualityManager();
  private lastPerfPublish = 0;
  private lastTimelinePublish = 0;
  private lastPreviewPublish = 0;
  private frozenTime: number | null = null;
  private logs: string[] = [];
  private disposed = false;
  /** CCP layout kept for the original debug/QA API. */
  readonly layout: ChamberLayout = CHAMBER_LAYOUT;
  private options: SceneHostOptions = {};
  private fallbackUsed = false;
  private pendingCanvas: HTMLCanvasElement | null = null;
  private pendingEngine: CreatedEngine | null = null;
  private scenarioDef: ScenarioDefinition | null = null;
  private ctx: ScenarioContext = { instances: [], stations: {} };
  /** Instances with a visible glow volume and camera-to-glow segments (limits the opaque depth pass). */
  private depthFocus: { instances: Set<string>; segments: { a: Vector3; b: Vector3 }[] } = { instances: new Set(), segments: [] };
  private lastPreview: PreviewState | null = null;
  private lastFocusInstance: string | null = null;
  private activeTemplateId: string | null = null;
  /** Exploded view shows one frozen snapshot of the scripted state (robot, holders, carrier together). */
  private explodeSnapshot: PreviewState | null = null;
  private lastLodUpdate = 0;

  log(msg: string): void {
    this.logs.push(`${new Date().toISOString()} ${msg}`);
    if (this.logs.length > 200) this.logs.shift();
    console.info(`[PECVD Twin] ${msg}`);
  }

  getLogs(): string[] {
    return this.logs.slice();
  }

  async mount(container: HTMLElement, options: SceneHostOptions = {}): Promise<void> {
    this.container = container;
    this.options = options;
    const store = usePresentationStore.getState();
    const forceWebGL2 = options.forceWebGL2 ?? readForceWebGL2();
    store.setRenderer({ status: "initializing", message: "렌더러 초기화 중…", forceWebGL2 });

    const warnings: string[] = [];
    for (const r of validateAllBundles()) {
      warnings.push(...r.errors.map((e) => `${r.templateId}: ${e}`), ...r.warnings.map((w) => `${r.templateId}: ${w}`));
    }
    store.setDevWarnings(warnings);

    let created: CreatedEngine | null = null;
    const canvas = createCanvas(container, "pecvd-canvas");
    this.pendingCanvas = canvas;
    if (this.disposed) {
      canvas.remove();
      return;
    }
    if (!forceWebGL2) created = await tryCreateWebGPU(canvas, (m) => this.log(m));
    if (this.disposed) {
      created?.engine.dispose();
      canvas.remove();
      return;
    }
    if (!created) {
      try {
        created = tryCreateWebGL2(canvas, (m) => this.log(m));
      } catch (e) {
        canvas.remove();
        store.setRenderer({ status: "error", message: `렌더러를 초기화할 수 없습니다: ${String(e)}`, backend: null });
        return;
      }
    }
    this.pendingEngine = created;
    try {
      await this.buildWorld(created);
      if (this.disposed) {
        this.teardownWorld();
        created.engine.dispose();
        canvas.remove();
        return;
      }
    } catch (e) {
      if (this.disposed) {
        this.teardownWorld();
        try {
          created.engine.dispose();
        } catch {
          /* ignore */
        }
        canvas.remove();
        return;
      }
      this.log(`장면 구성 실패 (${created.backend}): ${String(e)}`);
      if (created.backend === "webgpu" && !this.fallbackUsed) {
        this.fallbackUsed = true;
        this.teardownWorld();
        try {
          created.engine.dispose();
        } catch {
          /* ignore */
        }
        created.canvas.remove();
        const canvas2 = createCanvas(container, "pecvd-canvas");
        this.pendingCanvas = canvas2;
        let wgl: CreatedEngine;
        try {
          wgl = tryCreateWebGL2(canvas2, (m) => this.log(m));
        } catch (e2) {
          canvas2.remove();
          store.setRenderer({ status: "error", message: `WebGPU 실패 후 WebGL2도 초기화할 수 없습니다: ${String(e2)}`, backend: null, fallbackReason: String(e) });
          return;
        }
        this.pendingEngine = wgl;
        try {
          await this.buildWorld(wgl);
          if (this.disposed) {
            this.teardownWorld();
            wgl.engine.dispose();
            canvas2.remove();
            return;
          }
          usePresentationStore.getState().setRenderer({ status: "fallback", fallbackReason: `WebGPU 장면 구성 실패: ${String(e)}` });
        } catch (e3) {
          this.teardownWorld();
          store.setRenderer({ status: "error", message: `장면 구성 실패 (WebGL2): ${String(e3)}`, backend: null, fallbackReason: String(e) });
        }
        return;
      }
      this.teardownWorld();
      store.setRenderer({ status: "error", message: `장면 구성 실패: ${String(e)}`, backend: null });
    }
  }

  private instanceDefs(): EquipmentInstanceDef[] {
    return this.options.fixture ? (instanceFixture(this.options.fixture) ?? DEFAULT_INSTANCES) : DEFAULT_INSTANCES;
  }

  private async buildWorld(created: CreatedEngine): Promise<void> {
    const store = usePresentationStore.getState();
    const { engine } = created;
    const isWebGPU = created.backend === "webgpu";
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.914, 0.929, 0.949, 1);
    scene.ambientColor = new Color3(0.02, 0.02, 0.02);
    scene.useRightHandedSystem = false;
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    const camera = new ArcRotateCamera("camera", 240 * (Math.PI / 180), 66 * (Math.PI / 180), 1.75, new Vector3(0, 0.12, 0), scene);
    camera.minZ = 0.02;
    camera.maxZ = 80;
    camera.lowerRadiusLimit = 0.06;
    camera.upperRadiusLimit = 18;
    camera.wheelDeltaPercentage = 0.02;
    camera.pinchDeltaPercentage = 0.02;
    camera.panningSensibility = 2500;
    camera.angularSensibilityX = 900;
    camera.angularSensibilityY = 900;
    camera.inertia = 0.82;
    camera.panningInertia = 0.82;
    camera.allowUpsideDown = false;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = Math.PI - 0.05;
    camera.useNaturalPinchZoom = true;
    camera.attachControl(created.canvas, true);

    const env = await createCleanroomEnvironment(scene);
    const textures = createProceduralTextures(scene);
    const materials = new MaterialLibrary(scene, textures);
    const lighting = new LightingRig(scene, env);

    const instances = new Map<string, EquipmentInstance>();
    const defs = this.instanceDefs();
    const t0 = performance.now();
    for (const def of defs) {
      const bundle = getBundle(def.templateId);
      if (!bundle) {
        this.log(`알 수 없는 template ${def.templateId} (instance ${def.instanceId}) - 건너뜀`);
        continue;
      }
      const inst = new EquipmentInstance(scene, def, bundle, materials, lighting.shadow);
      instances.set(def.instanceId, inst);
    }
    this.log(`Equipment 생성 ${instances.size}개 (${defs.map((d) => d.templateId).join(", ")}), ${(performance.now() - t0).toFixed(0)} ms, meshes=${scene.meshes.length}`);

    // Station world frames (load ports) for carrier placement and the OHT evaluator
    const stations: Record<string, StationWorldFrame> = {};
    for (const inst of instances.values()) {
      const st = inst.bundle.template.station;
      if (!st) continue;
      inst.root.computeWorldMatrix(true);
      const seat = Vector3.TransformCoordinates(new Vector3(st.seatLocal[0], st.seatLocal[1], st.seatLocal[2]), inst.root.getWorldMatrix());
      const yaw = inst.root.rotation.y;
      const dfx = st.doorFacingLocal[0] * Math.cos(yaw) + st.doorFacingLocal[2] * Math.sin(yaw);
      const dfz = -st.doorFacingLocal[0] * Math.sin(yaw) + st.doorFacingLocal[2] * Math.cos(yaw);
      const stationId = `LP.${inst.def.instanceId}`;
      stations[stationId] = { stationId, instanceId: inst.def.instanceId, seatWorld: [seat.x, seat.y, seat.z], yawRad: Math.atan2(dfx, dfz), doorFacing: [dfx, 0, dfz] };
    }
    this.ctx = { instances: defs.filter((d) => instances.has(d.instanceId)), stations };

    // Effects (after the station frames exist: the OHT overlay draws the station regions on its rail)
    for (const inst of instances.values()) {
      let stationMarkers: { s: number; seatY: number; label: string }[] | undefined;
      if (inst.bundle.pathPose) {
        inst.root.computeWorldMatrix(true);
        const inv = inst.root.getWorldMatrix().clone().invert();
        stationMarkers = Object.values(stations).map((st) => {
          const local = Vector3.TransformCoordinates(new Vector3(st.seatWorld[0], st.seatWorld[1], st.seatWorld[2]), inv);
          const L = inst.bundle.layout as { rail?: { z0: number } };
          return { s: local.z - (L.rail?.z0 ?? 0), seatY: local.y, label: st.instanceId };
        });
      }
      inst.effects = createEffects(inst.templateId, { scene, instance: inst, materials, isWebGPU, visual: store.visual, stationMarkers });
    }

    // Bay extents (for the overview camera and the floor)
    let bayCenter = new Vector3(0, 0, 0);
    let bayRadius = 2.5;
    {
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const inst of instances.values()) {
        if (inst.def.mobile) continue;
        const b = inst.worldBoundsAll();
        if (!b) continue;
        min.minimizeInPlace(b.min);
        max.maximizeInPlace(b.max);
      }
      if (Number.isFinite(min.x)) {
        bayCenter = min.add(max).scale(0.5);
        bayRadius = Math.max(2.5, Vector3.Distance(min, max) * 0.5);
      }
    }

    // Ground plane for grounding shadows (fab floor)
    const floorY = floorTopY(this.layout.cfg);
    const ground = new Mesh("ground", scene);
    applyMeshData(ground, revolveProfile(rectProfile(0, Math.max(4.5, bayRadius * 2.2), floorY - 0.01, floorY), { segments: 96 }));
    ground.position.set(bayCenter.x, 0, bayCenter.z);
    const groundMat = new PBRMaterial("mat.ground", scene);
    groundMat.albedoColor = new Color3(0.12, 0.125, 0.14);
    groundMat.metallic = 0;
    groundMat.roughness = 0.9;
    groundMat.environmentIntensity = 0.5;
    ground.material = groundMat;
    ground.receiveShadows = true;
    ground.isPickable = false;
    ground.metadata = { isGround: true };

    // Plasma glow approximation targets: nearby interior surfaces of each deposition instance
    const litMeshes: AbstractMesh[] = [];
    for (const inst of instances.values()) {
      for (const id of inst.bundle.plasmaLitAssets ?? []) for (const m of inst.meshesByAsset.get(id) ?? []) litMeshes.push(m);
    }
    lighting.setPlasmaLitMeshes(litMeshes);
    lighting.key.shadowMaxZ = Math.max(6, bayRadius * 4);

    // Opaque depth for the plasma ray march
    const depth = scene.enableDepthRenderer(camera, false, true, Constants.TEXTURE_NEAREST_SAMPLINGMODE, true);
    depth.useOnlyInActiveCamera = true;
    const depthMap = depth.getDepthMap();
    depthMap.renderListPredicate = (m: AbstractMesh) => {
      const meta = m.metadata as (InstanceMeshMetadata & { isOverlay?: boolean; isGround?: boolean }) | undefined;
      if (!m.isEnabled() || !m.isVisible) return false;
      if (meta?.isPlasma || meta?.isOverlay) return false;
      const mat = m.material;
      if (mat && mat.needAlphaBlending()) return false;
      // only what can hide a glow volume: the meshes of the tool that owns it, and anything between the camera and it
      const focus = this.depthFocus;
      if (meta?.instanceId && focus.instances.has(meta.instanceId)) return true;
      const bs = m.getBoundingInfo().boundingSphere;
      for (const seg of focus.segments) if (segmentSphereHit(seg.a, seg.b, bs.centerWorld, bs.radiusWorld)) return true;
      return false;
    };
    for (const inst of instances.values()) for (const p of inst.effects?.plasmas ?? []) p.setDepthTexture(depthMap);

    // Backdrop sphere: an explicit unlit background so both backends produce the same tone-mapped color.
    const backdrop = new Mesh("backdrop", scene);
    applyMeshData(backdrop, revolveProfile(backdropProfile(Math.max(18, bayRadius * 6)), { segments: 48, caps: false }));
    backdrop.position.set(bayCenter.x, 0, bayCenter.z);
    const backdropMat = new PBRMaterial("mat.backdrop", scene);
    backdropMat.unlit = true;
    backdropMat.albedoColor = new Color3(0.93, 0.945, 0.965);
    backdropMat.backFaceCulling = false;
    backdrop.material = backdropMat;
    backdrop.isPickable = false;
    backdrop.receiveShadows = false;
    backdrop.infiniteDistance = false;
    backdrop.metadata = { isGround: true };

    const pipeline = new RenderPipeline(scene, camera, true);
    const highlight = new HighlightLayer("hl", scene, { blurHorizontalSize: 0.9, blurVerticalSize: 0.9, mainTextureRatio: 0.75 });
    highlight.innerGlow = false;
    highlight.outerGlow = true;
    // Transparent effect meshes must not touch the highlight stencil, otherwise the glow leaks into their footprint.
    for (const inst of instances.values()) for (const m of inst.effects?.excludedMeshes() ?? []) highlight.addExcludedMesh(m);
    highlight.addExcludedMesh(backdrop);

    const picking = new PickingController(scene, {
      onSelect: (res) => {
        const s = usePresentationStore.getState();
        if (res) {
          if (res.instanceId !== s.activeInstanceId) s.setActiveInstance(res.instanceId);
          s.select(res.assetId);
        } else s.select(null);
      },
      onHover: (res) => usePresentationStore.getState().hover(res ? res.assetId : null),
    });

    const labels = new LabelsOverlay(this.container!, scene);
    const markers = new MeasurementOverlay(scene);

    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    resizeObserver.observe(this.container!);

    const instrumentation = new SceneInstrumentation(scene);
    const lodCenters = new Map<string, Vector3>();
    for (const inst of instances.values()) {
      if (inst.def.mobile) continue;
      const b = inst.worldBoundsAll();
      if (b) lodCenters.set(inst.def.instanceId, b.center.clone());
    }
    // bay surroundings with utility drops to every placed tool's facility interface
    const drops: FacilityDrop[] = [];
    for (const inst of instances.values()) {
      const fi = inst.bundle.facilityInterface?.(inst.bundle.layout);
      if (fi && !inst.def.mobile) drops.push(facilityDropFor(inst.def.instanceId, inst.def.position, inst.def.rotationYDeg, fi));
    }
    const environment = new FabEnvironment(scene, materials, floorY, drops);
    this.world = { created, scene, camera, env, textures, materials, lighting, instances, stations, depth, pipeline, highlight, picking, labels, markers, ground, backdrop, resizeObserver, bayCenter, bayRadius, instrumentation, lodCenters, environment };

    // Report loaded instances and pick a valid active instance / scenario
    const info: LoadedInstanceInfo[] = Array.from(instances.values()).map((i) => ({
      instanceId: i.def.instanceId,
      templateId: i.templateId,
      displayName: i.def.displayName,
      familyLabel: FAMILY_LABEL[i.bundle.template.family] ?? i.bundle.template.family,
      mobile: !!i.def.mobile,
    }));
    store.reportInstances(info);
    if (!instances.has(store.activeInstanceId)) {
      const first = info.find((i) => !i.mobile) ?? info[0];
      if (first) store.setActiveInstance(first.instanceId);
    }
    this.ensureScenario(usePresentationStore.getState());

    // Initial state application
    this.lastState = null;
    this.applyState(usePresentationStore.getState(), true);
    this.quality.reset(usePresentationStore.getState().effectiveQuality);

    // Readiness: wait for materials/shaders including the plasma shader; failures propagate to fallback.
    await Promise.race([
      scene.whenReadyAsync(true),
      new Promise((_, rej) => setTimeout(() => rej(new Error("scene ready timeout (20 s)")), 20000)),
    ]);
    for (const inst of instances.values()) {
      for (const p of inst.effects?.plasmas ?? []) await p.material.forceCompilationAsync(p.mesh);
    }
    this.log(`장면 준비 완료 (${created.backend}), meshes=${scene.meshes.length}, materials=${scene.materials.length}`);

    this.unsubscribe = usePresentationStore.subscribe((s) => this.applyState(s, false));
    this.clock.play();
    engine.runRenderLoop(() => this.renderFrame());

    usePresentationStore.getState().setRenderer({
      status: this.fallbackUsed ? "fallback" : "ready",
      backend: created.backend,
      gpu: created.gpuDescription,
      message: null,
    });
    (window as unknown as { __pecvdTwin?: unknown }).__pecvdTwin = this.debugApi();
  }

  private teardownWorld(): void {
    const w = this.world;
    if (!w) return;
    this.world = null;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    try {
      w.created.engine.stopRenderLoop();
    } catch {
      /* ignore */
    }
    w.resizeObserver.disconnect();
    w.instrumentation.dispose();
    w.picking.dispose();
    w.labels.dispose();
    w.markers.dispose();
    for (const i of w.instances.values()) i.dispose();
    w.highlight.dispose();
    w.pipeline.dispose();
    w.lighting.dispose();
    w.materials.dispose();
    w.textures.dispose();
    w.env.dispose();
    w.ground.dispose(false, true);
    w.environment.dispose();
    w.backdrop.dispose(false, true);
    w.scene.dispose();
  }

  dispose(): void {
    this.disposed = true;
    if (this.cutawayTimer !== null) window.clearTimeout(this.cutawayTimer);
    const created = this.world?.created ?? this.pendingEngine;
    this.teardownWorld();
    if (created) {
      try {
        created.engine.dispose();
      } catch {
        /* ignore */
      }
      created.canvas.remove();
    }
    this.pendingCanvas?.remove();
    this.pendingCanvas = null;
    this.pendingEngine = null;
    const g = window as unknown as { __pecvdTwin?: { host?: unknown } };
    if (g.__pecvdTwin?.host === this) delete g.__pecvdTwin;
  }

  // ------------------------------------------------------------------ scenario

  /** Make sure the store's scenario is runnable with the loaded instances; fall back to the active template's standalone. */
  private ensureScenario(s: PresentationState): void {
    const w = this.world;
    if (!w) return;
    let def = getScenario(s.scenarioId);
    const loaded = this.ctx.instances;
    const runnable = (d: ScenarioDefinition | undefined) => !!d && d.requiredInstanceIds.every((id) => w.instances.has(id)) && d.requiredTemplateIds.every((t) => loaded.some((i) => i.templateId === t));
    if (!runnable(def)) {
      const active = w.instances.get(s.activeInstanceId);
      def = (active && standaloneScenarioFor(active.templateId)) || undefined;
      if (!runnable(def)) def = undefined;
      if (def && def.id !== s.scenarioId) {
        const id = def.id;
        queueMicrotask(() => usePresentationStore.getState().setScenario(id));
      }
    }
    if (def && def !== this.scenarioDef) this.switchScenario(def);
  }

  private switchScenario(def: ScenarioDefinition): void {
    this.scenarioDef = def;
    this.clock.configure(def.scenario.durationSec, holdPointSec(def.scenario), true);
    this.frozenTime = null;
    this.lastFocusInstance = null;
    // an exploded view keeps one frozen snapshot: take it again from the new scenario
    this.explodeSnapshot = null;
    this.log(`Scenario: ${def.id} (${def.kind}, ${def.scenario.durationSec} s)`);
  }

  get scenario(): ScenarioDefinition | null {
    return this.scenarioDef;
  }

  // ------------------------------------------------------------------ state application

  private activeInstance(s: PresentationState): EquipmentInstance | null {
    return this.world?.instances.get(s.activeInstanceId) ?? null;
  }

  private activeBundle(s: PresentationState): EquipmentBundle<unknown> | null {
    return this.activeInstance(s)?.bundle ?? null;
  }

  private applyState(s: PresentationState, force: boolean): void {
    const w = this.world;
    if (!w) return;
    const prev = this.lastState;
    this.lastState = s;
    const changed = <K extends keyof PresentationState>(k: K) => force || !prev || prev[k] !== s[k];

    if (changed("activeInstanceId")) {
      const inst = this.activeInstance(s);
      const templateId = inst?.templateId ?? null;
      if (templateId && templateId !== this.activeTemplateId) {
        this.activeTemplateId = templateId;
        const b = inst!.bundle;
        // a different template reads best with its own default sector; same-template switches keep the user's sector.
        // Both defaults below are queued: a cutaway or scenario set explicitly in the same tick wins over them.
        if (!force) {
          const { azimuthDeg, sweepDeg } = s.cutaway;
          queueMicrotask(() => {
            const st = usePresentationStore.getState();
            if (st.cutaway.azimuthDeg === azimuthDeg && st.cutaway.sweepDeg === sweepDeg) st.setCutaway({ azimuthDeg: b.cutawayDefault.azimuthDeg, sweepDeg: b.cutawayDefault.sweepDeg });
          });
        }
        // standalone demonstrations follow the active equipment
        const cur = this.scenarioDef;
        if (!inst?.def.mobile && cur && cur.kind === "standalone" && cur.templateId !== templateId) {
          const next = standaloneScenarioFor(templateId);
          const picked = s.scenarioId;
          if (next)
            queueMicrotask(() => {
              const st = usePresentationStore.getState();
              if (st.scenarioId === picked) st.setScenario(next.id);
            });
        }
      }
      w.markers.setInstance(inst, inst ? (measurementIndex(inst.templateId) ?? null) : null);
      w.markers.setVisible(s.overlays.markers && !s.overview, s.selectedMeasurement);
    }
    if (changed("scenarioId")) this.ensureScenario(s);

    const modeKey = `${s.viewMode}:${s.overview}`;
    const prevModeKey = prev ? `${prev.viewMode}:${prev.overview}` : "";
    const modeChanged = force || modeKey !== prevModeKey;
    const viewMode = s.overview ? "assembled" : s.viewMode;

    if (modeChanged || changed("cutaway") || changed("activeInstanceId") || changed("carrierSection")) this.scheduleCutaway(s, force || modeChanged || changed("activeInstanceId") || changed("carrierSection"));
    if (modeChanged || changed("explodeAmount") || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) inst.applyExplode(s.explodeAmount, viewMode === "exploded" && id === s.activeInstanceId);
    }
    if (modeChanged || changed("xrayOpacity") || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) inst.applyXray(viewMode === "xray" && id === s.activeInstanceId, s.xrayOpacity);
    }
    if (changed("coverMode") || modeChanged || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) inst.setCoversRemoved(this.coversRemovedFor(s, id));
    }
    if (changed("hiddenAssets") || changed("isolatedAssetId") || modeChanged || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) {
        const active = id === s.activeInstanceId;
        inst.applyVisibility(active ? new Set(s.hiddenAssets) : new Set(), active ? s.isolatedAssetId : null, active && viewMode === "exploded");
      }
      this.refreshHighlight(s);
    }
    if (changed("selectedAssetId") || changed("hoveredAssetId") || changed("activeInstanceId")) this.refreshHighlight(s);
    if (changed("lightingPreset")) w.lighting.setPreset(s.lightingPreset);
    if (changed("qualityPreset") || changed("effectiveQuality")) this.applyQuality(s);
    if (changed("overlays") || modeChanged || changed("activeInstanceId") || changed("selectedMeasurement")) {
      w.labels.setVisible(s.overlays.labels || s.overview);
      this.refreshLabels(s);
      w.markers.setVisible(s.overlays.markers && !s.overview, s.selectedMeasurement);
    }
    if (changed("requests")) {
      const r = s.requests;
      const p = prev?.requests;
      if (!p || r.resetCamera !== p.resetCamera) this.resetCamera();
      if (!p || r.focusSelected !== p.focusSelected) this.focusSelected(s);
      if (!p || r.focusInstance !== p.focusInstance) this.focusInstance(s);
      if ((!p || r.cameraPreset !== p.cameraPreset) && s.cameraPresetId) this.applyCameraPreset(s.cameraPresetId);
      if (p && r.focusCarrier !== p.focusCarrier) this.focusCarrier();
    }
  }

  /** Cover display rule: auto = removed on the active tool outside the bay overview (display only). */
  private coversRemovedFor(s: PresentationState, instanceId: string): boolean {
    if (s.coverMode === "closed") return false;
    if (s.coverMode === "removed") return true;
    return instanceId === s.activeInstanceId && !s.overview;
  }

  private scheduleCutaway(s: PresentationState, immediate: boolean): void {
    const bundle = this.activeBundle(s);
    const keepOuts = bundle?.cutawayKeepOuts ?? [];
    const enabled = s.viewMode === "cutaway" && !s.overview;
    const resolved = resolveCutaway({ enabled, azimuthDeg: s.cutaway.azimuthDeg, sweepDeg: s.cutaway.sweepDeg }, keepOuts);
    this.pendingCut = resolved;
    if (this.cutawayTimer !== null) window.clearTimeout(this.cutawayTimer);
    const run = () => {
      this.cutawayTimer = null;
      const cut = this.pendingCut;
      if (!cut || !this.world) return;
      const t = performance.now();
      for (const [id, inst] of this.world.instances) inst.applyCutaway(this.cutFor(id, inst, cut, s));
      this.appliedCut = cut;
      const dt = performance.now() - t;
      if (dt > 5) this.log(`cutaway 적용 ${dt.toFixed(0)} ms (${cut.enabled ? `${cut.effectiveAzimuthDeg.toFixed(0)}° / ${cut.effectiveSweepDeg.toFixed(0)}°` : "off"})`);
      usePresentationStore.getState().reportCutaway(cut.effectiveAzimuthDeg, cut.effectiveSweepDeg, cut.snapped);
      this.refreshHighlight(usePresentationStore.getState());
    };
    if (immediate) run();
    else this.cutawayTimer = window.setTimeout(run, 90);
  }

  /**
   * Cut of one instance: the active one follows the cutaway view; carriers keep their own section (the
   * template's default sector) while the FOUP section view is on, whichever tool is active.
   */
  private cutFor(id: string, inst: EquipmentInstance, activeCut: ResolvedCutaway, s: PresentationState): ResolvedCutaway {
    if (id === s.activeInstanceId && activeCut.enabled) return activeCut;
    const b = inst.bundle;
    if (s.carrierSection && b.carrierSlots) return resolveCutaway({ enabled: true, azimuthDeg: b.cutawayDefault.azimuthDeg, sweepDeg: b.cutawayDefault.sweepDeg }, b.cutawayKeepOuts);
    return NO_CUT;
  }

  private refreshHighlight(s: PresentationState): void {
    const w = this.world;
    if (!w) return;
    w.highlight.removeAllMeshes();
    const inst = this.activeInstance(s);
    if (!inst) return;
    if (s.hoveredAssetId && s.hoveredAssetId !== s.selectedAssetId) {
      for (const m of inst.highlightMeshes(s.hoveredAssetId)) w.highlight.addMesh(m, new Color3(0.36, 0.56, 0.95));
    }
    if (s.selectedAssetId) {
      for (const m of inst.highlightMeshes(s.selectedAssetId)) w.highlight.addMesh(m, new Color3(0.11, 0.37, 0.82));
    }
  }

  private refreshLabels(s: PresentationState): void {
    const w = this.world;
    if (!w) return;
    if (s.overview) {
      // equipment-level labels for the bay overview
      w.labels.setItems(
        Array.from(w.instances.values())
          .filter((inst) => !inst.def.mobile)
          .map((inst, i) => ({
            id: `instance:${inst.def.instanceId}`,
            text: `${inst.def.displayName}`,
            priority: 20 - i,
            anchor: () => {
              const b = inst.worldBoundsAll();
              return b ? new Vector3(b.center.x, b.max.y + 0.05, b.center.z) : null;
            },
            ownMeshes: () => new Set<AbstractMesh>(inst.allMeshes),
          })),
      );
      return;
    }
    const inst = this.activeInstance(s);
    if (!inst) {
      w.labels.setItems([]);
      return;
    }
    const items = inst.components
      .filter((c) => c.label && c.label.priority > 0)
      .map((c) => ({
        id: c.assetId,
        text: c.label!.text,
        priority: c.label!.priority,
        anchor: () => {
          if (c.kind === "effect") {
            const plasma = inst.plasma;
            if (!plasma || !plasma.mesh.isEnabled()) return null;
            const center = inst.bundle.plasmaCenter ? inst.bundle.plasmaCenter(inst.bundle.layout) : (inst.bundle.layout as ChamberLayout).plasma?.center;
            if (!center) return null;
            return Vector3.TransformCoordinates(new Vector3(center[0], center[1], center[2]), inst.root.getWorldMatrix());
          }
          const b = inst.worldBounds(c.assetId);
          if (!b) return null;
          if (c.assetId === "chamber_body") return new Vector3(b.center.x, b.max.y - 0.05, b.center.z);
          return b.center;
        },
        ownMeshes: () => new Set<AbstractMesh>(inst.meshesByAsset.get(c.assetId) ?? []),
      }));
    w.labels.setItems(items);
  }

  private applyQuality(s: PresentationState): void {
    const w = this.world;
    if (!w) return;
    const effective = s.qualityPreset === "auto" ? s.effectiveQuality : s.qualityPreset;
    if (effective !== s.effectiveQuality) usePresentationStore.getState().reportEffectiveQuality(effective);
    const q = QUALITY[effective];
    w.pipeline.apply(q, w.created.engine, window.devicePixelRatio || 1);
    w.lighting.setShadowMapSize(q.shadowMapSize);
    this.quality.reset(effective);
  }

  // ------------------------------------------------------------------ camera

  /** Presets of the active equipment plus the bay overview. */
  presetsFor(instanceId: string): CameraPreset[] {
    const inst = this.world?.instances.get(instanceId);
    const own = inst ? inst.bundle.cameraPresets : cameraPresets(this.layout);
    return [...own, { id: "bay-overview", label: "FAB bay overview", labelKo: "Bay 전체 (네 장비 + rail)", alpha: 215 * DEG, beta: 58 * DEG, radius: 1, target: [0, 0, 0] }];
  }

  private applyCameraPreset(id: string): void {
    const w = this.world;
    if (!w) return;
    const s = usePresentationStore.getState();
    if (id === "bay-overview") {
      w.camera.interpolateTo(215 * DEG, 58 * DEG, Math.max(6, w.bayRadius * 2.1), new Vector3(w.bayCenter.x, w.bayCenter.y + 0.2, w.bayCenter.z));
      return;
    }
    const inst = this.activeInstance(s);
    const preset = (inst ? inst.bundle.cameraPresets : cameraPresets(this.layout)).find((p) => p.id === id);
    if (!preset) return;
    const target = new Vector3(preset.target[0], preset.target[1], preset.target[2]);
    const worldTarget = inst ? Vector3.TransformCoordinates(target, inst.root.getWorldMatrix()) : target;
    const alpha = preset.alpha + (inst ? inst.root.rotation.y : 0);
    w.camera.interpolateTo(alpha, preset.beta, preset.radius, worldTarget);
  }

  resetCamera(): void {
    const s = usePresentationStore.getState();
    if (s.overview) {
      this.applyCameraPreset("bay-overview");
      return;
    }
    const inst = this.activeInstance(s);
    this.applyCameraPreset(inst ? inst.bundle.overviewPresetId : "overview");
  }

  private focusInstance(s: PresentationState): void {
    const inst = this.activeInstance(s);
    if (!inst) return;
    if (inst.def.mobile) {
      const b = inst.worldBoundsAll();
      if (b && this.world) this.world.camera.interpolateTo(this.world.camera.alpha, this.world.camera.beta, Math.max(1.2, Vector3.Distance(b.min, b.max) * 1.8), b.center);
      return;
    }
    this.applyCameraPreset(inst.bundle.overviewPresetId);
  }

  /** Camera to the carrier from the side its section opens to (the carrier's "section" preset); the active tool and view stay. */
  private focusCarrier(): void {
    const w = this.world;
    const inst = w ? Array.from(w.instances.values()).find((i) => i.bundle.carrierSlots) : undefined;
    if (!w || !inst) return;
    const preset = inst.bundle.cameraPresets.find((p) => p.id === "section") ?? inst.bundle.cameraPresets[0];
    if (!preset) return;
    inst.root.computeWorldMatrix(true);
    const m = inst.root.getWorldMatrix();
    const target = Vector3.TransformCoordinates(new Vector3(preset.target[0], preset.target[1], preset.target[2]), m);
    // preset direction in the carrier frame, turned into world alpha / beta with the carrier's pose
    const local = new Vector3(Math.cos(preset.alpha) * Math.sin(preset.beta), Math.cos(preset.beta), Math.sin(preset.alpha) * Math.sin(preset.beta));
    const d = Vector3.TransformNormal(local, m).normalize();
    w.camera.interpolateTo(Math.atan2(d.z, d.x), Math.acos(Math.min(1, Math.max(-1, d.y))), preset.radius, target);
  }

  private focusSelected(s: PresentationState): void {
    const w = this.world;
    const inst = this.activeInstance(s);
    if (!w || !inst) return;
    if (s.selectedMeasurement) {
      const p = w.markers.worldPosition(s.selectedMeasurement);
      if (p) {
        w.camera.interpolateTo(w.camera.alpha, w.camera.beta, 0.5, p);
        return;
      }
    }
    if (!s.selectedAssetId) return;
    const comp = inst.components.find((c) => c.assetId === s.selectedAssetId);
    if (comp?.kind === "effect" && inst.plasma) {
      const center = inst.bundle.plasmaCenter ? inst.bundle.plasmaCenter(inst.bundle.layout) : (inst.bundle.layout as ChamberLayout).plasma?.center;
      if (!center) return;
      const t = Vector3.TransformCoordinates(new Vector3(center[0], center[1], center[2]), inst.root.getWorldMatrix());
      w.camera.interpolateTo(w.camera.alpha, w.camera.beta, 0.45, t);
      return;
    }
    const b = inst.worldBounds(s.selectedAssetId);
    if (!b) return;
    const extent = Vector3.Distance(b.min, b.max);
    const radius = Math.min(Math.max(extent * 1.6, 0.18), 3.5);
    w.camera.interpolateTo(w.camera.alpha, w.camera.beta, radius, b.center);
  }

  /** Programmatic camera for QA screenshots (world frame). */
  setCamera(alphaDeg: number, betaDeg: number, radius: number, target: [number, number, number]): void {
    const w = this.world;
    if (!w) return;
    // setTarget rebuilds alpha/beta/radius from the current position, so set the angles afterwards;
    // a running preset interpolation must not override a programmatic camera.
    (w.camera as unknown as { _isInterpolating: boolean })._isInterpolating = false;
    w.camera.setTarget(new Vector3(target[0], target[1], target[2]));
    w.camera.alpha = alphaDeg * (Math.PI / 180);
    w.camera.beta = betaDeg * (Math.PI / 180);
    w.camera.radius = radius;
  }

  /** Programmatic camera in the frame of an instance (QA): target is given in the instance frame. */
  setCameraLocal(instanceId: string, alphaDeg: number, betaDeg: number, radius: number, target: [number, number, number]): void {
    const w = this.world;
    const inst = w?.instances.get(instanceId);
    if (!w || !inst) return;
    inst.root.computeWorldMatrix(true);
    const t = Vector3.TransformCoordinates(new Vector3(target[0], target[1], target[2]), inst.root.getWorldMatrix());
    (w.camera as unknown as { _isInterpolating: boolean })._isInterpolating = false;
    w.camera.setTarget(t);
    w.camera.alpha = alphaDeg * (Math.PI / 180) + inst.root.rotation.y;
    w.camera.beta = betaDeg * (Math.PI / 180);
    w.camera.radius = radius;
  }

  // ------------------------------------------------------------------ frame

  private applyPreview(preview: PreviewState, s: PresentationState, effectTime: number): void {
    const w = this.world!;
    const presetColor = colorPresetById(s.visual.colorPreset);
    const q = QUALITY[s.effectiveQuality];
    const viewMode = s.overview ? "assembled" : s.viewMode;
    const overlays = s.overlays as unknown as Record<string, boolean>;
    for (const [id, inst] of w.instances) {
      let ip = preview.instances[id];
      const active = id === s.activeInstanceId && !s.overview;
      // carriers show one wafer per occupied slot (slot map); the single presentation rule below is for tools
      const cp = inst.def.mobile ? preview.carriers[id] : undefined;
      if (ip) {
        // sector cutaway: the removed sector must not turn with spinning revolved parts
        if (active && viewMode === "cutaway" && inst.joints.some((j) => j.freezeInCutaway)) {
          const joints = { ...ip.joints };
          for (const j of inst.joints) if (j.freezeInCutaway) joints[j.jointId] = 0;
          ip = { ...ip, joints };
        }
        inst.applyJoints(ip.joints);
        if (inst.bundle.pathPose) {
          for (const j of inst.joints) {
            if (j.kind !== "path") continue;
            const pose = inst.bundle.pathPose(inst.bundle.layout, j.jointId, ip.joints[j.jointId] ?? 0);
            inst.setPathPose(j.jointId, pose.position, pose.yawRad);
          }
        }
        const st = inst.bundle.template.station;
        const all = inst.bundle.template.waferPresentationAssetIds ?? st?.waferPresentationAssetIds ?? (st ? [st.waferPresentationAssetId] : []);
        if (all.length) {
          const shown = ip.presentedWaferId ? (ip.presentedWaferAssetId ?? st?.waferPresentationAssetId ?? all[0]) : null;
          inst.setPreviewHidden(cp ? new Set() : new Set(all.filter((a) => a !== shown)));
        }
      }
      // mobile carriers follow their presented holder (one mesh entity, world pose set directly)
      if (cp) this.placeCarrier(inst, cp);
      if (inst.bundle.carrierSlots) inst.setPresentKeys(cp ? new Set(Object.keys(cp.slots).filter((k) => cp.slots[k])) : new Set());
      inst.effects?.update({
        preview: ip ?? { instanceId: id, joints: {}, effects: {}, flags: {}, presentedWaferId: null, phaseLabelKo: "" },
        active,
        viewMode,
        overlays,
        effectTime,
        cut: active ? this.appliedCut : NO_CUT,
        plasmaSteps: active ? q.plasmaSteps : Math.min(q.plasmaSteps, 20),
        camera: w.camera,
        visual: s.visual,
        color: presetColor,
        debugDepth: !!this.options.plasmaDebugDepth,
        flipDepthY: !!this.options.flipDepthY,
      });
      if (active && inst.plasma) {
        const center = inst.bundle.plasmaCenter ? inst.bundle.plasmaCenter(inst.bundle.layout) : ((inst.bundle.layout as ChamberLayout).plasma?.center ?? [0, 0, 0]);
        const cw = Vector3.TransformCoordinates(new Vector3(center[0], center[1], center[2]), inst.root.getWorldMatrix());
        const intensity = ip?.effects.plasmaIntensity ?? 0;
        const lightOn = s.visual.plasmaLightEnabled && s.visual.plasmaVisible && viewMode !== "exploded";
        w.lighting.updatePlasmaLight(cw, intensity * s.visual.glowIntensity, presetColor.core, lightOn);
      }
    }
    if (!w.instances.get(s.activeInstanceId)?.plasma || s.overview) w.lighting.updatePlasmaLight(Vector3.Zero(), 0, presetColor.core, false);
  }

  private placeCarrier(inst: EquipmentInstance, cp: { holder: { kind: "station" | "gripper"; id: string }; yawFromStationId?: string; dockOffset?: number }): void {
    const w = this.world!;
    const frames = inst.bundle.carrierFrames ?? { seatLocal: [0, 0, 0], flangeLocal: [0, 0.3, 0], doorFacingLocal: [0, 0, 1] };
    const doorYawLocal = Math.atan2(frames.doorFacingLocal[0], frames.doorFacingLocal[2]);
    if (cp.holder.kind === "station") {
      const st = w.stations[cp.holder.id];
      if (!st) return;
      // docking slides the FOUP toward the tool along the door-facing direction (0 at OHT handoffs)
      const dk = cp.dockOffset ?? 0;
      inst.root.position.set(st.seatWorld[0] + st.doorFacing[0] * dk - frames.seatLocal[0], st.seatWorld[1] - frames.seatLocal[1], st.seatWorld[2] + st.doorFacing[2] * dk - frames.seatLocal[2]);
      inst.root.rotation.y = st.yawRad - doorYawLocal;
      return;
    }
    const oht = w.instances.get(cp.holder.id);
    const attach = oht?.bundle.carrierAttach;
    if (!oht || !attach) return;
    const seatWorld = oht.worldPoint(attach.seatLocal, attach.jointId);
    const yawStation = cp.yawFromStationId ? w.stations[cp.yawFromStationId] : undefined;
    const yaw = yawStation ? yawStation.yawRad : oht.root.rotation.y;
    inst.root.position.set(seatWorld.x - frames.seatLocal[0], seatWorld.y - frames.seatLocal[1], seatWorld.z - frames.seatLocal[2]);
    inst.root.rotation.y = yaw - doorYawLocal;
  }

  private renderFrame(): void {
    const w = this.world;
    if (!w || this.disposed) return;
    const s = usePresentationStore.getState();
    const now = performance.now();
    const time = this.frozenTime ?? this.clock.tick(now);
    // effect time keeps running while the playhead holds in the stable phase
    const animTime = this.frozenTime ?? this.clock.effectTimeSec;
    const def = this.scenarioDef;
    const effectTime = animTime * s.visual.animationSpeed;
    let preview: PreviewState | null = null;
    if (def) {
      preview = def.evaluate(time, s.visual.visualSeed, animTime, this.ctx);
      // exploded: robot joints, wafer holders and the carrier stay on one frozen snapshot; leaving the
      // view applies the current evaluator state again
      const exploded = s.viewMode === "exploded" && !s.overview;
      if (exploded) {
        if (!this.explodeSnapshot) this.explodeSnapshot = preview;
        preview = this.explodeSnapshot;
      } else this.explodeSnapshot = null;
      this.lastPreview = preview;
      this.applyPreview(preview, s, effectTime);
      // linked demonstrations: follow the phase focus (active equipment + camera)
      if (def.kind === "linked" && s.followPhase && preview.phaseFocusInstanceId && preview.phaseFocusInstanceId !== this.lastFocusInstance) {
        this.lastFocusInstance = preview.phaseFocusInstanceId;
        if (w.instances.has(preview.phaseFocusInstanceId) && !s.overview) {
          const st = usePresentationStore.getState();
          if (st.activeInstanceId !== preview.phaseFocusInstanceId) st.setActiveInstance(preview.phaseFocusInstanceId);
          st.requestFocusInstance();
        }
      }
    }
    w.markers.update((pointId) => {
      const fx = this.activeInstance(s)?.effects;
      return fx?.pointPose ? fx.pointPose(pointId) : null;
    });
    w.lighting.updateHeadlamp(w.camera);
    w.environment.update(w.camera.globalPosition, s.environment);
    // the opaque depth map only feeds the plasma ray march: stop refreshing it while no glow volume is drawn
    let glowVisible = false;
    this.depthFocus.instances.clear();
    this.depthFocus.segments.length = 0;
    for (const [id, inst] of w.instances)
      for (const p of inst.effects?.plasmas ?? [])
        if (p.mesh.isEnabled() && p.mesh.isVisible) {
          glowVisible = true;
          this.depthFocus.instances.add(id);
          this.depthFocus.segments.push({ a: w.camera.globalPosition.clone(), b: p.mesh.getBoundingInfo().boundingSphere.centerWorld.clone() });
        }
    const depthMap = w.depth.getDepthMap();
    const wantRefresh = glowVisible ? 1 : 0;
    if (depthMap.refreshRate !== wantRefresh) {
      depthMap.refreshRate = wantRefresh;
      if (glowVisible) depthMap.resetRefreshCounter();
    }
    if (now - this.lastLodUpdate > 200) {
      this.lastLodUpdate = now;
      this.updateLod(s);
    }
    w.scene.render();
    w.labels.update(w.camera, (m) => {
      const meta = m.metadata as (InstanceMeshMetadata & { isOverlay?: boolean; isGround?: boolean }) | undefined;
      return m.isEnabled() && m.isVisible && !!meta && !meta.isPlasma && !meta.isOverlay && !meta.isGround && !(m.material && m.material.needAlphaBlending());
    });

    // auto quality
    const frameMs = w.created.engine.getDeltaTime();
    if (s.qualityPreset === "auto") {
      const next = this.quality.sample(frameMs, now);
      if (next) usePresentationStore.getState().reportEffectiveQuality(next);
    }
    if (now - this.lastPerfPublish > 500) {
      this.lastPerfPublish = now;
      usePresentationStore.getState().reportPerf({
        fps: w.created.engine.getFps(),
        frameMs: this.quality.frameMsEma,
        activeMeshes: w.scene.getActiveMeshes().length,
        renderWidth: w.created.engine.getRenderWidth(),
        renderHeight: w.created.engine.getRenderHeight(),
        dpr: 1 / w.created.engine.getHardwareScalingLevel(),
      });
    }
    if (now - this.lastTimelinePublish > 100 && def) {
      this.lastTimelinePublish = now;
      const ph = phaseAt(def.scenario, time);
      usePresentationStore.getState().reportTimeline({
        playheadSec: time,
        playing: this.clock.playing,
        holding: this.clock.holding,
        speed: this.clock.speed,
        durationSec: this.clock.durationSec,
        phase: ph.id,
        phaseLabelKo: ph.labelKo,
        intensity: preview?.plasma.intensity ?? 0,
        scenarioId: def.id,
        phaseEquipment: ph.equipment ?? null,
        phaseFocusInstanceId: preview?.phaseFocusInstanceId ?? null,
      });
    }
    if (now - this.lastPreviewPublish > 150 && preview) {
      this.lastPreviewPublish = now;
      usePresentationStore.getState().reportPreview(preview);
    }
  }

  /**
   * Distance LOD: fine details (fasteners, labels, cable ties) of far, inactive tools are hidden. The distance is
   * taken to the tool's static center or to its vehicle (path joint), whichever is closer; details appear inside
   * 4.5 m and hide beyond 5 m so orbiting at the limit does not toggle them.
   */
  private updateLod(s: PresentationState): void {
    const w = this.world!;
    const cam = w.camera.globalPosition;
    for (const [id, inst] of w.instances) {
      const c = w.lodCenters.get(id);
      const active = id === s.activeInstanceId && !s.overview;
      let d = c ? Vector3.Distance(cam, c) : 0;
      for (const p of inst.pathJointPositions()) d = Math.min(d, Vector3.Distance(cam, p));
      const near = d < (inst.fineDetailVisible ? 5 : 4.5);
      inst.setFineDetailVisible(active || near || inst.def.mobile === true);
    }
  }

  /** Freeze presentation time for reproducible screenshots (null to resume the clock). */
  freezeTime(sec: number | null): void {
    this.frozenTime = sec;
    if (sec !== null) {
      this.clock.pause();
      this.clock.scrub(sec);
    }
  }

  /** Last evaluated preview (debug / tests). */
  get preview(): PreviewState | null {
    return this.lastPreview;
  }

  get stations(): Record<string, StationWorldFrame> {
    return this.world?.stations ?? {};
  }

  private debugApi() {
    return {
      host: this,
      isReady: () => !!this.world,
      backend: () => this.world?.created.backend ?? null,
      setCamera: (a: number, b: number, r: number, t: [number, number, number]) => this.setCamera(a, b, r, t),
      setCameraLocal: (id: string, a: number, b: number, r: number, t: [number, number, number]) => this.setCameraLocal(id, a, b, r, t),
      freezeTime: (t: number | null) => this.freezeTime(t),
      preview: () => this.lastPreview,
      scenario: () => this.scenarioDef?.id ?? null,
      stations: () => this.stations,
      stats: () => {
        const w = this.world;
        if (!w) return null;
        return {
          backend: w.created.backend,
          gpu: w.created.gpuDescription,
          meshes: w.scene.meshes.length,
          activeMeshes: w.scene.getActiveMeshes().length,
          materials: w.scene.materials.length,
          textures: w.scene.textures.length,
          fps: w.created.engine.getFps(),
          frameMsEma: this.quality.frameMsEma,
          renderWidth: w.created.engine.getRenderWidth(),
          renderHeight: w.created.engine.getRenderHeight(),
          hardwareScaling: w.created.engine.getHardwareScalingLevel(),
          totalVertices: w.scene.getTotalVertices(),
          activeTriangles: Math.round(w.scene.getActiveIndices() / 3),
          drawCalls: w.instrumentation.drawCallsCounter?.current ?? null,
          environment: w.environment.stats(),
          cutaway: this.appliedCut,
          plasmaEnabled: Array.from(w.instances.values()).map((i) => (i.plasma ? i.plasma.mesh.isEnabled() : null)),
          instances: Array.from(w.instances.keys()),
          scenario: this.scenarioDef?.id ?? null,
        };
      },
      renderOnce: () => {
        this.renderFrame();
      },
      logs: () => this.getLogs(),
      store: usePresentationStore,
      bundles: () => listBundles().map((b) => b.template.templateId),
      /** Evaluate the current scenario at time t without rendering (pure; tests scan holder switches with it). */
      evaluateAt: (t: number) => (this.scenarioDef ? this.scenarioDef.evaluate(t, usePresentationStore.getState().visual.visualSeed, t, this.ctx) : null),
      /** Enabled wafer presentation meshes (instance, asset, world center) for continuity checks. */
      waferMeshes: () => {
        const out: { instanceId: string; assetId: string; center: [number, number, number] }[] = [];
        const w = this.world;
        if (!w) return out;
        for (const inst of w.instances.values()) {
          const st = inst.bundle.template.station;
          const ids = inst.bundle.template.waferPresentationAssetIds ?? st?.waferPresentationAssetIds ?? (st ? [st.waferPresentationAssetId] : []);
          for (const a of ids) {
            const node = inst.assetNodes.get(a);
            if (!node || !node.isEnabled()) continue;
            const b = inst.worldBounds(a);
            if (b) out.push({ instanceId: inst.def.instanceId, assetId: a, center: [b.center.x, b.center.y, b.center.z] });
          }
        }
        return out;
      },
      covers: () => {
        const w = this.world;
        return w ? Object.fromEntries(Array.from(w.instances.entries()).map(([id, i]) => [id, i.hasCovers ? i.coversAreRemoved : null])) : {};
      },
      /** Kept sector of every instance in degrees (null = not cut): cutaway and FOUP section checks. */
      cuts: () => {
        const w = this.world;
        if (!w) return {};
        const deg = (r: number) => (r * 180) / Math.PI;
        return Object.fromEntries(Array.from(w.instances.entries()).map(([id, i]) => [id, i.kept.length === 1 && i.kept[0].sweep >= 2 * Math.PI - 1e-6 ? null : i.kept.map((k) => ({ startDeg: deg(k.start), sweepDeg: deg(k.sweep) }))]));
      },
    };
  }

  get currentCut(): ResolvedCutaway {
    return this.appliedCut ?? { enabled: false, removed: null, kept: FULL, effectiveAzimuthDeg: 0, effectiveSweepDeg: 0, snapped: false };
  }

  /** Instance-frame -> world helper for QA scripts. */
  worldOf(instanceId: string, local: Vec3Tuple): Vector3 | null {
    const inst = this.world?.instances.get(instanceId);
    if (!inst) return null;
    return inst.worldPoint(local);
  }
}
