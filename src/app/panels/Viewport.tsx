import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePresentationStore } from "../../presentation/store";
import { SceneHost } from "../../scene/sceneHost";

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
    const fixture = q.get("fixture") === "two-chambers" ? "two-chambers" : null;
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
    <div className="relative min-w-0 flex-1 bg-[#0b0e12]" data-testid="viewport">
      <div ref={ref} className="absolute inset-0" />
      {renderer.status === "initializing" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/70 text-[13px] text-slate-300" data-testid="loading">
          {renderer.message ?? "로딩 중…"}
        </div>
      )}
      {renderer.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-6" data-testid="renderer-error">
          <div className="max-w-lg rounded border border-amber-700/60 bg-slate-900 p-4 text-[13px]">
            <div className="mb-2 flex items-center gap-2 text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden /> 3D 렌더러를 시작할 수 없습니다
            </div>
            <p className="text-slate-300">{renderer.message}</p>
            {renderer.fallbackReason && <p className="mt-2 text-slate-400">WebGPU 실패 원인: {renderer.fallbackReason}</p>}
            <ul className="mt-3 list-disc pl-5 text-slate-400">
              <li>브라우저의 하드웨어 가속(GPU) 설정이 켜져 있는지 확인하세요.</li>
              <li>Chrome 최신 버전을 권장합니다. WebGL2 또는 WebGPU 중 하나가 필요합니다.</li>
              <li>
                강제 WebGL2: 주소에 <code>?renderer=webgl2</code> 를 추가해 다시 시도할 수 있습니다.
              </li>
            </ul>
          </div>
        </div>
      )}
      {devWarnings.length > 0 && showWarnings && (
        <div className="absolute left-2 top-2 max-w-md rounded border border-amber-700/60 bg-slate-900/90 p-2 text-[11px] text-amber-200" data-testid="dev-warnings">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Configuration warnings ({devWarnings.length})</span>
            <button type="button" className="text-slate-400 hover:text-slate-100" onClick={() => setShowWarnings(false)} aria-label="Dismiss warnings">
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
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/60 px-2 py-1 text-[10px] text-slate-400">
        Orbit: 좌클릭 드래그 · Pan: 우클릭/Ctrl 드래그 · Zoom: 휠 · 클릭: 부품 선택
      </div>
    </div>
  );
}
