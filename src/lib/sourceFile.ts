export interface HeldSource {
  bytes: ArrayBuffer;
  type: string;
  name: string;
}

const held = new Map<string, HeldSource>();

export function sourceType(file: { type: string; name: string }): string | null {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (file.type === "application/pdf" || extension === "pdf") return "application/pdf";
  if (file.type === "image/png" || extension === "png") return "image/png";
  if (file.type === "image/webp" || extension === "webp") return "image/webp";
  if (file.type === "image/jpeg" || extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return null;
}

export async function holdSourceFile(file: File): Promise<string | null> {
  const type = sourceType(file);
  if (!type) return null;
  const key = crypto.randomUUID();
  held.set(key, { bytes: await file.arrayBuffer(), type, name: file.name });
  return key;
}

export function peekSourceFile(key: string | undefined): HeldSource | null {
  if (!key) return null;
  return held.get(key) ?? null;
}

export function takeSourceFile(key: string | undefined): HeldSource | null {
  if (!key) return null;
  const file = held.get(key) ?? null;
  if (file) held.delete(key);
  return file;
}
