import type { CFEdge, CFNode, Graph, NodeType } from "../model";
import { TYPE_LABEL } from "../model";

/* ------------------------------------------------------------------ */
/* Layout — deterministic hierarchical placement                      */
/* ------------------------------------------------------------------ */

export function layoutGraph(g: Graph) {
  const { nodes } = g;
  const byKind = (k: NodeType) => nodes.filter((n) => n.data.kind === k);
  const features = byKind("feature");
  const COL = 408;

  const setPos = (id: string, x: number, y: number) => {
    const n = nodes.find((v) => v.id === id);
    if (n) n.position = { x, y };
  };
  const children = (fid: string, k: NodeType) =>
    nodes.filter((n) => n.data.featureId === fid && n.data.kind === k);

  setPos("prod", 0, -190);

  if (features.length > 0) {
    features.forEach((f, i) => {
      const fx = (i - (features.length - 1) / 2) * COL;
      setPos(f.id, fx, 250);

      const pages = children(f.id, "page");
      const rows = Math.max(1, Math.ceil(pages.length / 2));
      pages.forEach((p, j) => {
        const row = Math.floor(j / 2);
        const col = j % 2;
        const px = fx + (col === 0 ? -114 : 114);
        const py = 545 + row * 330;
        setPos(p.id, px, py);
        children(f.id, "component")
          .filter((c) => g.edges.some((e) => e.source === p.id && e.target === c.id))
          .forEach((c, k) => setPos(c.id, px + (k % 2 === 0 ? -24 : 24), py + 152 + k * 106));
      });

      const apis = children(f.id, "api");
      const apiY = 545 + rows * 330 + 30;
      apis.forEach((a, j) => setPos(a.id, fx + (j % 2 === 0 ? -110 : 110), apiY + Math.floor(j / 2) * 140));

      const services = children(f.id, "service");
      services.forEach((s, j) => setPos(s.id, fx, apiY + Math.ceil(apis.length / 2) * 140 + 30 + j * 150));

      children(f.id, "job").forEach((jb, j) =>
        setPos(jb.id, fx + (j % 2 === 0 ? -110 : 110), apiY + Math.ceil(apis.length / 2) * 140 + 30 + services.length * 150 + 40)
      );
    });

    const minX = ((0 - (features.length - 1) / 2) * COL) - 200;
    const maxX = ((features.length - 1 - (features.length - 1) / 2) * COL) + 200;

    const tables = nodes.filter((n) => n.data.kind === "database" && n.id !== "t-postgresql" && n.id !== "t-redis");
    tables.forEach((t, i) => setPos(t.id, (i - (tables.length - 1) / 2) * 292, 2150));
    setPos("t-postgresql", -180, 2430);
    setPos("t-redis", 720, 2430);

    byKind("external").forEach((x, i) => setPos(x.id, maxX + 430, 640 + i * 250));

    const shared = nodes.filter((n) => n.data.kind === "component" && !n.data.featureId);
    shared.forEach((c, i) => setPos(c.id, minX - 430, 320 + i * 128));
  } else {
    /* fallback for imported repos with no detected features */
    const row = (k: NodeType, y: number, step = 260) =>
      byKind(k).forEach((n, i) => setPos(n.id, (i - (byKind(k).length - 1) / 2) * step, y));
    row("page", 300);
    row("api", 700);
    row("service", 1050);
    row("component", 1400, 230);
    row("database", 1750);
    row("external", 2050);
    row("job", 2050);
  }
}

/* ------------------------------------------------------------------ */
/* Graph queries                                                      */
/* ------------------------------------------------------------------ */

export function adjacency(edges: CFEdge[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  edges.forEach((e) => {
    add(e.source, e.target);
    add(e.target, e.source);
  });
  return m;
}

export function focusSetFor(id: string, edges: CFEdge[]): Set<string> {
  const set = new Set<string>([id]);
  edges.forEach((e) => {
    if (e.source === id) set.add(e.target);
    if (e.target === id) set.add(e.source);
  });
  return set;
}

/** Shortest connecting path (direction-agnostic) between two nodes. */
export function findPath(start: string, end: string, edges: CFEdge[]): string[] {
  if (start === end) return [start];
  const adj = adjacency(edges);
  const prev = new Map<string, string>();
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      prev.set(nxt, cur);
      if (nxt === end) {
        const path = [end];
        let p = end;
        while (p !== start) {
          p = prev.get(p)!;
          path.unshift(p);
        }
        return path;
      }
      queue.push(nxt);
    }
  }
  return [];
}

export function pathEdgeIds(path: string[], edges: CFEdge[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    edges.forEach((e) => {
      if ((e.source === a && e.target === b) || (e.source === b && e.target === a)) set.add(e.id);
    });
  }
  return set;
}

/** Directed downstream reach — distinct feature areas a change could ripple into. */
export function downstreamReach(id: string, edges: CFEdge[], nodes: CFNode[]) {
  const out = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
  });
  const seen = new Set<string>();
  const queue = [...(out.get(id) ?? [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (out.get(cur) ?? []).forEach((n) => queue.push(n));
  }
  const nameOf = (nid: string) => nodes.find((n) => n.id === nid)?.data.name ?? nid;
  const features = [...new Set(
    [...seen].map((nid) => {
      const n = nodes.find((v) => v.id === nid);
      return n?.data.featureId ? nameOf(`f:${n.data.featureId}`) : n?.data.kind === "feature" ? n.data.name : null;
    })
  )].filter(Boolean) as string[];
  return { count: seen.size, features, ids: seen };
}

/** Direct dependents — things that point at this node. */
export function dependentsOf(id: string, edges: CFEdge[], nodes: CFNode[]): CFNode[] {
  const ids = edges.filter((e) => e.target === id).map((e) => e.source);
  return nodes.filter((n) => ids.includes(n.id));
}

export function outgoingOf(id: string, edges: CFEdge[], nodes: CFNode[]): CFNode[] {
  const ids = edges.filter((e) => e.source === id).map((e) => e.target);
  return nodes.filter((n) => ids.includes(n.id));
}

/* ------------------------------------------------------------------ */
/* Complexity heat                                                    */
/* ------------------------------------------------------------------ */

export function heatColor(score: number): string {
  const s = Math.max(0, Math.min(100, score));
  if (s < 40) return "#34d399";
  if (s < 60) return "#facc15";
  if (s < 80) return "#fb923c";
  return "#ef4444";
}

export function heatLabel(score: number): string {
  if (score < 40) return "simple";
  if (score < 60) return "moderate";
  if (score < 80) return "complex";
  return "risky";
}

/* ------------------------------------------------------------------ */
/* Explain — deterministic, graph-aware explanations (3 levels)       */
/* ------------------------------------------------------------------ */

export function explain(node: CFNode, g: Graph, level: "simple" | "developer" | "deep"): string[] {
  const d = node.data;
  const product = g.nodes.find((n) => n.data.kind === "product")?.data.name ?? "the product";
  const outs = outgoingOf(node.id, g.edges, g.nodes);
  const deps = dependentsOf(node.id, g.edges, g.nodes);
  const reach = downstreamReach(node.id, g.edges, g.nodes);
  const count = (k: NodeType) => outs.filter((n) => n.data.kind === k).length + deps.filter((n) => n.data.kind === k).length;
  const feat = d.featureId ? g.nodes.find((n) => n.id === `f:${d.featureId}`)?.data.name : null;

  if (level === "simple") {
    const lead = `${d.name} ${d.description.charAt(0).toLowerCase() + d.description.slice(1)}`;
    const second =
      d.kind === "feature" ? `It's one of ${g.stats.features} product areas inside ${product}.`
      : d.kind === "page" ? `People reach it through the ${product} interface${feat ? ` — part of the ${feat} area` : ""}.`
      : d.kind === "api" ? `The interface talks to it whenever the ${feat ?? "app"} area needs data.`
      : d.kind === "database" ? `Everything the ${feat ?? "app"} area remembers ends up here.`
      : d.kind === "service" ? `It does the ${feat ?? "core"} work behind the scenes, out of sight of the UI.`
      : d.kind === "external" ? `It's a third party ${product} relies on — it lives outside this codebase.`
      : d.kind === "job" ? `It runs in the background, on a schedule or a queue — never while a user waits.`
      : d.kind === "component" ? `It's a building block of the interface, reused by the screens around it.`
      : `It's the root of the whole map — everything else hangs off it.`;
    return [lead, second, reach.features.length > 1 ? `Heads up: it touches ${reach.features.length} areas — ${reach.features.slice(0, 3).join(", ")}${reach.features.length > 3 ? "…" : ""}.` : `It's fairly self-contained — safe to explore first.`];
  }

  if (level === "developer") {
    const bits: string[] = [];
    bits.push(`${TYPE_LABEL[d.kind]} in \`${d.files[0] ?? "—"}\`${feat ? `, owned by the ${feat} feature` : ""}.`);
    if (count("api")) bits.push(`Wired to ${count("api")} API route${count("api") > 1 ? "s" : ""}.`);
    if (count("database")) bits.push(`Reads or writes ${count("database")} table${count("database") > 1 ? "s" : ""}.`);
    if (count("component")) bits.push(`Composed of ${count("component")} components.`);
    if (count("external")) bits.push(`Calls ${count("external")} external integration${count("external") > 1 ? "s" : ""}.`);
    bits.push(`Start reading at \`${d.files[0] ?? d.files[1] ?? "—"}\` — ${d.meta.loc} LOC, ${d.meta.coverage}% test coverage.`);
    return bits;
  }

  /* deep */
  const lines = [
    `Coupling: ${deps.length} inbound and ${outs.length} outbound relationships; downstream blast radius spans ${reach.count} nodes across ${reach.features.length || 1} feature area${(reach.features.length || 1) > 1 ? "s" : ""}${reach.features.length ? ` (${reach.features.slice(0, 4).join(", ")})` : ""}.`,
    `Signals: complexity ${d.meta.complexity}/100, ${heatLabel(d.meta.complexity)} · ${d.meta.churn} commits in the last 8 months · ${d.meta.contributors} contributors · coverage ${d.meta.coverage}%.`,
  ];
  if (d.meta.complexity >= 75)
    lines.push(`Risk: high complexity plus ${d.meta.churn > 20 ? "heavy churn" : "moderate churn"} — changes here deserve a migration plan and tests around ${d.files[0] ?? "the entry point"}.`);
  else if (d.meta.coverage < 50)
    lines.push(`Risk: coverage under 50% — add characterization tests before refactoring.`);
  else lines.push(`Risk: low. Well-bounded with healthy coverage — safe to refactor incrementally.`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* "How does X work?" — intent matcher over the live graph            */
/* ------------------------------------------------------------------ */

export interface AskResult {
  title: string;
  lines: string[];
  path?: string[];
  focusIds: string[];
}

export function askGraph(raw: string, g: Graph): AskResult | null {
  const q = raw.toLowerCase().trim();
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));
  const path = (a: string, b: string) => findPath(a, b, g.edges);
  const nameOf = (id: string) => g.nodes.find((n) => n.id === id)?.data.name ?? id;
  const result = (title: string, lines: string[], p: string[] | undefined, focusIds: string[]): AskResult =>
    ({ title, lines, path: p, focusIds: p?.length ? p : focusIds });

  if (has("login", "log in", "sign in", "signin", "authenticat", "session")) {
    const p = path("p-loginpage", "t-sessions");
    return result("How login works", [
      "Authentication starts at LoginPage, where AuthForm collects credentials.",
      "POST /api/auth/login verifies the hash and asks AuthService to mint a session.",
      "AuthService writes the session to PostgreSQL and mirrors it to Redis for fast lookups.",
      "middleware.ts then hydrates every request from that session.",
    ], p, ["p-loginpage", "s-authservice", "t-sessions"]);
  }
  if (has("create a project", "create project", "new project")) {
    const p = path("p-projectspage", "t-projects");
    return result("What happens when you create a project", [
      "NewProjectModal posts to POST /api/projects.",
      "ProjectService validates workspace permissions, inserts the row,",
      "then asks TaskService to scaffold the default board columns.",
      "A workspace activity event is appended so the dashboard updates live.",
    ], p, ["p-projectspage", "s-projectservice", "t-projects"]);
  }
  if (has("stripe", "payment", "checkout", "subscribe", "subscription", "billing", "invoice")) {
    const p = path("p-checkoutpage", "x-stripe");
    return result("Where Stripe is used", [
      "CheckoutPage collects the plan and seat count, then calls POST /api/billing/subscribe.",
      "BillingService creates the Stripe subscription and stores a mirror in `subscriptions`.",
      "Stripe calls back through POST /api/billing/webhook; WebhookProcessor verifies signatures",
      "and updates invoices. Failed payments fan out through NotificationService.",
    ], p, ["f:billing", "x-stripe", "s-billingservice", "t-subscriptions"]);
  }
  if (has("notification", "email", "digest", "mention")) {
    const p = path("s-notificationservice", "x-sendgrid");
    return result("Which files handle notifications", [
      "NotificationService is the fan-out hub: mentions, assignments, payment alerts.",
      "In-app rows land in the `notifications` table; emails are enqueued to Redis.",
      "EmailWorker renders templates and sends through SendGrid; DigestJob batches a nightly summary.",
      "Connected workspaces also mirror alerts to Slack.",
    ], p, ["s-notificationservice", "j-emailworker", "x-sendgrid", "t-notifications"]);
  }
  if (has("redis")) {
    const deps = dependentsOf("t-redis", g.edges, g.nodes).map((n) => n.data.name);
    return result("What would break if you removed Redis", [
      `Redis backs ${deps.length} subsystems: ${deps.join(", ")}.`,
      "Losing it means: sessions fall back to PostgreSQL (slower, but login survives),",
      "the analytics event queue and all background job queues stall —",
      "emails, digests, reports and webhook retries stop until a queue exists again.",
    ], undefined, ["t-redis", ...deps.map((n) => g.nodes.find((v) => v.data.name === n)?.id ?? "")]);
  }
  if (has("task", "board", "kanban", "drag")) {
    const p = path("p-taskboardpage", "t-tasks");
    return result("How the task board works", [
      "TaskBoardPage loads columns via GET /api/tasks and renders a virtualized TaskBoard.",
      "Drags are optimistic: the UI reorders instantly, PATCH /api/tasks/:id confirms.",
      "TaskService owns ordering keys and status transitions, and parses @mentions",
      "into NotificationService fan-out. Every mutation appends to `events` for analytics.",
    ], p, ["p-taskboardpage", "s-taskservice", "t-tasks"]);
  }
  if (has("analytic", "report", "chart", "velocity")) {
    const p = path("p-analyticspage", "t-events");
    return result("How analytics data flows", [
      "Clients POST /api/analytics/events into a Redis queue.",
      "AnalyticsService rolls events into daily aggregates; charts read GET /api/analytics/reports.",
      "ReportGenerator builds scheduled PDF snapshots into the `reports` table.",
    ], p, ["p-analyticspage", "s-analyticsservice", "t-events"]);
  }
  if (has("invite", "team", "member")) {
    const p = path("p-invitespage", "t-invites");
    return result("How invites work", [
      "InviteComposer posts emails to POST /api/invites, which writes `invites`",
      "and dispatches through SendGrid. Role changes are guarded to workspace admins.",
    ], p, ["p-invitespage", "t-invites", "x-sendgrid"]);
  }
  if (has("webhook")) {
    const p = path("j-webhookprocessor", "t-subscriptions");
    return result("How webhooks are processed", [
      "Stripe posts to POST /api/billing/webhook. The raw body is signature-verified,",
      "then WebhookProcessor replays the event idempotently against `subscriptions`.",
    ], p, ["j-webhookprocessor", "a-post-api-billing-webhook", "t-subscriptions"]);
  }
  if (has("search")) {
    const p = path("c-commandbar", "a-get-api-search");
    return result("How search works", [
      "CommandBar (⌘K) debounces keystrokes into GET /api/search,",
      "which queries projects, tasks and people in one round trip.",
    ], p, ["c-commandbar", "a-get-api-search"]);
  }

  /* generic: match a node by name */
  const hit = g.nodes.find((n) => n.data.name.toLowerCase().includes(q.replace(/[?!.]/g, "").trim())) ??
    g.nodes.find((n) => q.includes(n.data.name.toLowerCase()));
  if (hit) {
    return result(hit.data.name, [
      `${TYPE_LABEL[hit.data.kind]} — ${hit.data.description}`,
      `Focused on the map. Open the inspector (click) for its flow, files and an explanation.`,
    ], undefined, [hit.id]);
  }
  return null;
}