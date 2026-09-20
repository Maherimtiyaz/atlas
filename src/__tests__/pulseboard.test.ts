import { describe, it, expect } from "vitest";
import { buildPulseboard, computeStats } from "../data/pulseboard";
import type { NodeType } from "../model";
import { TYPE_LABEL, NODE_W, NODE_H } from "../model";

describe("buildPulseboard", () => {
  const g = buildPulseboard();

  it("has exactly one product node", () => {
    const products = g.nodes.filter((n) => n.data.kind === "product");
    expect(products.length).toBe(1);
    expect(products[0].id).toBe("prod");
  });

  it("has the expected feature count", () => {
    const features = g.nodes.filter((n) => n.data.kind === "feature");
    expect(features.length).toBe(9);
  });

  it("has no dangling edges", () => {
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("every feature has at least one page and one API", () => {
    const features = g.nodes.filter((n) => n.data.kind === "feature");
    for (const f of features) {
      const pages = g.edges.filter((e) => e.source === f.id && e.target.startsWith("p-"));
      const apis = g.edges.filter((e) => e.source === f.id && e.target.startsWith("a-"));
      expect(pages.length).toBeGreaterThan(0);
      expect(apis.length).toBeGreaterThan(0);
    }
  });

  it("every page has at least one component", () => {
    const pages = g.nodes.filter((n) => n.data.kind === "page");
    for (const p of pages) {
      const comps = g.edges.filter((e) => e.source === p.id && e.target.startsWith("c-"));
      expect(comps.length).toBeGreaterThan(0);
    }
  });

  it("stats match node counts", () => {
    const stats = computeStats(g.nodes);
    expect(stats.features).toBe(9);
    expect(stats.components).toBeGreaterThan(30);
    expect(stats.pages).toBeGreaterThan(10);
    expect(stats.apis).toBeGreaterThan(20);
  });

  it("all node types have valid dimensions", () => {
    const kinds: NodeType[] = ["product", "feature", "page", "component", "api", "database", "service", "external", "job"];
    for (const k of kinds) {
      expect(NODE_W[k]).toBeGreaterThan(0);
      expect(NODE_H[k]).toBeGreaterThan(0);
      expect(TYPE_LABEL[k]).toBeTruthy();
    }
  });

  it("produces deterministic output across multiple calls", () => {
    const g1 = buildPulseboard();
    const g2 = buildPulseboard();
    expect(g1.nodes.length).toBe(g2.nodes.length);
    expect(g1.edges.length).toBe(g2.edges.length);
    // metrics should be identical
    const n1 = g1.nodes.find((n) => n.id === "f:billing")!;
    const n2 = g2.nodes.find((n) => n.id === "f:billing")!;
    expect(n1.data.meta.complexity).toBe(n2.data.meta.complexity);
    expect(n1.data.meta.loc).toBe(n2.data.meta.loc);
  });
});