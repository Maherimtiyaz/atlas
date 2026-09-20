import { createClient } from "@supabase/supabase-js";
import { generatePdf, sanitizeGraph } from "./core.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key" };
const json = (body: Record<string, string>, status = 400) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const paidAccessConfigured = false;
const canDownloadPdf = (reservation: { paid_access: boolean; consumes_free_download: boolean }) =>
  reservation.consumes_free_download || (paidAccessConfigured && reservation.paid_access);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
  const maxBytes = 1_500_000;
  if (!token) return json({ error: "Authentication required" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return json({ error: "Authentication required" }, 401);

  let graph;
  try {
    const bodyBytes = new Uint8Array(await request.arrayBuffer());
    if (bodyBytes.byteLength > maxBytes) return json({ error: "Graph payload is too large" }, 413);
    const body = JSON.parse(new TextDecoder().decode(bodyBytes));
    graph = sanitizeGraph(body.graph);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid Graph payload" }, 422);
  }

  const { data: reservations, error: reserveError } = await supabase.rpc("reserve_pdf_download", { request_key: key });
  const reservation = reservations?.[0] as { reservation_id: string; reservation_status: string; paid_access: boolean; consumes_free_download: boolean; is_new: boolean } | undefined;
  if (reserveError?.message.includes("paid_access_required")) return json({ error: "Your free PDF download has been used. Paid PDF access is not configured yet." }, 402);
  if (reserveError) return json({ error: "Could not reserve PDF access" }, 409);
  if (!reservation) return json({ error: "Could not reserve PDF access" }, 409);
  if (!reservation.is_new) return json({ error: reservation.reservation_status === "reserved" ? "This export request is already in progress" : "This export request has already been processed" }, 409);
  if (reservation.reservation_status !== "reserved") return json({ error: "This export request has already been processed" }, 409);
  if (!canDownloadPdf(reservation)) {
    await supabase.rpc("fail_pdf_download", { reservation: reservation.reservation_id });
    return json({ error: "Paid PDF access is not configured yet" }, 402);
  }

  try {
    const bytes = await generatePdf(graph);
    const { error: completeError } = await supabase.rpc("complete_pdf_download", { reservation: reservation.reservation_id });
    if (completeError) throw completeError;
    const filename = `${graph.repo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "atlas"}-visual-study.pdf`;
    return new Response(bytes, { status: 200, headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch {
    await supabase.rpc("fail_pdf_download", { reservation: reservation.reservation_id });
    return json({ error: "PDF generation failed. Your free download was restored; please try again." }, 500);
  }
});