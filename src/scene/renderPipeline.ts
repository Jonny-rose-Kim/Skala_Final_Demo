/**
 * Post-processing and quality presets. Default view: FXAA/MSAA + ACES tone mapping, no bloom, no DOF,
 * no chromatic aberration. Quality tiers adjust DPR cap, MSAA, plasma sample count, shadow map size
 * and SSAO without ever removing core components or observation modes.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import type { EffectiveQuality } from "../presentation/store";

export interface QualitySettings {
  id: EffectiveQuality;
  dprCap: number;
  msaa: number;
  plasmaSteps: number;
  shadowMapSize: number;
  ssao: boolean;
  fxaa: boolean;
}

export const QUALITY: Record<EffectiveQuality, QualitySettings> = {
  high: { id: "high", dprCap: 2.0, msaa: 4, plasmaSteps: 48, shadowMapSize: 2048, ssao: true, fxaa: true },
  balanced: { id: "balanced", dprCap: 1.25, msaa: 2, plasmaSteps: 24, shadowMapSize: 1024, ssao: false, fxaa: true },
};

export class RenderPipeline {
  readonly main: DefaultRenderingPipeline;
  private ssao: SSAO2RenderingPipeline | null = null;
  private ssaoAttached = false;
  private current: QualitySettings | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly supportsSSAO: boolean,
  ) {
    this.main = new DefaultRenderingPipeline("main", true, scene, [camera]);
    this.main.fxaaEnabled = true;
    this.main.bloomEnabled = false;
    this.main.chromaticAberrationEnabled = false;
    this.main.grainEnabled = false;
    this.main.depthOfFieldEnabled = false;
    this.main.sharpenEnabled = false;
    this.main.imageProcessingEnabled = true;
    this.main.imageProcessing.toneMappingEnabled = true;
    this.main.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.main.imageProcessing.exposure = 0.88;
    this.main.imageProcessing.contrast = 1.05;
    this.main.imageProcessing.vignetteEnabled = false;
  }

  apply(q: QualitySettings, engine: AbstractEngine, devicePixelRatio: number): void {
    const dpr = Math.min(devicePixelRatio, q.dprCap);
    const level = 1 / dpr;
    if (Math.abs(engine.getHardwareScalingLevel() - level) > 1e-4) engine.setHardwareScalingLevel(level);
    if (this.main.samples !== q.msaa) this.main.samples = q.msaa;
    this.main.fxaaEnabled = q.fxaa;
    this.setSSAO(q.ssao && this.supportsSSAO);
    this.current = q;
  }

  private setSSAO(on: boolean): void {
    if (on) {
      if (!this.ssao) {
        this.ssao = new SSAO2RenderingPipeline("ssao", this.scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera], true);
        this.ssao.totalStrength = 0.75;
        this.ssao.radius = 0.035;
        this.ssao.base = 0.1;
        this.ssao.samples = 12;
        this.ssao.maxZ = 8;
        this.ssao.minZAspect = 0.5;
        this.ssaoAttached = true;
      } else if (!this.ssaoAttached) {
        this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", this.camera);
        this.ssaoAttached = true;
      }
    } else if (this.ssao && this.ssaoAttached) {
      this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", this.camera);
      this.ssaoAttached = false;
    }
  }

  get settings(): QualitySettings | null {
    return this.current;
  }

  setExposure(v: number): void {
    this.main.imageProcessing.exposure = v;
  }

  dispose(): void {
    if (this.ssao) this.ssao.dispose();
    this.main.dispose();
  }
}

/**
 * Auto quality: observes real frame times (EMA) and switches between High and Balanced with hysteresis.
 * Never more than one switch per 8 seconds; it only ever changes rendering cost, never features.
 */
export class QualityManager {
  private ema = 16;
  private lastSwitch = 0;
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  effective: EffectiveQuality = "high";

  sample(frameMs: number, nowMs: number): EffectiveQuality | null {
    if (frameMs > 250) return null; // ignore stalls (tab switch, shader compile)
    this.ema = this.ema * 0.92 + frameMs * 0.08;
    if (nowMs - this.lastSwitch < 8000) return null;
    if (this.effective === "high") {
      if (this.ema > 26) {
        this.slowSince ??= nowMs;
        if (nowMs - this.slowSince > 2500) {
          this.effective = "balanced";
          this.lastSwitch = nowMs;
          this.slowSince = null;
          return "balanced";
        }
      } else this.slowSince = null;
    } else {
      if (this.ema < 11) {
        this.fastSince ??= nowMs;
        if (nowMs - this.fastSince > 6000) {
          this.effective = "high";
          this.lastSwitch = nowMs;
          this.fastSince = null;
          return "high";
        }
      } else this.fastSince = null;
    }
    return null;
  }

  reset(effective: EffectiveQuality): void {
    this.effective = effective;
    this.slowSince = null;
    this.fastSince = null;
  }

  get frameMsEma(): number {
    return this.ema;
  }
}
