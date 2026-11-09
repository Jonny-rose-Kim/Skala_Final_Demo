/**
 * SceneHost: owns the Babylon engine/scene lifecycle for the Visual Inspection mode and applies the
 * PresentationState to the scene imperatively. React never recreates the scene; per-frame values stay
 * in the renderer and are published to the store at a low rate.
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
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import type { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { CHAMBER_LAYOUT, validateGeometryConfig, GEOMETRY_CONFIG, type ChamberLayout } from "../config/geometry";
import { CCP_CHAMBER_TEMPLATE, getComponent, validateTemplate } from "../domain/ccpChamberTemplate";
import { DEFAULT_INSTANCES, TWO_CHAMBER_FIXTURE } from "../domain/instances";
import type { EquipmentInstanceDef } from "../domain/types";
import { revolveProfile, rectProfile, type Vec2 } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import { createCleanroomEnvironment } from "../materials/environment";
import { MaterialLibrary } from "../materials/materialLibrary";
import { createProceduralTextures, type ProceduralTextureSet } from "../materials/proceduralTextures";
import { resolveCutaway, type ResolvedCutaway, FULL } from "../presentation/cutaway";
import { DEFAULT_SCENARIO, evaluateScenario, phaseAt } from "../presentation/scenario";
import { colorPresetById, usePresentationStore, type PresentationState } from "../presentation/store";
import { VisualClock } from "../presentation/visualClock";
import { GasPathOverlay, SheathOverlay } from "../interaction/gasPathOverlay";
import { LabelsOverlay } from "../interaction/labels";
import { PickingController } from "../interaction/picking";
import { cameraPresets } from "./cameraPresets";
import { ChamberInstance, type InstanceMeshMetadata } from "./chamberInstance";
import { createCanvas, readForceWebGL2, tryCreateWebGL2, tryCreateWebGPU, type CreatedEngine } from "./engineFactory";
import { LightingRig } from "./lighting";
import { QUALITY, QualityManager, RenderPipeline } from "./renderPipeline";

export interface SceneHostOptions {
  fixture?: "two-chambers" | null;
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
  instances: Map<string, ChamberInstance>;
  depth: DepthRenderer;
  pipeline: RenderPipeline;
  highlight: HighlightLayer;
  picking: PickingController;
  labels: LabelsOverlay;
  gasOverlays: Map<string, GasPathOverlay>;
  sheathOverlays: Map<string, SheathOverlay>;
  ground: Mesh;
  backdrop: Mesh;
  resizeObserver: ResizeObserver;
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

const LABEL_ASSETS: { assetId: string; text: string; priority: number }[] = [
  { assetId: "showerhead_faceplate", text: "Showerhead faceplate (upper electrode)", priority: 10 },
  { assetId: "wafer", text: "Wafer 300 mm", priority: 9 },
  { assetId: "pedestal", text: "Heated pedestal", priority: 8 },
  { assetId: "plasma_volume", text: "Plasma (illustrative)", priority: 7 },
  { assetId: "lid", text: "Lid", priority: 6 },
  { assetId: "slit_valve", text: "Slit valve", priority: 5 },
  { assetId: "exhaust_port", text: "Exhaust port", priority: 4 },
  { assetId: "gas_inlet", text: "Gas inlet", priority: 3 },
  { assetId: "matching_network", text: "Matching network", priority: 2 },
  { assetId: "chamber_body", text: "Chamber body", priority: 1 },
];

export class SceneHost {
  private world: World | null = null;
  private container: HTMLElement | null = null;
  readonly clock = new VisualClock(DEFAULT_SCENARIO.durationSec);
  private unsubscribe: (() => void) | null = null;
  private lastState: PresentationState | null = null;
  private cutawayTimer: number | null = null;
  private pendingCut: ResolvedCutaway | null = null;
  private appliedCut: ResolvedCutaway = resolveCutaway({ enabled: false, azimuthDeg: 0, sweepDeg: 0 }, []);
  private readonly quality = new QualityManager();
  private lastPerfPublish = 0;
  private lastTimelinePublish = 0;
  private frozenTime: number | null = null;
  private logs: string[] = [];
  private disposed = false;
  readonly layout: ChamberLayout = CHAMBER_LAYOUT;
  private options: SceneHostOptions = {};
  private fallbackUsed = false;
  private pendingCanvas: HTMLCanvasElement | null = null;
  private pendingEngine: CreatedEngine | null = null;

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
    const geo = validateGeometryConfig(GEOMETRY_CONFIG);
    warnings.push(...geo.errors.map((e) => `geometry: ${e}`), ...geo.warnings.map((w) => `geometry (warning): ${w}`));
    warnings.push(...validateTemplate(CCP_CHAMBER_TEMPLATE).map((e) => `template: ${e}`));
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
    return this.options.fixture === "two-chambers" ? TWO_CHAMBER_FIXTURE : DEFAULT_INSTANCES;
  }

  private async buildWorld(created: CreatedEngine): Promise<void> {
    const store = usePresentationStore.getState();
    const { engine } = created;
    const isWebGPU = created.backend === "webgpu";
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.105, 0.115, 0.135, 1);
    scene.ambientColor = new Color3(0.02, 0.02, 0.02);
    scene.useRightHandedSystem = false;
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    const camera = new ArcRotateCamera("camera", 240 * (Math.PI / 180), 66 * (Math.PI / 180), 1.75, new Vector3(0, 0.12, 0), scene);
    camera.minZ = 0.02;
    camera.maxZ = 40;
    camera.lowerRadiusLimit = 0.06;
    camera.upperRadiusLimit = 7;
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

    const instances = new Map<string, ChamberInstance>();
    const gasOverlays = new Map<string, GasPathOverlay>();
    const sheathOverlays = new Map<string, SheathOverlay>();
    const t0 = performance.now();
    for (const def of this.instanceDefs()) {
      const inst = new ChamberInstance(scene, def, this.layout, materials, isWebGPU, store.visual.haloMargin, lighting.shadow);
      instances.set(def.instanceId, inst);
      gasOverlays.set(def.instanceId, new GasPathOverlay(scene, inst.root, this.layout, def.instanceId));
      sheathOverlays.set(def.instanceId, new SheathOverlay(scene, inst.root, this.layout, def.instanceId, store.visual.sheathFraction));
    }
    this.log(`Chamber 생성 ${instances.size}개, ${(performance.now() - t0).toFixed(0)} ms, meshes=${scene.meshes.length}`);

    // Ground plane for grounding shadows
    const ground = new Mesh("ground", scene);
    applyMeshData(ground, revolveProfile(rectProfile(0, 4.5, this.layout.cfg.peripherals.frame_bottom_y - 0.012, this.layout.cfg.peripherals.frame_bottom_y - 0.002), { segments: 96 }));
    const groundMat = new PBRMaterial("mat.ground", scene);
    groundMat.albedoColor = new Color3(0.12, 0.125, 0.14);
    groundMat.metallic = 0;
    groundMat.roughness = 0.9;
    groundMat.environmentIntensity = 0.5;
    ground.material = groundMat;
    ground.receiveShadows = true;
    ground.isPickable = false;
    ground.metadata = { isGround: true };

    // Plasma glow approximation targets: nearby interior surfaces of each instance
    const litMeshes: AbstractMesh[] = [];
    for (const inst of instances.values()) {
      for (const id of ["showerhead_faceplate", "wafer", "edge_ring", "pedestal", "chamber_liner", "edge_insulator_ring", "pumping_baffle", "lift_pins"]) {
        for (const m of inst.meshesByAsset.get(id) ?? []) litMeshes.push(m);
      }
    }
    lighting.setPlasmaLitMeshes(litMeshes);

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
      return true;
    };
    for (const inst of instances.values()) inst.plasma.setDepthTexture(depthMap);

    // Backdrop sphere: an explicit unlit background so both backends produce the same tone-mapped color.
    const backdrop = new Mesh("backdrop", scene);
    applyMeshData(backdrop, revolveProfile(backdropProfile(18), { segments: 48, caps: false }));
    const backdropMat = new PBRMaterial("mat.backdrop", scene);
    backdropMat.unlit = true;
    backdropMat.albedoColor = new Color3(0.105, 0.115, 0.135);
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
    for (const inst of instances.values()) highlight.addExcludedMesh(inst.plasma.mesh);
    for (const g of gasOverlays.values()) for (const m of g.root.getChildMeshes()) highlight.addExcludedMesh(m as Mesh);
    for (const sh of sheathOverlays.values()) for (const m of sh.root.getChildMeshes()) highlight.addExcludedMesh(m as Mesh);
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

    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    resizeObserver.observe(this.container!);

    this.world = { created, scene, camera, env, textures, materials, lighting, instances, depth, pipeline, highlight, picking, labels, gasOverlays, sheathOverlays, ground, backdrop, resizeObserver };

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
      await inst.plasma.material.forceCompilationAsync(inst.plasma.mesh);
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
    w.picking.dispose();
    w.labels.dispose();
    for (const g of w.gasOverlays.values()) g.dispose();
    for (const s of w.sheathOverlays.values()) s.dispose();
    for (const i of w.instances.values()) i.dispose();
    w.highlight.dispose();
    w.pipeline.dispose();
    w.lighting.dispose();
    w.materials.dispose();
    w.textures.dispose();
    w.env.dispose();
    w.ground.dispose(false, true);
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

  // ------------------------------------------------------------------ state application

  private activeInstance(s: PresentationState): ChamberInstance | null {
    return this.world?.instances.get(s.activeInstanceId) ?? null;
  }

  private applyState(s: PresentationState, force: boolean): void {
    const w = this.world;
    if (!w) return;
    const prev = this.lastState;
    this.lastState = s;
    const changed = <K extends keyof PresentationState>(k: K) => force || !prev || prev[k] !== s[k];

    if (changed("viewMode") || changed("cutaway") || changed("activeInstanceId")) this.scheduleCutaway(s, force || changed("viewMode") || changed("activeInstanceId"));
    if (changed("viewMode") || changed("explodeAmount") || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) inst.applyExplode(s.explodeAmount, s.viewMode === "exploded" && id === s.activeInstanceId);
    }
    if (changed("viewMode") || changed("xrayOpacity") || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) inst.applyXray(s.viewMode === "xray" && id === s.activeInstanceId, s.xrayOpacity);
    }
    if (changed("hiddenAssets") || changed("isolatedAssetId") || changed("viewMode") || changed("activeInstanceId")) {
      for (const [id, inst] of w.instances) {
        const active = id === s.activeInstanceId;
        inst.applyVisibility(active ? new Set(s.hiddenAssets) : new Set(), active ? s.isolatedAssetId : null, active && s.viewMode === "exploded");
      }
      this.refreshHighlight(s);
    }
    if (changed("selectedAssetId") || changed("hoveredAssetId") || changed("activeInstanceId")) this.refreshHighlight(s);
    if (changed("lightingPreset")) w.lighting.setPreset(s.lightingPreset);
    if (changed("qualityPreset") || changed("effectiveQuality")) this.applyQuality(s);
    if (changed("overlays") || changed("viewMode") || changed("activeInstanceId")) {
      for (const [id, g] of w.gasOverlays) g.setVisible(s.overlays.gasPath && id === s.activeInstanceId && s.viewMode !== "exploded");
      for (const [id, sh] of w.sheathOverlays) sh.setVisible(s.overlays.sheath && id === s.activeInstanceId && s.viewMode !== "exploded" && s.visual.plasmaVisible);
      w.labels.setVisible(s.overlays.labels);
      this.refreshLabels(s);
    }
    if (changed("visual")) {
      const inst = this.activeInstance(s);
      if (inst) inst.plasma.setHaloMargin(s.visual.haloMargin);
    }
    if (changed("requests")) {
      const r = s.requests;
      const p = prev?.requests;
      if (!p || r.resetCamera !== p.resetCamera) this.resetCamera();
      if (!p || r.focusSelected !== p.focusSelected) this.focusSelected(s);
      if ((!p || r.cameraPreset !== p.cameraPreset) && s.cameraPresetId) this.applyCameraPreset(s.cameraPresetId);
    }
  }

  private scheduleCutaway(s: PresentationState, immediate: boolean): void {
    const keepOuts = Object.values(this.layout.ports).map((p) => p.keepOut);
    const resolved = resolveCutaway({ enabled: s.viewMode === "cutaway", azimuthDeg: s.cutaway.azimuthDeg, sweepDeg: s.cutaway.sweepDeg }, keepOuts);
    this.pendingCut = resolved;
    if (this.cutawayTimer !== null) window.clearTimeout(this.cutawayTimer);
    const run = () => {
      this.cutawayTimer = null;
      const cut = this.pendingCut;
      if (!cut || !this.world) return;
      const t = performance.now();
      for (const [id, inst] of this.world.instances) inst.applyCutaway(id === s.activeInstanceId ? cut : resolveCutaway({ enabled: false, azimuthDeg: 0, sweepDeg: 0 }, []));
      this.appliedCut = cut;
      const dt = performance.now() - t;
      if (dt > 5) this.log(`cutaway 적용 ${dt.toFixed(0)} ms (${cut.enabled ? `${cut.effectiveAzimuthDeg.toFixed(0)}° / ${cut.effectiveSweepDeg.toFixed(0)}°` : "off"})`);
      usePresentationStore.getState().reportCutaway(cut.effectiveAzimuthDeg, cut.effectiveSweepDeg, cut.snapped);
      this.refreshHighlight(usePresentationStore.getState());
    };
    if (immediate) run();
    else this.cutawayTimer = window.setTimeout(run, 90);
  }

  private refreshHighlight(s: PresentationState): void {
    const w = this.world;
    if (!w) return;
    w.highlight.removeAllMeshes();
    const inst = this.activeInstance(s);
    if (!inst) return;
    if (s.hoveredAssetId && s.hoveredAssetId !== s.selectedAssetId) {
      for (const m of inst.highlightMeshes(s.hoveredAssetId)) w.highlight.addMesh(m, new Color3(0.55, 0.75, 0.95));
    }
    if (s.selectedAssetId) {
      for (const m of inst.highlightMeshes(s.selectedAssetId)) w.highlight.addMesh(m, new Color3(0.25, 0.95, 1.0));
    }
  }

  private refreshLabels(s: PresentationState): void {
    const w = this.world;
    if (!w) return;
    const inst = this.activeInstance(s);
    if (!inst) {
      w.labels.setItems([]);
      return;
    }
    const items = LABEL_ASSETS.map((l) => ({
      id: l.assetId,
      text: l.text,
      priority: l.priority,
      anchor: () => {
        if (l.assetId === "plasma_volume") {
          if (!inst.plasma.mesh.isEnabled()) return null;
          const c = this.layout.plasma.center;
          return Vector3.TransformCoordinates(new Vector3(c[0], c[1], c[2]), inst.root.getWorldMatrix());
        }
        const b = inst.worldBounds(l.assetId);
        if (!b) return null;
        if (l.assetId === "chamber_body") return new Vector3(b.center.x, b.max.y - 0.05, b.center.z);
        return b.center;
      },
      ownMeshes: () => new Set<AbstractMesh>(inst.meshesByAsset.get(l.assetId) ?? []),
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

  private applyCameraPreset(id: string): void {
    const w = this.world;
    if (!w) return;
    const preset = cameraPresets(this.layout).find((p) => p.id === id);
    if (!preset) return;
    const inst = this.activeInstance(usePresentationStore.getState());
    const target = new Vector3(preset.target[0], preset.target[1], preset.target[2]);
    const worldTarget = inst ? Vector3.TransformCoordinates(target, inst.root.getWorldMatrix()) : target;
    const alpha = preset.alpha + (inst ? inst.root.rotation.y : 0);
    w.camera.interpolateTo(alpha, preset.beta, preset.radius, worldTarget);
  }

  resetCamera(): void {
    this.applyCameraPreset("overview");
  }

  private focusSelected(s: PresentationState): void {
    const w = this.world;
    const inst = this.activeInstance(s);
    if (!w || !inst || !s.selectedAssetId) return;
    if (s.selectedAssetId === "plasma_volume") {
      const c = this.layout.plasma.center;
      const t = Vector3.TransformCoordinates(new Vector3(c[0], c[1], c[2]), inst.root.getWorldMatrix());
      w.camera.interpolateTo(w.camera.alpha, w.camera.beta, 0.45, t);
      return;
    }
    const b = inst.worldBounds(s.selectedAssetId);
    if (!b) return;
    const extent = Vector3.Distance(b.min, b.max);
    const radius = Math.min(Math.max(extent * 1.6, 0.18), 3.5);
    w.camera.interpolateTo(w.camera.alpha, w.camera.beta, radius, b.center);
  }

  /** Programmatic camera for QA screenshots (instance frame of the active instance). */
  setCamera(alphaDeg: number, betaDeg: number, radius: number, target: [number, number, number]): void {
    const w = this.world;
    if (!w) return;
    w.camera.alpha = alphaDeg * (Math.PI / 180);
    w.camera.beta = betaDeg * (Math.PI / 180);
    w.camera.radius = radius;
    w.camera.setTarget(new Vector3(target[0], target[1], target[2]));
  }

  // ------------------------------------------------------------------ frame

  private renderFrame(): void {
    const w = this.world;
    if (!w || this.disposed) return;
    const s = usePresentationStore.getState();
    const now = performance.now();
    const time = this.frozenTime ?? this.clock.tick(now);
    const sample = evaluateScenario(DEFAULT_SCENARIO, time, s.visual.visualSeed);
    const preset = colorPresetById(s.visual.colorPreset);
    const q = QUALITY[s.effectiveQuality];
    const effectTime = time * s.visual.animationSpeed;
    for (const [id, inst] of w.instances) {
      const active = id === s.activeInstanceId;
      const cut = active ? this.appliedCut : resolveCutaway({ enabled: false, azimuthDeg: 0, sweepDeg: 0 }, []);
      inst.plasma.update(w.camera, {
        time: effectTime,
        intensity: sample.intensity,
        flicker: sample.flicker,
        glow: s.visual.glowIntensity,
        opacity: s.visual.opacity,
        edgeSoftness: s.visual.edgeSoftness,
        variation: s.visual.variationStrength,
        sheath: s.visual.sheathFraction,
        seed: s.visual.visualSeed,
        colorCore: preset.core,
        colorHalo: preset.halo,
        steps: q.plasmaSteps,
        cut,
        visible: s.visual.plasmaVisible && !(active && s.viewMode === "exploded"),
        debugDepth: !!this.options.plasmaDebugDepth,
        flipDepthY: !!this.options.flipDepthY,
      });
      if (active) {
        const c = this.layout.plasma.center;
        const center = Vector3.TransformCoordinates(new Vector3(c[0], c[1], c[2]), inst.root.getWorldMatrix());
        const lightOn = s.visual.plasmaLightEnabled && s.visual.plasmaVisible && s.viewMode !== "exploded";
        w.lighting.updatePlasmaLight(center, sample.intensity * s.visual.glowIntensity, preset.core, lightOn);
      }
      w.gasOverlays.get(id)?.update(effectTime);
    }
    w.lighting.updateHeadlamp(w.camera);
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
    if (now - this.lastTimelinePublish > 100) {
      this.lastTimelinePublish = now;
      const ph = phaseAt(DEFAULT_SCENARIO, time);
      usePresentationStore.getState().reportTimeline({
        playheadSec: time,
        playing: this.clock.playing,
        loop: this.clock.loop,
        speed: this.clock.speed,
        durationSec: this.clock.durationSec,
        phase: ph.id,
        phaseLabelKo: ph.labelKo,
        intensity: sample.intensity,
      });
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

  private debugApi() {
    return {
      host: this,
      isReady: () => !!this.world,
      backend: () => this.world?.created.backend ?? null,
      setCamera: (a: number, b: number, r: number, t: [number, number, number]) => this.setCamera(a, b, r, t),
      freezeTime: (t: number | null) => this.freezeTime(t),
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
          cutaway: this.appliedCut,
          plasmaEnabled: Array.from(w.instances.values()).map((i) => i.plasma.mesh.isEnabled()),
        };
      },
      renderOnce: () => {
        this.renderFrame();
      },
      logs: () => this.getLogs(),
      store: usePresentationStore,
    };
  }

  get currentCut(): ResolvedCutaway {
    return this.appliedCut ?? { enabled: false, removed: null, kept: FULL, effectiveAzimuthDeg: 0, effectiveSweepDeg: 0, snapped: false };
  }

  get componentName(): (id: string) => string {
    return (id) => getComponent(id)?.name ?? id;
  }
}
