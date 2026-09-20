import type { Edge, Node } from "@xyflow/react";

/* ------------------------------------------------------------------ */
/* Graph model — the single contract between analysis and rendering.  */
/* ------------------------------------------------------------------ */

export type NodeType =
  | "product"
  | "feature"
  | "page"
  | "component"
  | "api"
  | "database"
  | "service"
  | "external"
  | "job";

export type EdgeKind =
  | "navigation"
  | "dependency"
  | "api"
  | "database"
  | "external"
  | "data";

export interface NodeMeta {
  complexity: number;   // 0..100 composite signal
  loc: number;          // lines of code across files
  coverage: number;     // % test coverage
  addedIn: number;      // month index 0..7 (git history mode)
  churn: number;        // commits touching this area
  contributors: number;
  route?: string;
  method?: string;
  columns?: number;     // database tables
  relations?: number;   // database tables
}

export interface NodeData {
  kind: NodeType;
  name: string;
  typeLabel: string;
  description: string;
  files: string[];
  featureId?: string;   // owning feature, when applicable
  depth: number;        // hierarchy depth, drives entrance stagger + zoom bucket
  meta: NodeMeta;
  [key: string]: unknown;
}

export interface EdgeData {
  kind: EdgeKind;
  label?: string;
  [key: string]: unknown;
}

export type CFNode = Node<NodeData, "code">;
export type CFEdge = Edge<EdgeData, "cf">;

export interface GraphStats {
  files: number;
  components: number;
  pages: number;
  apis: number;
  tables: number;
  services: number;
  externals: number;
  jobs: number;
  features: number;
}

export interface RepoInfo {
  name: string;
  org: string;
  branch: string;
  source: "demo" | "github" | "upload";
}

export interface Graph {
  repo: RepoInfo;
  nodes: CFNode[];
  edges: CFEdge[];
  stats: GraphStats;
  notes: string[]; // partial-analysis warnings
}

/* ------------------------------------------------------------------ */
/* Visual language                                                    */
/* ------------------------------------------------------------------ */

export const TYPE_COLOR: Record<NodeType, string> = {
  product: "#8b5cf6",
  feature: "#3b82f6",
  page: "#22d3ee",
  component: "#34d399",
  api: "#f59e0b",
  database: "#ec4899",
  service: "#fb923c",
  external: "#818cf8",
  job: "#c084fc",
};

export const TYPE_LABEL: Record<NodeType, string> = {
  product: "Product",
  feature: "Feature",
  page: "Page",
  component: "Component",
  api: "API",
  database: "Database",
  service: "Service",
  external: "Integration",
  job: "Background Job",
};

/** Node canvas footprint per type (used for camera centering). */
export const NODE_W: Record<NodeType, number> = {
  product: 320,
  feature: 264,
  page: 224,
  component: 196,
  api: 208,
  database: 200,
  service: 224,
  external: 216,
  job: 216,
};

export const NODE_H: Record<NodeType, number> = {
  product: 148,
  feature: 158,
  page: 118,
  component: 96,
  api: 104,
  database: 104,
  service: 118,
  external: 104,
  job: 104,
};

export const METHOD_COLOR: Record<string, string> = {
  GET: "#34d399",
  POST: "#f59e0b",
  PATCH: "#22d3ee",
  PUT: "#22d3ee",
  DELETE: "#f87171",
};

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

export const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  navigation: "navigates to",
  dependency: "depends on",
  api: "calls",
  database: "reads / writes",
  external: "talks to",
  data: "data flow",
};