import { useMemo, useState } from "react";
import { TripCard } from "../components/TripCard";
import { categoryMeta } from "../lib/categories";
import { formatMoney } from "../lib/money";
import { buildYearSummary, categoryRows, summarizeReceipts } from "../lib/savings";
import { useStore } from "../lib/store";
import type { Category } from "../types";

export function CategoriesScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { receipts, settings } = useStore();
  const [scope, setScope] = useState<"year" | "all">("year");
  const [selected, setSelected] = useState<Category | null>(null);
  const summary = useMemo(() => buildYearSummary(receipts, settings, new Date()), [receipts, settings]);
  const visible = useMemo(() => {
    if (scope === "all") return receipts;
    return receipts.filter((receipt) => receipt.purchasedAt.startsWith(String(summary.year)));
  }, [receipts, scope, summary.year]);
  const rewards = scope === "year" ? summary.actual : summarizeReceipts(visible, settings);
  const rows = scope === "year" ? summary.byCategory : categoryRows(visible.flatMap((receipt) => receipt.items));
  const spent = scope === "year" ? summary.spent : visible.reduce((sum, receipt) => sum + receipt.total, 0);
  const listed = visible
    .filter((receipt) => (selected ? receipt.items.some((item) => item.category === selected) : true))
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

  return (
    <div className="stack">
      <div className="segment" role="radiogroup" aria-label="Which receipts to include">
        <button type="button" className={scope === "year" ? "segment-btn on" : "segment-btn"} onClick={() => setScope("year")}>
          This year
        </button>
        <button type="button" className={scope === "all" ? "segment-btn on" : "segment-btn"} onClick={() => setScope("all")}>
          All trips
        </button>
      </div>

      <section className="panel whole">
        <p className="sticker">The whole cart</p>
        <h2>{scope === "year" ? summary.year : "Everything saved"}</h2>
        <div className="stat-grid">
          <div>
            <span>Trips</span>
            <strong>{visible.length}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{formatMoney(spent)}</strong>
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
            <span>All rewards</span>
            <strong>{formatMoney(rewards.total)}</strong>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="panel">
          <h2>No categories yet</h2>
          <p className="help">Add a receipt and each item lands in a category, from groceries to gas.</p>
        </section>
      ) : (
        <ul className="bars selectable">
          {rows.map((row) => {
            const meta = categoryMeta(row.category);
            const active = selected === row.category;
            return (
              <li key={row.category}>
                <button
                  type="button"
                  className={active ? "bar-button active" : "bar-button"}
                  aria-pressed={active}
                  onClick={() => setSelected(active ? null : row.category)}
                >
                  <div className="bar-label">
                    <span>
                      {meta.emoji} {meta.label}
                    </span>
                    <strong>
                      {formatMoney(row.spent)} · {Math.round(row.share * 100)}%
                    </strong>
                  </div>
                  <div className="bar-track" aria-hidden="true">
                    <span style={{ width: `${Math.max(6, row.share * 100)}%`, background: meta.color }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section className="stack">
        <h2>{selected ? `${categoryMeta(selected).label} trips` : "Every trip in this view"}</h2>
        {listed.length === 0 ? (
          <p className="help">No trips in this view yet.</p>
        ) : (
          listed.map((receipt) => (
            <TripCard key={receipt.id} receipt={receipt} settings={settings} onOpen={() => onOpen(receipt.id)} />
          ))
        )}
      </section>
    </div>
  );
}
