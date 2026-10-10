import { useMemo, useState } from "react";
import { categoryMeta } from "../lib/categories";
import { formatMoney, formatPrettyDate } from "../lib/money";
import { useStore } from "../lib/store";
import type { Receipt } from "../types";

type DateOrder = "newest" | "oldest";

export function TripsScreen({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
  const { receipts, deleteReceipt, folder, files } = useStore();
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<DateOrder>("newest");
  const [year, setYear] = useState("all");

  const years = useMemo(() => {
    const found = new Set(
      receipts.map((receipt) => receipt.purchasedAt.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)),
    );
    return [...found].sort((a, b) => b.localeCompare(a));
  }, [receipts]);

  const activeYear = year === "all" || years.includes(year) ? year : "all";

  const trips = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const direction = order === "oldest" ? 1 : -1;
    return receipts
      .filter((receipt) => activeYear === "all" || receipt.purchasedAt.startsWith(`${activeYear}-`))
      .filter((receipt) => {
        if (!needle) return true;
        const haystack = [receipt.warehouse, receipt.purchasedAt, ...receipt.items.map((item) => item.description)]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const byDate = a.purchasedAt.localeCompare(b.purchasedAt);
        if (byDate !== 0) return byDate * direction;
        return a.createdAt.localeCompare(b.createdAt) * direction;
      });
  }, [receipts, query, order, activeYear]);

  const orderedFiles = useMemo(() => {
    const direction = order === "oldest" ? 1 : -1;
    return [...files].sort((a, b) => a.localeCompare(b) * direction);
  }, [files, order]);

  function remove(receipt: Receipt) {
    const when = formatPrettyDate(receipt.purchasedAt);
    if (!window.confirm(`Delete the ${when} receipt? It is removed from the receipt folder.`)) return;
    deleteReceipt(receipt.id);
  }

  return (
    <div className="stack">
      {receipts.length > 0 && (
      <section className="panel receipt-tools">
        <div className="segment" role="group" aria-label="Sort by date">
          <button type="button" className={order === "newest" ? "segment-btn on" : "segment-btn"} onClick={() => setOrder("newest")}>
            Newest first
          </button>
          <button type="button" className={order === "oldest" ? "segment-btn on" : "segment-btn"} onClick={() => setOrder("oldest")}>
            Oldest first
          </button>
        </div>
        <label>
          Year
          <select value={activeYear} onChange={(event) => setYear(event.target.value)}>
            <option value="all">All years</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="search">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Eggs, gas, Seattle…" />
        </label>
        {receipts.length > 0 && (
          <p className="help">
            {trips.length} of {receipts.length} saved · {order === "newest" ? "newest first" : "oldest first"}
          </p>
        )}
      </section>
      )}

      <section className="panel">
        <h2>Files in the receipt folder</h2>
        <code className="code-path">{folder}</code>
        {files.length === 0 ? (
          <p className="help">Saved receipts show up here as files. A PDF or photo is stored next to its receipt.</p>
        ) : (
          <ul className="folder-files">
            {orderedFiles.map((name) => {
              const match = receipts.find((receipt) => name.includes(receipt.id));
              return (
                <li key={name}>
                  {match ? (
                    <button type="button" className="text-button" onClick={() => onOpen(match.id)}>
                      {name}
                    </button>
                  ) : (
                    name
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {receipts.length === 0 ? (
        <section className="panel empty-panel">
          <h2>No receipts saved</h2>
          <p>Each receipt you save is listed here by date, with the items, tax, and total that were stored.</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            Add a receipt
          </button>
        </section>
      ) : trips.length === 0 ? (
        <section className="panel">
          <h2>Nothing in this filter</h2>
          <p className="help">Try another year, or clear the search.</p>
        </section>
      ) : (
        trips.map((receipt) => (
          <article key={receipt.id} className="receipt-row">
            <div className="trip-top">
              <div>
                <strong>{formatPrettyDate(receipt.purchasedAt)}</strong>
                <p>
                  {receipt.warehouse}
                  {receipt.sample ? " · Sample" : ""}
                </p>
              </div>
              <strong className="trip-total">{formatMoney(receipt.total)}</strong>
            </div>
            <p className="trip-meta">
              Tax {formatMoney(receipt.tax)} · {receipt.items.length} {receipt.items.length === 1 ? "item" : "items"}
              {receipt.sourceFile ? ` · ${receipt.sourceFile}` : ""}
            </p>
            <details className="saved-details">
              <summary>Saved items</summary>
              {receipt.items.length === 0 ? (
                <p className="help">No items were stored on this receipt.</p>
              ) : (
                <ul className="saved-lines">
                  {receipt.items.map((item) => {
                    const meta = categoryMeta(item.category);
                    return (
                      <li key={item.id}>
                        <div>
                          <strong>{item.description || "Untitled item"}</strong>
                          <small>
                            {item.quantity} × {item.unitPrice != null ? `${formatMoney(item.unitPrice)} · ` : ""}
                            {meta.emoji} {meta.label}
                            {item.itemNumber ? ` · #${item.itemNumber}` : ""}
                          </small>
                        </div>
                        <strong>{formatMoney(item.amount)}</strong>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
            <div className="action-row">
              <button type="button" className="btn btn-ghost slim" onClick={() => onOpen(receipt.id)}>
                Open breakdown
              </button>
              <button type="button" className="btn btn-danger slim" onClick={() => remove(receipt)}>
                Delete
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
