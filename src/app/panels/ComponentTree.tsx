import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsLeft, Eye, EyeOff, Search } from "lucide-react";
import { getBundle } from "../../domain/registry";
import { usePresentationStore } from "../../presentation/store";

export function ComponentTree() {
  const selected = usePresentationStore((s) => s.selectedAssetId);
  const hovered = usePresentationStore((s) => s.hoveredAssetId);
  const select = usePresentationStore((s) => s.select);
  const hover = usePresentationStore((s) => s.hover);
  const hidden = usePresentationStore((s) => s.hiddenAssets);
  const toggleHidden = usePresentationStore((s) => s.toggleHidden);
  const isolated = usePresentationStore((s) => s.isolatedAssetId);
  const activeInstanceId = usePresentationStore((s) => s.activeInstanceId);
  const instances = usePresentationStore((s) => s.instances);
  const setPanel = usePresentationStore((s) => s.setPanel);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const info = instances.find((i) => i.instanceId === activeInstanceId);
  const bundle = info ? getBundle(info.templateId) : undefined;

  const groups = useMemo(() => {
    if (!bundle) return [];
    const q = query.trim().toLowerCase();
    const t = bundle.template;
    return t.assemblies
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        assembly: a,
        items: t.components.filter((c) => c.assembly === a.id && (!q || c.name.toLowerCase().includes(q) || c.assetId.includes(q) || c.nodeKey.includes(q))),
      }))
      .filter((g) => g.items.length > 0);
  }, [query, bundle]);

  return (
    <aside id="component-tree" className="flex h-full w-full flex-col border-r border-line bg-subtle" data-testid="component-tree">
      <div className="border-b border-line px-3 pb-3 pt-3">
        <div className="mb-1 flex items-center justify-between gap-1">
          <span className="truncate text-meta font-semibold text-ink">Component tree</span>
          <button type="button" className="shrink-0 rounded p-1 text-ink-muted hover:bg-subtle hover:text-ink" onClick={() => setPanel("tree", false)} title="왼쪽 가장자리로 접기" aria-label="Component tree 접기" data-testid="fold-tree">
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mb-2 truncate text-meta text-ink-muted" title={activeInstanceId}>
          {activeInstanceId}
          {bundle ? <span className="text-ink-muted"> · {bundle.template.displayName}</span> : null}
        </div>
        <label className="flex h-9 items-center gap-2 rounded border border-control bg-canvas px-2 pointer-coarse:h-11">
          <Search className="h-4 w-4 text-ink-muted" aria-hidden />
          <input className="w-full bg-transparent text-meta outline-none placeholder:text-ink-muted" placeholder="부품 검색 (English name / id)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search components" data-testid="tree-search" />
        </label>
      </div>
      <div className="panel-scroll flex-1 overflow-y-auto py-1">
        {groups.map(({ assembly, items }) => {
          const isCollapsed = collapsed[assembly.id] && !query;
          return (
            <div key={assembly.id}>
              <button
                type="button"
                className="flex min-h-8 w-full items-center gap-1 px-2 text-left text-meta font-semibold text-ink hover:bg-sunken pointer-coarse:min-h-11"
                onClick={() => setCollapsed((c) => ({ ...c, [assembly.id]: !c[assembly.id] }))}
                title={assembly.description}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                {assembly.name}
                <span className="ml-auto text-meta text-ink-muted">{items.length}</span>
              </button>
              {!isCollapsed &&
                items.map((c) => {
                  const isSel = selected === c.assetId;
                  const isHov = hovered === c.assetId;
                  const isHidden = hidden.includes(c.assetId) || (isolated !== null && isolated !== c.assetId);
                  const isEffect = c.kind === "effect";
                  return (
                    <div
                      key={c.assetId}
                      className={`group flex items-center gap-1 pl-6 pr-2 ${isSel ? "bg-accent-soft font-medium text-accent-strong" : isHov ? "bg-sunken" : "hover:bg-sunken"}`}
                      onMouseEnter={() => hover(c.assetId)}
                      onMouseLeave={() => hover(null)}
                      data-testid={`tree-item-${c.assetId}`}
                      data-selected={isSel ? "true" : "false"}
                    >
                      <button type="button" className={`min-h-8 flex-1 truncate py-1 text-left text-body pointer-coarse:min-h-11 ${isHidden ? "text-ink-muted line-through" : ""}`} onClick={() => select(c.assetId)} title={`${c.name}\n${c.description}`}>
                        {c.name}
                      </button>
                      {!isEffect && (
                        <button type="button" className="rounded p-1 text-ink-muted hover:bg-canvas hover:text-ink" onClick={() => toggleHidden(c.assetId)} title={isHidden ? "Show" : "Hide"} aria-label={`${isHidden ? "Show" : "Hide"} ${c.name}`}>
                          {isHidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
        {!bundle && (
          <div className="space-y-3 px-3 py-2" aria-busy="true" aria-label="부품 목록을 불러오는 중">
            {[28, 40, 32, 36, 24].map((w, i) => (
              <span key={i} className="skeleton block h-4" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
