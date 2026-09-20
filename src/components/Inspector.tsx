import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, FileCode2, Route, ChevronRight, Flame, GitCommit, Users } from "lucide-react";
import { useApp, type ExplainLevel } from "../store";
import type { CFEdge, CFNode, EdgeKind, Graph } from "../model";
import { TYPE_COLOR, MONTHS } from "../model";
import { dependentsOf, downstreamReach, explain, heatColor, heatLabel } from "../lib/engine";
import { TYPE_ICON } from "./graphBits";

const PRIO: Record<EdgeKind, number> = { api: 0, external: 1, database: 2, data: 3, navigation: 4, dependency: 5 };

function chainFor(id: string, nodes: CFNode[], edges: CFEdge[]): string[] {
  const up: string[] = [];
  let cur = id;
  for (let i = 0; i < 4; i++) {
    const ins = edges.filter((e) => e.target === cur).map((e) => e.source);
    if (!ins.length) break;
    const best = ins
      .map((s) => nodes.find((n) => n.id === s))
      .filter((n): n is CFNode => !!n)
      .sort((a, b) => a.data.depth - b.data.depth)[0];
    if (!best || up.includes(best.id)) break;
    up.unshift(best.id);
    cur = best.id;
  }
  const down: string[] = [];
  cur = id;
  for (let i = 0; i < 5; i++) {
    const outs = edges.filter((e) => e.source === cur).sort((a, b) => PRIO[a.data?.kind ?? "dependency"] - PRIO[b.data?.kind ?? "dependency"]);
    if (!outs.length) break;
    const nxt = outs[0].target;
    if (down.includes(nxt) || nxt === id) break;
    down.push(nxt);
    cur = nxt;
  }
  return [...up, id, ...down];
}

const LEVELS: ExplainLevel[] = ["simple", "developer", "deep"];

export default function Inspector() {
  const open = useApp((s) => s.inspectorOpen);
  const selectedId = useApp((s) => s.selectedId);
  const nodes = useApp((s) => s.nodes);
  const edges = useApp((s) => s.edges);
  const select = useApp((s) => s.select);
  const focusNode = useApp((s) => s.focusNode);
  const openCode = useApp((s) => s.openCode);
  const setFlow = useApp((s) => s.setFlow);
  const notify = useApp((s) => s.notify);
  const level = useApp((s) => s.explainLevel);
  const setLevel = useApp((s) => s.setExplainLevel);

  const node = nodes.find((n) => n.id === selectedId) ?? null;

  const graph = useMemo<Graph | null>(() => {
    if (!nodes.length) return null;
    const count = (k: string) => nodes.filter((n) => n.data.kind === k).length;
    return {
      nodes, edges, repo: { name: "", org: "", branch: "", source: "demo" },
      stats: { files: 0, components: 0, pages: 0, apis: 0, tables: 0, services: 0, externals: 0, jobs: 0, features: count("feature") },
      notes: [],
    };
  }, [nodes, edges]);

  const chain = useMemo(() => (node ? chainFor(node.id, nodes, edges) : []), [node, nodes, edges]);
  const reach = useMemo(() => (node && graph ? downstreamReach(node.id, edges, nodes) : null), [node, graph, edges, nodes]);
  const deps = useMemo(() => (node ? dependentsOf(node.id, edges, nodes) : []), [node, edges, nodes]);
  const explanation = useMemo(() => (node && graph ? explain(node, graph, level) : []), [node, graph, level]);

  const nameOf = (nid: string) => nodes.find((n) => n.id === nid);

  return (
    <AnimatePresence>
      {open && node && (
        <motion.aside
          key="inspector"
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="pointer-events-auto absolute bottom-0 right-0 top-14 z-30 flex w-85 max-w-[92vw] flex-col border-l border-t border-ink-800 bg-ink-900/95 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-ink-800 px-4 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = TYPE_ICON[node.data.kind];
                  const c = TYPE_COLOR[node.data.kind];
                  return (
                    <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${c}1f`, color: c }}>
                      <Icon size={13} />
                    </span>
                  );
                })()}
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-400">{node.data.typeLabel}</span>
              </div>
              <h2 className="mt-1.5 truncate font-display text-[17px] font-bold text-ink-50">{node.data.name}</h2>
              <p className="mt-0.5 text-[11.5px] leading-snug text-ink-300">{node.data.description}</p>
            </div>
            <button onClick={() => select(null)} className="mt-0.5 shrink-0 text-ink-400 transition hover:text-ink-50" aria-label="Close inspector">
              <X size={15} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* signals */}
            <div className="grid grid-cols-4 gap-1.5 px-4 pt-3.5">
              {[
                { icon: Flame, label: heatLabel(node.data.meta.complexity), value: String(node.data.meta.complexity), color: heatColor(node.data.meta.complexity) },
                { icon: GitCommit, label: "churn", value: String(node.data.meta.churn), color: "#a1a1aa" },
                { icon: Users, label: "authors", value: String(node.data.meta.contributors), color: "#a1a1aa" },
                { icon: Sparkles, label: "coverage", value: `${node.data.meta.coverage}%`, color: node.data.meta.coverage > 65 ? "#34d399" : "#f59e0b" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-ink-800 bg-ink-950/60 px-1.5 py-2 text-center">
                  <s.icon size={11} className="mx-auto" style={{ color: s.color }} />
                  <div className="mt-1 font-display text-[12.5px] font-bold text-ink-100">{s.value}</div>
                  <div className="font-mono text-[7.5px] uppercase tracking-[0.08em] text-ink-500">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="px-4 pt-2 font-mono text-[9.5px] text-ink-500">
              added {MONTHS[node.data.meta.addedIn]} · {node.data.meta.loc} LOC · {node.data.files.length} file{node.data.files.length > 1 ? "s" : ""}
            </div>

            {/* flow chain */}
            <section className="mt-4 border-t border-ink-800 px-4 py-3.5">
              <h3 className="mb-2.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-400">
                <Route size={11} /> Flow through this node
              </h3>
              <div className="space-y-0">
                {chain.map((cid, i) => {
                  const cn = nameOf(cid);
                  if (!cn) return null;
                  const c = TYPE_COLOR[cn.data.kind];
                  const isSelf = cid === node.id;
                  return (
                    <div key={cid}>
                      {i > 0 && (
                        <div className="ml-2.25 h-3.5 w-px" style={{ background: "linear-gradient(to bottom, #3f3f46, #27272a)" }} />
                      )}
                      <button
                        onClick={() => { select(cid); focusNode(cid); }}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition ${isSelf ? "bg-ink-800" : "hover:bg-ink-850"}`}
                        style={isSelf ? { boxShadow: `inset 2px 0 0 ${c}` } : undefined}
                      >
                        <span className="h-1.75 w-1.75 shrink-0 rounded-full" style={{ background: c, boxShadow: isSelf ? `0 0 8px ${c}` : undefined }} />
                        <span className={`min-w-0 flex-1 truncate text-[12px] ${isSelf ? "font-semibold text-ink-50" : "text-ink-300"}`}>
                          {cn.data.name}
                        </span>
                        <span className="font-mono text-[8px] uppercase tracking-wider text-ink-600">{cn.data.typeLabel}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* impact */}
            <section className="border-t border-ink-800 px-4 py-3.5">
              <h3 className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-400">If this changes…</h3>
              <p className="text-[11.5px] leading-relaxed text-ink-300">
                <span className="font-semibold text-ink-100">{deps.length}</span> direct dependent{deps.length === 1 ? "" : "s"}, blast radius of{" "}
                <span className="font-semibold text-ink-100">{reach?.count ?? 0}</span> nodes
                {reach && reach.features.length > 0 && (
                  <>
                    {" "}touching{" "}
                    <span className="text-amber-300">{reach.features.slice(0, 3).join(", ")}{reach.features.length > 3 ? ` +${reach.features.length - 3} more` : ""}</span>
                  </>
                )}
                .
              </p>
            </section>

            {/* files */}
            <section className="border-t border-ink-800 px-4 py-3.5">
              <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-400">
                <FileCode2 size={11} /> Files
              </h3>
              <div className="space-y-px">
                {node.data.files.map((f) => (
                  <button
                    key={f}
                    onClick={() => openCode(f, node.id)}
                    className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-ink-850"
                  >
                    <span className="truncate font-mono text-[10.5px] text-cyan-200/90 group-hover:text-cyan-100">{f}</span>
                    <ChevronRight size={11} className="ml-auto shrink-0 text-ink-600 opacity-0 transition group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </section>

            {/* explain */}
            <section className="border-t border-ink-800 px-4 py-3.5 pb-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-400">
                  <Sparkles size={11} className="text-violet-300" /> Explain this
                </h3>
                <div className="flex overflow-hidden rounded-md border border-ink-700">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`px-2 py-1 font-mono text-[8.5px] uppercase tracking-wide transition ${level === l ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-200"}`}
                    >
                      {l === "developer" ? "dev" : l}
                    </button>
                  ))}
                </div>
              </div>
              <div key={level} className="anim-fade-in space-y-2">
                {explanation.map((p, i) => (
                  <p key={i} className="border-l-2 border-violet-400/30 pl-2.5 text-[11.5px] leading-relaxed text-ink-200">{p}</p>
                ))}
              </div>
            </section>
          </div>

          {/* actions */}
          <div className="flex gap-2 border-t border-ink-800 p-3">
            <button
              onClick={() => {
                setFlow({ active: true, startId: node.id, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
                notify("Trace armed — click any node to set the end point", "info");
              }}
              className="btn-ghost flex-1 rounded-lg py-2 text-[12px] font-medium text-amber-200"
            >
              Trace from here
            </button>
            <button
              onClick={() => openCode(node.data.files[0] ?? null, node.id)}
              className="btn-primary flex-1 rounded-lg py-2 text-[12px] font-semibold"
            >
              Open code
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}