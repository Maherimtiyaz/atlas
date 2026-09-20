import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Map as MapIcon } from "lucide-react";
import { useApp } from "../store";
import { TYPE_COLOR, TYPE_LABEL } from "../model";
import { codeFor, highlight } from "../data/code";

export default function CodeViewer() {
  const file = useApp((s) => s.codeFile);
  const nodeId = useApp((s) => s.codeNode);
  const nodes = useApp((s) => s.nodes);
  const openCode = useApp((s) => s.openCode);
  const select = useApp((s) => s.select);
  const focusNode = useApp((s) => s.focusNode);

  const node = nodes.find((n) => n.id === nodeId) ?? null;
  const product = nodes.find((n) => n.data.kind === "product");
  const feature = node?.data.featureId ? nodes.find((n) => n.id === `f:${node.data.featureId}`) : null;

  const { code } = useMemo(() => (node ? codeFor(node, file) : { file: "", code: "" }), [node, file]);
  const lines = useMemo(() => highlight(code), [code]);

  const crumbs = [product?.data.name, feature?.data.name, node?.data.name].filter(Boolean) as string[];

  return (
    <AnimatePresence>
      {file && node && (
        <motion.div
          key="code"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 backdrop-blur-[3px] md:items-center md:p-10"
          onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && openCode(null)}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="panel flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl shadow-2xl shadow-black/70"
          >
            <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
              <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden" aria-label="Breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={`${c}-${i}`} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <ChevronRight size={11} className="shrink-0 text-ink-600" />}
                    <span className={`truncate font-mono text-[10.5px] ${i === crumbs.length - 1 ? "text-cyan-200" : "text-ink-400"}`}>{c}</span>
                  </span>
                ))}
              </nav>
              <button
                onClick={() => {
                  select(node.id);
                  focusNode(node.id);
                  openCode(null);
                }}
                className="btn-ghost flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-ink-300 hover:text-cyan-200"
              >
                <MapIcon size={12} /> Back to map
              </button>
              <button onClick={() => openCode(null)} className="shrink-0 text-ink-400 transition hover:text-ink-50" aria-label="Close code viewer">
                <X size={15} />
              </button>
            </div>

            {/* file tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-ink-800 bg-ink-950/50 px-3 pt-2">
              {node.data.files.map((f) => (
                <button
                  key={f}
                  onClick={() => openCode(f, node.id)}
                  className={`shrink-0 rounded-t-md border-x border-t px-3 py-1.5 font-mono text-[10.5px] transition ${
                    f === file ? "border-ink-700 bg-ink-900 text-cyan-200" : "border-transparent text-ink-500 hover:text-ink-300"
                  }`}
                >
                  {f.split("/").pop()}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-ink-950/70 py-3 font-mono text-[12px] leading-[1.75]">
              {lines.map((tokens, i) => (
                <div key={i} className="flex px-0 hover:bg-ink-900/60">
                  <span className="w-12 shrink-0 select-none pr-4 text-right text-ink-600">{i + 1}</span>
                  <span className="whitespace-pre pr-6 text-ink-200">
                    {tokens.map((t, j) =>
                      t.cls ? (
                        <span key={j} className={t.cls}>{t.text}</span>
                      ) : (
                        <span key={j}>{t.text}</span>
                      )
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2.5">
              <span className="font-mono text-[9.5px] text-ink-500">
                {file} · {code.split("\n").length} lines · {TYPE_LABEL[node.data.kind]} layer — deepest level of the map
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[node.data.kind] }} />
                <span className="font-mono text-[9.5px] text-ink-400">{node.data.name}</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}