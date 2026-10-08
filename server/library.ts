import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";

const MAX_BODY = 2_000_000;

export interface StoredReceipt {
  id: string;
  purchasedAt: string;
  warehouse: string;
  items: unknown[];
  tax: number;
  total: number;
  rawText?: string;
  sample?: boolean;
  createdAt: string;
}

export interface StoredSettings {
  blackCard: boolean;
  costcoVisa: boolean;
  pace: "auto" | "weekly" | "biweekly" | "monthly";
}

export interface LibraryFile {
  version: 1;
  settings: StoredSettings;
  receipts: StoredReceipt[];
  folder: string;
}

const defaultSettings: StoredSettings = {
  blackCard: true,
  costcoVisa: true,
  pace: "auto",
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

function isSettings(value: unknown): value is StoredSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<StoredSettings>;
  return (
    typeof settings.blackCard === "boolean" &&
    typeof settings.costcoVisa === "boolean" &&
    (settings.pace === "auto" || settings.pace === "weekly" || settings.pace === "biweekly" || settings.pace === "monthly")
  );
}

export function receiptFileName(receipt: StoredReceipt): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(receipt.purchasedAt) ? receipt.purchasedAt : "undated";
  return `${day}_${receipt.id}.json`;
}

function idFromFileName(fileName: string): string | null {
  if (!fileName.endsWith(".json")) return null;
  const base = fileName.slice(0, -".json".length);
  const splitAt = base.indexOf("_");
  if (splitAt === -1) return null;
  const id = base.slice(splitAt + 1);
  return safeId(id) ? id : null;
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
  receipts.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt.localeCompare(a.createdAt));

  let settings = defaultSettings;
  const settingsFile = settingsPath(root);
  if (fs.existsSync(settingsFile)) {
    try {
      const parsed = readJson(settingsFile);
      if (isSettings(parsed)) settings = parsed;
    } catch {
      settings = defaultSettings;
    }
  }

  return { version: 1, settings, receipts, folder };
}

export function writeLibrary(root: string, library: Pick<LibraryFile, "settings" | "receipts">) {
  if (!isSettings(library.settings) || !Array.isArray(library.receipts) || !library.receipts.every(isReceipt)) {
    throw new Error("That receipt file is missing a date, items, or total.");
  }
  const folder = receiptsDir(root);
  fs.mkdirSync(folder, { recursive: true });
  const keep = new Set(library.receipts.map((receipt) => receiptFileName(receipt)));
  const ids = new Set(library.receipts.map((receipt) => receipt.id));

  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith(".json")) continue;
    const id = idFromFileName(name);
    if (id && (!ids.has(id) || !keep.has(name))) fs.unlinkSync(path.join(folder, name));
  }

  for (const receipt of library.receipts) {
    writeJson(path.join(folder, receiptFileName(receipt)), receipt);
  }
  writeJson(settingsPath(root), library.settings);
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("That file is too large to save."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createFolderMiddleware(root: string): Connect.NextHandleFunction {
  return (request, response, next) => {
    const url = request.url?.split("?")[0];
    if (url !== "/api/library") {
      next();
      return;
    }

    if (request.method === "GET") {
      sendJson(response, 200, readLibrary(root));
      return;
    }

    if (request.method === "PUT") {
      void readBody(request)
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
