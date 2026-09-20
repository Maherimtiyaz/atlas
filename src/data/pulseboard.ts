import type {
  CFEdge,
  CFNode,
  EdgeKind,
  Graph,
  NodeData,
  NodeType,
} from "../model";
import { TYPE_LABEL } from "../model";

/* Deterministic PRNG so metrics are stable between reloads. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* ------------------------------------------------------------------ */
/* Spec — a hand-authored blueprint of the fictional SaaS "Pulseboard" */
/* ------------------------------------------------------------------ */

type Comp = [name: string, desc: string];
type Api = { m: string; p: string; d: string; svc?: string; w?: string[]; hot?: number };
type Page = { n: string; r: string; d: string; c: Comp[]; calls: string[]; hot?: number };
type Feature = {
  id: string;
  name: string;
  d: string;
  month: number;
  pages: Page[];
  apis: Api[];
  services?: [string, string][];
  tables?: [string, string][];
  jobs?: [string, string][];
};

const FEATURES: Feature[] = [
  {
    id: "auth",
    name: "Authentication",
    d: "Sign-up, login, sessions and workspace access control.",
    month: 0,
    pages: [
      { n: "LoginPage", r: "/login", d: "Email, password and SSO entry point for returning users.", calls: ["POST /api/auth/login"], c: [
        ["AuthForm", "Email + password form with inline validation and rate-limit errors."],
        ["OAuthButtons", "Google and GitHub one-tap sign-in buttons."],
        ["WorkspaceSwitcher", "Workspace picker shown after multi-tenant sign-in."],
      ]},
      { n: "SignupPage", r: "/signup", d: "Self-serve registration that creates a user and a workspace.", calls: ["POST /api/auth/signup"], c: [
        ["SignupForm", "Registration form with password policy checks."],
        ["PlanPicker", "Choose Free or Pro during onboarding."],
      ]},
      { n: "RecoveryPage", r: "/recover", d: "Password reset flow driven by emailed one-time tokens.", calls: ["POST /api/auth/login"], c: [
        ["RecoveryForm", "Requests and consumes reset tokens."],
      ]},
    ],
    apis: [
      { m: "POST", p: "/api/auth/login", d: "Verifies credentials and mints a session token.", svc: "AuthService", w: ["sessions"], hot: 21 },
      { m: "POST", p: "/api/auth/signup", d: "Creates the user, a workspace, and sends the welcome email.", svc: "AuthService", w: ["users", "workspaces"] },
      { m: "GET", p: "/api/auth/session", d: "Hydrates the current user from the session cookie.", svc: "AuthService", w: ["sessions"] },
      { m: "POST", p: "/api/auth/logout", d: "Revokes the active session in Redis.", svc: "AuthService", w: ["sessions"] },
    ],
    services: [["AuthService", "Issues sessions, guards routes and rotates refresh tokens."]],
    tables: [
      ["users", "Core identity records: email, hash, avatar, role."],
      ["sessions", "Active login sessions, mirrored to Redis for speed."],
    ],
  },
  {
    id: "dashboard",
    name: "Dashboard",
    d: "The home screen — live activity, stats and quick-create.",
    month: 0,
    pages: [
      { n: "DashboardPage", r: "/dashboard", d: "Central hub every authenticated user passes through.", calls: ["GET /api/dashboard/summary", "GET /api/activity"], hot: 18, c: [
        ["StatCards", "Open tasks, velocity and overdue counters."],
        ["ActivityFeed", "Realtime stream of workspace events."],
        ["QuickCreateMenu", "Create task, project or doc from one button."],
        ["ProjectSummaryList", "Compact status list of active projects."],
      ]},
    ],
    apis: [
      { m: "GET", p: "/api/dashboard/summary", d: "Aggregated counts powering the stat cards.", w: ["tasks", "projects"] },
      { m: "GET", p: "/api/activity", d: "Paginated recent events across the workspace.", w: ["events"] },
      { m: "GET", p: "/api/search", d: "Global search across projects, tasks and people.", w: ["projects", "tasks", "users"] },
    ],
    tables: [["events", "Append-only product analytics events."]],
  },
  {
    id: "projects",
    name: "Projects",
    d: "Create, browse and configure the containers work lives in.",
    month: 0,
    pages: [
      { n: "ProjectsPage", r: "/projects", d: "Filterable grid of every project in the workspace.", calls: ["GET /api/projects", "POST /api/projects"], c: [
        ["ProjectGrid", "Card grid with status, owners and progress."],
        ["FilterBar", "Status / owner / label filters with saved views."],
        ["NewProjectModal", "Name, key, privacy and default workflow setup."],
      ]},
      { n: "ProjectDetailPage", r: "/projects/:id", d: "Overview, members and settings for a single project.", calls: ["GET /api/projects/:id"], c: [
        ["ProjectHeader", "Title, key, status pill and star toggle."],
        ["MemberList", "People in the project with role badges."],
        ["ProjectTabs", "Board / List / Activity / Settings tabs."],
      ]},
    ],
    apis: [
      { m: "GET", p: "/api/projects", d: "Lists projects with role-based visibility.", svc: "ProjectService", w: ["projects"] },
      { m: "POST", p: "/api/projects", d: "Creates a project plus its default task columns.", svc: "ProjectService", w: ["projects", "tasks"], hot: 15 },
      { m: "GET", p: "/api/projects/:id", d: "Fetches one project with member and stats includes.", svc: "ProjectService", w: ["projects"] },
    ],
    services: [["ProjectService", "Owns project lifecycle, archiving and permissions."]],
    tables: [["projects", "Projects: key, name, status, owning workspace."]],
  },
  {
    id: "tasks",
    name: "Tasks",
    d: "The kanban core — statuses, drag-and-drop, mentions, history.",
    month: 0,
    pages: [
      { n: "TaskBoardPage", r: "/projects/:id/board", d: "Kanban board with optimistic drag-and-drop.", calls: ["GET /api/tasks", "PATCH /api/tasks/:id"], hot: 24, c: [
        ["TaskBoard", "Virtualized columns with drag reordering."],
        ["TaskCard", "Compact card: assignee, labels, due date."],
        ["ColumnMenu", "Rename, WIP limits and column color."],
        ["DragLayer", "Floating preview while dragging a card."],
      ]},
      { n: "TaskDetailPage", r: "/tasks/:id", d: "Full task context: comments, subtasks and history.", calls: ["GET /api/tasks", "POST /api/comments"], c: [
        ["TaskDrawer", "Slide-over with editable fields."],
        ["CommentThread", "Markdown comments with @mentions."],
        ["SubtaskList", "Checklist with progress rollup."],
        ["TaskTimeline", "Every state change, audited."],
      ]},
    ],
    apis: [
      { m: "GET", p: "/api/tasks", d: "Board query grouped by status column.", svc: "TaskService", w: ["tasks"] },
      { m: "POST", p: "/api/tasks", d: "Creates a task and notifies assignees.", svc: "TaskService", w: ["tasks", "notifications"] },
      { m: "PATCH", p: "/api/tasks/:id", d: "Persists edits, emits activity events.", svc: "TaskService", w: ["tasks", "events"], hot: 26 },
      { m: "POST", p: "/api/comments", d: "Adds a comment and fans out mentions.", svc: "TaskService", w: ["comments", "notifications"] },
    ],
    services: [["TaskService", "Board ordering, status transitions and mention parsing."]],
    tables: [
      ["tasks", "Tasks: status, order key, assignee, project."],
      ["comments", "Threaded comments on tasks."],
    ],
  },
  {
    id: "teams",
    name: "Teams",
    d: "Workspace membership, roles and email invites.",
    month: 1,
    pages: [
      { n: "TeamsPage", r: "/teams", d: "Roster of members with roles and groups.", calls: ["GET /api/teams/:id/members"], c: [
        ["TeamRoster", "Searchable member table with presence."],
        ["RoleSelect", "Admin / member / viewer role dropdown."],
      ]},
      { n: "InvitesPage", r: "/teams/invites", d: "Pending invites and reusable invite links.", calls: ["POST /api/invites"], c: [
        ["InviteTable", "Status, expiry and resend controls."],
        ["InviteComposer", "Email list input with role selection."],
      ]},
    ],
    apis: [
      { m: "GET", p: "/api/teams/:id/members", d: "Members with roles, joined date and 2FA status.", w: ["team_members", "users"] },
      { m: "POST", p: "/api/invites", d: "Creates invites and emails them via SendGrid.", w: ["invites"], hot: 9 },
      { m: "PATCH", p: "/api/members/:id/role", d: "Changes a member's role, guarded to admins.", w: ["team_members"] },
    ],
    tables: [
      ["workspaces", "Tenant boundary for all data."],
      ["team_members", "User ↔ workspace membership and role."],
      ["invites", "Outstanding email invites with expiry."],
    ],
  },
  {
    id: "notifications",
    name: "Notifications",
    d: "Mentions, assignments and digests — in-app and by email.",
    month: 1,
    pages: [
      { n: "NotificationsPage", r: "/notifications", d: "Inbox of mentions, assignments and system alerts.", calls: ["GET /api/notifications", "POST /api/notifications/read"], c: [
        ["NotificationList", "Grouped, filterable notification inbox."],
        ["NotificationItem", "Single row: icon, actor, action, timestamp."],
        ["MarkAllRead", "Bulk read with optimistic UI."],
      ]},
    ],
    apis: [
      { m: "GET", p: "/api/notifications", d: "Unread-first inbox with cursor pagination.", svc: "NotificationService", w: ["notifications"] },
      { m: "POST", p: "/api/notifications/read", d: "Marks items read in a single batch.", svc: "NotificationService", w: ["notifications"] },
    ],
    services: [["NotificationService", "Fan-out of mentions, assignments and payment alerts."]],
    jobs: [
      ["EmailWorker", "Renders templates and sends transactional email."],
      ["DigestJob", "Nightly per-user summary of what changed."],
    ],
    tables: [["notifications", "In-app notification rows per user."]],
  },
  {
    id: "billing",
    name: "Billing",
    d: "Plans, seats, Stripe subscriptions, invoices and webhooks.",
    month: 2,
    pages: [
      { n: "BillingPage", r: "/billing", d: "Current plan, seat usage and payment method.", calls: ["GET /api/billing/portal"], hot: 19, c: [
        ["PlanCard", "Plan name, renewal date and price."],
        ["UsageMeter", "Seats used vs. seats purchased."],
        ["PaymentMethodForm", "Card update via Stripe Elements."],
      ]},
      { n: "CheckoutPage", r: "/billing/checkout", d: "Upgrade and seat-purchase checkout.", calls: ["POST /api/billing/subscribe"], hot: 33, c: [
        ["CheckoutSummary", "Line items, proration and tax."],
        ["SeatCalculator", "Slider that recalculates the quote live."],
      ]},
      { n: "InvoicesPage", r: "/billing/invoices", d: "Downloadable invoice history.", calls: ["GET /api/billing/portal"], c: [
        ["InvoiceTable", "Number, amount, status and PDF link."],
      ]},
    ],
    apis: [
      { m: "POST", p: "/api/billing/subscribe", d: "Creates the Stripe subscription for a workspace.", svc: "BillingService", w: ["subscriptions"], hot: 37 },
      { m: "GET", p: "/api/billing/portal", d: "Builds a Stripe customer portal redirect.", svc: "BillingService", w: ["subscriptions"] },
      { m: "POST", p: "/api/billing/webhook", d: "Stripe events: paid, failed, cancelled, proration.", svc: "BillingService", w: ["subscriptions", "invoices"], hot: 29 },
    ],
    services: [["BillingService", "Plans, seat math, proration and dunning states."]],
    tables: [
      ["subscriptions", "Stripe subscription mirror per workspace."],
      ["invoices", "Paid and open invoices with PDF urls."],
    ],
  },
  {
    id: "analytics",
    name: "Analytics",
    d: "Velocity, throughput and scheduled PDF reports.",
    month: 3,
    pages: [
      { n: "AnalyticsPage", r: "/analytics", d: "Velocity, throughput and cycle-time charts.", calls: ["GET /api/analytics/reports"], c: [
        ["VelocityChart", "Completed vs. scope creep per sprint."],
        ["ThroughputBars", "Tasks shipped per week per project."],
        ["RangePicker", "7 / 30 / 90 day range selector."],
      ]},
      { n: "ReportsPage", r: "/analytics/reports", d: "Saved and scheduled PDF reports.", calls: ["GET /api/analytics/reports"], c: [
        ["ReportList", "Generated snapshots with download."],
        ["ScheduleDialog", "Cron-like schedule builder."],
      ]},
    ],
    apis: [
      { m: "POST", p: "/api/analytics/events", d: "Ingests client events into the Redis queue.", svc: "AnalyticsService", w: ["events"] },
      { m: "GET", p: "/api/analytics/reports", d: "Pre-aggregated daily rollups for charts.", svc: "AnalyticsService", w: ["events", "reports"] },
    ],
    services: [["AnalyticsService", "Turns raw events into daily aggregates."]],
    jobs: [["ReportGenerator", "Builds PDF snapshots on schedule."]],
    tables: [["reports", "Stored report snapshots and schedules."]],
  },
  {
    id: "settings",
    name: "Settings",
    d: "Profile, workspace preferences and API tokens.",
    month: 1,
    pages: [
      { n: "SettingsPage", r: "/settings", d: "Profile, workspace and appearance preferences.", calls: ["PATCH /api/users/me"], c: [
        ["ProfileForm", "Name, avatar and notification prefs."],
        ["WorkspaceForm", "Workspace name, slug and default role."],
        ["ThemeToggle", "Light / dark / system switch."],
      ]},
      { n: "ApiKeysPage", r: "/settings/api-keys", d: "Personal access tokens for the public API.", calls: ["POST /api/tokens"], c: [
        ["TokenTable", "Tokens with scopes, last-used, revoke."],
        ["CreateTokenDialog", "Scope picker; secret shown once."],
      ]},
    ],
    apis: [
      { m: "GET", p: "/api/users/me", d: "Current profile with workspace membership.", w: ["users"] },
      { m: "PATCH", p: "/api/users/me", d: "Updates profile fields with validation.", w: ["users"] },
      { m: "POST", p: "/api/tokens", d: "Mints a scoped personal access token.", w: ["tokens"] },
    ],
    tables: [["tokens", "Hashed personal access tokens."]],
  },
];

const SHARED_COMPONENTS: Comp[] = [
  ["AppShell", "Authenticated layout: nav, sidebar, command bar."],
  ["TopNav", "Global navigation and workspace switcher."],
  ["CommandBar", "⌘K launcher wired to global search."],
  ["AvatarMenu", "Account menu, theme and logout."],
  ["ToastStack", "Transient feedback across the app."],
  ["EmptyState", "Friendly zero-states with a next action."],
];

const EXTERNALS: [string, string][] = [
  ["Stripe", "Payments, subscriptions and the customer portal."],
  ["SendGrid", "Transactional and digest email delivery."],
  ["Slack", "Posts notifications into connected channels."],
];

const JOBS_EXTRA: [string, string][] = [
  ["WebhookProcessor", "Verifies and replays Stripe webhook events."],
];

const INFRA: [string, string, string][] = [
  ["PostgreSQL", "Primary OLTP store — every table below lives here.", "prisma/schema.prisma"],
  ["Redis", "Session cache, rate limits and the job queue.", "server/lib/redis.ts"],
];

/* ------------------------------------------------------------------ */
/* Builder                                                            */
/* ------------------------------------------------------------------ */

let rnd = mulberry(20250817);
const ri = (min: number, max: number) => Math.round(min + rnd() * (max - min));

const apiId = (m: string, p: string) => `a-${slug(`${m} ${p}`)}`;

function mk(
  kind: NodeType,
  id: string,
  name: string,
  description: string,
  files: string[],
  depth: number,
  featureId: string | undefined,
  metaPatch: Partial<NodeData["meta"]> = {}
): CFNode {
  const base = {
    complexity: ri(20, 70),
    loc: kind === "component" ? ri(40, 320) : kind === "service" ? ri(180, 640) : ri(60, 300),
    coverage: ri(38, 90),
    addedIn: 0,
    churn: ri(2, 12),
    contributors: ri(1, 7),
  };
  return {
    id,
    type: "code",
    position: { x: 0, y: 0 },
    data: {
      kind,
      name,
      typeLabel: TYPE_LABEL[kind],
      description,
      files,
      depth,
      featureId,
      meta: { ...base, ...metaPatch },
    },
  };
}

export function buildPulseboard(): Graph {
  rnd = mulberry(20250817); // stable metrics on every run
  const nodes: CFNode[] = [];
  const edges: CFEdge[] = [];
  const E = (source: string, target: string, kind: EdgeKind, label?: string) =>
    edges.push({ id: `e-${source}-${target}-${kind}`, source, target, type: "cf", data: { kind, label } });

  /* product */
  nodes.push(
    mk("product", "prod", "Pulseboard", "A modern project-management SaaS. Nine product areas, one workspace model.",
      ["app/layout.tsx", "app/page.tsx", "middleware.ts", "next.config.mjs", "package.json"], 0, undefined,
      { complexity: 72, loc: 412, coverage: 64, addedIn: 0, churn: 44, contributors: 8 })
  );

  /* shared core components */
  SHARED_COMPONENTS.forEach(([n, d], i) => {
    nodes.push(mk("component", `c-${slug(n)}`, n, d, [`components/core/${n}.tsx`], 1, undefined, { addedIn: 0, churn: ri(6, 16) }));
    E("prod", `c-${slug(n)}`, "dependency");
    void i;
  });

  /* externals + infra */
  EXTERNALS.forEach(([n, d], i) => {
    nodes.push(mk("external", `x-${slug(n)}`, n, d, [`server/integrations/${slug(n)}.ts`], 1, undefined,
      { addedIn: n === "Stripe" ? 2 : 1, complexity: 55, churn: ri(4, 10), contributors: ri(2, 5) }));
    void i;
  });
  INFRA.forEach(([n, d, f]) => {
    nodes.push(mk("database", `t-${slug(n)}`, n, d, [f], 1, undefined,
      { complexity: n === "PostgreSQL" ? 68 : 52, loc: n === "PostgreSQL" ? 480 : 130, addedIn: 0, churn: n === "PostgreSQL" ? 31 : 14, contributors: 8 }));
  });

  /* features */
  for (const f of FEATURES) {
    const fid = `f:${f.id}`;
    nodes.push(mk("feature", fid, f.name, f.d, [`app/(app)/${f.id}/layout.tsx`], 1, f.id,
      { complexity: ri(55, 88), loc: ri(900, 2600), coverage: ri(45, 88), addedIn: f.month, churn: ri(10, 30), contributors: ri(3, 8) }));
    E("prod", fid, "dependency", "ships");

    for (const p of f.pages) {
      const pid = `p-${slug(p.n)}`;
      const routeFile = `app${p.r.replace(/:[^/]+/g, "[id]")}/page.tsx`;
      nodes.push(mk("page", pid, p.n, p.d, [routeFile], 2, f.id,
        { route: p.r, addedIn: f.month, complexity: ri(28, 62), churn: p.hot ?? ri(3, 14), contributors: ri(2, 6) }));
      E(fid, pid, "navigation");
      for (const c of p.c) {
        const cid = `c-${slug(c[0])}`;
        nodes.push(mk("component", cid, c[0], c[1], [`components/${f.id}/${c[0]}.tsx`], 3, f.id, { addedIn: f.month }));
        E(pid, cid, "dependency");
      }
      for (const call of p.calls) {
        const [m, path] = call.split(" ");
        E(pid, apiId(m, path), "api", `${m} ${path}`);
      }
    }

    for (const a of f.apis) {
      const aid = apiId(a.m, a.p);
      const routeFile = `app/api${a.p.replace("/api", "").replace(/:[^/]+/g, "[id]")}/route.ts`;
      nodes.push(mk("api", aid, a.p, a.d, [routeFile], 2, f.id,
        { method: a.m, route: a.p, addedIn: f.month, complexity: ri(30, 72), churn: a.hot ?? ri(3, 12), contributors: ri(1, 5) }));
      E(fid, aid, "dependency", "exposes");
      if (a.svc) E(aid, `s-${slug(a.svc)}`, "dependency");
      for (const t of a.w ?? []) E(aid, `t-${t}`, "database");
    }

    for (const [sn, sd] of f.services ?? []) {
      const sid = `s-${slug(sn)}`;
      nodes.push(mk("service", sid, sn, sd, [`server/services/${sn}.ts`, `server/services/${sn}.test.ts`], 2, f.id,
        { addedIn: f.month, complexity: ri(58, 92), loc: ri(240, 720), coverage: ri(52, 92), churn: ri(6, 20), contributors: ri(2, 6) }));
      E(fid, sid, "dependency", "runs");
      for (const [tn] of f.tables ?? []) E(sid, `t-${tn}`, "database");
    }

    for (const [tn, td] of f.tables ?? []) {
      nodes.push(mk("database", `t-${tn}`, tn, td, [`prisma/schema.prisma`, `server/db/${tn}.queries.ts`], 1, f.id,
        { columns: ri(5, 16), relations: ri(1, 6), addedIn: f.month, complexity: ri(20, 55), loc: ri(30, 120), churn: ri(3, 16), contributors: ri(2, 7) }));
      E(`t-${tn}`, "t-postgresql", "database", "stored in");
    }

    for (const [jn, jd] of f.jobs ?? []) {
      const jid = `j-${slug(jn)}`;
      nodes.push(mk("job", jid, jn, jd, [`server/workers/${jn}.ts`], 2, f.id,
        { addedIn: Math.min(f.month + 1, 7), complexity: ri(45, 75), churn: ri(4, 14) }));
      E(fid, jid, "dependency", "schedules");
      E(jid, "t-redis", "data", "queue");
    }
  }

  /* webhook processor (billing-adjacent job) */
  nodes.push(mk("job", "j-webhookprocessor", "WebhookProcessor", JOBS_EXTRA[0][1], ["server/workers/WebhookProcessor.ts"], 2, "billing",
    { addedIn: 3, complexity: 78, churn: 29, contributors: 5 }));
  E("f:billing", "j-webhookprocessor", "dependency", "schedules");
  E("j-webhookprocessor", "t-subscriptions", "database");
  E("j-webhookprocessor", "x-stripe", "external", "verify");

  /* cross-feature + integration wiring */
  E("a-post-api-billing-subscribe", "x-stripe", "external", "create subscription");
  E("a-post-api-billing-webhook", "x-stripe", "external", "event source");
  E("a-get-api-billing-portal", "x-stripe", "external", "portal session");
  E("a-post-api-invites", "x-sendgrid", "external", "invite email");
  E("j-emailworker", "x-sendgrid", "external", "send");
  E("j-emailworker", "t-notifications", "database");
  E("j-digestjob", "t-notifications", "database");
  E("j-digestjob", "x-sendgrid", "external", "digest");
  E("j-reportgenerator", "t-reports", "database");
  E("j-reportgenerator", "t-events", "database");
  E("s-notificationservice", "j-emailworker", "data", "enqueue");
  E("s-notificationservice", "x-slack", "external", "mirror");
  E("s-taskservice", "s-notificationservice", "data", "mentions");
  E("s-projectservice", "s-taskservice", "data", "default columns");
  E("s-billingservice", "s-notificationservice", "data", "payment alerts");
  E("s-authservice", "t-redis", "data", "session cache");
  E("s-analyticsservice", "t-redis", "data", "event queue");
  E("s-analyticsservice", "t-events", "database");
  E("c-commandbar", "a-get-api-search", "api", "GET /api/search");
  E("p-dashboardpage", "c-appshell", "dependency");

  const stats = computeStats(nodes);
  return {
    repo: { name: "pulseboard", org: "acme-labs", branch: "main", source: "demo" },
    nodes,
    edges,
    stats,
    notes: [],
  };
}

export function computeStats(nodes: CFNode[]): Graph["stats"] {
  const files = new Set<string>();
  nodes.forEach((n) => n.data.files.forEach((f) => files.add(f)));
  const count = (k: NodeType) => nodes.filter((n) => n.data.kind === k).length;
  return {
    files: files.size + 63, // config, tests, migrations not individually mapped
    components: count("component"),
    pages: count("page"),
    apis: count("api"),
    tables: Math.max(count("database") - 2, 0),
    services: count("service"),
    externals: count("external"),
    jobs: count("job"),
    features: count("feature"),
  };
}