import type { Graph } from "../model";
import { generatePdf, sanitizeGraph } from "./pdfCore";

export class PdfExportError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function requestPdfExport(graph: Graph): Promise<string> {
  const bytes = await generatePdf(sanitizeGraph(graph));
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${graph.repo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "atlas"}-visual-study.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return link.download;
}