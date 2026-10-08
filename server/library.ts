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
      const normalized = normalizeSettings(parsed);
      if (normalized) settings = normalized;
    } catch {
      settings = defaultSettings;
    }
  }

  return { version: 1, settings, receipts, folder };
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

  for (const name of fs.readdirSync(folder)) {
    if (!name.endsWith(".json")) continue;
    const id = idFromFileName(name);
    if (id && (!ids.has(id) || !keep.has(name))) fs.unlinkSync(path.join(folder, name));
  }

  for (const receipt of library.receipts) {
    writeJson(path.join(folder, receiptFileName(receipt)), receipt);
  }
  writeJson(settingsPath(root), settings);
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
