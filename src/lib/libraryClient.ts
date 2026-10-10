import type { Receipt, Settings } from "../types";

export interface LibraryResponse {
  version: 1;
  settings: Settings;
  receipts: Receipt[];
  files: string[];
  folder: string;
}

export async function fetchLibrary(): Promise<LibraryResponse> {
  const response = await fetch("/api/library");
  if (!response.ok) throw new Error("The receipt folder did not open.");
  return (await response.json()) as LibraryResponse;
}

export async function putLibrary(library: { settings: Settings; receipts: Receipt[] }): Promise<LibraryResponse> {
  const response = await fetch("/api/library", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: 1, ...library }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Could not save to the receipt folder.");
  }
  return (await response.json()) as LibraryResponse;
}

export async function putReceiptFile(id: string, file: { bytes: ArrayBuffer; type: string }): Promise<string> {
  const response = await fetch(`/api/receipt-file/${id}`, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file.bytes,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Could not save the original file.");
  }
  const saved = (await response.json()) as { sourceFile?: string };
  if (!saved.sourceFile) throw new Error("Could not save the original file.");
  return saved.sourceFile;
}
