import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const NODE_KINDS = ["product", "feature", "page", "component", "api", "database", "service", "external", "job"] as const;
export const EDGE_KINDS = ["navigation", "dependency", "api", "database", "external", "data"] as const;
const MAX_NODES = 500;
const MAX_EDGES = 1500;
const MAX_STRING = 240;

export type PdfNode = {
  id: string;
  kind: typeof NODE_KINDS[number];
  name: string;
  typeLabel: string;
  description: string;
  files: string[];
  meta: Record<string, number | string>;
  position: { x: number; y: number };
};

export type PdfEdge = { id: string; source: string; target: string; kind: typeof EDGE_KINDS[number] };

export type PdfGraph = {
  repo: { name: string; org: string; branch: string };
  nodes: PdfNode[];
  edges: PdfEdge[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, field: string, max = MAX_STRING) => {
  if (typeof value !== "string" || value.length > max) throw new Error(`Invalid ${field}`);
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
};
const finite = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e7) throw new Error(`Invalid ${field}`);
  return value;
};

export function sanitizeGraph(input: unknown): PdfGraph {
  if (!isRecord(input) || !isRecord(input.repo) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw new Error("Graph must contain repo, nodes[], and edges[]");
  if (input.nodes.length === 0 || input.nodes.length > MAX_NODES) throw new Error("Graph node count is outside the allowed range");
  if (input.edges.length > MAX_EDGES) throw new Error("Graph edge count exceeds the allowed limit");
  const repo = { name: text(input.repo.name, "repo.name"), org: text(input.repo.org, "repo.org"), branch: text(input.repo.branch, "repo.branch") };
  const nodes = input.nodes.map((raw, index): PdfNode => {
    if (!isRecord(raw) || !isRecord(raw.data)) throw new Error(`Invalid node at index ${index}`);
    const data = raw.data;
    if (!NODE_KINDS.includes(data.kind as typeof NODE_KINDS[number])) throw new Error(`Invalid node kind at index ${index}`);
    const position = isRecord(raw.position) ? raw.position : {};
    const meta: Record<string, number | string> = {};
    if (isRecord(data.meta)) {
      for (const key of ["complexity", "loc", "coverage", "churn", "contributors", "columns", "relations", "route", "method"]) {
        if (data.meta[key] !== undefined) meta[key] = typeof data.meta[key] === "number" ? finite(data.meta[key], `node.meta.${key}`) : text(data.meta[key], `node.meta.${key}`, 80);
      }
    }
    return {
      id: text(raw.id, `node[${index}].id`, 120), kind: data.kind as PdfNode["kind"], name: text(data.name, `node[${index}].name`, 120),
      typeLabel: text(data.typeLabel, `node[${index}].typeLabel`, 80), description: text(data.description, `node[${index}].description`),
      files: Array.isArray(data.files) ? data.files.slice(0, 8).map((file, fileIndex) => text(file, `node[${index}].files[${fileIndex}]`, 180)) : [], meta,
      position: { x: position.x === undefined ? 0 : finite(position.x, `node[${index}].position.x`), y: position.y === undefined ? 0 : finite(position.y, `node[${index}].position.y`) },
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error("Graph contains duplicate node IDs");
  const edges = input.edges.map((raw, index): PdfEdge => {
    if (!isRecord(raw) || !isRecord(raw.data) || !EDGE_KINDS.includes(raw.data.kind as PdfEdge["kind"])) throw new Error(`Invalid edge at index ${index}`);
    const source = text(raw.source, `edge[${index}].source`, 120); const target = text(raw.target, `edge[${index}].target`, 120);
    if (!ids.has(source) || !ids.has(target)) throw new Error(`Edge at index ${index} references an unknown node`);
    return { id: text(raw.id, `edge[${index}].id`, 120), source, target, kind: raw.data.kind as PdfEdge["kind"] };
  });
  return { repo, nodes, edges };
}

const COLORS: Record<PdfNode["kind"], ReturnType<typeof rgb>> = {
  product: rgb(0.55, 0.36, 0.96), feature: rgb(0.23, 0.51, 0.95), page: rgb(0.13, 0.83, 0.92), component: rgb(0.2, 0.82, 0.6), api: rgb(0.96, 0.62, 0.12), database: rgb(0.92, 0.29, 0.6), service: rgb(0.98, 0.57, 0.24), external: rgb(0.51, 0.39, 0.92), job: rgb(0.75, 0.52, 0.92),
};
const safePdfText = (value: string) => value.replace(/[^\x20-\x7e]/g, "?");
const wrap = (value: string, max: number) => {
  const words = safePdfText(value).split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { if ((line + " " + word).trim().length > max && line) { lines.push(line); line = word; } else line = (line + " " + word).trim(); }
  if (line) lines.push(line); return lines;
};

export async function generatePdf(graph: PdfGraph): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${graph.repo.name} visual study`); pdf.setAuthor("Atlas");
  const pageWidth = 792; const pageHeight = 612; const overview = pdf.addPage([pageWidth, pageHeight]);
  overview.drawText(`${safePdfText(graph.repo.name)} - visual study`, { x: 30, y: 575, size: 20, font: bold, color: rgb(0.08, 0.08, 0.1) });
  overview.drawText(`${safePdfText(graph.repo.org)}/${safePdfText(graph.repo.name)} - ${safePdfText(graph.repo.branch)} - ${graph.nodes.length} nodes - ${graph.edges.length} relationships`, { x: 30, y: 552, size: 9, font, color: rgb(0.3, 0.3, 0.34) });
  const minX = Math.min(...graph.nodes.map((node) => node.position.x)); const maxX = Math.max(...graph.nodes.map((node) => node.position.x + 200));
  const minY = Math.min(...graph.nodes.map((node) => node.position.y)); const maxY = Math.max(...graph.nodes.map((node) => node.position.y + 120));
  const scale = Math.min(720 / Math.max(1, maxX - minX), 455 / Math.max(1, maxY - minY), 1);
  const point = (node: PdfNode) => ({ x: 36 + (node.position.x - minX) * scale, y: 90 + (maxY - node.position.y - 50) * scale });
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) { const source = byId.get(edge.source); const target = byId.get(edge.target); if (!source || !target) continue; const a = point(source); const b = point(target); overview.drawLine({ start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, thickness: Math.max(0.35, scale), color: rgb(0.72, 0.72, 0.76), opacity: 0.65 }); }
  for (const node of graph.nodes) { const p = point(node); const width = Math.max(28, 150 * scale); const height = Math.max(14, 52 * scale); const color = COLORS[node.kind]; overview.drawRectangle({ x: p.x, y: p.y, width, height, color: rgb(0.98, 0.98, 0.99), borderColor: color, borderWidth: Math.max(0.6, 2 * scale) }); if (scale > 0.28) overview.drawText(safePdfText(node.name).slice(0, 24), { x: p.x + 4, y: p.y + height / 2 - 3, size: Math.max(4, Math.min(9, 9 * scale + 2)), font: bold, color: rgb(0.1, 0.1, 0.12), maxWidth: width - 8 }); }
  overview.drawText("Overview - node colors indicate type; relationships connect analyzed areas", { x: 30, y: 32, size: 8, font, color: rgb(0.35, 0.35, 0.38) });
  for (let start = 0; start < graph.nodes.length; start += 12) {
    const chunk = graph.nodes.slice(start, start + 12); const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawText(`${safePdfText(graph.repo.name)} - node details ${start + 1}-${start + chunk.length}`, { x: 30, y: 575, size: 16, font: bold, color: rgb(0.08, 0.08, 0.1) });
    chunk.forEach((node, index) => { const x = 30 + (index % 2) * 370; const y = 525 - Math.floor(index / 2) * 80; const color = COLORS[node.kind]; page.drawRectangle({ x, y: y - 52, width: 340, height: 64, color: rgb(0.98, 0.98, 0.99), borderColor: color, borderWidth: 1.2 }); page.drawText(`${safePdfText(node.typeLabel)} - ${safePdfText(node.name)}`.slice(0, 70), { x: x + 10, y: y - 5, size: 10, font: bold, color: rgb(0.1, 0.1, 0.12), maxWidth: 320 }); const meta = Object.entries(node.meta).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join(" | "); page.drawText(wrap(`${node.description}${meta ? ` | ${meta}` : ""}`, 65).slice(0, 2).join("\n"), { x: x + 10, y: y - 20, size: 7.5, lineHeight: 10, font, color: rgb(0.3, 0.3, 0.34), maxWidth: 320 }); });
    const relationships = graph.edges.filter((edge) => chunk.some((node) => node.id === edge.source || node.id === edge.target)).slice(0, 12); page.drawText("Relationships in this section", { x: 30, y: 72, size: 10, font: bold, color: rgb(0.1, 0.1, 0.12) }); relationships.forEach((edge, index) => { const source = byId.get(edge.source)?.name ?? edge.source; const target = byId.get(edge.target)?.name ?? edge.target; page.drawText(`${safePdfText(source)} -> ${safePdfText(target)} | ${edge.kind}`, { x: 30, y: 56 - index * 12, size: 7.5, font, color: rgb(0.3, 0.3, 0.34), maxWidth: 730 }); });
  }
  return pdf.save();
}
