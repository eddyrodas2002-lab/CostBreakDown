import { useEffect, useState } from "react";
import { OriginalReceipt } from "../components/OriginalReceipt";
import { CATEGORIES, makeItem } from "../lib/categories";
import { formatMoney, lineSum, money, todayISO } from "../lib/money";
import { receiptKind } from "../lib/pdfText";
import { draftFromParsed, parseReceipt } from "../lib/parseReceipt";
import { readReceiptFile } from "../lib/readReceipt";
import { holdSourceFile, peekSourceFile } from "../lib/sourceFile";
import { summarize } from "../lib/savings";
import { useStore } from "../lib/store";
import type { Draft, LineItem } from "../types";

export function NewReceiptScreen({ onSaved, onSample }: { onSaved: (id: string) => void; onSample: () => void }) {
  const { draft, setDraft, beginManual } = useStore();
  if (!draft) {
    return <Picker onParsed={(next) => setDraft(next)} onManual={beginManual} onSample={onSample} />;
  }
  return (
    <Editor
      key={`${draft.editingId ?? "new"}-${draft.rawText.length}-${draft.items.length}`}
      draft={draft}
      onSaved={onSaved}
    />
  );
}

function Picker({
  onParsed,
  onManual,
  onSample,
}: {
  onParsed: (draft: Draft) => void;
  onManual: () => void;
  onSample: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Reading your receipt");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function readFile(file: File) {
    setError("");
    setReading(true);
    setProgress(0.04);
    setLabel(receiptKind(file) === "pdf" ? "Opening the PDF" : "Opening your photo");
    try {
      const text = await readReceiptFile(file, (value, nextLabel) => {
        setProgress(value);
        setLabel(nextLabel);
      });
      if (!text.trim()) {
        setError("We couldn’t find any words in that file. Try a clearer photo, or paste the text.");
        return;
      }
      const sourceKey = await holdSourceFile(file);
      onParsed(
        draftFromParsed(parseReceipt(text), {
          sourceKey: sourceKey ?? undefined,
          sourceName: sourceKey ? file.name : undefined,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That file couldn’t be read. Paste the text instead.");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="stack">
      <section className={dragOver ? "dropzone hot" : "dropzone"}>
        <p className="step">1</p>
        <h2>Photo or PDF</h2>
        <p>Use a photo of the slip, or a PDF from your email. JPG, PNG, and PDF all work.</p>
        <label className="btn btn-primary">
          {reading ? "Reading…" : "Choose a photo or PDF"}
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            hidden
            disabled={reading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readFile(file);
            }}
          />
        </label>
        <div
          className="drop-target"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void readFile(file);
          }}
        >
          Or drop a photo or PDF here
        </div>
        {reading && (
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
            <small>{label}</small>
          </div>
        )}
      </section>

      <section className="panel">
        <p className="step">2</p>
        <h2>Paste the receipt text</h2>
        <textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          placeholder={"KS ORG EGGS 8.79\nPAPER TOWELS 21.99\nTOTAL 30.78"}
          rows={6}
        />
        <button
          type="button"
          className="btn btn-sun"
          onClick={() => {
            if (!paste.trim()) {
              setError("Paste the receipt first.");
              return;
            }
            setError("");
            onParsed(draftFromParsed(parseReceipt(paste)));
          }}
        >
          Break down this text
        </button>
      </section>

      <section className="panel">
        <p className="step">3</p>
        <h2>Type it yourself</h2>
        <p className="help">Handy when a photo or PDF is hard to read.</p>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onManual}>
            Add items by hand
          </button>
          <button type="button" className="btn btn-ghost" onClick={onSample}>
            Try a sample receipt
          </button>
        </div>
      </section>
      {error && <p className="banner warn">{error}</p>}
    </div>
  );
}

function Editor({ draft, onSaved }: { draft: Draft; onSaved: (id: string) => void }) {
  const { settings, saveDraft } = useStore();
  const [purchasedAt, setPurchasedAt] = useState(draft.purchasedAt || todayISO());
  const [warehouse, setWarehouse] = useState(draft.warehouse || "Costco");
  const [items, setItems] = useState<LineItem[]>(draft.items);
  const [tax, setTax] = useState(draft.tax || 0);
  const [total, setTotal] = useState(draft.total || 0);
  const [rawText, setRawText] = useState(draft.rawText);
  const [showRaw, setShowRaw] = useState(draft.items.length === 0);
  const [detectedSubtotal, setDetectedSubtotal] = useState(draft.detectedSubtotal);
  const [error, setError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  useEffect(() => {
    const held = peekSourceFile(draft.sourceKey);
    if (!held) return;
    const url = URL.createObjectURL(new Blob([held.bytes], { type: held.type }));
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.sourceKey]);

  const sum = lineSum(items);
  const rewards = summarize(items, settings, false);
  const mismatch =
    detectedSubtotal !== undefined && Math.abs(money(detectedSubtotal) - sum) > 0.05;

  function updateItem(id: string, patch: Partial<LineItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? makeItem({ ...item, ...patch, id: item.id }) : item)),
    );
  }

  function reread() {
    const parsed = parseReceipt(rawText, purchasedAt);
    setItems(parsed.items);
    if (parsed.tax !== undefined) setTax(parsed.tax);
    if (parsed.total !== undefined) setTotal(parsed.total);
    if (parsed.warehouse !== "Costco") setWarehouse(parsed.warehouse);
    setPurchasedAt(parsed.purchasedAt);
    setDetectedSubtotal(parsed.subtotal);
    setError(parsed.items.length ? "" : "No prices showed up in that text. Add the items below.");
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const id = saveDraft({
          purchasedAt,
          warehouse,
          items,
          tax,
          total,
          rawText,
          sample: draft.sample,
          editingId: draft.editingId,
          sourceKey: draft.sourceKey,
          detectedSubtotal,
        });
        if (!id) {
          setError("Add at least one item with a name or a price.");
          return;
        }
        onSaved(id);
      }}
    >
      {draft.sample && <p className="banner">This is an example trip. Save it to explore, or delete it later.</p>}
      {sourceUrl && draft.sourceName && (
        <section className="panel">
          <h2>Original file</h2>
          <p className="help">{draft.sourceName} stays with this receipt so you can check the items against it.</p>
          <OriginalReceipt src={sourceUrl} fileName={draft.sourceName} />
        </section>
      )}
      <section className="panel">
        <h2>Check the items</h2>
        <p className="help">Fix anything that looks wrong. Categories and rewards update as you edit.</p>
        <div className="form-grid">
          <label>
            Date
            <input type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} required />
          </label>
          <label>
            Warehouse
            <input value={warehouse} onChange={(event) => setWarehouse(event.target.value)} />
          </label>
          <label>
            Tax
            <input
              inputMode="decimal"
              type="number"
              step="0.01"
              value={tax}
              onChange={(event) => setTax(Number(event.target.value))}
            />
          </label>
          <label>
            Total paid
            <input
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              value={total}
              onChange={(event) => setTotal(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      {mismatch && (
        <p className="banner warn">
          The lines add up to {formatMoney(sum)}, and the receipt says {formatMoney(detectedSubtotal ?? 0)} before tax. Fix any line that looks off.
        </p>
      )}
      {items.length === 0 && <p className="banner warn">No items yet. Add one, or paste the receipt text and read it again.</p>}

      <ul className="edit-list">
        {items.map((item, index) => (
          <li key={item.id} className="edit-item">
            <div className="edit-index">{index + 1}</div>
            <label>
              Item
              <input
                value={item.description}
                onChange={(event) => updateItem(item.id, { description: event.target.value })}
              />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                type="number"
                step="0.01"
                value={item.amount}
                onChange={(event) => updateItem(item.id, { amount: Number(event.target.value) })}
              />
            </label>
            <label>
              Category
              <select
                value={item.category}
                onChange={(event) => updateItem(item.id, { category: event.target.value as LineItem["category"] })}
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji} {category.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-danger slim" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-sun"
        onClick={() =>
          setItems((current) => [...current, makeItem({ description: "", amount: 0, category: "groceries" })])
        }
      >
        Add an item
      </button>

      <section className="panel reward-preview">
        <h2>This trip</h2>
        <div className="stat-grid">
          <div>
            <span>Merchandise</span>
            <strong>{formatMoney(sum)}</strong>
          </div>
          <div>
            <span>Groceries</span>
            <strong>{formatMoney(rewards.grocerySpend)}</strong>
          </div>
          <div>
            <span>Grocery rewards</span>
            <strong>{formatMoney(rewards.groceryRewards)}</strong>
          </div>
          <div>
            <span>Black card</span>
            <strong>{formatMoney(rewards.executive)}</strong>
          </div>
          <div>
            <span>Visa</span>
            <strong>{formatMoney(rewards.visa)}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <button type="button" className="text-button" onClick={() => setShowRaw((open) => !open)}>
          {showRaw ? "Hide receipt text" : "Edit the text we read"}
        </button>
        {showRaw && (
          <>
            <textarea rows={8} value={rawText} onChange={(event) => setRawText(event.target.value)} />
            <button type="button" className="btn btn-ghost" onClick={reread}>
              Read this text again
            </button>
          </>
        )}
      </section>

      {error && <p className="banner warn">{error}</p>}
      <div className="save-bar">
        <div>
          <strong>{formatMoney(rewards.total)} back</strong>
          <small>on this trip, with your current settings</small>
        </div>
        <button type="submit" className="btn btn-primary">
          Save receipt
        </button>
      </div>
    </form>
  );
}
