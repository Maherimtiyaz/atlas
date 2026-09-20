import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { useApp } from "./store";
import { readPendingGraph } from "./lib/pdfExport";
import { getSupabase } from "./lib/supabase";
import Landing from "./components/Landing";
import Analyzing from "./components/Analyzing";
import MapScreen from "./components/MapScreen";

function ToastHost() {
  const toast = useApp((s) => s.toast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-60 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: -14, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="panel flex items-center gap-2.5 rounded-lg px-4 py-2.5 shadow-xl shadow-black/50"
          >
            {toast.kind === "ok" ? (
              <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
            ) : toast.kind === "warn" ? (
              <AlertTriangle size={14} className="shrink-0 text-amber-300" />
            ) : (
              <Info size={14} className="shrink-0 text-cyan-300" />
            )}
            <span className="text-[12px] text-ink-200">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const phase = useApp((s) => s.phase);
  const anim = useApp((s) => s.anim);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    let active = true;
    const restorePendingGraph = async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      const pending = readPendingGraph();
      if (active && session && pending && useApp.getState().phase === "landing") boot(pending);
    };
    void restorePendingGraph();
    return () => { active = false; };
  }, [boot]);

  return (
    <div className={`h-full w-full overflow-hidden bg-ink-950 font-body text-ink-50 ${anim ? "" : "anim-off"}`}>
      <AnimatePresence mode="wait">
        {phase === "landing" && (
          <motion.div key="landing" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Landing />
          </motion.div>
        )}
        {phase === "analyzing" && (
          <motion.div key="analyzing" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Analyzing />
          </motion.div>
        )}
        {phase === "map" && (
          <motion.div key="map" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <MapScreen />
          </motion.div>
        )}
      </AnimatePresence>
      <ToastHost />
    </div>
  );
}