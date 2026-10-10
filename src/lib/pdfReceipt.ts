import type { PDFPageProxy } from "pdfjs-dist";
import { readReceiptImage } from "./ocr";
import { parseReceipt } from "./parseReceipt";
import { hasReadableText, linesFromTextItems } from "./pdfText";

const MAX_PAGES = 8;

type Pdfjs = typeof import("pdfjs-dist");

let pdfjsReady: Promise<Pdfjs> | null = null;

function loadPdfjs(): Promise<Pdfjs> {
  pdfjsReady ??= (async () => {
    if (typeof window === "undefined") {
      return import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<Pdfjs>;
    }
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return pdfjsReady;
}

function fontDataUrl(): string | undefined {
  const base =
    typeof window === "undefined"
      ? new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)
      : new URL("pdfjs-dist/standard_fonts/", import.meta.url);
  const href = base.href;
  return href.endsWith("/") ? href : `${href}/`;
}

async function renderPage(page: PDFPageProxy): Promise<Blob> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, 1800 / Math.max(base.width, base.height, 1));
  const viewport = page.getViewport({ scale: Math.max(1, scale) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn’t open that PDF.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("This browser couldn’t open that PDF.");
  return blob;
}

function asReceiptError(error: unknown): Error {
  if (error instanceof Error && (error.name === "PasswordException" || /password/i.test(error.message))) {
    return new Error("That PDF is locked. Remove the password, or use a photo.");
  }
  if (error instanceof Error && /photo|JPG|PNG|reader|PDF/i.test(error.message)) return error;
  return new Error("That PDF couldn’t be opened. Try a photo, or paste the text.");
}

export async function readReceiptPdf(
  file: File,
  onProgress: (value: number, label: string) => void,
): Promise<string> {
  onProgress(0.05, "Opening the PDF");
  const { getDocument } = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data, standardFontDataUrl: fontDataUrl() });
  try {
    const pdf = await task.promise;
    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    const parts: string[] = [];
    for (let number = 1; number <= pageCount; number += 1) {
      onProgress(0.1 + (number / pageCount) * 0.2, "Reading the PDF");
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = linesFromTextItems(content.items);
      if (text) parts.push(text);
      page.cleanup();
    }
    const combined = parts.join("\n");
    if (hasReadableText(combined)) {
      const parsed = parseReceipt(combined);
      if (parsed.items.length > 0 || combined.length > 500) return combined;
    }

    const scans: string[] = [];
    for (let number = 1; number <= pageCount; number += 1) {
      onProgress(0.35 + ((number - 1) / pageCount) * 0.6, "Reading the scanned PDF");
      const page = await pdf.getPage(number);
      const blob = await renderPage(page);
      page.cleanup();
      const image = new File([blob], `page-${number}.jpg`, { type: "image/jpeg" });
      const text = await readReceiptImage(image, (value, label) => {
        const start = 0.35 + ((number - 1) / pageCount) * 0.6;
        onProgress(start + value * (0.6 / pageCount), label);
      });
      if (text.trim()) scans.push(text.trim());
    }
    return scans.join("\n");
  } catch (error) {
    throw asReceiptError(error);
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
