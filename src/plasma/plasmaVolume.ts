/**
 * PlasmaVolume: bounded-cylinder ray-marched glow between the showerhead faceplate and the wafer.
 * Rendered as alpha-blended (premultiplied) back faces of a proxy cylinder with the depth test
 * disabled; occlusion is resolved analytically against the opaque depth texture, so the effect
 * never bleeds through walls or electrodes and keeps working when the camera enters the volume.
 * render_source = "illustrative": nothing here is a computed plasma field.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { ChamberLayout } from "../config/geometry";
import { plasmaProxyMesh } from "../geometry/chamberParts";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import type { ResolvedCutaway } from "../presentation/cutaway";
import { PLASMA_FRAGMENT_GLSL, PLASMA_VERTEX_GLSL } from "./shaders/plasma.glsl";
import { PLASMA_FRAGMENT_WGSL, PLASMA_VERTEX_WGSL } from "./shaders/plasma.wgsl";

export interface PlasmaFrameParams {
  time: number;
  intensity: number;
  flicker: number;
  glow: number;
  opacity: number;
  edgeSoftness: number;
  variation: number;
  sheath: number;
  seed: number;
  colorCore: [number, number, number];
  colorHalo: [number, number, number];
  steps: number;
  cut: ResolvedCutaway;
  visible: boolean;
  debugDepth: boolean;
  flipDepthY: boolean;
}

export const PLASMA_RENDER_SOURCE = "illustrative" as const;

let shadersRegistered = false;
function registerShaders(): void {
  if (shadersRegistered) return;
  ShaderStore.ShadersStore["pecvdPlasmaVertexShader"] = PLASMA_VERTEX_GLSL;
  ShaderStore.ShadersStore["pecvdPlasmaFragmentShader"] = PLASMA_FRAGMENT_GLSL;
  ShaderStore.ShadersStoreWGSL["pecvdPlasmaVertexShader"] = PLASMA_VERTEX_WGSL;
  ShaderStore.ShadersStoreWGSL["pecvdPlasmaFragmentShader"] = PLASMA_FRAGMENT_WGSL;
  shadersRegistered = true;
}

const UNIFORMS = [
  "world",
  "worldViewProjection",
  "uCameraPosition",
  "uCameraForward",
  "uVolumeCenter",
  "uVolumeRadius",
  "uVolumeHalfHeight",
  "uHaloMargin",
  "uInstanceRotY",
  "uTime",
  "uSeed",
  "uIntensity",
  "uGlow",
  "uOpacity",
  "uEdgeSoftness",
  "uVariation",
  "uSheath",
  "uFlicker",
  "uColorCore",
  "uColorHalo",
  "uSteps",
  "uCutEnabled",
  "uCutStart",
  "uCutSweep",
  "uFlipDepthY",
  "uDebugMode",
];

export class PlasmaVolume {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly localCenter: Vector3;
  private readonly radius: number;
  private readonly halfHeight: number;
  private haloMargin: number;
  private readonly tmpCenter = new Vector3();
  private readonly tmpFwd = new Vector3();
  private readonly tmpCore = new Vector3();
  private readonly tmpHalo = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly layout: ChamberLayout,
    root: TransformNode,
    instanceId: string,
    isWebGPU: boolean,
    haloMargin: number,
  ) {
    registerShaders();
    this.haloMargin = haloMargin;
    const c = layout.plasma.center;
    this.localCenter = new Vector3(c[0], c[1], c[2]);
    this.radius = layout.plasma.radius;
    this.halfHeight = (layout.plasma.topY - layout.plasma.bottomY) / 2;

    const md = plasmaProxyMesh(layout, haloMargin);
    // Flip winding so the inside faces are the front faces: with back-face culling on, only the far
    // side of the proxy rasterizes, which keeps the shader running when the camera is inside the volume.
    for (let i = 0; i < md.indices.length; i += 3) {
      const t = md.indices[i + 1];
      md.indices[i + 1] = md.indices[i + 2];
      md.indices[i + 2] = t;
    }
    this.mesh = new Mesh(`${instanceId}::plasma_volume`, scene);
    applyMeshData(this.mesh, md);
    this.mesh.parent = root;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    this.mesh.alphaIndex = -10; // render before other transparent meshes (glass, x-ray shell)
    this.mesh.metadata = { instanceId, assetId: "plasma_volume", decorative: true, isPlasma: true };
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new ShaderMaterial(
      `${instanceId}::plasma_mat`,
      scene,
      { vertex: "pecvdPlasma", fragment: "pecvdPlasma" },
      {
        attributes: ["position"],
        uniforms: UNIFORMS,
        uniformBuffers: isWebGPU ? ["Scene", "Mesh"] : undefined,
        samplers: ["depthTex"],
        needAlphaBlending: true,
        shaderLanguage: isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      },
    );
    this.material.backFaceCulling = true;
    this.material.disableDepthWrite = true;
    this.material.depthFunction = Constants.ALWAYS;
    this.material.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
    this.material.setFloat("uVolumeRadius", this.radius);
    this.material.setFloat("uVolumeHalfHeight", this.halfHeight);
    this.material.setFloat("uHaloMargin", haloMargin);
    this.material.setFloat("uInstanceRotY", root.rotation.y);
    this.material.setFloat("uDebugMode", 0);
    this.material.setFloat("uFlipDepthY", 0);
    this.mesh.material = this.material;
  }

  setDepthTexture(tex: BaseTexture): void {
    this.material.setTexture("depthTex", tex);
  }

  isReady(): boolean {
    return this.material.isReady(this.mesh);
  }

  update(camera: Camera, p: PlasmaFrameParams): void {
    const root = this.mesh.parent as TransformNode;
    const enabled = p.visible && p.intensity > 0.0005 || p.debugDepth;
    if (this.mesh.isEnabled() !== enabled) this.mesh.setEnabled(enabled);
    if (!enabled) return;
    Vector3.TransformCoordinatesToRef(this.localCenter, root.getWorldMatrix(), this.tmpCenter);
    const m = this.material;
    m.setVector3("uVolumeCenter", this.tmpCenter);
    m.setFloat("uInstanceRotY", root.rotation.y);
    m.setVector3("uCameraPosition", camera.globalPosition);
    const fwd = camera.getDirection(Vector3.Forward());
    this.tmpFwd.copyFrom(fwd).normalize();
    m.setVector3("uCameraForward", this.tmpFwd);
    m.setFloat("uTime", p.time);
    m.setFloat("uSeed", p.seed);
    m.setFloat("uIntensity", Math.max(0, p.intensity));
    m.setFloat("uGlow", p.glow);
    m.setFloat("uOpacity", p.opacity);
    m.setFloat("uEdgeSoftness", p.edgeSoftness);
    m.setFloat("uVariation", p.variation);
    m.setFloat("uSheath", p.sheath);
    m.setFloat("uFlicker", p.flicker);
    this.tmpCore.set(p.colorCore[0], p.colorCore[1], p.colorCore[2]);
    this.tmpHalo.set(p.colorHalo[0], p.colorHalo[1], p.colorHalo[2]);
    m.setVector3("uColorCore", this.tmpCore);
    m.setVector3("uColorHalo", this.tmpHalo);
    m.setFloat("uSteps", p.steps);
    m.setFloat("uCutEnabled", p.cut.enabled && p.cut.removed ? 1 : 0);
    m.setFloat("uCutStart", p.cut.removed ? p.cut.removed.start : 0);
    m.setFloat("uCutSweep", p.cut.removed ? p.cut.removed.sweep : 0);
    m.setFloat("uFlipDepthY", p.flipDepthY ? 1 : 0);
    m.setFloat("uDebugMode", p.debugDepth ? 1 : 0);
  }

  /** Rebuild the proxy if the halo margin changes (rare; developer setting). */
  setHaloMargin(margin: number): void {
    if (Math.abs(margin - this.haloMargin) < 1e-6) return;
    this.haloMargin = margin;
    const md = plasmaProxyMesh(this.layout, margin);
    for (let i = 0; i < md.indices.length; i += 3) {
      const t = md.indices[i + 1];
      md.indices[i + 1] = md.indices[i + 2];
      md.indices[i + 2] = t;
    }
    applyMeshData(this.mesh, md);
    this.material.setFloat("uHaloMargin", margin);
  }

  dispose(): void {
    this.material.dispose(true, true);
    this.mesh.dispose(false, false);
    void this.scene;
  }
}
