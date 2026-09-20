import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Compass, AlertTriangle, Search } from "lucide-react";
import { useApp } from "../store";
import type { CFNode, NodeType } from "../model";
import { TYPE_COLOR } from "../model";

const GROUPS: { label: string; kinds: NodeType[] }[] = [
  { label: "Features", kinds: ["feature"] },
  { label: "Services", kinds: ["service"] },
  { label: "Data", kinds: ["database"] },
  { label: "Integrations", kinds: ["external"] },
  { label: "Background jobs", kinds: ["job"] },
  { label: "Pages", kinds: ["page"] },
];

function Row({ n, sub }: { n: CFNode; sub?: string }) {
  const select = useApp((s) => s.select);
  const focusNode = useApp((s) => s.focusNode);
  const selectedId = useApp((s) => s.selectedId);
  const c = TYPE_COLOR[n.data.kind];
  const active = selectedId === n.id;
  return (
    <button
      onClick={() => {
        select(n.id);
        focusNode(n.id);
      }}
      className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.75 text-left transition ${
        active ? "bg-ink-800" : "hover:bg-ink-850"
      }`}
      style={active ? { boxShadow: `inset 2px 0 0 ${c}` } : undefined}
    >
      <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: c }} />
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${active ? "text-ink-50" : "text-ink-300 group-hover:text-ink-200"}`}>
        {n.data.name}
      </span>
      {sub && <span className="shrink-0 font-mono text-[9px] text-ink-500">{sub}</span>}
    </button>
  );
}

export default function Explorer() {
  const open = useApp((s) => s.explorerOpen);
  const toggle = useApp((s) => s.toggleExplorer);
  const nodes = useApp((s) => s.nodes);
  const edges = useApp((s) => s.edges);
  const stats = useApp((s) => s.stats);
  const notes = useApp((s) => s.notes);
  const setTour = useApp((s) => s.setTour);
  const notify = useApp((s) => s.notify);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const ql = q.toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      items: nodes.filter(
        (n) => g.kinds.includes(n.data.kind) && (!ql || n.data.name.toLowerCase().includes(ql))
      ),
    }));
  }, [nodes, q]);

  const subFor = (n: CFNode) => {
    const deg = edges.filter((e) => e.source === n.id || e.target === n.id).length;
    if (n.data.kind === "feature") {
      const pages = edges.filter((e) => e.source === n.id && e.target.startsWith("p-")).length;
      return `${pages}p · ${deg}↔`;
    }
    if (n.data.kind === "database" && n.data.meta.columns) return `${n.data.meta.columns} cols`;
    return `${deg}↔`;
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.aside
            key="explorer"
            initial={{ x: -288, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -288, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="pointer-events-auto absolute bottom-0 left-0 top-14 z-30 flex w-68 flex-col border-r border-t border-ink-800 bg-ink-900/95 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-400">Explorer</span>
              <button onClick={toggle} className="text-ink-400 transition hover:text-ink-50" aria-label="Collapse explorer">
                <PanelLeftClose size={15} />
              </button>
            </div>

            <div className="border-b border-ink-800 p-3">
              <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/70 px-2.5 py-1.5">
                <Search size={12} className="text-ink-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter the tree"
                  className="w-full bg-transparent text-[12px] text-ink-200 outline-none placeholder:text-ink-600"
                />
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {[
                  [stats.files, "files"],
                  [stats.apis, "APIs"],
                  [stats.tables, "tables"],
                ].map(([v, l]) => (
                  <div key={String(l)} className="rounded-md border border-ink-800 bg-ink-950/50 px-2 py-1.5 text-center">
                    <div className="font-display text-[13px] font-bold text-ink-100">{v}</div>
                    <div className="font-mono text-[8px] uppercase tracking-widest text-ink-500">{l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {notes.map((n) => (
                <div key={n} className="mb-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 px-2.5 py-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-300" />
                  <span className="text-[10.5px] leading-snug text-ink-300">{n}</span>
                </div>
              ))}

              {groups.map((g) =>
                g.items.length === 0 ? null : (
                  <div key={g.label} className="mb-1.5">
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [g.label]: !c[g.label] }))}
                      className="flex w-full items-center justify-between px-2 py-1.5"
                    >
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-400">{g.label}</span>
                      <span className="font-mono text-[9px] text-ink-600">{collapsed[g.label] ? "+" : `${g.items.length}`}</span>
                    </button>
                    {!collapsed[g.label] && (
                      <div className="space-y-px">
                        {g.items.map((n) => (
                          <Row key={n.id} n={n} sub={subFor(n)} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            <div className="border-t border-ink-800 p-3">
              <button
                onClick={() => {
                  setTour(0);
                  notify("Guided tour started — 6 stops", "ok");
                }}
                className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[12.5px] font-medium text-cyan-200"
              >
                <Compass size={14} /> I'm new here — start a tour
              </button>
              <p className="mt-2 text-center font-mono text-[8.5px] uppercase tracking-[0.14em] text-ink-600">
                structured alternative to the canvas
              </p>
            </div>
          </motion.aside>
        ) : (
          <motion.button
            key="rail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggle}
            aria-label="Open explorer"
            className="pointer-events-auto absolute left-0 top-16 z-30 rounded-r-lg border border-l-0 border-ink-700 bg-ink-900/90 p-2 text-ink-300 backdrop-blur-xl transition hover:text-ink-50"
          >
            <PanelLeftOpen size={15} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}