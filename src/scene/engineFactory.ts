/**
 * Engine creation with explicit backend selection and a one-shot WebGPU -> WebGL2 fallback.
 * A canvas that has been handed to WebGPU is never reused for WebGL2: the fallback path creates a
 * fresh canvas and engine. No infinite retry loops.
 */
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
// Engine extensions that the modular (tree-shaken) Babylon build does not register by default but
// which the depth renderer, geometry buffer (SSAO), shadow maps and procedural textures rely on.
import "@babylonjs/core/Engines/Extensions/engine.multiRender";
import "@babylonjs/core/Engines/Extensions/engine.query";
import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTarget";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTargetTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTargetCube";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.readTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.cubeTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.query";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.alpha";

export type BackendId = "webgpu" | "webgl2";

export interface CreatedEngine {
  engine: AbstractEngine;
  backend: BackendId;
  canvas: HTMLCanvasElement;
  gpuDescription: string;
}

export interface EngineCreationLog {
  (message: string): void;
}

export function createCanvas(container: HTMLElement, id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "PECVD chamber 3D viewport");
  container.appendChild(canvas);
  return canvas;
}

export async function tryCreateWebGPU(canvas: HTMLCanvasElement, log: EngineCreationLog): Promise<CreatedEngine | null> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    log("WebGPU: navigator.gpu 없음");
    return null;
  }
  let supported = false;
  try {
    supported = await WebGPUEngine.IsSupportedAsync;
  } catch (e) {
    log(`WebGPU: 지원 확인 실패 (${String(e)})`);
    return null;
  }
  if (!supported) {
    log("WebGPU: adapter를 얻을 수 없음 (브라우저/OS에서 비활성)");
    return null;
  }
  let engine: WebGPUEngine | null = null;
  try {
    engine = new WebGPUEngine(canvas, {
      antialias: true,
      stencil: true,
      adaptToDeviceRatio: false,
      powerPreference: "high-performance",
      enableAllFeatures: false,
      setMaximumLimits: false,
    });
    await engine.initAsync();
    const info = engine.getInfo?.() ?? { vendor: "", renderer: "", version: "" };
    const desc = [info.vendor, info.renderer, info.version].filter(Boolean).join(" / ") || "WebGPU adapter";
    log(`WebGPU: 초기화 성공 (${desc})`);
    return { engine, backend: "webgpu", canvas, gpuDescription: desc };
  } catch (e) {
    log(`WebGPU: 초기화 실패 (${String(e)})`);
    try {
      engine?.dispose();
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function tryCreateWebGL2(canvas: HTMLCanvasElement, log: EngineCreationLog): CreatedEngine {
  const engine = new Engine(
    canvas,
    true,
    {
      stencil: true,
      adaptToDeviceRatio: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    },
    false,
  );
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error("WebGL2를 사용할 수 없습니다. 브라우저의 하드웨어 가속 설정을 확인하세요.");
  }
  const gl = engine.getGlInfo();
  const desc = `${gl.vendor ?? ""} ${gl.renderer ?? ""}`.trim() || "WebGL2";
  log(`WebGL2: 초기화 성공 (${desc})`);
  return { engine, backend: "webgl2", canvas, gpuDescription: desc };
}

export function readForceWebGL2(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get("renderer") === "webgl2" || q.get("forceWebGL2") === "1") return true;
  try {
    return window.localStorage.getItem("pecvd.forceWebGL2") === "1";
  } catch {
    return false;
  }
}
