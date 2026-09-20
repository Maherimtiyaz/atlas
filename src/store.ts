import { create } from "zustand";
import type { ReactFlowInstance } from "@xyflow/react";
import { applyNodeChanges, type NodeChange } from "@xyflow/react";
import type { CFEdge, CFNode, Graph, GraphStats, RepoInfo } from "./model";
import { NODE_H, NODE_W } from "./model";
import { layoutGraph, focusSetFor } from "./lib/engine";

export type Phase = "landing" | "analyzing" | "map";
export type MapMode = "overview" | "complexity" | "history";
export type ExplainLevel = "simple" | "developer" | "deep";

interface FlowState {
  active: boolean;
  startId: string | null;
  endId: string | null;
  path: string[];
  pathEdges: Set<string>;
  playing: boolean;
  step: number;
}

interface Toast {
  id: number;
  msg: string;
  kind: "info" | "ok" | "warn";
}

interface AppState {
  phase: Phase;
  pendingGraph: Graph | null;
  repo: RepoInfo;
  nodes: CFNode[];
  edges: CFEdge[];
  stats: GraphStats;
  notes: string[];
  revealKey: number;

  rf: ReactFlowInstance<CFNode, CFEdge> | null;
  zoomBucket: 0 | 1 | 2;

  selectedId: string | null;
  hoverId: string | null;
  focus: Set<string> | null;
  mode: MapMode;
  timeIndex: number;

  flow: FlowState;
  explorerOpen: boolean;
  inspectorOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  codeFile: string | null;
  codeNode: string | null;
  tourStep: number;
  explainLevel: ExplainLevel;
  anim: boolean;
  toast: Toast | null;

  boot: (g: Graph) => void;
  toMap: () => void;
  reset: () => void;
  setRf: (rf: ReactFlowInstance<CFNode, CFEdge> | null) => void;
  setZoomBucket: (b: 0 | 1 | 2) => void;
  onNodesChange: (changes: NodeChange<CFNode>[]) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  focusNode: (id: string | null, zoom?: number) => void;
  setMode: (m: MapMode) => void;
  setTime: (i: number) => void;
  setFlow: (patch: Partial<FlowState>) => void;
  toggleExplorer: () => void;
  setPalette: (b: boolean) => void;
  setShortcuts: (b: boolean) => void;
  openCode: (file: string | null, nodeId?: string | null) => void;
  setTour: (n: number) => void;
  setExplainLevel: (l: ExplainLevel) => void;
  toggleAnim: () => void;
  notify: (msg: string, kind?: Toast["kind"]) => void;
}

const emptyStats: GraphStats = {
  files: 0, components: 0, pages: 0, apis: 0, tables: 0, services: 0, externals: 0, jobs: 0, features: 0,
};

const prefersReduced =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  phase: "landing",
  pendingGraph: null,
  repo: { name: "—", org: "", branch: "main", source: "demo" },
  nodes: [],
  edges: [],
  stats: emptyStats,
  notes: [],
  revealKey: 0,

  rf: null,
  zoomBucket: 1,

  selectedId: null,
  hoverId: null,
  focus: null,
  mode: "overview",
  timeIndex: 7,

  flow: { active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 },
  explorerOpen: typeof window !== "undefined" ? window.innerWidth >= 1200 : true,
  inspectorOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  codeFile: null,
  codeNode: null,
  tourStep: -1,
  explainLevel: "simple",
  anim: !prefersReduced,
  toast: null,

  boot: (g) => {
    layoutGraph(g);
    set({
      pendingGraph: g,
      phase: "analyzing",
      repo: g.repo,
      nodes: g.nodes,
      edges: g.edges,
      stats: g.stats,
      notes: g.notes,
      selectedId: null,
      hoverId: null,
      focus: null,
      flow: { active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 },
      tourStep: -1,
      codeFile: null,
      revealKey: get().revealKey + 1,
    });
  },

  toMap: () => set({ phase: "map", pendingGraph: null }),

  reset: () =>
    set({
      phase: "landing",
      pendingGraph: null,
      nodes: [],
      edges: [],
      selectedId: null,
      hoverId: null,
      focus: null,
      codeFile: null,
      tourStep: -1,
      flow: { active: false, startId: null, endId: null, path: [], pathEdges: new Set(), playing: false, step: 0 },
    }),

  setRf: (rf) => set({ rf }),
  setZoomBucket: (b) => {
    if (b !== get().zoomBucket) set({ zoomBucket: b });
  },

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as CFNode[] }),

  select: (id) => {
    const { edges } = get();
    set({
      selectedId: id,
      inspectorOpen: !!id,
      focus: id ? focusSetFor(id, edges) : get().hoverId ? focusSetFor(get().hoverId!, edges) : null,
    });
  },

  hover: (id) => {
    const { edges, selectedId } = get();
    if (id) set({ hoverId: id, focus: focusSetFor(id, edges) });
    else set({ hoverId: null, focus: selectedId ? focusSetFor(selectedId, edges) : null });
  },

  focusNode: (id, zoom) => {
    const { rf, nodes, anim } = get();
    if (!id) return;
    const n = nodes.find((v) => v.id === id);
    if (!rf || !n) return;
    const z = zoom ?? (n.data.kind === "product" ? 0.7 : n.data.kind === "feature" ? 0.95 : 1.15);
    rf.setCenter(
      n.position.x + NODE_W[n.data.kind] / 2,
      n.position.y + NODE_H[n.data.kind] / 2,
      { zoom: z, duration: anim ? 700 : 0 }
    );
  },

  setMode: (m) => set({ mode: m }),
  setTime: (i) => set({ timeIndex: i }),
  setFlow: (patch) => set({ flow: { ...get().flow, ...patch } }),
  toggleExplorer: () => set({ explorerOpen: !get().explorerOpen }),
  setPalette: (b) => set({ paletteOpen: b }),
  setShortcuts: (b) => set({ shortcutsOpen: b }),
  openCode: (file, nodeId) => set({ codeFile: file, codeNode: nodeId ?? get().selectedId }),
  setTour: (n) => set({ tourStep: n }),
  setExplainLevel: (l) => set({ explainLevel: l }),
  toggleAnim: () => {
    const next = !get().anim;
    set({ anim: next });
    get().notify(next ? "Map animations enabled" : "Map animations paused", "info");
  },
  notify: (msg, kind = "info") => {
    const id = ++toastSeq;
    set({ toast: { id, msg, kind } });
    window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },
}));