import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Search } from "lucide-react";
import { ASSEMBLIES, COMPONENTS } from "../../domain/ccpChamberTemplate";
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
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ASSEMBLIES.slice()
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        assembly: a,
        items: COMPONENTS.filter((c) => c.assembly === a.id && (!q || c.name.toLowerCase().includes(q) || c.assetId.includes(q) || c.nodeKey.includes(q))),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/70" data-testid="component-tree">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Component tree</div>
        <div className="mb-1.5 truncate text-[11px] text-slate-500" title={activeInstanceId}>
          {activeInstanceId}
        </div>
        <label className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1">
          <Search className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          <input className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate-600" placeholder="부품 검색 (English name / id)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search components" data-testid="tree-search" />
        </label>
      </div>
      <div className="panel-scroll flex-1 overflow-y-auto py-1">
        {groups.map(({ assembly, items }) => {
          const isCollapsed = collapsed[assembly.id] && !query;
          return (
            <div key={assembly.id}>
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 py-1 text-left text-[12px] font-medium text-slate-300 hover:bg-slate-800/60"
                onClick={() => setCollapsed((c) => ({ ...c, [assembly.id]: !c[assembly.id] }))}
                title={assembly.description}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                {assembly.name}
                <span className="ml-auto text-[10px] text-slate-500">{items.length}</span>
              </button>
              {!isCollapsed &&
                items.map((c) => {
                  const isSel = selected === c.assetId;
                  const isHov = hovered === c.assetId;
                  const isHidden = hidden.includes(c.assetId) || (isolated !== null && isolated !== c.assetId);
                  return (
                    <div
                      key={c.assetId}
                      className={`group flex items-center gap-1 pl-6 pr-2 ${isSel ? "bg-sky-500/20 text-sky-100" : isHov ? "bg-slate-800/70" : "hover:bg-slate-800/50"}`}
                      onMouseEnter={() => hover(c.assetId)}
                      onMouseLeave={() => hover(null)}
                      data-testid={`tree-item-${c.assetId}`}
                      data-selected={isSel ? "true" : "false"}
                    >
                      <button type="button" className={`flex-1 truncate py-1 text-left text-[12px] ${isHidden ? "text-slate-500 line-through" : ""}`} onClick={() => select(c.assetId)} title={c.description}>
                        {c.name}
                      </button>
                      {c.assetId !== "plasma_volume" && (
                        <button type="button" className="rounded p-0.5 text-slate-500 opacity-60 hover:text-slate-200 group-hover:opacity-100" onClick={() => toggleHidden(c.assetId)} title={isHidden ? "Show" : "Hide"} aria-label={`${isHidden ? "Show" : "Hide"} ${c.name}`}>
                          {isHidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
