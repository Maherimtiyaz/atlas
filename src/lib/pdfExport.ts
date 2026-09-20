import type { Graph } from "../model";
import { getSupabase } from "./supabase";

const PENDING_GRAPH_KEY = "atlas.pending-pdf-graph";

export class PdfExportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function savePendingGraph(graph: Graph) {
  try {
    sessionStorage.setItem(PENDING_GRAPH_KEY, JSON.stringify(graph));
  } catch {
    throw new PdfExportError("PENDING_GRAPH_STORAGE", "This graph is too large to hold while authentication completes. Please analyze it again after signing in.");
  }
}

export function readPendingGraph(): Graph | null {
  try {
    const raw = sessionStorage.getItem(PENDING_GRAPH_KEY);
    return raw ? JSON.parse(raw) as Graph : null;
  } catch {
    return null;
  }
}

export function clearPendingGraph() {
  sessionStorage.removeItem(PENDING_GRAPH_KEY);
}

export async function requestPdfExport(graph: Graph, idempotencyKey: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new PdfExportError("NOT_CONFIGURED", "PDF downloads are not configured yet.");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new PdfExportError("AUTH_REQUIRED", "Sign in before downloading a PDF.");

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pdf-export`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ graph }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    const code = response.status === 401 ? "AUTH_REQUIRED" : response.status === 402 ? "PAID_ACCESS_REQUIRED" : response.status === 409 ? "EXPORT_IN_PROGRESS" : "EXPORT_FAILED";
    throw new PdfExportError(code, body?.error ?? "PDF generation failed. Please try again.");
  }

  const blob = await response.blob();
  if (blob.type !== "application/pdf") throw new PdfExportError("INVALID_PDF", "The export response was not a valid PDF.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "atlas-visual-study.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return link.download;
}