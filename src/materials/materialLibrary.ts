/**
 * Shared PBR material presets. Materials are shared between meshes of one scene; per-instance
 * variants (x-ray transparency) are created lazily as clones so changing one instance never
 * affects another.
 */
import type { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { MaterialRef } from "../domain/types";
import type { ProceduralTextureSet } from "./proceduralTextures";

export interface MaterialPreset {
  albedo: [number, number, number];
  metallic: number;
  roughness: number;
  normal?: keyof Pick<ProceduralTextureSet, "brushedNormal" | "machinedNormal" | "ceramicNormal">;
  normalStrength?: number;
  roughnessNoise?: boolean;
  /** texture repeats per meter */
  uvScale?: number;
  specularAA?: boolean;
  environmentIntensity?: number;
}

export const MATERIAL_PRESETS: Record<Exclude<MaterialRef, "none" | "quartz">, MaterialPreset> = {
  aluminum_machined: { albedo: [0.86, 0.87, 0.88], metallic: 1, roughness: 0.36, normal: "brushedNormal", normalStrength: 0.18, roughnessNoise: true, uvScale: 6 },
  aluminum_anodized: { albedo: [0.38, 0.39, 0.41], metallic: 0.55, roughness: 0.62, normal: "machinedNormal", normalStrength: 0.5, roughnessNoise: true, uvScale: 5 },
  stainless: { albedo: [0.8, 0.81, 0.83], metallic: 1, roughness: 0.3, normal: "brushedNormal", normalStrength: 0.14, roughnessNoise: true, uvScale: 14 },
  painted_housing: { albedo: [0.62, 0.63, 0.61], metallic: 0, roughness: 0.5, normal: "machinedNormal", normalStrength: 0.12, uvScale: 3 },
  ceramic: { albedo: [0.93, 0.90, 0.84], metallic: 0, roughness: 0.48, normal: "ceramicNormal", normalStrength: 0.5, uvScale: 8 },
  silicon_wafer: { albedo: [0.17, 0.18, 0.21], metallic: 0.9, roughness: 0.18, specularAA: true, environmentIntensity: 0.3 },
  copper: { albedo: [0.93, 0.62, 0.45], metallic: 1, roughness: 0.34, normal: "brushedNormal", normalStrength: 0.3, uvScale: 12 },
  nichrome: { albedo: [0.55, 0.52, 0.48], metallic: 1, roughness: 0.55, normal: "machinedNormal", normalStrength: 0.3, uvScale: 20 },
  dark_steel: { albedo: [0.32, 0.33, 0.35], metallic: 1, roughness: 0.5, normal: "machinedNormal", normalStrength: 0.4, uvScale: 6 },
};

export type SharedMaterialKey = Exclude<MaterialRef, "none"> | `${Exclude<MaterialRef, "none" | "quartz">}_cap`;

export class MaterialLibrary {
  private readonly cache = new Map<string, PBRMaterial>();
  private readonly xrayCache = new Map<string, PBRMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly textures: ProceduralTextureSet,
  ) {}

  /** Shared surface material for a material reference. */
  get(ref: Exclude<MaterialRef, "none">): PBRMaterial {
    if (ref === "quartz") return this.glass();
    return this.getOrCreate(ref, () => this.createFromPreset(ref, MATERIAL_PRESETS[ref]));
  }

  /** Matte, darker variant used for cutaway section caps so cut faces read as solid material. */
  sectionCap(ref: Exclude<MaterialRef, "none" | "quartz">): PBRMaterial {
    return this.getOrCreate(`${ref}_cap`, () => {
      const p = MATERIAL_PRESETS[ref];
      const m = new PBRMaterial(`mat.${ref}.cap`, this.scene);
      m.albedoColor = new Color3(p.albedo[0] * 0.3, p.albedo[1] * 0.3, p.albedo[2] * 0.32);
      m.metallic = 0;
      m.roughness = 0.85;
      m.environmentIntensity = 0.7;
      m.backFaceCulling = true;
      return m;
    });
  }

  glass(): PBRMaterial {
    return this.getOrCreate("quartz", () => {
      const m = new PBRMaterial("mat.quartz", this.scene);
      m.albedoColor = new Color3(0.95, 0.97, 1.0);
      m.metallic = 0;
      m.roughness = 0.04;
      m.alpha = 0.28;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      m.indexOfRefraction = 1.46;
      m.subSurface.isRefractionEnabled = false;
      m.backFaceCulling = false;
      m.environmentIntensity = 1.2;
      m.needDepthPrePass = false;
      return m;
    });
  }

  /** Transparent variant of `base` for x-ray shell display; cached per base material. */
  xrayVariant(base: PBRMaterial, opacity: number): PBRMaterial {
    const key = base.uniqueId.toString();
    let m = this.xrayCache.get(key);
    if (!m) {
      m = base.clone(`${base.name}.xray`) as PBRMaterial;
      m.bumpTexture = null;
      m.metallicTexture = null;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      m.backFaceCulling = true;
      m.needDepthPrePass = true;
      m.separateCullingPass = false;
      m.alphaMode = Constants.ALPHA_COMBINE;
      this.xrayCache.set(key, m);
    }
    m.alpha = opacity;
    return m;
  }

  setXrayOpacity(opacity: number): void {
    for (const m of this.xrayCache.values()) m.alpha = opacity;
  }

  private getOrCreate(key: string, make: () => PBRMaterial): PBRMaterial {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  private createFromPreset(ref: string, p: MaterialPreset): PBRMaterial {
    const m = new PBRMaterial(`mat.${ref}`, this.scene);
    m.albedoColor = new Color3(p.albedo[0], p.albedo[1], p.albedo[2]);
    m.metallic = p.metallic;
    m.roughness = p.roughness;
    m.backFaceCulling = true;
    m.enableSpecularAntiAliasing = p.specularAA ?? true;
    m.useRadianceOcclusion = true;
    m.useHorizonOcclusion = true;
    if (p.normal) {
      const src = this.textures[p.normal];
      const tex = src.clone() as Texture;
      tex.uScale = p.uvScale ?? 4;
      tex.vScale = p.uvScale ?? 4;
      tex.level = p.normalStrength ?? 0.5;
      m.bumpTexture = tex;
      m.invertNormalMapX = false;
      m.invertNormalMapY = false;
    }
    if (p.roughnessNoise) {
      const tex = this.textures.roughnessNoise.clone() as Texture;
      tex.uScale = (p.uvScale ?? 4) * 0.5;
      tex.vScale = (p.uvScale ?? 4) * 0.5;
      m.metallicTexture = tex;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useRoughnessFromMetallicTextureAlpha = false;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.useAmbientOcclusionFromMetallicTextureRed = false;
    }
    if (p.environmentIntensity !== undefined) m.environmentIntensity = p.environmentIntensity;
    return m;
  }

  dispose(): void {
    for (const m of this.xrayCache.values()) m.dispose(true, false);
    for (const m of this.cache.values()) m.dispose(true, true);
    this.cache.clear();
    this.xrayCache.clear();
  }
}
