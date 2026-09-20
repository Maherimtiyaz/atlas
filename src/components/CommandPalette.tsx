import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CornerDownLeft, ArrowRight, Route } from "lucide-react";
import { useApp } from "../store";
import type { CFNode, Graph, NodeType } from "../model";
import { TYPE_COLOR, TYPE_LABEL } from "../model";
import { askGraph, pathEdgeIds, type AskResult } from "../lib/engine";
import { TYPE_ICON } from "./graphBits";

const GROUP_ORDER: NodeType[] = ["feature", "page", "api", "database", "service", "component", "external", "job"];

export default function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPalette);
  const nodes = useApp((s) => s.nodes);
  const edges = useApp((s) => s.edges);
  const select = useApp((s) => s.select);
  const focusNode = useApp((s) => s.focusNode);
  const setFlow = useApp((s) => s.setFlow);
  const notify = useApp((s) => s.notify);

  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const isQuestion = /^(how|what|where|which|show|why|trace)\b/i.test(q.trim()) || q.trim().endsWith("?");

  const ask: AskResult | null = useMemo(() => {
    if (!isQuestion || q.trim().length < 4) return null;
    const g: Graph = { nodes, edges, repo: { name: "", org: "", branch: "", source: "demo" }, stats: { files: 0, components: 0, pages: 0, apis: 0, tables: 0, services: 0, externals: 0, jobs: 0, features: 0 }, notes: [] };
    return askGraph(q, g);
  }, [q, isQuestion, nodes, edges]);

  const groups = useMemo(() => {
    const ql = q.toLowerCase().trim();
    if (!ql || isQuestion) return [];
    return GROUP_ORDER.map((kind) => ({
      kind,
      items: nodes
        .filter(
          (n) =>
            n.data.kind === kind &&
            (n.data.name.toLowerCase().includes(ql) ||
              n.data.description.toLowerCase().includes(ql) ||
              (n.data.meta.route ?? "").toLowerCase().includes(ql) ||
              n.data.files.some((f) => f.toLowerCase().includes(ql)))
        )
        .slice(0, 4),
    })).filter((g) => g.items.length > 0);
  }, [q, nodes, isQuestion]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const runTrace = (a: AskResult) => {
    if (!a.path || a.path.length < 2) {
      if (a.focusIds.length) {
        select(a.focusIds[0]);
        focusNode(a.focusIds[0]);
      }
      setOpen(false);
      return;
    }
    const p = a.path.filter((id) => nodes.some((n) => n.id === id));
    setFlow({ active: true, startId: p[0], endId: p[p.length - 1], path: p, pathEdges: pathEdgeIds(p, edges), playing: true, step: 0 });
    focusNode(p[0], 0.9);
    setOpen(false);
    notify(`Tracing: ${nodes.find((n) => n.id === p[0])?.data.name} → ${nodes.find((n) => n.id === p[p.length - 1])?.data.name}`, "ok");
  };

  const go = (n: CFNode) => {
    select(n.id);
    focusNode(n.id);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    if (ask?.path) {
      if (e.key === "Enter") runTrace(ask);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flat[idx]) {
      go(flat[idx]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  let counter = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[3px]"
          onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            initial={{ y: -18, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -12, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="panel mx-auto mt-[11vh] w-[min(620px,92vw)] overflow-hidden rounded-xl shadow-2xl shadow-black/70"
          >
            <div className="flex items-center gap-3 border-b border-ink-800 px-4 py-3.5">
              <Search size={16} className="shrink-0 text-cyan-300" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setIdx(0);
                }}
                onKeyDown={onKey}
                placeholder="Search nodes, routes, files… or ask “how does login work?”"
                className="w-full bg-transparent text-[14px] text-ink-50 outline-none placeholder:text-ink-500"
                aria-label="Command palette"
              />
              <span className="kbd shrink-0">esc</span>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
              {ask && (
                <div className="px-4 pb-1">
                  <div className="mb-2 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-violet-300">
                    <Route size={11} /> {ask.title}
                  </div>
                  <div className="space-y-1.5 rounded-lg border border-violet-400/20 bg-violet-400/5 p-3.5">
                    {ask.lines.map((l, i) => (
                      <p key={i} className="text-[12px] leading-relaxed text-ink-200">{l}</p>
                    ))}
                    {ask.path && ask.path.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {ask.path.map((pid, i) => {
                          const n = nodes.find((v) => v.id === pid);
                          if (!n) return null;
                          const c = TYPE_COLOR[n.data.kind];
                          return (
                            <span key={pid} className="flex items-center gap-1.5">
                              {i > 0 && <ArrowRight size={10} className="text-ink-500" />}
                              <span className="rounded-md border px-2 py-1 font-mono text-[10px]" style={{ borderColor: `${c}55`, color: c, background: `${c}10` }}>
                                {n.data.name}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => runTrace(ask)} className="btn-primary mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold">
                      Show flow on map <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}

              {!ask && groups.length === 0 && q.trim() && (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-ink-300">Nothing matches “{q}”.</p>
                  <p className="mt-1.5 text-[11px] text-ink-500">Try a feature name (“billing”), a route (“/api/subscribe”) or ask a question ending in “?”.</p>
                </div>
              )}

              {!ask &&
                groups.map((g) => (
                  <div key={g.kind} className="mb-1">
                    <div className="px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">{TYPE_LABEL[g.kind]}s</div>
                    {g.items.map((n) => {
                      counter += 1;
                      const i = counter;
                      const c = TYPE_COLOR[n.data.kind];
                      const Icon = TYPE_ICON[n.data.kind];
                      return (
                        <button
                          key={n.id}
                          data-idx={i}
                          onClick={() => go(n)}
                          onMouseEnter={() => setIdx(i)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${i === idx ? "bg-ink-800" : ""}`}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${c}1a`, color: c }}>
                            <Icon size={12} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-ink-100">{n.data.name}</span>
                            <span className="block truncate font-mono text-[9.5px] text-ink-500">
                              {n.data.meta.route ?? n.data.files[0] ?? n.data.description}
                            </span>
                          </span>
                          {i === idx && <CornerDownLeft size={12} className="shrink-0 text-cyan-300" />}
                        </button>
                      );
                    })}
                  </div>
                ))}

              {!q.trim() && !ask && (
                <div className="px-5 py-6">
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">Try asking</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["How does login work?", "Where is Stripe used?", "What would break if I remove Redis?", "Show me the checkout flow."].map((s) => (
                      <button key={s} onClick={() => setQ(s)} className="btn-ghost rounded-full px-3 py-1.5 text-[11px] text-ink-300 hover:text-cyan-200">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2">
              <span className="font-mono text-[9px] text-ink-600">{nodes.length} nodes indexed · client-side</span>
              <span className="flex items-center gap-2">
                <span className="kbd">↑↓</span>
                <span className="kbd">↵</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}