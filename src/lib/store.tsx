import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Draft, Receipt, Settings } from "../types";
import { fetchLibrary, putLibrary, putReceiptFile } from "./libraryClient";
import { holdSourceFile, takeSourceFile, type HeldSource } from "./sourceFile";
import { assignRoles } from "./categories";
import { draftFromParsed, improveReceipt, parseReceipt } from "./parseReceipt";
import { buildSampleText, defaultSampleDate } from "./sampleReceipt";
import { money, todayISO, uid } from "./money";

const STORAGE_KEY = "costbreak.v1";

const defaultSettings: Settings = {
  blackCard: true,
  costcoVisa: true,
  pace: "auto",
  payAmount: 0,
  payCadence: "biweekly",
  planCadence: "biweekly",
  nearbyGasPrice: 0,
  necessary: [],
};

interface Persisted {
  version: 1;
  settings: Settings;
  receipts: Receipt[];
}

export type LibraryStatus = "loading" | "ready" | "offline";

interface StoreValue {
  settings: Settings;
  receipts: Receipt[];
  draft: Draft | null;
  status: LibraryStatus;
  folder: string;
  files: string[];
  reload: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  attachOriginal: (id: string, file: File) => Promise<void>;
  setDraft: (draft: Draft | null) => void;
  beginNew: () => void;
  beginSample: () => void;
  beginManual: () => void;
  beginEdit: (id: string) => void;
  saveDraft: (draft: Draft) => string | null;
  deleteReceipt: (id: string) => void;
  replaceAll: (next: Persisted) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function withRoles(receipts: Receipt[]): { receipts: Receipt[]; changed: boolean } {
  let changed = false;
  const next = receipts.map((receipt) => {
    const improved = improveReceipt(receipt);
    const base = improved ?? receipt;
    const items = assignRoles(base.items);
    if (improved || items.some((item, index) => item !== base.items[index])) {
      changed = true;
      return { ...base, items };
    }
    return receipt;
  });
  return { receipts: changed ? next : receipts, changed };
}

function blankDraft(): Draft {
  return {
    purchasedAt: todayISO(),
    warehouse: "Costco",
    items: [],
    tax: 0,
    total: 0,
    rawText: "",
    sample: false,
  };
}

function loadPersisted(): Persisted {
  const empty: Persisted = { version: 1, settings: defaultSettings, receipts: [] };
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.version !== 1 || !Array.isArray(parsed.receipts)) return empty;
    return {
      version: 1,
      settings: { ...defaultSettings, ...parsed.settings },
      receipts: parsed.receipts,
    };
  } catch {
    return empty;
  }
}

export function isBackup(value: unknown): value is Persisted {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Persisted>;
  return record.version === 1 && Array.isArray(record.receipts) && !!record.settings;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<Persisted>({ version: 1, settings: defaultSettings, receipts: [] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<LibraryStatus>("loading");
  const [folder, setFolder] = useState("data/receipts");
  const [files, setFiles] = useState<string[]>([]);
  const skipWrite = useRef(true);
  const writeQueue = useRef(Promise.resolve());
  const pendingFiles = useRef(new Map<string, HeldSource>());

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        let remote = await fetchLibrary();
        const local = loadPersisted();
        if (remote.receipts.length === 0 && local.receipts.length > 0) {
          remote = await putLibrary(local);
        }
        if (cancel) return;
        const normalized = withRoles(remote.receipts);
        skipWrite.current = !normalized.changed;
        setPersisted({ version: 1, settings: { ...defaultSettings, ...remote.settings }, receipts: normalized.receipts });
        setFolder(remote.folder || "data/receipts");
        setFiles(remote.files ?? []);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ version: 1, settings: remote.settings, receipts: normalized.receipts }),
        );
        setStatus("ready");
      } catch {
        if (cancel) return;
        const local = loadPersisted();
        const normalized = withRoles(local.receipts);
        skipWrite.current = true;
        setPersisted({ ...local, receipts: normalized.receipts });
        setStatus("offline");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    if (status !== "ready") return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    const snapshot = persisted;
    writeQueue.current = writeQueue.current
      .then(() => putLibrary(snapshot))
      .then(async (saved) => {
        setFolder(saved.folder || "data/receipts");
        setFiles(saved.files ?? []);
        const uploads = [...pendingFiles.current.entries()];
        for (const [id, file] of uploads) {
          if (!saved.receipts.some((receipt) => receipt.id === id)) continue;
          const sourceFile = await putReceiptFile(id, file);
          pendingFiles.current.delete(id);
          setPersisted((current) => ({
            ...current,
            receipts: current.receipts.map((receipt) => (receipt.id === id ? { ...receipt, sourceFile } : receipt)),
          }));
        }
        if (uploads.length > 0) {
          const fresh = await fetchLibrary();
          setFiles(fresh.files ?? []);
        }
      })
      .catch(() => setStatus("offline"));
  }, [persisted, status]);

  const reload = useCallback(async () => {
    try {
      await writeQueue.current;
      const remote = await fetchLibrary();
      const normalized = withRoles(remote.receipts);
      skipWrite.current = !normalized.changed;
      setPersisted({ version: 1, settings: { ...defaultSettings, ...remote.settings }, receipts: normalized.receipts });
      setFolder(remote.folder || "data/receipts");
      setFiles(remote.files ?? []);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, settings: remote.settings, receipts: normalized.receipts }),
      );
      setStatus("ready");
    } catch {
      setStatus((current) => (current === "loading" ? "offline" : current));
    }
  }, []);

  const value = useMemo<StoreValue>(() => {
    return {
      settings: persisted.settings,
      receipts: persisted.receipts,
      draft,
      status,
      folder,
      files,
      reload,
      updateSettings: (patch) => {
        setPersisted((current) => ({
          ...current,
          settings: { ...current.settings, ...patch },
        }));
      },
      setDraft,
      beginNew: () => setDraft(null),
      beginSample: () => {
        const date = defaultSampleDate();
        const parsed = parseReceipt(buildSampleText(date), date);
        setDraft(draftFromParsed(parsed, { sample: true, warehouse: "Seattle, WA" }));
      },
      beginManual: () => setDraft(blankDraft()),
      beginEdit: (id) => {
        const receipt = persisted.receipts.find((entry) => entry.id === id);
        if (!receipt) return;
        setDraft({
          purchasedAt: receipt.purchasedAt,
          warehouse: receipt.warehouse,
          items: receipt.items,
          tax: receipt.tax,
          total: receipt.total,
          rawText: receipt.rawText ?? "",
          sample: Boolean(receipt.sample),
          editingId: receipt.id,
        });
      },
      saveDraft: (next) => {
        const items = next.items
          .map((item) => ({ ...item, description: item.description.trim() }))
          .filter((item) => item.description || item.amount !== 0);
        if (!items.length) return null;
        const sum = money(items.reduce((total, item) => total + item.amount, 0));
        const tax = money(next.tax || 0);
        const receipt: Receipt = {
          id: next.editingId ?? uid(),
          purchasedAt: next.purchasedAt || todayISO(),
          warehouse: next.warehouse.trim() || "Costco",
          items,
          tax,
          total: money(next.total > 0 ? next.total : sum + tax),
          rawText: next.rawText,
          sample: next.sample,
          createdAt: new Date().toISOString(),
        };
        const held = takeSourceFile(next.sourceKey);
        if (held) pendingFiles.current.set(receipt.id, held);
        setPersisted((current) => {
          const existing = current.receipts.find((entry) => entry.id === receipt.id);
          const saved = { ...receipt, createdAt: existing?.createdAt ?? receipt.createdAt, sourceFile: existing?.sourceFile };
          const receipts = existing
            ? current.receipts.map((entry) => (entry.id === receipt.id ? saved : entry))
            : [saved, ...current.receipts];
          return { ...current, receipts };
        });
        setDraft(null);
        return receipt.id;
      },
      deleteReceipt: (id) => {
        setPersisted((current) => ({
          ...current,
          receipts: current.receipts.filter((receipt) => receipt.id !== id),
        }));
        setDraft(null);
      },
      attachOriginal: async (id, file) => {
        const key = await holdSourceFile(file);
        const held = takeSourceFile(key ?? undefined);
        if (!held) throw new Error("Save a PDF or a photo of the receipt.");
        const sourceFile = await putReceiptFile(id, held);
        setPersisted((current) => ({
          ...current,
          receipts: current.receipts.map((receipt) => (receipt.id === id ? { ...receipt, sourceFile } : receipt)),
        }));
        const fresh = await fetchLibrary();
        setFiles(fresh.files ?? []);
      },
      replaceAll: (next) => {
        setPersisted({
          version: 1,
          settings: { ...defaultSettings, ...next.settings },
          receipts: next.receipts,
        });
        setDraft(null);
      },
    };
  }, [persisted, draft, status, folder, files, reload]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
