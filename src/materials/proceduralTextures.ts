/**
 * Locally generated surface detail textures (no external assets): brushed/turned metal normal maps and
 * roughness variation. Generation is deterministic (seeded hash noise) so screenshots are reproducible.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * smoothNoise(x * f, y * f, seed + i * 17);
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

export interface ProceduralTextureSet {
  /** Fine anisotropic streaks along U (turning / brushing marks). Tangent-space normal map. */
  brushedNormal: Texture;
  /** Softer machining texture for cast/anodized surfaces. */
  machinedNormal: Texture;
  /** Grey roughness variation (R channel) used as a micro-surface texture. */
  roughnessNoise: Texture;
  /** Subtle speckle for ceramic. */
  ceramicNormal: Texture;
  dispose(): void;
}

function heightToNormalTexture(scene: Scene, size: number, height: (x: number, y: number) => number, strength: number, name: string): Texture {
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x];
      const u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz / len) * 0.5 * 255 + 127.5);
      data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  tex.name = name;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

export function createProceduralTextures(scene: Scene): ProceduralTextureSet {
  const size = 512;
  // Brushed: long streaks along x (U), fine noise across y.
  const brushedNormal = heightToNormalTexture(
    scene,
    size,
    (x, y) => {
      const streak = fbm(x * 0.012, y * 1.3, 11, 3) * 0.6 + fbm(x * 0.09, y * 3.1, 23, 2) * 0.4;
      return streak * 0.003;
    },
    170,
    "brushedNormal",
  );
  const machinedNormal = heightToNormalTexture(
    scene,
    size,
    (x, y) => {
      const base = fbm(x * 0.05, y * 0.05, 41, 4);
      const pits = hash2(x >> 1, y >> 1, 77) > 0.985 ? 0.8 : 0;
      return base * 0.004 + pits * 0.003;
    },
    140,
    "machinedNormal",
  );
  const ceramicNormal = heightToNormalTexture(
    scene,
    size,
    (x, y) => fbm(x * 0.12, y * 0.12, 91, 3) * 0.004 + (hash2(x, y, 5) > 0.97 ? 0.004 : 0),
    90,
    "ceramicNormal",
  );
  // Metallic-roughness workflow texture: R = ambient occlusion (1), G = roughness factor (0.72..1), B = metalness factor (1).
  const rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = fbm(x * 0.03, y * 0.6, 131, 3) * 0.7 + fbm(x * 0.2, y * 0.2, 151, 2) * 0.3;
      const g = Math.round(Math.min(1, Math.max(0, 0.72 + v * 0.28)) * 255);
      const i = (y * size + x) * 4;
      rough[i] = 255;
      rough[i + 1] = g;
      rough[i + 2] = 255;
      rough[i + 3] = 255;
    }
  }
  const roughnessNoise = RawTexture.CreateRGBATexture(rough, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  roughnessNoise.name = "roughnessNoise";
  roughnessNoise.wrapU = Texture.WRAP_ADDRESSMODE;
  roughnessNoise.wrapV = Texture.WRAP_ADDRESSMODE;
  roughnessNoise.anisotropicFilteringLevel = 8;

  return {
    brushedNormal,
    machinedNormal,
    roughnessNoise,
    ceramicNormal,
    dispose() {
      brushedNormal.dispose();
      machinedNormal.dispose();
      roughnessNoise.dispose();
      ceramicNormal.dispose();
    },
  };
}
