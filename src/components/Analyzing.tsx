import { useEffect, useMemo, useRef, useState } from "react";
import { Check, TerminalSquare, ArrowRight } from "lucide-react";
import { useApp } from "../store";
import { LogoMark } from "./Landing";

const STEPS = [
  "Reading project structure",
  "Detecting framework",
  "Detecting entry points",
  "Finding routes",
  "Mapping components",
  "Detecting API endpoints",
  "Analyzing database",
  "Finding external services",
  "Detecting authentication",
  "Building dependency graph",
  "Generating product map",
];

export default function Analyzing() {
  const repo = useApp((s) => s.repo);
  const stats = useApp((s) => s.stats);
  const anim = useApp((s) => s.anim);
  const toMap = useApp((s) => s.toMap);
  const [done, setDone] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const step = anim ? 230 : 60;
    timer.current = window.setInterval(() => {
      setDone((d) => {
        if (d >= STEPS.length) {
          if (timer.current) window.clearInterval(timer.current);
          return d;
        }
        return d + 1;
      });
    }, step);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [anim]);

  const complete = done >= STEPS.length;

  /* auto-advance into the map shortly after the sequence completes */
  useEffect(() => {
    if (!complete) return;
    const t = window.setTimeout(toMap, anim ? 1600 : 400);
    return () => window.clearTimeout(t);
  }, [complete, anim, toMap]);

  const pct = Math.round((done / STEPS.length) * 100);
  const eta = useMemo(() => Math.max(2, Math.round(stats.files / 40)), [stats.files]);

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden px-6">
      <div className="dotgrid pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className="relative w-full max-w-xl">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="font-display text-[14px] font-semibold text-ink-50">Atlas</span>
          <span className="font-mono text-[10px] text-ink-600">· static analysis</span>
        </div>

        <div className="panel rounded-xl">
          <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
            <TerminalSquare size={13} className="text-cyan-300" />
            <span className="font-mono text-[11px] text-ink-300">
              $ atlas analyze <span className="text-ink-50">{repo.org}/{repo.name}</span> --branch {repo.branch}
              {!complete && <span className="cursor-blink text-cyan-300">▊</span>}
            </span>
          </div>

          <div className="px-5 py-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-[15px] font-semibold text-ink-50">
                {complete ? "Your product map is ready." : "Analyzing repository…"}
              </span>
              <span className="font-mono text-[10.5px] text-ink-400">{pct}%</span>
            </div>

            <div className="mb-4 h-0.75 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-linear-to-r from-violet-400 via-cyan-300 to-emerald-300 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>

            <ul className="space-y-1.5">
              {STEPS.map((s, i) => {
                const state = i < done ? "done" : i === done ? "active" : "pending";
                return (
                  <li key={s} className={`flex items-center gap-2.5 text-[12.5px] transition-opacity duration-300 ${state === "pending" ? "opacity-25" : "opacity-100"}`}>
                    {state === "done" ? (
                      <Check size={13} className="shrink-0 text-emerald-400" />
                    ) : state === "active" ? (
                      <span className="h-3.25 w-3.25 shrink-0 animate-spin rounded-full border border-cyan-300/30 border-t-cyan-300" />
                    ) : (
                      <span className="h-3.25 w-3.25 shrink-0 rounded-full border border-ink-700" />
                    )}
                    <span className={state === "done" ? "text-ink-300" : "text-ink-200"}>{s}</span>
                    {state === "active" && <span className="font-mono text-[9.5px] text-cyan-300/80">…</span>}
                  </li>
                );
              })}
            </ul>
          </div>

          {complete && (
            <div className="anim-fade-up border-t border-ink-800 px-5 py-4">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                {[
                  [stats.files, "files"],
                  [stats.components, "components"],
                  [stats.apis, "API routes"],
                  [stats.tables, "db tables"],
                  [stats.services + stats.externals + stats.jobs, "services"],
                  [`~${eta} min`, "to understand"],
                ].map(([v, l]) => (
                  <div key={String(l)} className="rounded-lg border border-ink-800 bg-ink-950/60 px-2.5 py-2 text-center">
                    <div className="font-display text-[16px] font-bold text-ink-50">{v}</div>
                    <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-400">{l}</div>
                  </div>
                ))}
              </div>
              <button onClick={toMap} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[13.5px] font-semibold">
                Enter the map <ArrowRight size={15} />
              </button>
              <p className="mt-2 text-center font-mono text-[9.5px] text-ink-600">the camera pulls back as the ecosystem reveals itself</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}