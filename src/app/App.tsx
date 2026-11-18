import { useCallback, useState } from "react";
import "../equipment/index";
import { usePresentationStore } from "../presentation/store";
import type { SceneHost } from "../scene/sceneHost";
import { ComponentTree } from "./panels/ComponentTree";
import { Timeline } from "./panels/Timeline";
import { TopBar } from "./panels/TopBar";
import { TreeDock } from "./panels/TreeDock";
import { Viewport } from "./panels/Viewport";

export function App() {
  const timelineOpen = usePresentationStore((s) => s.panels.timeline);
  const [host, setHost] = useState<SceneHost | null>(null);
  const onHost = useCallback((h: SceneHost | null) => setHost(h), []);
  return (
    <div className="flex h-full flex-col">
      <TopBar host={host} />
      <div className="flex min-h-0 flex-1">
        <TreeDock>
          <ComponentTree />
        </TreeDock>
        <Viewport onHost={onHost} />
      </div>
      {timelineOpen && <Timeline host={host} />}
    </div>
  );
}
