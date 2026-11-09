/**
 * Lighting rig: procedural HDR environment (IBL), one shadowed key light, soft fill, an inspection
 * headlamp that follows the camera, and an explicit point-light approximation of the plasma's glow
 * on nearby surfaces (not a radiative-transfer computation).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import type { LightingPreset } from "../presentation/store";

export class LightingRig {
  readonly key: DirectionalLight;
  readonly fill: HemisphericLight;
  readonly headlamp: PointLight;
  readonly plasmaLight: PointLight;
  readonly shadow: ShadowGenerator;
  private preset: LightingPreset = "exterior";

  constructor(
    private readonly scene: Scene,
    env: HDRCubeTexture,
  ) {
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.75;

    this.key = new DirectionalLight("key", new Vector3(-0.55, -1, 0.35).normalize(), scene);
    this.key.position = new Vector3(1.6, 3.2, -1.0);
    this.key.intensity = 1.15;
    this.key.diffuse = new Color3(1, 0.98, 0.95);
    this.key.specular = new Color3(1, 1, 1);
    this.key.shadowMinZ = 0.5;
    this.key.shadowMaxZ = 6;

    this.fill = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
    this.fill.intensity = 0.18;
    this.fill.diffuse = new Color3(0.9, 0.93, 1.0);
    this.fill.groundColor = new Color3(0.25, 0.24, 0.22);
    this.fill.specular = Color3.Black();

    this.headlamp = new PointLight("headlamp", new Vector3(0, 1, 0), scene);
    this.headlamp.intensity = 0;
    this.headlamp.range = 3;
    this.headlamp.diffuse = new Color3(1, 1, 1);
    this.headlamp.specular = new Color3(0.3, 0.3, 0.3);

    this.plasmaLight = new PointLight("plasmaLight", new Vector3(0, 0.16, 0), scene);
    this.plasmaLight.intensity = 0;
    this.plasmaLight.range = 0.6;
    this.plasmaLight.specular = new Color3(0.2, 0.2, 0.2);
    this.plasmaLight.includedOnlyMeshes = [];

    this.shadow = new ShadowGenerator(2048, this.key);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadow.bias = 0.0015;
    this.shadow.normalBias = 0.02;
    this.shadow.forceBackFacesOnly = true;
    this.shadow.setDarkness(0.3);
    this.shadow.transparencyShadow = false;
  }

  setPreset(p: LightingPreset): void {
    this.preset = p;
    if (p === "inspection") {
      this.scene.environmentIntensity = 0.9;
      this.key.intensity = 0.9;
      this.fill.intensity = 0.35;
      this.headlamp.intensity = 10;
    } else {
      this.scene.environmentIntensity = 0.75;
      this.key.intensity = 1.15;
      this.fill.intensity = 0.18;
      this.headlamp.intensity = 0;
    }
  }

  get currentPreset(): LightingPreset {
    return this.preset;
  }

  setShadowMapSize(size: number): void {
    if (this.shadow.mapSize !== size) this.shadow.mapSize = size;
  }

  /** Meshes lit by the explicit plasma glow approximation. */
  setPlasmaLitMeshes(meshes: AbstractMesh[]): void {
    this.plasmaLight.includedOnlyMeshes = meshes;
  }

  updatePlasmaLight(center: Vector3, intensity: number, color: [number, number, number], enabled: boolean): void {
    this.plasmaLight.position.copyFrom(center);
    this.plasmaLight.intensity = enabled ? intensity * 1.1 : 0;
    this.plasmaLight.diffuse.set(color[0], color[1], color[2]);
  }

  updateHeadlamp(camera: Camera): void {
    if (this.headlamp.intensity <= 0) return;
    const pos = camera.globalPosition;
    const fwd = camera.getDirection(Vector3.Forward());
    this.headlamp.position.set(pos.x + fwd.x * 0.1, pos.y + fwd.y * 0.1 + 0.05, pos.z + fwd.z * 0.1);
  }

  dispose(): void {
    this.shadow.dispose();
    this.key.dispose();
    this.fill.dispose();
    this.headlamp.dispose();
    this.plasmaLight.dispose();
  }
}
