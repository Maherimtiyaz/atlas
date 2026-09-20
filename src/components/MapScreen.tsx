import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, MiniMap, type ReactFlowInstance } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Flame, Map as MapIcon, GitCommit, Route, Play, Pause, X, RotateCcw,
  Compass, ChevronRight, Keyboard, ChevronLeft, Activity, Download, Loader2,
} from "lucide-react";
import { useApp } from "../store";
import type { CFEdge, CFNode, NodeType } from "../model";
import { TYPE_COLOR, MONTHS } from "../model";
import { findPath, pathEdgeIds } from "../lib/engine";
import { requestPdfExport } from "../lib/pdfExport";
import { nodeTypes, edgeTypes, ZoomGate, Legend, ZoomControls } from "./graphBits";
import Explorer from "./Explorer";
import Inspector from "./Inspector";
import CommandPalette from "./CommandPalette";
import CodeViewer from "./CodeViewer";
import { LogoMark } from "./Landing";

/* ------------------------------------------------------------------ */
/* Guided tour                                                        */
/* ------------------------------------------------------------------ */

const TOUR: { kind: NodeType; title: string; why: string }[] = [
  { kind: "product", title: "Application entry point", why: "Everything hangs off this node. Hover it to see the whole product light up — that's the map's core trick." },
  { kind: "feature", title: "Authentication", why: "Every request passes through auth before anything else. Understand the guard, and the rest of the map makes sense." },
  { kind: "page", title: "Main dashboard", why: "The central hub — most authenticated users eventually pass through this area, and it reads from nearly everything." },
  { kind: "service", title: "Core business logic", why: "The product's real rules live in services, not in UI code. This one owns ordering, transitions and mentions." },
  { kind: "database", title: "The database", why: "Source of truth. Every feature's tables hang off PostgreSQL — follow the pink edges to see who writes what." },
  { kind: "external", title: "External services", why: "Where the system boundary is. Failures here surface asynchronously — usually via webhooks and job queues." },
];

function Tour() {
  const step = useApp((s) => s.tourStep);
  const setTour = useApp((s) => s.setTour);
  const nodes = useApp((s) => s.nodes);
  const focusNode = useApp((s) => s.focusNode);
  const select = useApp((s) => s.select);

  const target = useMemo(() => {
    if (step < 0 || step >= TOUR.length) return null;
    const t = TOUR[step];
    return nodes.find((n) => n.data.kind === t.kind) ?? null;
  }, [step, nodes]);

  useEffect(() => {
    if (target && step >= 0) {
      select(target.id);
      focusNode(target.id);
    }
  }, [step, target?.id]);

  if (step < 0 || !target) return null;
  const t = TOUR[step];

  return (
    <motion.div
      key={step}
      initial={{ y: 26, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="pointer-events-auto absolute bottom-24 left-1/2 z-40 w-[min(460px,90vw)] -translate-x-1/2"
    >
      <div className="panel rounded-xl p-4 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-300">
            start here · {step + 1}/{TOUR.length}
          </span>
          <div className="flex gap-1">
            {TOUR.map((_, i) => (
              <span key={i} className={`h-1 w-4 rounded-full transition ${i <= step ? "bg-cyan-300" : "bg-ink-700"}`} />
            ))}
          </div>
        </div>
        <h3 className="mt-2 font-display text-[16px] font-bold text-ink-50">{t.title}</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">{t.why}</p>
        <div className="mt-3.5 flex items-center justify-between">
          <button onClick={() => setTour(-1)} className="text-[11.5px] text-ink-500 transition hover:text-ink-300">
            Skip tour
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setTour(step - 1)} className="btn-ghost flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] text-ink-300">
                <ChevronLeft size={13} /> Back
              </button>
            )}
            <button
              onClick={() => (step === TOUR.length - 1 ? setTour(-1) : setTour(step + 1))}
              className="btn-primary flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[11.5px] font-semibold"
            >
              {step === TOUR.length - 1 ? "Finish — explore freely" : "Next"} <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow trace bar                                                     */
/* ------------------------------------------------------------------ */

function FlowBar() {
  const flow = useApp((s) => s.flow);
  const setFlow = useApp((s) => s.setFlow);
  const nodes = useApp((s) => s.nodes);
  const focusNode = useApp((s) => s.focusNode);
  const notify = useApp((s) => s.notify);
  const nameOf = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.data.name ?? "?" : "…");

  if (!flow.active) return null;

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="pointer-events-auto absolute bottom-24 left-1/2 z-40 w-[min(640px,92vw)] -translate-x-1/2"
    >
      <div className="panel rounded-xl shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-2.5">
          <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-amber-300">
            <Route size={12} /> Trace a flow
          </span>
          <div className="flex items-center gap-1.5">
            {flow.path.length > 0 && (
              <button
                onClick={() => setFlow({ playing: !flow.playing, step: flow.playing ? flow.step : 0 })}
                className="btn-ghost flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-ink-200"
              >
                {flow.playing ? <Pause size={11} /> : <Play size={11} />} {flow.playing ? "Pause" : "Play"}
              </button>
            )}
            <button
              onClick={() => setFlow({ startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 })}
              className="btn-ghost flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-ink-300"
            >
              <RotateCcw size={11} /> Reset
            </button>
            <button
              onClick={() => {
                setFlow({ active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
                notify("Trace cleared", "info");
              }}
              className="rounded-md p-1 text-ink-400 transition hover:text-ink-50"
              aria-label="Exit trace mode"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {flow.path.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 font-mono text-[10.5px] text-cyan-200">
              {nameOf(flow.startId)}
            </span>
            <span className="font-mono text-[10px] text-ink-500">→</span>
            <span className="rounded-md border border-dashed border-ink-600 px-2.5 py-1 font-mono text-[10.5px] text-ink-400">
              click any node…
            </span>
            <span className="ml-auto hidden font-mono text-[9px] text-ink-600 sm:block">
              {flow.startId ? "now pick the end point" : "click a node to set the start point"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 overflow-x-auto px-4 py-3">
            {flow.path.map((pid, i) => {
              const n = nodes.find((v) => v.id === pid);
              if (!n) return null;
              const c = TYPE_COLOR[n.data.kind];
              const current = i === flow.step;
              return (
                <span key={pid} className="flex shrink-0 items-center gap-1">
                  {i > 0 && <ChevronRight size={11} className={i <= flow.step ? "text-amber-300" : "text-ink-600"} />}
                  <button
                    onClick={() => {
                      setFlow({ step: i, playing: false });
                      focusNode(pid);
                    }}
                    className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${current ? "scale-105" : ""}`}
                    style={{
                      borderColor: current ? c : `${c}44`,
                      color: current ? "#09090b" : c,
                      background: current ? c : `${c}12`,
                      fontWeight: current ? 700 : 500,
                    }}
                  >
                    {i + 1}. {n.data.name}
                  </button>
                </span>
              );
            })}
            <span className="ml-2 shrink-0 font-mono text-[9px] text-ink-500">{flow.path.length - 1} hops</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Git history timeline                                               */
/* ------------------------------------------------------------------ */

function Timeline() {
  const mode = useApp((s) => s.mode);
  const timeIndex = useApp((s) => s.timeIndex);
  const setTime = useApp((s) => s.setTime);
  const nodes = useApp((s) => s.nodes);
  const focusNode = useApp((s) => s.focusNode);
  const select = useApp((s) => s.select);

  const hotspots = useMemo(
    () => [...nodes].sort((a, b) => b.data.meta.churn - a.data.meta.churn).slice(0, 3),
    [nodes]
  );

  if (mode !== "history") return null;
  const visible = nodes.filter((n) => n.data.meta.addedIn <= timeIndex).length;
  const addedThis = nodes.filter((n) => n.data.meta.addedIn === timeIndex).length;

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="pointer-events-auto absolute bottom-24 left-1/2 z-40 w-[min(560px,92vw)] -translate-x-1/2"
    >
      <div className="panel rounded-xl px-5 py-4 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-pink-300">
            <GitCommit size={12} /> Time travel
          </span>
          <span className="font-mono text-[10px] text-ink-400">
            {visible} nodes existed · <span className="text-emerald-300">+{addedThis}</span> in {MONTHS[timeIndex]}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="font-mono text-[10px] text-ink-500">{MONTHS[0]}</span>
          <input
            type="range"
            min={0}
            max={7}
            value={timeIndex}
            onChange={(e) => setTime(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-pink-400"
            aria-label="Architecture time travel"
          />
          <span className="font-mono text-[10px] text-ink-500">{MONTHS[7]}</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-wider text-ink-500">high churn:</span>
          {hotspots.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                select(n.id);
                focusNode(n.id);
              }}
              className="flex shrink-0 items-center gap-1 rounded-full border border-orange-400/30 bg-orange-400/8 px-2 py-1 font-mono text-[9.5px] text-orange-200 transition hover:border-orange-400/60"
            >
              🔥 {n.data.name} · {n.data.meta.churn}×
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Shortcuts                                                          */
/* ------------------------------------------------------------------ */

function Shortcuts() {
  const open = useApp((s) => s.shortcutsOpen);
  const set = useApp((s) => s.setShortcuts);
  const rows: [string, string][] = [
    ["⌘ K", "Search / ask the map"],
    ["F", "Fit map to screen"],
    ["T", "Trace a flow"],
    ["E", "Explain selection (open inspector)"],
    ["C", "Open code for selection"],
    ["1 / 2 / 3", "Overview · Complexity · History"],
    ["Esc", "Clear selection / exit mode"],
    ["Shift + drag", "Multi-select"],
    ["Space + drag", "Pan"],
    ["?", "This panel"],
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-[3px]"
          onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && set(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            className="panel w-[min(400px,92vw)] rounded-xl p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                <Keyboard size={13} /> Keyboard
              </span>
              <button onClick={() => set(false)} className="text-ink-400 hover:text-ink-50" aria-label="Close shortcuts">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1.5">
              {rows.map(([k, d]) => (
                <div key={k} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-ink-850">
                  <span className="text-[12px] text-ink-300">{d}</span>
                  <span className="kbd">{k}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                            */
/* ------------------------------------------------------------------ */

function TopBar() {
  const repo = useApp((s) => s.repo);
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const setPalette = useApp((s) => s.setPalette);
  const flow = useApp((s) => s.flow);
  const setFlow = useApp((s) => s.setFlow);
  const selectedId = useApp((s) => s.selectedId);
  const anim = useApp((s) => s.anim);
  const toggleAnim = useApp((s) => s.toggleAnim);
  const setShortcuts = useApp((s) => s.setShortcuts);
  const reset = useApp((s) => s.reset);
  const explorerOpen = useApp((s) => s.explorerOpen);
  const toggleExplorer = useApp((s) => s.toggleExplorer);
  const setTour = useApp((s) => s.setTour);
  const notify = useApp((s) => s.notify);
  const nodes = useApp((s) => s.nodes);
  const edges = useApp((s) => s.edges);
  const stats = useApp((s) => s.stats);
  const notes = useApp((s) => s.notes);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const graph = { repo, nodes, edges, stats, notes };
  const downloadPdf = async () => {
    if (exporting) return;
    setExportError("");
    setExporting(true);
    try {
      await requestPdfExport(graph);
      notify("PDF downloaded", "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF generation failed. Please try again.";
      setExportError(message);
      notify(message, "warn");
    } finally {
      setExporting(false);
    }
  };

  const modes: { id: typeof mode; label: string; icon: typeof MapIcon }[] = [
    { id: "overview", label: "Overview", icon: MapIcon },
    { id: "complexity", label: "Complexity", icon: Flame },
    { id: "history", label: "History", icon: GitCommit },
  ];

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-800/80 bg-ink-950/80 px-4 backdrop-blur-xl">
      {!explorerOpen && (
        <button onClick={toggleExplorer} className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-850 hover:text-ink-50" aria-label="Open explorer">
          <Compass size={15} />
        </button>
      )}
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoMark size={20} />
        <span className="hidden truncate font-display text-[13.5px] font-semibold text-ink-100 sm:block">
          {repo.org !== "local" && <span className="text-ink-500">{repo.org}/</span>}
          {repo.name}
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-ink-700 px-2 py-0.5 font-mono text-[9.5px] text-ink-400 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {repo.branch}
        </span>
      </div>

      <div className="mx-auto flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-900/80 p-0.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition ${
              mode === m.id ? "bg-ink-700 text-ink-50 shadow-sm" : "text-ink-400 hover:text-ink-200"
            }`}
            title={`Mode: ${m.label} (${modes.indexOf(m) + 1})`}
          >
            <m.icon size={12} />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={downloadPdf}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1.5 text-[11.5px] font-medium text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
        title="Download the current visual study as a PDF"
      >
        {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        <span className="hidden sm:inline">{exporting ? "Exporting…" : "Download PDF"}</span>
      </button>

      <button
        onClick={() => {
          if (flow.active) {
            setFlow({ active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
          } else {
            setFlow({ active: true, startId: selectedId, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
            notify(selectedId ? "Trace armed — click the end node" : "Trace armed — click a start node", "info");
          }
        }}
        className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition md:flex ${
          flow.active ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100"
        }`}
      >
        <Route size={12} /> Trace
        <span className="kbd ml-0.5">T</span>
      </button>

      <button
        onClick={() => setPalette(true)}
        className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-1.5 text-[11.5px] text-ink-400 transition hover:border-ink-600 hover:text-ink-200"
      >
        <Search size={12} />
        <span className="hidden lg:inline">Search or ask…</span>
        <span className="kbd">⌘K</span>
      </button>

      <button onClick={toggleAnim} className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-850 hover:text-ink-50" title={anim ? "Pause map animations" : "Resume map animations"} aria-label="Toggle animations">
        <Activity size={15} className={anim ? "text-emerald-400/80" : ""} />
      </button>
      <button onClick={() => setShortcuts(true)} className="hidden rounded-md p-1.5 text-ink-400 transition hover:bg-ink-850 hover:text-ink-50 sm:block" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
        <Keyboard size={15} />
      </button>
      <button onClick={() => setTour(0)} className="hidden rounded-md p-1.5 text-cyan-300/80 transition hover:bg-ink-850 hover:text-cyan-200 lg:block" title="I'm new here — guided tour" aria-label="Start guided tour">
        <Compass size={15} />
      </button>
      <button onClick={reset} className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-850 hover:text-ink-50" title="Switch repository" aria-label="Switch repository">
        <RotateCcw size={14} />
      </button>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink-700 bg-linear-to-br from-violet-500/30 to-cyan-400/30 font-display text-[10px] font-bold text-ink-100">
        {(repo.org[0] ?? "A").toUpperCase()}
      </span>

      {exportError && (
        <div className="pointer-events-auto fixed inset-0 z-80 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setExportError("")}>
          <div className="panel flex w-[min(420px,92vw)] items-start justify-between gap-4 rounded-xl p-5 shadow-2xl">
            <p className="text-[12px] leading-relaxed text-red-200">{exportError}</p>
            <button onClick={() => setExportError("")} className="text-ink-400 hover:text-ink-50" aria-label="Close error"><span aria-hidden="true">×</span></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                             */
/* ------------------------------------------------------------------ */

function Canvas() {
  const nodes = useApp((s) => s.nodes);
  const edges = useApp((s) => s.edges);
  const onNodesChange = useApp((s) => s.onNodesChange);
  const select = useApp((s) => s.select);
  const hover = useApp((s) => s.hover);
  const setRf = useApp((s) => s.setRf);
  const focusNode = useApp((s) => s.focusNode);
  const zoomBucket = useApp((s) => s.zoomBucket);
  const focus = useApp((s) => s.focus);
  const mode = useApp((s) => s.mode);
  const timeIndex = useApp((s) => s.timeIndex);
  const flow = useApp((s) => s.flow);
  const setFlow = useApp((s) => s.setFlow);
  const notify = useApp((s) => s.notify);
  const anim = useApp((s) => s.anim);
  const bootFitted = useRef(false);

  const visibleNodes = useMemo(() => {
    const pathSet = new Set(flow.path);
    return nodes.map((n) => {
      const d = n.data;
      const pinned = focus?.has(n.id) || pathSet.has(n.id);
      let show = true;
      if (!pinned) {
        if (zoomBucket === 0) show = d.kind === "product" || d.kind === "feature" || d.kind === "service" || d.kind === "external" || d.kind === "database";
        else if (zoomBucket === 1) show = d.kind !== "component";
        if (mode === "history" && d.meta.addedIn > timeIndex) show = false;
      }
      return show === (n.hidden !== true) && n.hidden === undefined ? n : { ...n, hidden: !show };
    });
  }, [nodes, zoomBucket, focus, mode, timeIndex, flow.path]);

  /* node click — selection or trace picking */
  const onNodeClick = (_: React.MouseEvent, n: CFNode) => {
    const f = useApp.getState().flow;
    if (f.active && f.path.length === 0) {
      if (!f.startId) {
        setFlow({ startId: n.id });
        notify(`Start: ${n.data.name} — now click the end node`, "info");
        select(n.id);
      } else if (n.id !== f.startId) {
        const p = findPath(f.startId, n.id, useApp.getState().edges);
        if (p.length > 1) {
          setFlow({ endId: n.id, path: p, pathEdges: pathEdgeIds(p, useApp.getState().edges), playing: useApp.getState().anim, step: 0 });
          focusNode(p[0], 0.85);
          notify(`Flow traced — ${p.length - 1} hops`, "ok");
        } else {
          notify("No connecting path between those nodes — try a different pair.", "warn");
        }
      }
      return;
    }
    select(n.id);
    focusNode(n.id);
  };

  /* flow playback */
  useEffect(() => {
    if (!flow.playing || flow.path.length === 0) return;
    const t = window.setInterval(() => {
      const st = useApp.getState();
      const next = st.flow.step + 1;
      if (next >= st.flow.path.length) {
        st.setFlow({ playing: false });
        st.notify(`Flow complete — ${st.flow.path.length - 1} hops from ${st.nodes.find((n) => n.id === st.flow.path[0])?.data.name}`, "ok");
      } else {
        st.setFlow({ step: next });
        st.focusNode(st.flow.path[next]);
        st.hover(st.flow.path[next]);
      }
    }, 1500);
    return () => window.clearInterval(t);
  }, [flow.playing, flow.path]);

  /* entrance camera: open on the product, pull back to reveal */
  const onInit = (instance: ReactFlowInstance<CFNode, CFEdge>) => {
    setRf(instance);
    if (bootFitted.current) return;
    bootFitted.current = true;
    const product = useApp.getState().nodes.find((n) => n.data.kind === "product");
    if (product) {
      instance.setCenter(product.position.x + 160, product.position.y + 70, { zoom: 1.25, duration: 0 });
      window.setTimeout(() => {
        instance.fitView({ padding: 0.13, duration: anim ? 1400 : 0 });
      }, 500);
    } else {
      instance.fitView({ padding: 0.13, duration: 0 });
    }
  };

  return (
    <ReactFlow
      nodes={visibleNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={(_, n) => hover(n.id)}
      onNodeMouseLeave={() => hover(null)}
      onPaneClick={() => select(null)}
      onInit={onInit}
      minZoom={0.12}
      maxZoom={2.4}
      panActivationKeyCode="Space"
      selectionKeyCode="Shift"
      multiSelectionKeyCode="Meta"
      proOptions={{ hideAttribution: false }}
      fitView={false}
      nodesDraggable
      deleteKeyCode={null}
      className="bg-transparent!"
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#232327" />
      <ZoomGate />
      <MiniMap
        position="bottom-right"
        style={{ marginBottom: 200, width: 168, height: 110 }}
        pannable
        zoomable
        maskColor="rgba(9,9,11,0.6)"
        nodeColor={(n) => TYPE_COLOR[(n as CFNode).data.kind] ?? "#3f3f46"}
        nodeStrokeColor="#09090b"
      />
    </ReactFlow>
  );
}

/* ------------------------------------------------------------------ */
/* Screen shell                                                       */
/* ------------------------------------------------------------------ */

export default function MapScreen() {
  const anim = useApp((s) => s.anim);

  /* global keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      const st = useApp.getState();

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        st.setPalette(!st.paletteOpen);
        return;
      }
      if (typing) return;

      switch (e.key) {
        case "Escape":
          if (st.codeFile) st.openCode(null);
          else if (st.paletteOpen) st.setPalette(false);
          else if (st.shortcutsOpen) st.setShortcuts(false);
          else if (st.flow.active) st.setFlow({ active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
          else if (st.tourStep >= 0) st.setTour(-1);
          else st.select(null);
          break;
        case "f":
        case "F":
          st.rf?.fitView({ padding: 0.13, duration: st.anim ? 700 : 0 });
          break;
        case "t":
        case "T":
          if (st.flow.active) st.setFlow({ active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
          else {
            st.setFlow({ active: true, startId: st.selectedId, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 });
            st.notify(st.selectedId ? "Trace armed — click the end node" : "Trace armed — click a start node", "info");
          }
          break;
        case "e":
        case "E":
          if (st.selectedId) useApp.setState({ inspectorOpen: true });
          break;
        case "c":
        case "C": {
          const n = st.nodes.find((v) => v.id === st.selectedId);
          if (n?.data.files[0]) st.openCode(n.data.files[0], n.id);
          break;
        }
        case "1":
          st.setMode("overview");
          break;
        case "2":
          st.setMode("complexity");
          break;
        case "3":
          st.setMode("history");
          break;
        case "?":
          st.setShortcuts(!st.shortcutsOpen);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden ${anim ? "" : "anim-off"}`}>
      <div className="dotgrid pointer-events-none absolute inset-0 opacity-50" />
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className="absolute inset-0">
        <Canvas />
      </div>

      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <Explorer />
        <Inspector />
        <FlowBar />
        <Timeline />
        <Tour />
        <Legend />
        <ZoomControls />
      </div>

      <CommandPalette />
      <CodeViewer />
      <Shortcuts />
    </div>
  );
}