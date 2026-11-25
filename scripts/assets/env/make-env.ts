// Prefilters an equirectangular .hdr into a Babylon .env (specular mip chain + SH) in the browser.
// Opened by scripts/assets/make-env.mjs through the Vite dev server; the result is read back by Playwright.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { EnvironmentTextureTools } from "@babylonjs/core/Misc/environmentTextureTools";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader";
import "@babylonjs/core/Engines/Extensions/engine.cubeTexture";
import "@babylonjs/core/Engines/Extensions/engine.renderTarget";
import "@babylonjs/core/Engines/Extensions/engine.renderTargetCube";
import "@babylonjs/core/Engines/Extensions/engine.readTexture";

const params = new URLSearchParams(location.search);
const src = params.get("src")!;
const size = Number(params.get("size") ?? "256");
const engine = new Engine(document.getElementById("c") as HTMLCanvasElement, false, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
const tex = new HDRCubeTexture(src, scene, size, false, true, false, true);
tex.onLoadObservable.addOnce(async () => {
  try {
    const buf = await EnvironmentTextureTools.CreateEnvTextureAsync(tex, { imageType: "image/png" });
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    (window as unknown as { __env: string }).__env = btoa(bin);
  } catch (e) {
    (window as unknown as { __envError: string }).__envError = String(e);
  }
});
