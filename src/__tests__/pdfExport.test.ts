import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generatePdf, sanitizeGraph } from "../lib/pdfCore";

const graph = {
  repo: { name: "Demo", org: "atlas", branch: "main" },
  nodes: [
    { id: "product", type: "code", position: { x: 0, y: 0 }, data: { kind: "product", name: "Demo", typeLabel: "Product", description: "The product", files: [], depth: 0, meta: { complexity: 20, loc: 100, coverage: 80 } } },
    { id: "feature", type: "code", position: { x: 0, y: 250 }, data: { kind: "feature", name: "Auth", typeLabel: "Feature", description: "Sign in", files: ["src/auth.ts"], depth: 1, meta: { complexity: 40, loc: 80, coverage: 70 } } },
  ],
  edges: [{ id: "edge", source: "product", target: "feature", type: "cf", data: { kind: "dependency" } }],
};

describe("PDF export core", () => {
  it("sanitizes the Graph into the PDF schema", () => {
    const clean = sanitizeGraph(graph);
    expect(clean.nodes).toHaveLength(2);
    expect(clean.edges[0].kind).toBe("dependency");
    expect((clean.nodes[0] as unknown as Record<string, unknown>).type).toBeUndefined();
  });

  it("rejects malformed and oversized graphs", () => {
    expect(() => sanitizeGraph({ repo: {}, nodes: [], edges: [] })).toThrow();
    const oversized = { ...graph, nodes: Array.from({ length: 501 }, (_, i) => ({ ...graph.nodes[0], id: `n-${i}` })) };
    expect(() => sanitizeGraph(oversized)).toThrow(/node count/);
  });

  it("generates a readable PDF with multiple pages", async () => {
    const bytes = await generatePdf(sanitizeGraph(graph));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(document.getTitle()).toBe("Demo visual study");
    expect(document.getAuthor()).toBe("Atlas");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});