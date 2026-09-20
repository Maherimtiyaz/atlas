import { describe, it, expect } from "vitest";
import { findPath, focusSetFor, heatColor, heatLabel, downstreamReach, explain, askGraph } from "../lib/engine";
import { buildPulseboard } from "../data/pulseboard";

describe("findPath", () => {
  const g = buildPulseboard();

  it("returns a single-node path when start === end", () => {
    expect(findPath("prod", "prod", g.edges)).toEqual(["prod"]);
  });

  it("finds a path from login to sessions", () => {
    const path = findPath("p-loginpage", "t-sessions", g.edges);
    expect(path.length).toBeGreaterThan(1);
    expect(path[0]).toBe("p-loginpage");
    expect(path[path.length - 1]).toBe("t-sessions");
  });

  it("returns empty when no path exists", () => {
    // A node with no edges in the graph
    const edges = g.edges.filter((e) => e.source !== "prod" && e.target !== "prod");
    expect(findPath("prod", "t-sessions", edges)).toEqual([]);
  });
});

describe("focusSetFor", () => {
  const g = buildPulseboard();

  it("includes the node itself and its direct neighbors", () => {
    const set = focusSetFor("prod", g.edges);
    expect(set.has("prod")).toBe(true);
    // product connects to features, externals, etc.
    expect(set.size).toBeGreaterThan(1);
    // every member is directly connected to prod
    for (const id of set) {
      if (id === "prod") continue;
      const connected = g.edges.some(
        (e) => (e.source === "prod" && e.target === id) || (e.target === "prod" && e.source === id)
      );
      expect(connected).toBe(true);
    }
  });
});

describe("heatColor / heatLabel", () => {
  it("classifies complexity into four bands", () => {
    expect(heatLabel(20)).toBe("simple");
    expect(heatLabel(50)).toBe("moderate");
    expect(heatLabel(70)).toBe("complex");
    expect(heatLabel(90)).toBe("risky");
  });

  it("returns a color string for every score", () => {
    for (const s of [0, 30, 55, 75, 100]) {
      expect(heatColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("downstreamReach", () => {
  const g = buildPulseboard();

  it("returns zero for a leaf node", () => {
    // a component with no outgoing edges
    const leaf = g.nodes.find((n) => n.data.kind === "component" && !g.edges.some((e) => e.source === n.id));
    if (!leaf) return;
    const r = downstreamReach(leaf.id, g.edges, g.nodes);
    expect(r.count).toBe(0);
  });

  it("reaches multiple nodes from the product root", () => {
    const r = downstreamReach("prod", g.edges, g.nodes);
    expect(r.count).toBeGreaterThan(10);
  });
});

describe("explain", () => {
  const g = buildPulseboard();
  const billing = g.nodes.find((n) => n.id === "f:billing")!;

  it("produces three levels of explanation", () => {
    const simple = explain(billing, g, "simple");
    const dev = explain(billing, g, "developer");
    const deep = explain(billing, g, "deep");
    expect(simple.length).toBeGreaterThan(0);
    expect(dev.length).toBeGreaterThan(0);
    expect(deep.length).toBeGreaterThan(0);
  });
});

describe("askGraph intents", () => {
  const g = buildPulseboard();

  it("answers 'how does login work'", () => {
    const r = askGraph("how does login work?", g);
    expect(r).not.toBeNull();
    expect(r!.title).toMatch(/login/i);
    expect(r!.path).toBeDefined();
    expect(r!.path!.length).toBeGreaterThan(1);
  });

  it("answers 'where is stripe used'", () => {
    const r = askGraph("where is stripe used?", g);
    expect(r).not.toBeNull();
    expect(r!.title).toMatch(/stripe/i);
  });

  it("answers 'what would break if i remove redis'", () => {
    const r = askGraph("what would break if i remove redis?", g);
    expect(r).not.toBeNull();
    expect(r!.lines.some((l) => /redis/i.test(l))).toBe(true);
  });

  it("returns null for gibberish", () => {
    expect(askGraph("xyzzy", g)).toBeNull();
  });
});