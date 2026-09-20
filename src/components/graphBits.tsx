import { memo, useMemo, useState } from "react";
import {
  Boxes, Sparkles, FileText, Puzzle, Braces, Database, Server, Globe, Workflow,
  Plus, Minus, Crosshair, CircleDot,
} from "lucide-react";
import {
  Handle, Position, getBezierPath, useViewport,
  type EdgeProps, type NodeProps,
} from "@xyflow/react";
import type { CFEdge, CFNode, NodeType } from "../model";
import { METHOD_COLOR, TYPE_COLOR, TYPE_LABEL, NODE_W } from "../model";
import { heatColor } from "../lib/engine";
import { useApp } from "../store";

export const TYPE_ICON: Record<NodeType, typeof Boxes> = {
  product: Boxes,
  feature: Sparkles,
  page: FileText,
  component: Puzzle,
  api: Braces,
  database: Database,
  service: Server,
  external: Globe,
  job: Workflow,
};

/* ------------------------------------------------------------------ */
/* Node card                                                          */
/* ------------------------------------------------------------------ */

function metricsFor(n: CFNode, edges: CFEdge[]): string {
  const d = n.data;
  const out = edges.filter((e) => e.source === n.id).map((e) => e.target);
  switch (d.kind) {
    case "product":
      return `${edges.filter((e) => e.source === n.id).length} areas · ${d.meta.loc} LOC core`;
    case "feature": {
      const comps = out.filter((t) => t.startsWith("p-")).length;
      const apis = out.filter((t) => t.startsWith("a-")).length;
      return `${comps} pages · ${apis} APIs`;
    }
    case "page":
      return `${d.meta.route ?? ""} · ${out.filter((t) => t.startsWith("c-")).length} components`;
    case "component":
      return `${d.meta.loc} LOC`;
    case "api":
      return `${d.meta.method} · ${d.meta.loc} LOC`;
    case "database":
      return d.meta.columns ? `${d.meta.columns} columns · ${d.meta.relations} rels` : "cache / queue";
    case "service":
      return `${d.meta.loc} LOC · ${d.meta.coverage}% tested`;
    case "external":
      return "third-party";
    case "job":
      return "queue / cron";
  }
}

const NodeCard = memo(function NodeCard({ id, data }: NodeProps<CFNode>) {
  const selectedId = useApp((s) => s.selectedId);
  const focus = useApp((s) => s.focus);
  const mode = useApp((s) => s.mode);
  const revealKey = useApp((s) => s.revealKey);
  const inPath = useApp((s) => (s.flow.active ? s.flow.path.includes(id) : false));
  const isCurrent = useApp((s) => s.flow.active && s.flow.path[s.flow.step] === id);
  const edges = useApp((s) => s.edges);

  const d = data;
  const base = mode === "complexity" ? heatColor(d.meta.complexity) : TYPE_COLOR[d.kind];
  const lit = (focus?.has(id) ?? false) || inPath;
  const dim = !!focus && !focus.has(id) && !inPath;
  const selected = selectedId === id || isCurrent;
  const Icon = TYPE_ICON[d.kind];
  const methodColor = d.meta.method ? METHOD_COLOR[d.meta.method] : undefined;
  const metrics = useMemo(() => metricsFor({ id, data } as CFNode, edges), [id, data, edges]);

  return (
    <div
      key={revealKey}
      className={`node-card node-entrance relative select-none ${selected ? "selected" : ""} ${lit ? "lit" : ""} ${dim ? "dim" : ""} ${inPath ? "lit" : ""} is-hoverable`}
      style={{
        width: NODE_W[d.kind],
        ["--acc" as string]: base,
        animationDelay: `${d.depth * 150 + (d.kind === "component" ? 60 : 0)}ms`,
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-0.75 rounded-l-[9px]" style={{ background: base, opacity: 0.9 }} />
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md"
              style={{ background: `${base}1f`, color: base }}
            >
              <Icon size={12} strokeWidth={2.2} />
            </span>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-400">
              {d.typeLabel}
            </span>
          </div>
          {mode === "complexity" && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold"
              style={{ background: `${base}22`, color: base }}
            >
              {d.meta.complexity}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {d.kind === "api" && d.meta.method && (
            <span className="shrink-0 rounded px-1 py-px font-mono text-[9px] font-bold" style={{ background: `${methodColor}1e`, color: methodColor }}>
              {d.meta.method}
            </span>
          )}
          <span
            className={`min-w-0 truncate font-display font-semibold leading-tight text-ink-50 ${
              d.kind === "product" ? "text-[19px]" : d.kind === "feature" ? "text-[16px]" : "text-[13px]"
            }`}
            title={d.name}
          >
            {d.name}
          </span>
        </div>

        {(d.kind === "product" || d.kind === "feature" || d.kind === "page" || d.kind === "service" || d.kind === "external") && (
          <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-ink-300">{d.description}</p>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[9px] text-ink-400">{metrics}</span>
          <span className="flex items-center gap-1 font-mono text-[9px]" style={{ color: base }}>
            <span className="inline-block h-1 w-1 rounded-full" style={{ background: base }} />
            {edges.filter((e) => e.source === id || e.target === id).length}
          </span>
        </div>

        {d.kind === "feature" && (
          <div className="mt-2 h-0.75 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${d.meta.coverage}%`, background: base, transformOrigin: "left", animation: "barGrow 1s cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${d.depth * 150 + 400}ms` }}
            />
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Edge                                                               */
/* ------------------------------------------------------------------ */

const CodeEdge = memo(function CodeEdge(props: EdgeProps<CFEdge>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const focus = useApp((s) => s.focus);
  const anim = useApp((s) => s.anim);
  const revealKey = useApp((s) => s.revealKey);
  const inTrace = useApp((s) => s.flow.pathEdges.has(id));
  const nodes = useApp((s) => s.nodes);

  const kind = data?.kind ?? "dependency";
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.22 });

  const lit = !!focus && focus.has(source) && focus.has(target);
  const dim = !!focus && !lit;
  const srcType = useMemo(() => nodes.find((n) => n.id === source)?.data.kind, [nodes, source]);
  const depth = useMemo(() => nodes.find((n) => n.id === source)?.data.depth ?? 1, [nodes, source]);
  const color = lit || inTrace ? (inTrace ? "#f59e0b" : TYPE_COLOR[srcType ?? "feature"]) : "#2c2c31";
  const cls =
    kind === "dependency" ? "e-dep" : kind === "api" ? "e-api" : kind === "database" ? "e-db" : kind === "external" ? "e-ext" : kind === "data" ? "e-data" : "";
  const ambient = anim && (kind === "api" || kind === "database" || kind === "data") && (lit || inTrace);

  return (
    <g key={revealKey} className="edge-entrance" style={{ animationDelay: `${depth * 150 + 350}ms` }}>
      <path d={path} className="edge-hit" />
      <path
        d={path}
        className={`edge-base ${inTrace ? "trace-edge" : cls} ${dim ? "dim" : ""} ${ambient ? "flow-anim" : anim && kind === "external" && lit ? "flow-anim-slow" : ""}`}
        stroke={color}
        strokeWidth={lit || inTrace ? 1.8 : 1.1}
        style={{ opacity: dim ? 0.08 : lit || inTrace ? 0.95 : 0.5 }}
      />
      {anim && (lit || inTrace) && (
        <circle r={inTrace ? 3 : 2.4} fill={color}>
          <animateMotion dur={inTrace ? "1s" : "1.8s"} repeatCount="indefinite" path={path} />
        </circle>
      )}
    </g>
  );
});

export const nodeTypes = { code: NodeCard };
export const edgeTypes = { cf: CodeEdge };

/* ------------------------------------------------------------------ */
/* Semantic-zoom gate                                                 */
/* ------------------------------------------------------------------ */

export function ZoomGate() {
  const { zoom } = useViewport();
  const setZoomBucket = useApp((s) => s.setZoomBucket);
  const bucket: 0 | 1 | 2 = zoom < 0.5 ? 0 : zoom < 0.85 ? 1 : 2;
  // side-effect on bucket change only
  useMemo(() => setZoomBucket(bucket), [bucket, setZoomBucket]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Legend + zoom controls                                             */
/* ------------------------------------------------------------------ */

export function Legend() {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(TYPE_COLOR) as [NodeType, string][];
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-20">
      {open ? (
        <div className="panel anim-fade-up rounded-xl p-3 shadow-2xl shadow-black/50">
          <div className="mb-2 flex items-center justify-between gap-6">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400">Node types</span>
            <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-50" aria-label="Collapse legend">
              <CircleDot size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
            {entries.map(([t, c]) => (
              <div key={t} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: c }} />
                <span className="text-[10.5px] text-ink-300">{TYPE_LABEL[t]}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="btn-ghost flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10.5px] text-ink-300">
          <span className="flex -space-x-0.5">
            {entries.slice(0, 5).map(([t, c]) => (
              <span key={t} className="h-2 w-2 rounded-full border border-ink-950" style={{ background: c }} />
            ))}
          </span>
          Legend
        </button>
      )}
    </div>
  );
}

export function ZoomControls() {
  const rf = useApp((s) => s.rf);
  const anim = useApp((s) => s.anim);
  const dur = anim ? 400 : 0;
  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900/90 shadow-xl shadow-black/40">
      <button className="px-2.5 py-2 text-ink-300 transition hover:bg-ink-850 hover:text-ink-50" aria-label="Zoom in" onClick={() => rf?.zoomIn({ duration: dur })}>
        <Plus size={14} />
      </button>
      <div className="h-px bg-ink-700" />
      <button className="px-2.5 py-2 text-ink-300 transition hover:bg-ink-850 hover:text-ink-50" aria-label="Zoom out" onClick={() => rf?.zoomOut({ duration: dur })}>
        <Minus size={14} />
      </button>
      <div className="h-px bg-ink-700" />
      <button
        className="px-2.5 py-2 text-ink-300 transition hover:bg-ink-850 hover:text-ink-50"
        aria-label="Fit map to screen"
        title="Fit to screen (F)"
        onClick={() => rf?.fitView({ padding: 0.12, duration: anim ? 700 : 0 })}
      >
        <Crosshair size={14} />
      </button>
    </div>
  );
}