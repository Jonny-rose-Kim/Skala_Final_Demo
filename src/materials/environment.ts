/**
 * Procedural cleanroom environment: an equirectangular RGBE (.hdr) panorama generated in memory
 * (bright ceiling light panels, neutral walls, darker floor) and loaded as a prefiltered HDRCubeTexture
 * so PBR reflections and ambient lighting work offline without external HDRI files.
 */
import type { Scene } from "@babylonjs/core/scene";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";

function float2rgbe(r: number, g: number, b: number, out: Uint8Array, o: number): void {
  const v = Math.max(r, g, b);
  if (v < 1e-32) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  const e = Math.ceil(Math.log2(v));
  const scale = Math.pow(2, -e) * 256;
  out[o] = Math.min(255, Math.floor(r * scale));
  out[o + 1] = Math.min(255, Math.floor(g * scale));
  out[o + 2] = Math.min(255, Math.floor(b * scale));
  out[o + 3] = e + 128;
}

export interface EnvironmentOptions {
  width?: number;
  /** Peak luminance of the ceiling panels. */
  panelLuminance?: number;
}

/** Build the RGBE panorama bytes (flat, non-RLE scanlines are accepted by Babylon's HDR reader). */
export function buildCleanroomHdr(opts: EnvironmentOptions = {}): Uint8Array {
  const width = opts.width ?? 512;
  const height = width / 2;
  const panelLum = opts.panelLuminance ?? 5.5;
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  const headerBytes = new TextEncoder().encode(header);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1); // 0 = top (zenith), 1 = bottom
    const elevation = (0.5 - v) * Math.PI; // +pi/2 up
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const az = u * Math.PI * 2;
      let r = 0;
      let g = 0;
      let b = 0;
      if (elevation > 0.45) {
        // ceiling: grid of light panels with diffuser gradient
        const gx = Math.abs(((az / (Math.PI / 4)) % 1) - 0.5);
        const gy = Math.abs((((elevation - 0.45) / 0.35) % 1) - 0.5);
        const panel = gx < 0.33 && gy < 0.3 ? 1 : 0;
        const soft = Math.max(0, 1 - Math.max(gx / 0.4, gy / 0.36));
        const lum = 0.32 + panel * panelLum * (0.6 + 0.4 * soft) + soft * 0.3;
        r = lum * 1.0;
        g = lum * 1.0;
        b = lum * 1.04;
      } else if (elevation > -0.12) {
        // walls: neutral light grey with subtle vertical variation and a brighter band near the ceiling
        const t = (elevation + 0.12) / 0.57;
        const lum = 0.2 + 0.2 * t;
        const stripe = Math.sin(az * 6) * 0.03;
        r = lum + stripe;
        g = lum + stripe;
        b = lum * 1.02 + stripe;
      } else {
        // floor: darker, slightly warm, with a soft falloff
        const t = Math.min(1, (-elevation - 0.12) / 1.4);
        const lum = 0.1 - 0.05 * t;
        r = lum * 1.0;
        g = lum * 0.98;
        b = lum * 0.95;
      }
      float2rgbe(r, g, b, pixels, (y * width + x) * 4);
    }
  }
  const out = new Uint8Array(headerBytes.length + pixels.length);
  out.set(headerBytes, 0);
  out.set(pixels, headerBytes.length);
  return out;
}

export function createCleanroomEnvironment(scene: Scene, opts: EnvironmentOptions = {}): Promise<HDRCubeTexture> {
  const bytes = buildCleanroomHdr(opts);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "image/vnd.radiance" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const tex = new HDRCubeTexture(
      url,
      scene,
      128,
      false,
      true,
      false,
      true,
      () => {
        URL.revokeObjectURL(url);
        resolve(tex);
      },
      (msg, ex) => {
        URL.revokeObjectURL(url);
        reject(ex ?? new Error(msg ?? "HDR environment failed"));
      },
    );
    tex.name = "cleanroomEnvironment";
  });
}
