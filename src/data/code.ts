import type { CFNode } from "../model";

/* Hand-authored source for the flows users are most likely to open. */
const FILES: Record<string, string> = {
  "app/billing/checkout/page.tsx": `import { SeatCalculator } from "@/components/billing/SeatCalculator"
import { CheckoutSummary } from "@/components/billing/CheckoutSummary"
import { subscribe } from "./actions"

export default function CheckoutPage() {
  // Plan + seat count are server-rendered from the workspace
  const subscription = useSubscription()

  return (
    <main className="mx-auto max-w-3xl">
      <SeatCalculator onChange={recalculate} />
      <CheckoutSummary quote={quote} />
      <form action={subscribe}>
        <Button type="submit">Upgrade to {quote.plan}</Button>
      </form>
    </main>
  )
}`,
  "app/api/billing/subscribe/route.ts": `import { z } from "zod"
import { billing } from "@/server/services/BillingService"
import { requireWorkspace } from "@/server/auth"

const Body = z.object({
  plan: z.enum(["free", "pro", "enterprise"]),
  seats: z.number().int().min(1).max(500),
})

export async function POST(req: Request) {
  const { workspace, user } = await requireWorkspace(req)
  const body = Body.parse(await req.json())

  // Idempotent: reuses an in-flight checkout for the same workspace
  const result = await billing.subscribe(workspace.id, {
    plan: body.plan,
    seats: body.seats,
    meta { actor: user.id },
  })

  return Response.json({ clientSecret: result.clientSecret })
}`,
  "app/api/billing/webhook/route.ts": `import { stripe } from "@/server/integrations/stripe"
import { processWebhook } from "@/server/workers/WebhookProcessor"

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get("stripe-signature")!

  // Throws unless the signature matches the endpoint secret
  const event = stripe.webhooks.constructEvent(
    raw, sig, process.env.STRIPE_WEBHOOK_SECRET!
  )

  // Acknowledge fast, replay idempotently off the hot path
  await processWebhook.enqueue(event)
  return new Response(null, { status: 200 })
}`,
  "server/services/BillingService.ts": `import { db } from "@/server/db"
import { stripe } from "@/server/integrations/stripe"
import { notify } from "@/server/services/NotificationService"

export const billing = {
  async subscribe(workspaceId: string, opts: SubscribeOpts) {
    const customer = await this.ensureCustomer(workspaceId)

    const sub = await stripe.subscriptions.create({
      customer: customer.stripeId,
      items: [{ price: PRICES[opts.plan], quantity: opts.seats }],
      payment_behavior: "default_incomplete",
    })

    await db.subscriptions.upsert({
      where: { workspaceId },
      update: { stripeId: sub.id, status: "incomplete", seats: opts.seats },
      create: { workspaceId, stripeId: sub.id, status: "incomplete" },
    })

    return { clientSecret: sub.latest_invoice.payment_intent.client_secret }
  },

  async onPaymentFailed(workspaceId: string) {
    await db.subscriptions.update({ where: { workspaceId },  { status: "past_due" } })
    await notify.fanOut(workspaceId, "billing.payment_failed")
  },
}`,
  "server/services/AuthService.ts": `import { compare } from "@node-rs/argon2"
import { db } from "@/server/db"
import { redis } from "@/server/lib/redis"
import { randomBytes } from "node:crypto"

const SESSION_TTL = 60 * 60 * 24 * 30 // 30 days

export const auth = {
  async login(email: string, password: string) {
    const user = await db.users.findUnique({ where: { email } })
    if (!user || !(await compare(user.passwordHash, password))) {
      throw new AuthError("Invalid credentials")
    }
    return this.mint(user.id)
  },

  async mint(userId: string) {
    const token = randomBytes(32).toString("base64url")
    // Postgres is the source of truth, Redis makes lookups O(1)
    await db.sessions.create({  { token, userId } })
    await redis.set(\`session:\${token}\`, userId, "EX", SESSION_TTL)
    return token
  },

  async verify(token: string) {
    const userId = await redis.get(\`session:\${token}\`)
    return userId ?? null
  },
}`,
  "server/services/TaskService.ts": `import { db } from "@/server/db"
import { track } from "@/server/services/AnalyticsService"
import { notify } from "@/server/services/NotificationService"

export const tasks = {
  async move(taskId: string, status: string, orderKey: string, actorId: string) {
    const task = await db.tasks.update({
      where: { id: taskId },
       { status, orderKey },
      include: { project: true },
    })

    await track("task.moved", { taskId, status, actorId })

    const mentioned = parseMentions(task.title)
    if (mentioned.length) await notify.fanOut(mentioned, "task.mentioned")

    return task
  },

  async create(input: TaskInput, actorId: string) {
    const task = await db.tasks.create({  { ...input, orderKey: lastKey(input.projectId) } })
    if (input.assigneeId) await notify.send(input.assigneeId, "task.assigned", task.id)
    return task
  },
}`,
  "server/services/NotificationService.ts": `import { db } from "@/server/db"
import { queue } from "@/server/lib/redis"
import { slack } from "@/server/integrations/slack"

export const notify = {
  async fanOut(userIds: string[], template: string, meta?: Record<string, string>) {
    const rows = userIds.map((userId) => ({ userId, template, meta }))
    await db.notifications.createMany({  rows })

    // Email delivery is async — never block the request path
    await queue.push("email", rows.map((r) => ({ ...r, kind: template })))

    await slack.mirror(template, meta)
  },
}`,
  "server/workers/EmailWorker.ts": `import { Worker } from "bullmq"
import { render } from "@react-email/render"
import { sendgrid } from "@/server/integrations/sendgrid"
import { templates } from "@/emails"

// Pulls from the Redis "email" queue; retries with exponential backoff
export const emailWorker = new Worker("email", async (job) => {
  const { to, kind, meta } = job.data
  const html = await render(templates[kind](meta))

  await sendgrid.send({
    to,
    from: "Pulseboard <hello@pulseboard.app>",
    subject: templates[kind].subject(meta),
    html,
  })
}, { concurrency: 8 })`,
  "server/workers/WebhookProcessor.ts": `import { db } from "@/server/db"
import { billing } from "@/server/services/BillingService"

export const processWebhook = {
  async enqueue(event: Stripe.Event) {
    // Idempotency: Stripe redelivers; the event id is the dedupe key
    const seen = await db.webhookEvents.findUnique({ where: { id: event.id } })
    if (seen) return
    await handle(event)
    await db.webhookEvents.create({  { id: event.id, type: event.type } })
  },
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "invoice.paid":
      return billing.onPaid(event.data.object)
    case "invoice.payment_failed":
      return billing.onPaymentFailed(event.data.object.subscription)
    case "customer.subscription.deleted":
      return billing.onCancelled(event.data.object)
  }
}`,
  "components/tasks/TaskBoard.tsx": `import { useVirtualizer } from "@tanstack/react-virtual"
import { DragLayer } from "./DragLayer"
import { TaskCard } from "./TaskCard"
import { useBoard } from "./useBoard"

export function TaskBoard({ projectId }: { projectId: string }) {
  const { columns, onMove, pending } = useBoard(projectId)

  return (
    <div className="flex gap-4 overflow-x-auto">
      {columns.map((col) => (
        <Column key={col.status} column={col}>
          {col.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              optimistic={pending.has(task.id)}
              onDrop={(status, orderKey) => onMove(task.id, status, orderKey)}
            />
          ))}
        </Column>
      ))}
      <DragLayer />
    </div>
  )
}`,
  "prisma/schema.prisma": `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  workspaces   TeamMember[]
  sessions     Session[]
}

model Session {
  token   String   @id
  userId  String
  user    User     @relation(fields: [userId], references: [id])
  expires DateTime
}

model Project {
  id          String  @id @default(cuid())
  key         String
  name        String
  workspaceId String
  tasks       Task[]
}

model Task {
  id        String @id @default(cuid())
  title     String
  status    String @default("todo")
  orderKey  String
  projectId String
  project   Project @relation(fields: [projectId], references: [id])
}`,
  "middleware.ts": `import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/server/services/AuthService"

const PUBLIC = ["/login", "/signup", "/recover"]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get("pb_session")?.value
  const userId = token ? await auth.verify(token) : null
  if (!userId) return NextResponse.redirect(new URL("/login", req.url))

  // Hydrate the request so server components can skip a lookup
  const headers = new Headers(req.headers)
  headers.set("x-user-id", userId)
  return NextResponse.next({ request: { headers } })
}`,
  "server/lib/redis.ts": `import Redis from "ioredis"

export const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // required by bullmq
  retryStrategy: (n) => Math.min(n * 200, 5000),
})

import { Queue } from "bullmq"
export const queue = {
  email: new Queue("email", { connection: redis }),
  push(name: string, jobs: unknown[]) {
    return this[name as "email"].addBulk(jobs.map((data) => ({ name, data })))
  },
}`,
};

/* Plausible generated source for everything else. */
export function codeFor(node: CFNode, selected?: string | null): { file: string; code: string } {
  const file = selected ?? node.data.files[0] ?? `src/${node.data.name}.ts`;
  const hit = FILES[file] ?? FILES[node.data.files[0] ?? ""];
  if (hit) return { file, code: hit };

  const d = node.data;
  const schema = file.endsWith(".prisma")
    ? `model ${cap(d.name)} {\n  id        String   @id @default(cuid())\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n  // ${d.description}\n}`
    : d.kind === "api"
    ? `import { ${svcName(d)} } from "@/server/services"\nimport { requireUser } from "@/server/auth"\n\n// ${d.description}\nexport async function ${d.meta.method === "GET" ? "GET" : "POST"}(req: Request) {\n  const { user } = await requireUser(req)\n  const result = await ${svcName(d)}.handle(user, await req.json())\n  return Response.json(result)\n}`
    : d.kind === "service"
    ? `import { db } from "@/server/db"\n\n// ${d.description}\nexport const ${lc(d.name)} = {\n  async handle(input: unknown) {\n    // ${d.meta.loc} LOC · ${d.meta.coverage}% covered\n    return db.$transaction(async (tx) => {\n      return { ok: true }\n    })\n  },\n}`
    : d.kind === "component"
    ? `// ${d.description}\nexport function ${d.name}(props: ${d.name}Props) {\n  return (\n    <div className="rounded-lg border p-4">\n      {/* ${d.meta.loc} LOC */}\n    </div>\n  )\n}`
    : d.kind === "page"
    ? `// Route: ${d.meta.route ?? "/"}\nexport default function ${d.name}() {\n  return (\n    <main>\n      {/* ${d.description} */}\n    </main>\n  )\n}`
    : d.kind === "database"
    ? `-- ${d.description}\n-- ${d.meta.columns ?? 8} columns · ${d.meta.relations ?? 2} relations\nSELECT * FROM "${d.name}" LIMIT 50;`
    : `// ${d.description}\nexport const ${lc(d.name)} = {\n  async run() {\n    return { ok: true }\n  },\n}`;

  return { file, code: schema };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const svcName = (d: CFNode["data"]) => lc(d.name.replace(/[^a-zA-Z]/g, "") || "service");

/* ------------------------------------------------------------------ */
/* Tiny tokenizer for the code viewer                                 */
/* ------------------------------------------------------------------ */

export interface Token { text: string; cls?: string }

const RE =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(<\/?[A-Za-z][\w.]*|\/?>)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|import|from|export|default|new|await|async|type|interface|extends|class|try|catch|throw|switch|case|break|typeof|in|of|null|undefined|true|false|this|void|enum|readonly|static|model|generator|datasource|provider)\b|(@[a-zA-Z_][\w()]*)|\b([A-Z][A-Za-z0-9_]*)\b|([a-zA-Z_$][\w$]*)(?=\()|([{}[\]().,;:=+\-*/<>!&|?]+)/g;

export function highlight(code: string): Token[][] {
  return code.split("\n").map((line) => {
    const out: Token[] = [];
    let last = 0;
    RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(line))) {
      if (m.index > last) out.push({ text: line.slice(last, m.index) });
      const cls = m[1] ? "tk-com" : m[2] ? "tk-str" : m[3] ? "tk-jsx" : m[4] ? "tk-num" : m[5] ? "tk-kw" : m[6] ? "tk-fn" : m[7] ? "tk-type" : m[8] ? "tk-fn" : m[9] ? "tk-punc" : undefined;
      out.push({ text: m[0], cls });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last) });
    return out;
  });
}