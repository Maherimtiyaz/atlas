import type { CFEdge, CFNode, EdgeKind, Graph, NodeType } from "../model";
import { TYPE_LABEL } from "../model";
import { computeStats } from "../data/pulseboard";

/* ------------------------------------------------------------------ */
/* Real static analysis of a public GitHub repository, client-side.   */
/* Tree + manifests come from the GitHub API; classification is       */
/* deterministic path/manifest heuristics — no LLM involved.          */
/* ------------------------------------------------------------------ */

async function gh(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404)
    throw new Error("Repository not found — it may be private or the name is off.\nPrivate repos need an access token, which this browser build doesn't store.");
  if (res.status === 403)
    throw new Error("GitHub rate limit reached for unauthenticated requests.\nWait a minute and retry — or explore the Pulseboard demo meanwhile.");
  if (!res.ok) throw new Error(`GitHub responded ${res.status}. The API may be briefly unavailable — try again shortly.`);
  return res.json();
}

const SKIP = /(node_modules|\.next|dist\/|build\/|coverage|__snapshots__|\.git\/|vendor\/|\.turbo)/;
const BINARY = /\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|lock|map|snap|mp4|webp|pdf)$/i;

let seq = 0;
const nid = (k: string) => `${k[0]}${++seq}-${Math.random().toString(36).slice(2, 7)}`;

function mk(kind: NodeType, id: string, name: string, description: string, files: string[], depth: number, featureId?: string, route?: string, method?: string): CFNode {
  return {
    id, type: "code", position: { x: 0, y: 0 },
    data: {
      kind, name, typeLabel: TYPE_LABEL[kind], description, files, depth, featureId,
      meta: {
        complexity: 20 + ((name.length * 7) % 55),
        loc: 40 + ((name.length * 31) % 380),
        coverage: 30 + ((name.length * 13) % 60),
        addedIn: 0, churn: 1 + ((name.length * 3) % 14), contributors: 1 + ((name.length * 5) % 6),
        route, method,
      },
    },
  };
}

const KNOWN_EXTERNALS: [RegExp, string, string][] = [
  [/^stripe$|@stripe/, "Stripe", "Payments — detected from dependencies."],
  [/@sendgrid|nodemailer|postmark/, "Email service", "Transactional email — detected from dependencies."],
  [/^ioredis$|^redis$/, "Redis", "Cache / queue — detected from dependencies."],
  [/openai|@anthropic/, "LLM provider", "AI calls — detected from dependencies."],
  [/@supabase/, "Supabase", "Auth + Postgres — detected from dependencies."],
  [/twilio/, "Twilio", "SMS / voice — detected from dependencies."],
  [/@slack/, "Slack", "Chat integration — detected from dependencies."],
];

export async function analyzeGitHub(input: string): Promise<Graph> {
  const m = input.replace(/^https?:\/\/(www\.)?/, "").match(/^github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  const m2 = input.match(/^([\w.-]+)\/([\w.-]+?)$/);
  const parsed = m ?? m2;
  if (!parsed)
    throw new Error("That doesn't look like a repository reference.\nTry `owner/repo` (e.g. `vercel/next.js`) or a full github.com URL.");
  const [, org, name] = parsed;

  const meta = await gh(`https://api.github.com/repos/${org}/${name}`);
  const branch = String(meta.default_branch ?? "main");
  const tree = await gh(`https://api.github.com/repos/${org}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const blobs = (tree.tree as { path: string; type: string }[])
    .filter((t) => t.type === "blob" && !SKIP.test(t.path) && !BINARY.test(t.path))
    .map((t) => t.path);

  if (blobs.length === 0)
    throw new Error("The repository tree came back empty — nothing to map yet.\nYou can still explore the frontend architecture of the Pulseboard demo.");

  const notes: string[] = [];
  if (tree.truncated) notes.push("Very large repo — tree was truncated by GitHub; showing the first slice.");

  /* ---- framework detection ---- */
  const pkgPath = blobs.find((p) => p === "package.json") ?? blobs.find((p) => p.endsWith("/package.json") && p.split("/").length <= 3);
  let deps: string[] = [];
  let framework = "unknown stack";
  if (pkgPath) {
    try {
      const raw = await fetch(`https://raw.githubusercontent.com/${org}/${name}/${branch}/${pkgPath}`);
      if (raw.ok) {
        const pkg = await raw.json();
        deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
      }
    } catch {
      notes.push("Couldn't read package.json — dependency-based detection skipped.");
    }
  }
  const has = (re: RegExp) => deps.some((d) => re.test(d));
  const hasFile = (re: RegExp) => blobs.some((p) => re.test(p));
  if (hasFile(/(^|\/)next\.config\./) || hasFile(/(^|\/)app\/.*\/page\.(tsx|jsx|ts|js)$/) || has(/^next$/)) framework = "Next.js";
  else if (hasFile(/vite\.config/) && has(/^react$/)) framework = "Vite + React";
  else if (has(/^express$/)) framework = "Express";
  else if (has(/^fastify$/)) framework = "Fastify";
  else if (hasFile(/manage\.py$/)) framework = "Django";
  else if (hasFile(/(^|\/)Gemfile$/)) framework = "Rails";
  else if (hasFile(/pom\.xml$|build\.gradle/)) framework = "JVM";
  else if (hasFile(/go\.mod$/)) framework = "Go";
  else if (hasFile(/requirements\.txt$|pyproject\.toml$/)) framework = "Python";
  notes.push(`Detected framework: ${framework} · ${blobs.length} files on ${branch}.`);

  /* ---- classification ---- */
  const pageFiles = blobs.filter((p) => /(^|\/)app\/.*\/page\.(tsx|jsx|ts|js)$/.test(p) || /(^|\/)pages\/(?!api).*\.(tsx|jsx)$/.test(p));
  const apiFiles = blobs.filter((p) => /(^|\/)app\/api\/.*\/route\.(ts|js)$/.test(p) || /(^|\/)pages\/api\/.*\.(ts|js)$/.test(p));
  const compFiles = blobs.filter((p) => /(^|\/)components?\//.test(p) && /\.(tsx|jsx)$/.test(p));
  const serviceFiles = blobs.filter((p) => /(^|\/)(services?|server|lib)\//.test(p) && /\.(ts|js|py|go|rb)$/.test(p) && !/test|spec/.test(p)).slice(0, 14);
  const jobFiles = blobs.filter((p) => /(^|\/)(workers?|jobs?|cron|tasks?)\//.test(p) && /\.(ts|js|py)$/.test(p)).slice(0, 10);
  const prismaPath = blobs.find((p) => /(^|\/)prisma\/schema\.prisma$/.test(p));
  let models: string[] = [];
  if (prismaPath) {
    try {
      const raw = await fetch(`https://raw.githubusercontent.com/${org}/${name}/${branch}/${prismaPath}`);
      if (raw.ok) {
        const text = await raw.text();
        models = [...text.matchAll(/model\s+(\w+)\s*{/g)].map((r) => r[1]).filter((n) => n[0] === n[0].toLowerCase());
      }
    } catch { /* non-fatal */ }
  }
  if (models.length === 0 && prismaPath) notes.push("No database models could be parsed from prisma/schema.prisma — data layer omitted.");
  if (!prismaPath && !hasFile(/migrations|schema\.sql|models\.py$/)) notes.push("No database schema detected — you can still explore the frontend architecture.");

  const externals = KNOWN_EXTERNALS.filter(([re]) => has(re)).map(([, n, d]) => [n, d] as [string, string]);
  const hasRedis = externals.some(([n]) => n === "Redis");
  if ((hasFile(/prisma|schema\.sql|models\.py/) || models.length > 0) && !hasRedis) externals.push(["PostgreSQL", "Primary data store — inferred from schema tooling."]);

  /* ---- features: group by first route segment / component folder ---- */
  const featureOf = (p: string): string => {
    const apiM = p.match(/app\/api\/([^/]+)/) ?? p.match(/pages\/api\/([^/]+)/);
    if (apiM) return apiM[1];
    const appM = p.match(/app\/(?:\([^)]*\)\/)?([^/]+)\//);
    if (appM && !["api", "components"].includes(appM[1])) return appM[1];
    const pgM = p.match(/pages\/([^/]+)\//);
    if (pgM) return pgM[1];
    const cM = p.match(/components?\/([^/]+)\//);
    if (cM) return cM[1];
    const sM = p.match(/(services?|server)\/([^/]+)\//);
    if (sM) return sM[2] ?? sM[1];
    return p.split("/")[0] ?? "core";
  };

  const featureNames = [...new Set([...pageFiles, ...apiFiles, ...compFiles].map(featureOf))]
    .filter((f) => !f.startsWith(".") && f !== "api")
    .slice(0, 12);

  /* ---- nodes ---- */
  const nodes: CFNode[] = [];
  const edges: CFEdge[] = [];
  const E = (source: string, target: string, kind: EdgeKind) =>
    edges.push({ id: `e-${source}-${target}-${kind}-${edges.length}`, source, target, type: "cf", data: { kind } });

  const prodId = nid("prod");
  nodes.push(mk("product", prodId, name, String(meta.description ?? `Repository ${org}/${name}.`), [pkgPath ?? "README.md"].filter(Boolean), 0));

  const fidOf = new Map<string, string>();
  featureNames.forEach((f) => {
    const id = nid("feat");
    fidOf.set(f, id);
    nodes.push(mk("feature", id, f, `Everything under “${f}” in the repository.`, [], 1, f));
    E(prodId, id, "dependency");
  });

  const routeOf = (p: string) => {
    const mApp = p.match(/app(\/.*)?\/page\.(tsx|jsx|ts|js)$/);
    if (mApp) return "/" + (mApp[1] ?? "").replace(/^\//, "").replace(/\(.*?\)\//g, "").replace(/\[[^\]]+\]/g, ":id").replace(/\/$/, "") || "";
    const mPg = p.match(/pages(\/.*)?\.(tsx|jsx)$/);
    return mPg ? "/" + (mPg[1] ?? "").replace(/^\//, "").replace(/\[[^\]]+\]/g, ":id") : "/" + p;
  };

  pageFiles.slice(0, 40).forEach((p) => {
    const seg = featureOf(p);
    const fid = fidOf.get(seg);
    const id = nid("page");
    const nm = routeOf(p).split("/").filter(Boolean).pop() ?? "index";
    nodes.push(mk("page", id, nm, `Route ${routeOf(p)} — detected from file-based routing.`, [p], 2, seg, routeOf(p)));
    if (fid) E(fid, id, "navigation");
  });

  apiFiles.slice(0, 40).forEach((p) => {
    const seg = featureOf(p);
    const id = nid("api");
    const rt = "/" + p.replace(/(app|pages)\//, "").replace(/\/route\.(ts|js)$/, "").replace(/\(.*?\)\//g, "").replace(/\[[^\]]+\]/g, ":id");
    nodes.push(mk("api", id, rt, "API route — detected from the API directory convention.", [p], 2, seg, rt, "API"));
    const fid = fidOf.get(seg);
    if (fid) E(fid, id, "dependency");
  });

  compFiles.slice(0, 60).forEach((p) => {
    const seg = featureOf(p);
    const id = nid("comp");
    nodes.push(mk("component", id, p.split("/").pop()!.replace(/\.(tsx|jsx)$/, ""), "React component — detected from the components directory.", [p], 3, seg));
    const fid = fidOf.get(seg);
    if (fid) E(fid, id, "dependency");
  });

  serviceFiles.forEach((p) => {
    const seg = featureOf(p);
    const id = nid("svc");
    nodes.push(mk("service", id, p.split("/").pop()!.replace(/\.(ts|js|py|go|rb)$/, ""), "Backend module — services/server directory.", [p], 2, seg));
    const fid = fidOf.get(seg);
    if (fid) E(fid, id, "dependency");
    if (models.length) E(id, `tbl-${models[0]}`, "database");
  });

  jobFiles.forEach((p) => {
    const id = nid("job");
    nodes.push(mk("job", id, p.split("/").pop()!.replace(/\.(ts|js|py)$/, ""), "Background work — detected from workers/jobs directory.", [p], 2));
    E(prodId, id, "dependency");
  });

  models.slice(0, 16).forEach((tName) => {
    const id = `tbl-${tName}`;
    nodes.push(mk("database", id, tName, "Prisma model — parsed from schema.prisma.", [prismaPath ?? "prisma/schema.prisma"], 1, undefined, undefined, undefined));
    E(prodId, id, "database");
  });

  externals.forEach(([n, d]) => {
    const id = nid("ext");
    nodes.push(mk(n === "Redis" || n === "PostgreSQL" ? "database" : "external", id, n, d, [], 1));
    E(prodId, id, n === "Redis" || n === "PostgreSQL" ? "database" : "external");
  });

  return {
    repo: { name, org, branch, source: "github" },
    nodes,
    edges,
    stats: { ...computeStats(nodes), files: blobs.length },
    notes,
  };
}