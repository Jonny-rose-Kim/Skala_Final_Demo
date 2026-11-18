import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronsRight } from "lucide-react";
import { usePresentationStore } from "../../presentation/store";

/** The old fixed width (18rem at the 13 px root size), so the default layout and QA captures stay the same. */
const DEFAULT_WIDTH = 234;
const MIN_WIDTH = 160;
/** Dragging the edge further left than this folds the tree into the rail. */
const FOLD_BELOW = 96;
const KEY_STEP = 16;

/** Half the window, at most 560 px. */
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(560, Math.round(window.innerWidth / 2)));
const clampWidth = (w: number) => Math.min(Math.max(Math.round(w), MIN_WIDTH), maxWidth());

/**
 * Left dock of the component tree. The right edge drags to change the width; dragging it past the minimum folds
 * the tree into a thin rail on the left edge, and the rail opens it again (click, drag or Enter). The tree stays
 * mounted while folded, so its search text and folded groups survive.
 */
export function TreeDock({ children }: { children: ReactNode }) {
  const open = usePresentationStore((s) => s.panels.tree);
  const setPanel = usePresentationStore((s) => s.setPanel);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; from: number; restore: number; moved: boolean } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, from: open ? width : 0, restore: width, moved: false };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const w = d.from + dx;
    if (w < FOLD_BELOW) {
      // folded during the drag: opening it later brings back the width it had before
      setWidth(d.restore);
      setPanel("tree", false);
    } else {
      setWidth(clampWidth(w));
      setPanel("tree", true);
    }
  };

  const endDrag = (released: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    // a click on the rail opens the tree
    if (released && !d.moved && !open) setPanel("tree", true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") setPanel("tree", !open);
    else if (e.key === "ArrowLeft" && open) setWidth((w) => clampWidth(w - KEY_STEP));
    else if (e.key === "ArrowRight" && open) setWidth((w) => clampWidth(w + KEY_STEP));
    else if (e.key === "ArrowRight") setPanel("tree", true);
    else return;
    e.preventDefault();
  };

  return (
    <div className="relative flex h-full shrink-0" data-testid="tree-dock">
      <div className={open ? "h-full" : "hidden"} style={{ width, maxWidth: "50vw" }}>
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-controls="component-tree"
        aria-label="Component tree 폭"
        aria-valuemin={0}
        aria-valuemax={maxWidth()}
        aria-valuenow={open ? width : 0}
        tabIndex={0}
        title={open ? "끌어서 폭을 바꿉니다. 왼쪽 끝까지 밀면 접히고, 더블클릭하면 기본 폭으로 돌아갑니다." : "누르거나 오른쪽으로 끌면 Component tree가 펼쳐집니다."}
        className={
          open
            ? `absolute inset-y-0 right-[-5px] z-10 w-[8px] cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:left-[1px] after:w-[3px] ${dragging ? "after:bg-accent" : "hover:after:bg-accent"}`
            : `flex w-[20px] shrink-0 cursor-pointer touch-none select-none flex-col items-center gap-2 border-r border-line pt-3 hover:bg-sunken hover:text-ink ${dragging ? "bg-sunken text-ink" : "bg-subtle text-ink-muted"}`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onLostPointerCapture={() => endDrag(false)}
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH);
          setPanel("tree", true);
        }}
        onKeyDown={onKeyDown}
        data-testid="tree-resizer"
      >
        {!open && (
          <>
            <ChevronsRight className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-meta font-semibold [writing-mode:vertical-rl]">Component tree</span>
          </>
        )}
      </div>
    </div>
  );
}
