import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePresentationStore } from "../../presentation/store";
import { SceneHost } from "../../scene/sceneHost";
import { CarrierInset } from "./CarrierContents";
import { RouteCardOverlay, WaferInset } from "./WaferInset";

export function Viewport({ onHost }: { onHost: (host: SceneHost | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const renderer = usePresentationStore((s) => s.renderer);
  const devWarnings = usePresentationStore((s) => s.devWarnings);
  const [showWarnings, setShowWarnings] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const host = new SceneHost();
    const q = new URLSearchParams(window.location.search);
    const fixture = q.get("fixture");
    let cancelled = false;
    void host
      .mount(el, {
        fixture,
        plasmaDebugDepth: q.get("plasmaDebug") === "depth",
        flipDepthY: q.get("flipDepth") === "1",
      })
      .then(() => {
        if (!cancelled) onHost(host);
      });
    return () => {
      cancelled = true;
      onHost(null);
      host.dispose();
    };
  }, [onHost]);

  return (
    <div className="relative min-w-0 flex-1 bg-sunken" data-testid="viewport">
      <div ref={ref} className="absolute inset-0" />
      {renderer.status === "initializing" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-subtle" data-testid="loading" aria-busy="true">
          <span className="skeleton block h-40 w-72 rounded-lg" aria-hidden />
          <span className="text-body text-ink-muted">{renderer.message ?? "3D 장면을 준비하는 중"}</span>
        </div>
      )}
      {renderer.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas p-6" data-testid="renderer-error">
          <div className="max-w-lg rounded-lg border border-warn-line bg-canvas p-4 text-body shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-warn">
              <AlertTriangle className="h-4 w-4" aria-hidden /> 3D 렌더러를 시작할 수 없습니다
            </div>
            <p className="text-ink">{renderer.message}</p>
            {renderer.fallbackReason && <p className="mt-2 text-ink-muted">WebGPU 실패 원인: {renderer.fallbackReason}</p>}
            <ul className="mt-3 list-disc pl-5 text-ink-muted">
              <li>브라우저의 하드웨어 가속(GPU) 설정이 켜져 있는지 확인하세요.</li>
              <li>Chrome 최신 버전을 권장합니다. WebGL2 또는 WebGPU 중 하나가 필요합니다.</li>
              <li>
                강제 WebGL2: 주소에 <code>?renderer=webgl2</code> 를 추가해 다시 시도할 수 있습니다.
              </li>
            </ul>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-2">
        {devWarnings.length > 0 && showWarnings && (
          <div className="pointer-events-auto max-w-md rounded-lg border border-warn-line bg-canvas p-3 text-meta text-warn shadow-sm" data-testid="dev-warnings">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Configuration warnings ({devWarnings.length})</span>
              <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setShowWarnings(false)} aria-label="Dismiss warnings">
                ×
              </button>
            </div>
            <ul className="mt-1 list-disc pl-4">
              {devWarnings.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <CarrierInset />
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-line bg-canvas/95 px-3 py-1 text-meta text-ink-muted shadow-sm">
        Orbit: 좌클릭 드래그 · Pan: 우클릭/Ctrl 드래그 · Zoom: 휠 · 클릭: 부품 선택
      </div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-warn-line bg-warn-soft px-2 py-1 text-meta font-medium text-warn">VISUAL DEMO · Illustrative</div>
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
        <RouteCardOverlay />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3">
        <WaferInset />
      </div>
    </div>
  );
}
