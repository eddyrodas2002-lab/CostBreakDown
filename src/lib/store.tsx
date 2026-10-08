import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Draft, Receipt, Settings } from "../types";
import { fetchLibrary, putLibrary } from "./libraryClient";
import { draftFromParsed, parseReceipt } from "./parseReceipt";
import { buildSampleText, defaultSampleDate } from "./sampleReceipt";
import { money, todayISO, uid } from "./money";

const STORAGE_KEY = "costbreak.v1";

const defaultSettings: Settings = {
  blackCard: true,
  costcoVisa: true,
  pace: "auto",
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
  updateSettings: (patch: Partial<Settings>) => void;
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
  const skipWrite = useRef(true);
  const writeQueue = useRef(Promise.resolve());

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
        skipWrite.current = true;
        setPersisted({ version: 1, settings: { ...defaultSettings, ...remote.settings }, receipts: remote.receipts });
        setFolder(remote.folder || "data/receipts");
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: remote.settings, receipts: remote.receipts }));
        setStatus("ready");
      } catch {
        if (cancel) return;
        skipWrite.current = true;
        setPersisted(loadPersisted());
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
      .then((saved) => setFolder(saved.folder || "data/receipts"))
      .catch(() => setStatus("offline"));
  }, [persisted, status]);

  const value = useMemo<StoreValue>(() => {
    return {
      settings: persisted.settings,
      receipts: persisted.receipts,
      draft,
      status,
      folder,
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
        setPersisted((current) => {
          const exists = current.receipts.some((entry) => entry.id === receipt.id);
          const receipts = exists
            ? current.receipts.map((entry) =>
                entry.id === receipt.id ? { ...receipt, createdAt: entry.createdAt } : entry,
              )
            : [receipt, ...current.receipts];
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
      replaceAll: (next) => {
        setPersisted({
          version: 1,
          settings: { ...defaultSettings, ...next.settings },
          receipts: next.receipts,
        });
        setDraft(null);
      },
    };
  }, [persisted, draft, status, folder]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
