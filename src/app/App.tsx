import { useCallback, useState } from "react";
import { usePresentationStore } from "../presentation/store";
import type { SceneHost } from "../scene/sceneHost";
import { ComponentTree } from "./panels/ComponentTree";
import { Inspector } from "./panels/Inspector";
import { Timeline } from "./panels/Timeline";
import { TopBar } from "./panels/TopBar";
import { Viewport } from "./panels/Viewport";
import { VisualControls } from "./panels/VisualControls";

export function App() {
  const panels = usePresentationStore((s) => s.panels);
  const [host, setHost] = useState<SceneHost | null>(null);
  const onHost = useCallback((h: SceneHost | null) => setHost(h), []);
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {panels.tree && <ComponentTree />}
        <Viewport onHost={onHost} />
        {panels.inspector && (
          <aside className="panel-scroll flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-950/70" data-testid="right-panel">
            <Inspector />
            <VisualControls />
          </aside>
        )}
      </div>
      {panels.timeline && <Timeline host={host} />}
    </div>
  );
}
