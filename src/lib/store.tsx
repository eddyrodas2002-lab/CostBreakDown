import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Draft, Receipt, Settings } from "../types";
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

interface StoreValue {
  settings: Settings;
  receipts: Receipt[];
  draft: Draft | null;
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
  const [persisted, setPersisted] = useState<Persisted>(loadPersisted);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [persisted]);

  const value = useMemo<StoreValue>(() => {
    return {
      settings: persisted.settings,
      receipts: persisted.receipts,
      draft,
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
  }, [persisted, draft]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
