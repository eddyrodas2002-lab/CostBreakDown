import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";

const MAX_BODY = 2_000_000;
const MAX_ORIGINAL = 8_000_000;

export interface StoredReceipt {
  id: string;
  purchasedAt: string;
  warehouse: string;
  items: unknown[];
  tax: number;
  total: number;
  rawText?: string;
  sourceFile?: string;
  sample?: boolean;
  createdAt: string;
}

export interface StoredPlanItem {
  key: string;
  name: string;
  quantity: number;
  necessary: boolean;
  price?: number;
  custom?: boolean;
}

export interface StoredSettings {
  blackCard: boolean;
  costcoVisa: boolean;
  pace: "auto" | "weekly" | "biweekly" | "monthly";
  payAmount: number;
  payCadence: "weekly" | "biweekly" | "monthly";
  planCadence: "weekly" | "biweekly";
  nearbyGasPrice: number;
  necessary: StoredPlanItem[];
}

export interface LibraryFile {
  version: 1;
  settings: StoredSettings;
  receipts: StoredReceipt[];
  files: string[];
  folder: string;
}

const defaultSettings: StoredSettings = {
  blackCard: true,
  costcoVisa: true,
  pace: "auto",
  payAmount: 0,
  payCadence: "biweekly",
  planCadence: "biweekly",
  nearbyGasPrice: 0,
  necessary: [],
};

export function receiptsDir(root: string): string {
  return path.join(root, "data", "receipts");
}

export function settingsPath(root: string): string {
  return path.join(root, "data", "settings.json");
}

function safeId(id: string): boolean {
  return /^[a-zA-Z0-9-]{8,80}$/.test(id);
}

function isReceipt(value: unknown): value is StoredReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<StoredReceipt>;
  return (
    typeof receipt.id === "string" &&
    safeId(receipt.id) &&
    typeof receipt.purchasedAt === "string" &&
    typeof receipt.warehouse === "string" &&
    Array.isArray(receipt.items) &&
    typeof receipt.tax === "number" &&
    typeof receipt.total === "number" &&
    typeof receipt.createdAt === "string"
  );
}

function planItem(value: unknown): StoredPlanItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StoredPlanItem>;
  if (typeof item.key !== "string" || typeof item.name !== "string" || typeof item.quantity !== "number") return null;
  if (typeof item.necessary !== "boolean") return null;
  return {
    key: item.key,
    name: item.name,
    quantity: item.quantity,
    necessary: item.necessary,
    price: typeof item.price === "number" ? item.price : undefined,
    custom: Boolean(item.custom),
  };
}

export function normalizeSettings(value: unknown): StoredSettings | null {
  if (!value || typeof value !== "object") return null;
  const settings = value as Partial<StoredSettings>;
  if (typeof settings.blackCard !== "boolean" || typeof settings.costcoVisa !== "boolean") return null;
  if (
    settings.pace !== "auto" &&
    settings.pace !== "weekly" &&
    settings.pace !== "biweekly" &&
    settings.pace !== "monthly"
  ) {
    return null;
  }
  const payCadence =
    settings.payCadence === "weekly" || settings.payCadence === "biweekly" || settings.payCadence === "monthly"
      ? settings.payCadence
      : defaultSettings.payCadence;
  const planCadence =
    settings.planCadence === "weekly" || settings.planCadence === "biweekly"
      ? settings.planCadence
      : defaultSettings.planCadence;
  return {
    blackCard: settings.blackCard,
    costcoVisa: settings.costcoVisa,
    pace: settings.pace,
    payAmount: typeof settings.payAmount === "number" && settings.payAmount >= 0 ? settings.payAmount : 0,
    payCadence,
    planCadence,
    nearbyGasPrice: typeof settings.nearbyGasPrice === "number" && settings.nearbyGasPrice >= 0 ? settings.nearbyGasPrice : 0,
    necessary: Array.isArray(settings.necessary)
      ? settings.necessary.map(planItem).filter((item): item is StoredPlanItem => item !== null)
      : [],
  };
}

export function receiptFileName(receipt: StoredReceipt): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(receipt.purchasedAt) ? receipt.purchasedAt : "undated";
  return `${day}_${receipt.id}.json`;
}

const ORIGINAL_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function fileId(fileName: string): string | null {
  const extension = path.extname(fileName).toLowerCase();
  if (extension !== ".json" && !ORIGINAL_TYPES[extension]) return null;
  const base = fileName.slice(0, -extension.length);
  const splitAt = base.indexOf("_");
  if (splitAt === -1) return null;
  const id = base.slice(splitAt + 1);
  return safeId(id) ? id : null;
}

function originalExtension(contentType: string): string | null {
  const type = contentType.split(";")[0]?.trim().toLowerCase();
  if (type === "application/pdf") return ".pdf";
  if (type === "image/png") return ".png";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/webp") return ".webp";
  return null;
}

function findOriginal(folder: string, id: string): string | null {
  if (!fs.existsSync(folder)) return null;
  const matches = fs
    .readdirSync(folder)
    .filter((name) => fileId(name) === id && ORIGINAL_TYPES[path.extname(name).toLowerCase()]);
  return matches.sort()[0] ?? null;
}

function listFiles(folder: string): string[] {
  return fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".json") || ORIGINAL_TYPES[path.extname(name).toLowerCase()])
    .sort();
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function readLibrary(root: string): LibraryFile {
  const folder = receiptsDir(root);
  fs.mkdirSync(folder, { recursive: true });
  const receipts: StoredReceipt[] = [];
  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = readJson(path.join(folder, name));
      if (isReceipt(parsed)) receipts.push(parsed);
    } catch {
      // Leave an unreadable file alone so a bad edit does not wipe the folder.
    }
  }
  for (const receipt of receipts) {
    const original = findOriginal(folder, receipt.id);
    if (original) receipt.sourceFile = original;
    else delete receipt.sourceFile;
  }
  receipts.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt.localeCompare(a.createdAt));

  let settings = defaultSettings;
  const settingsFile = settingsPath(root);
  if (fs.existsSync(settingsFile)) {
    try {
      const parsed = readJson(settingsFile);
      const normalized = normalizeSettings(parsed);
      if (normalized) settings = normalized;
    } catch {
      settings = defaultSettings;
    }
  }

  return { version: 1, settings, receipts, files: listFiles(folder), folder };
}

export function writeLibrary(root: string, library: Pick<LibraryFile, "settings" | "receipts">) {
  const settings = normalizeSettings(library.settings);
  if (!settings || !Array.isArray(library.receipts) || !library.receipts.every(isReceipt)) {
    throw new Error("That receipt file is missing a date, items, or total.");
  }
  const folder = receiptsDir(root);
  fs.mkdirSync(folder, { recursive: true });
  const keep = new Set(library.receipts.map((receipt) => receiptFileName(receipt)));
  const ids = new Set(library.receipts.map((receipt) => receipt.id));
  const originals = new Map<string, string>();
  for (const name of fs.readdirSync(folder)) {
    const id = fileId(name);
    if (!id) continue;
    if (ORIGINAL_TYPES[path.extname(name).toLowerCase()]) originals.set(id, name);
  }

  for (const name of fs.readdirSync(folder)) {
    const id = fileId(name);
    if (!id) continue;
    const removed = !ids.has(id);
    const renamed = name.endsWith(".json") && !keep.has(name);
    if (removed || renamed) fs.unlinkSync(path.join(folder, name));
  }

  for (const receipt of library.receipts) {
    const original = originals.get(receipt.id);
    const saved = { ...receipt };
    if (original) {
      const extension = path.extname(original);
      const nextName = receiptFileName(receipt).replace(/\.json$/, extension.toLowerCase() === ".jpeg" ? ".jpg" : extension);
      if (original !== nextName && fs.existsSync(path.join(folder, original))) {
        fs.renameSync(path.join(folder, original), path.join(folder, nextName));
      }
      saved.sourceFile = nextName;
    } else {
      delete saved.sourceFile;
    }
    writeJson(path.join(folder, receiptFileName(receipt)), saved);
  }
  writeJson(settingsPath(root), settings);
}

export function writeOriginal(root: string, id: string, bytes: Buffer, contentType: string): string {
  if (!safeId(id)) throw new Error("That receipt could not be found.");
  const extension = originalExtension(contentType);
  if (!extension) throw new Error("Save a PDF or a photo of the receipt.");
  if (bytes.length === 0 || bytes.length > 8_000_000) throw new Error("That file is too large to save.");
  const folder = receiptsDir(root);
  const jsonName = fs.readdirSync(folder).find((name) => name.endsWith(".json") && fileId(name) === id);
  if (!jsonName) throw new Error("Save the receipt before its original file.");
  const nextName = jsonName.replace(/\.json$/, extension);
  for (const name of fs.readdirSync(folder)) {
    if (fileId(name) === id && ORIGINAL_TYPES[path.extname(name).toLowerCase()] && name !== nextName) {
      fs.unlinkSync(path.join(folder, name));
    }
  }
  const temporary = path.join(folder, `${nextName}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, path.join(folder, nextName));
  return nextName;
}

export function readOriginal(root: string, id: string): { fileName: string; bytes: Buffer; type: string } | null {
  if (!safeId(id)) return null;
  const folder = receiptsDir(root);
  const fileName = findOriginal(folder, id);
  if (!fileName) return null;
  const type = ORIGINAL_TYPES[path.extname(fileName).toLowerCase()];
  if (!type) return null;
  return { fileName, bytes: fs.readFileSync(path.join(folder, fileName)), type };
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function readChunks(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("That file is too large to save."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

export function createFolderMiddleware(root: string): Connect.NextHandleFunction {
  return (request, response, next) => {
    const url = request.url?.split("?")[0];
    const originalMatch = url?.match(/^\/api\/receipt-file\/([a-zA-Z0-9-]{8,80})$/);
    if (originalMatch) {
      const id = originalMatch[1];
      if (request.method === "GET") {
        const file = readOriginal(root, id);
        if (!file) {
          sendJson(response, 404, { error: "That original file is not in the receipt folder." });
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-type", file.type);
        response.setHeader("content-disposition", `inline; filename="${file.fileName}"`);
        response.end(file.bytes);
        return;
      }
      if (request.method === "PUT") {
        const contentType = request.headers["content-type"] ?? "";
        void readChunks(request, MAX_ORIGINAL)
          .then((bytes) => {
            const sourceFile = writeOriginal(root, id, bytes, contentType);
            sendJson(response, 200, { sourceFile });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Could not save the original file.";
            sendJson(response, 400, { error: message });
          });
        return;
      }
      sendJson(response, 405, { error: "Use GET or PUT." });
      return;
    }

    if (url !== "/api/library") {
      next();
      return;
    }

    if (request.method === "GET") {
      sendJson(response, 200, readLibrary(root));
      return;
    }

    if (request.method === "PUT") {
      void readChunks(request, MAX_BODY).then((bytes) => bytes.toString("utf8"))
        .then((raw) => {
          const parsed = JSON.parse(raw) as Partial<LibraryFile>;
          writeLibrary(root, {
            settings: parsed.settings ?? defaultSettings,
            receipts: parsed.receipts ?? [],
          });
          sendJson(response, 200, readLibrary(root));
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not save the receipt folder.";
          sendJson(response, 400, { error: message });
        });
      return;
    }

    sendJson(response, 405, { error: "Use GET or PUT." });
  };
}
