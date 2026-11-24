/** Debug API exposed by the scene host for QA and e2e (window.__pecvdTwin). */
export {};

declare global {
  interface Window {
    __pecvdTwin?: {
      isReady(): boolean;
      backend(): "webgpu" | "webgl2" | null;
      setCamera(a: number, b: number, r: number, t: [number, number, number]): void;
      setCameraLocal(id: string, a: number, b: number, r: number, t: [number, number, number]): void;
      freezeTime(t: number | null): void;
      stats(): Record<string, unknown> | null;
      preview(): any;
      scenario(): string | null;
      stations(): Record<string, any>;
      logs(): string[];
      evaluateAt(t: number): any;
      waferMeshes(): { instanceId: string; assetId: string; center: [number, number, number] }[];
      covers(): Record<string, boolean | null>;
      cuts(): Record<string, { startDeg: number; sweepDeg: number }[] | null>;
      store: { getState(): Record<string, any> };
      applyAgentEvent(e: any): any;
      clearDiagnosis(): void;
      host: any;
    };
  }
}
