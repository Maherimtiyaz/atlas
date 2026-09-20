import { useRef, useState } from "react";
import {
  ArrowRight, Upload, Loader2, AlertTriangle, Map as MapIcon, CheckCircle2, GitBranch,
} from "lucide-react";
import { useApp } from "../store";
import { buildPulseboard, computeStats } from "../data/pulseboard";
import { analyzeGitHub } from "../lib/repoAnalyzer";
import type { CFEdge, CFNode, Graph, NodeType } from "../model";
import { TYPE_COLOR, TYPE_LABEL } from "../model";

/* Brand mark — three graph nodes forming an "A", drawn with the product's
   own node/edge language. Violet origin, cyan + emerald terminals. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.4 4.2 20.2M12 3.4l7.8 16.8M6.8 14.6h10.4"
        stroke="#52525b"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10.27" cy="14.6" r="1.25" fill="#fafafa" opacity="0.92" />
      <circle cx="13.73" cy="14.6" r="1.25" fill="#fafafa" opacity="0.92" />
      <circle cx="12" cy="3.4" r="2.5" fill="#a78bfa" />
      <circle cx="4.2" cy="20.2" r="2.5" fill="#22d3ee" />
      <circle cx="19.8" cy="20.2" r="2.5" fill="#34d399" />
    </svg>
  );
}

/* Animated mini ecosystem for the right panel */
function LivingMap() {
  const nodes = [
    { x: 250, y: 62, w: 120, c: TYPE_COLOR.product, label: "Pulseboard", big: true },
    { x: 92, y: 176, w: 92, c: TYPE_COLOR.feature, label: "Tasks" },
    { x: 250, y: 190, w: 92, c: TYPE_COLOR.feature, label: "Billing" },
    { x: 402, y: 176, w: 92, c: TYPE_COLOR.feature, label: "Analytics" },
    { x: 150, y: 300, w: 84, c: TYPE_COLOR.api, label: "POST /tasks" },
    { x: 300, y: 316, w: 84, c: TYPE_COLOR.external, label: "Stripe" },
    { x: 430, y: 300, w: 84, c: TYPE_COLOR.database, label: "events" },
    { x: 220, y: 414, w: 84, c: TYPE_COLOR.database, label: "tasks" },
  ];
  const links: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 7]];
  return (
    <div className="relative h-120 w-full max-w-140 select-none">
      <div className="panel absolute inset-0 overflow-hidden rounded-2xl">
        <div className="dotgrid absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute inset-x-0 h-24 bg-linear-to-b from-transparent via-cyan-400/4 to-transparent" style={{ animation: "scanline 7s linear infinite" }} />
        <svg viewBox="0 0 520 480" className="absolute inset-0 h-full w-full">
          {links.map(([a, b], i) => {
            const n1 = nodes[a];
            const n2 = nodes[b];
            const d = `M ${n1.x} ${n1.y + 16} C ${n1.x} ${(n1.y + n2.y) / 2}, ${n2.x} ${(n1.y + n2.y) / 2}, ${n2.x} ${n2.y - 16}`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="#2c2c31" strokeWidth="1.2" strokeDasharray="6 7" className="flow-anim-slow" />
                <circle r="2.6" fill={nodes[b].c} opacity="0.9">
                  <animateMotion dur={`${3 + i * 0.6}s`} repeatCount="indefinite" path={d} />
                </circle>
              </g>
            );
          })}
          {nodes.map((n, i) => (
            <g key={i} style={{ animation: `drift ${5 + i}s ease-in-out infinite`, transformOrigin: "center" }}>
              <rect x={n.x - n.w / 2} y={n.y - 16} width={n.w} height={32} rx={8} fill="#111113" stroke={n.c} strokeOpacity={0.55} />
              <rect x={n.x - n.w / 2} y={n.y - 16} width={3} height={32} rx={1.5} fill={n.c} />
              <text x={n.x + 4} y={n.y + 3.5} textAnchor="middle" fill="#fafafa" fontSize={n.big ? 12.5 : 10.5} fontFamily="Space Grotesk, sans-serif" fontWeight={600}>
                {n.label}
              </text>
            </g>
          ))}
        </svg>

        <div className="anim-fade-up absolute left-4 top-4 rounded-lg border border-ink-700 bg-ink-900/90 px-3 py-2" style={{ animationDelay: "0.4s" }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-400">acme-labs / pulseboard</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> main · analyzed 2m ago
          </div>
        </div>
        <div className="anim-fade-up absolute bottom-4 right-4 rounded-lg border border-amber-400/30 bg-ink-900/90 px-3 py-2" style={{ animationDelay: "0.8s" }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-amber-400/90">hotspot</div>
          <div className="text-[11px] text-ink-200">POST /api/billing/subscribe — 37 commits</div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const boot = useApp((s) => s.boot);
  const notify = useApp((s) => s.notify);
  const [ghOpen, setGhOpen] = useState(false);
  const [ghUrl, setGhUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const startDemo = () => boot(buildPulseboard());

  const startGitHub = async () => {
    if (!ghUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const g = await analyzeGitHub(ghUrl.trim());
      boot(g);
      notify(`Analyzed ${g.repo.org}/${g.repo.name}`, "ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze that repository.");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.name.endsWith(".zip") || f.name.endsWith(".tar.gz")) {
      setError(
        "Archive parsing runs in the analysis worker, which isn't bundled in this build.\nDrop a .json graph export instead — or explore the Pulseboard demo, which exercises the full experience."
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        if (!Array.isArray(raw.nodes)) throw new Error("missing nodes[]");
        const nodes: CFNode[] = raw.nodes.map((n: Record<string, unknown>, i: number) => {
          const kind = (["product", "feature", "page", "component", "api", "database", "service", "external", "job"].includes(String(n.kind)) ? n.kind : "component") as NodeType;
          return {
            id: String(n.id ?? `n${i}`),
            type: "code",
            position: { x: 0, y: 0 },
            data: {
              kind,
              name: String(n.name ?? n.id ?? `node-${i}`),
              typeLabel: TYPE_LABEL[kind],
              description: String(n.description ?? ""),
              files: Array.isArray(n.files) ? n.files.map(String) : [`src/${n.id ?? i}`],
              depth: kind === "product" ? 0 : kind === "feature" ? 1 : 2,
              featureId: typeof n.featureId === "string" ? n.featureId : undefined,
              meta: { complexity: 40, loc: 120, coverage: 60, addedIn: 0, churn: 5, contributors: 2, ...(typeof n.meta === "object" && n.meta ? (n.meta as object) : {}) },
            },
          };
        });
        if (!nodes.some((n) => n.data.kind === "product")) {
          nodes.unshift({
            id: "prod", type: "code", position: { x: 0, y: 0 },
            data: { kind: "product", name: f.name.replace(/\.json$/, ""), typeLabel: "Product", description: "Imported project graph.", files: [], depth: 0, meta: { complexity: 50, loc: 0, coverage: 0, addedIn: 0, churn: 0, contributors: 0 } },
          });
        }
        const ids = new Set(nodes.map((n) => n.id));
        const edges: CFEdge[] = (Array.isArray(raw.edges) ? raw.edges : [])
          .filter((e: Record<string, unknown>) => ids.has(String(e.source)) && ids.has(String(e.target)))
          .map((e: Record<string, unknown>, i: number) => ({
            id: `e${i}`, source: String(e.source), target: String(e.target), type: "cf",
            data: { kind: (["navigation", "dependency", "api", "database", "external", "data"].includes(String(e.kind)) ? e.kind : "dependency") as any },
          }));
        const g: Graph = {
          repo: { name: f.name.replace(/\.json$/, ""), org: "local", branch: "—", source: "upload" },
          nodes, edges, stats: computeStats(nodes),
          notes: ["Imported graph — metrics were not recomputed from source."],
        };
        boot(g);
        notify(`Imported ${nodes.length} nodes`, "ok");
      } catch (e) {
        setError(`That file isn't a graph export I can read. Expected { "nodes": [...], "edges": [...] }.\n${e instanceof Error ? e.message : ""}`);
      }
    };
    reader.readAsText(f);
  };

  return (
    <div className="relative flex h-full flex-col overflow-y-auto overflow-x-hidden">
      <div className="dotgrid pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2.5">
          <LogoMark size={26} />
          <div>
            <div className="font-display text-[15px] font-bold tracking-tight text-ink-50">Atlas</div>
            <div className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-ink-400">codebase product maps</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <span className="kbd">⌘K</span>
          <span className="text-[11px] text-ink-400">search everything, once inside</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 pb-10 md:px-12 lg:grid-cols-[1.02fr_1fr] lg:gap-14">
        <div>
          <div className="anim-fade-up mb-5 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">a map, not a file browser</span>
          </div>

          <h1 className="anim-fade-up font-display text-[42px] font-bold leading-[1.02] tracking-tight text-ink-50 md:text-[62px]" style={{ animationDelay: "0.06s" }}>
            Understand any
            <br />
            codebase.
            <br />
            <span className="text-cyan-300">Visually.</span>
          </h1>

          <p className="anim-fade-up mt-5 max-w-md text-[14.5px] leading-relaxed text-ink-300" style={{ animationDelay: "0.14s" }}>
            Drop a repository in and explore how the entire product works — features, pages,
            APIs, data and services, arranged like a living map instead of a folder tree.
          </p>

          <div className="anim-fade-up mt-8 flex max-w-md flex-col gap-3" style={{ animationDelay: "0.22s" }}>
            <button onClick={startDemo} className="btn-primary group flex items-center justify-between rounded-xl px-5 py-4 text-left">
              <div>
                <div className="flex items-center gap-2 font-display text-[15px] font-semibold">
                  <MapIcon size={16} strokeWidth={2.2} /> Try Demo Repository
                </div>
                <div className="mt-0.5 text-[11.5px] font-normal text-zinc-500">
                  Pulseboard — a project-management SaaS · 9 features · 26 API routes
                </div>
              </div>
              <ArrowRight size={18} className="text-zinc-500 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-zinc-800" />
            </button>

            <button onClick={() => { setGhOpen(!ghOpen); setError(null); }} className="btn-ghost flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-ink-200">
              <div className="flex items-center gap-2 font-display text-[14px] font-medium">
                <GitBranch size={16} /> Import GitHub Repository
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-ink-400">{ghOpen ? "close" : "public repos"}</span>
            </button>

            {ghOpen && (
              <div className="anim-fade-up -mt-1 rounded-xl border border-ink-700 bg-ink-900/80 p-3">
                <div className="flex gap-2">
                  <input
                    value={ghUrl}
                    onChange={(e) => setGhUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startGitHub()}
                    placeholder="vercel/next.js or a full github.com URL"
                    className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-[12px] text-ink-200 outline-none placeholder:text-ink-600 focus:border-cyan-400/50"
                    autoFocus
                  />
                  <button onClick={startGitHub} disabled={busy || !ghUrl.trim()} className="btn-primary flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-40">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                    {busy ? "Analyzing" : "Analyze"}
                  </button>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">
                  The repo tree is fetched straight from the GitHub API and analyzed in your browser —
                  framework, routes, components, Prisma models and integrations are inferred statically.
                </p>
              </div>
            )}

            <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-ink-200">
              <div className="flex items-center gap-2 font-display text-[14px] font-medium">
                <Upload size={16} /> Upload Project
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-ink-400">.json graph</span>
            </button>
            <input ref={fileRef} type="file" accept=".json,.zip,.tar.gz" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />

            {error && (
              <div className="anim-fade-up rounded-xl border border-amber-400/30 bg-amber-400/6 p-3.5">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-300">
                  <AlertTriangle size={14} /> Partial analysis — couldn't import
                </div>
                <p className="mt-1.5 whitespace-pre-line text-[11.5px] leading-relaxed text-ink-300">{error}</p>
              </div>
            )}

          </div>

          <div className="anim-fade-up mt-9 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ animationDelay: "0.3s" }}>
            {[
              ["⌘K", "ask “how does login work?”"],
              ["T", "trace a flow end-to-end"],
              ["F", "fit the whole ecosystem"],
            ].map(([k, t]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="kbd">{k}</span>
                <span className="text-[10.5px] text-ink-400">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="anim-fade-in hidden lg:block" style={{ animationDelay: "0.25s" }}>
          <LivingMap />
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between border-t border-ink-800/70 px-6 py-3.5 md:px-12">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-600">
          don't show more code — show the structure behind it
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-ink-600">
          <CheckCircle2 size={11} className="text-emerald-400/70" /> static analysis runs locally
        </span>
      </footer>
    </div>
  );
}