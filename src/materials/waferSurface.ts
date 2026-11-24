/**
 * Wafer front-surface materials driven by the illustrative film state (never by a measurement).
 *
 *   bare Si            library wafer_front material
 *   deposited oxide    thin-film interference (PBR iridescence); thickness grows with the schematic fraction
 *   masked             die grid with a line / space mask pattern (photoresist tone on the mask lines)
 *   etched             exposed spaces turn to the layer below (Si tone, no interference), mask lines stay
 *   stripped           mask removed: oxide lines (interference) next to etched spaces
 *   residue            faint grey speckle in the exposed spaces; reduced after the clean
 *
 * The pattern is a concept texture: the die pitch and the line count are readable from the default camera and
 * are not the device scale. Nothing here carves geometry into the 300 mm wafer.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { IllustrativeFilmState } from "../presentation/preview";

const DIE_MM = 22;
const LINES_PER_DIE = 7;
const SIZE = 1024;

export interface WaferSurfaceKey {
  oxide: number;
  mask: "absent" | "retained" | "removed";
  exposed: number;
  residue: number;
}

export function surfaceKey(f: IllustrativeFilmState | undefined): WaferSurfaceKey | null {
  if (!f) return null;
  const ox = f.layers.find((l) => l.role === "target_oxide")?.presentFraction ?? 0;
  const res = f.layers.find((l) => l.role === "residue")?.presentFraction ?? 0;
  const q = (x: number, n: number) => Math.round(Math.min(1, Math.max(0, x)) * n) / n;
  const key: WaferSurfaceKey = { oxide: q(ox, 10), mask: f.pattern?.mask ?? "absent", exposed: q(f.pattern?.exposedOxideRemaining ?? 1, 8), residue: q(res, 4) };
  if (key.oxide === 0 && key.mask === "absent") return null; // bare: keep the library material
  return key;
}

export class WaferSurfaceLibrary {
  private readonly materials = new Map<string, PBRMaterial>();
  private readonly textures = new Map<string, { albedo: DynamicTexture; irid: DynamicTexture }>();

  constructor(
    private readonly scene: Scene,
    private readonly base: PBRMaterial,
  ) {}

  /** Material for a film state (null = the bare library material). */
  materialFor(f: IllustrativeFilmState | undefined): Material | null {
    const k = surfaceKey(f);
    if (!k) return null;
    const id = `${k.oxide}|${k.mask}|${k.exposed}|${k.residue}`;
    let m = this.materials.get(id);
    if (m) return m;
    m = this.base.clone(`mat.wafer_surface.${id}`) as PBRMaterial;
    m.iridescence.isEnabled = k.oxide > 0;
    m.iridescence.intensity = k.oxide > 0 ? 1 : 0;
    m.iridescence.indexOfRefraction = 1.46;
    // illustrative thickness range for the interference colour (nm); grows with the schematic fraction
    m.iridescence.minimumThickness = 60 + 220 * k.oxide;
    m.iridescence.maximumThickness = 60 + 220 * k.oxide;
    m.roughness = 0.12 + 0.12 * k.residue;
    if (k.mask !== "absent") {
      const tx = this.patternTextures(k);
      m.albedoTexture = tx.albedo;
      m.albedoColor = new Color3(1, 1, 1);
      m.iridescence.texture = tx.irid;
    }
    this.materials.set(id, m);
    return m;
  }

  private patternTextures(k: WaferSurfaceKey): { albedo: DynamicTexture; irid: DynamicTexture } {
    const id = `${k.mask}|${k.exposed}|${k.residue}`;
    const hit = this.textures.get(id);
    if (hit) return hit;
    const albedo = new DynamicTexture(`tex.wafer_pattern.${id}`, { width: SIZE, height: SIZE }, this.scene, true);
    const irid = new DynamicTexture(`tex.wafer_irid.${id}`, { width: SIZE, height: SIZE }, this.scene, true);
    const a = albedo.getContext() as unknown as CanvasRenderingContext2D;
    const b = irid.getContext() as unknown as CanvasRenderingContext2D;
    const px = SIZE / 300; // texture pixels per mm (UV 0..1 spans the 300 mm wafer)
    const die = DIE_MM * px;
    const etched = 1 - k.exposed; // 0 = untouched, 1 = cleared to the layer below
    // base: oxide everywhere (albedo neutral, full interference)
    a.fillStyle = "rgb(200,204,214)";
    a.fillRect(0, 0, SIZE, SIZE);
    b.fillStyle = "rgb(255,255,255)";
    b.fillRect(0, 0, SIZE, SIZE);
    const lineW = die / (LINES_PER_DIE * 2);
    for (let x0 = 0; x0 < SIZE; x0 += die) {
      for (let y0 = 0; y0 < SIZE; y0 += die) {
        // scribe lines between dies
        a.fillStyle = "rgb(150,154,162)";
        a.fillRect(x0, y0, die, 2);
        a.fillRect(x0, y0, 2, die);
        for (let i = 0; i < LINES_PER_DIE; i++) {
          const lx = x0 + 4 + i * 2 * lineW;
          // mask line (retained: photoresist tone; removed: the oxide under it shows)
          if (k.mask === "retained") {
            a.fillStyle = "rgb(176,112,84)";
            a.fillRect(lx, y0 + 4, lineW, die - 8);
            b.fillStyle = "rgb(60,60,60)";
            b.fillRect(lx, y0 + 4, lineW, die - 8);
          }
          // exposed space: interference fades and the Si tone appears as the etch clears it
          const sx = lx + lineW;
          const g = Math.round(204 - 120 * etched);
          a.fillStyle = `rgb(${Math.round(200 - 140 * etched)},${Math.round(g - 10 * etched)},${Math.round(214 - 110 * etched)})`;
          a.fillRect(sx, y0 + 4, lineW, die - 8);
          const ir = Math.round(255 * (1 - etched));
          b.fillStyle = `rgb(${ir},${ir},${ir})`;
          b.fillRect(sx, y0 + 4, lineW, die - 8);
          if (k.residue > 0) {
            // deterministic speckle in the exposed space
            a.fillStyle = `rgba(225,225,220,${0.45 * k.residue})`;
            for (let s = 0; s < 6; s++) {
              const fx = (Math.sin((x0 + i * 13 + s * 7) * 12.9898 + y0 * 78.233) * 43758.5453) % 1;
              const fy = (Math.sin((y0 + s * 31 + i) * 39.346 + x0 * 11.135) * 24634.6345) % 1;
              a.fillRect(sx + Math.abs(fx) * (lineW - 2), y0 + 4 + Math.abs(fy) * (die - 12), 2, 3);
            }
          }
        }
      }
    }
    albedo.update(false);
    irid.update(false);
    for (const t of [albedo, irid]) {
      t.wrapU = Texture.CLAMP_ADDRESSMODE;
      t.wrapV = Texture.CLAMP_ADDRESSMODE;
      t.anisotropicFilteringLevel = 8;
    }
    const out = { albedo, irid };
    this.textures.set(id, out);
    return out;
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose(false, false);
    for (const t of this.textures.values()) {
      t.albedo.dispose();
      t.irid.dispose();
    }
    this.materials.clear();
    this.textures.clear();
  }
}
