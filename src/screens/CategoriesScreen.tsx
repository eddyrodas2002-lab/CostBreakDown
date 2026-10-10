import { useEffect, useMemo, useState } from "react";
import { TripCard } from "../components/TripCard";
import { categoryMeta } from "../lib/categories";
import { formatMoney } from "../lib/money";
import { buildYearSummary, categoryRows, summarizeReceipts } from "../lib/savings";
import { useStore } from "../lib/store";
import { visitSnapshots, type VisitSnapshot, type VisitWindow } from "../lib/visits";
import type { Category } from "../types";

function trendCopy(snapshot: VisitSnapshot): string {
  const trips = `${snapshot.trips} ${snapshot.trips === 1 ? "trip" : "trips"}`;
  if (snapshot.spent === 0 && snapshot.previousSpent === 0) {
    return `${trips}. None in ${snapshot.previousLabel}.`;
  }
  if (snapshot.direction === "flat") return `${trips}. Same spending as ${snapshot.previousLabel}.`;
  const way = snapshot.direction === "up" ? "Up" : "Down";
  const amount = formatMoney(Math.abs(snapshot.change));
  const percent =
    snapshot.previousSpent > 0 ? ` · ${Math.round((Math.abs(snapshot.change) / snapshot.previousSpent) * 100)}%` : "";
  return `${trips}. ${way} ${amount}${percent} from ${snapshot.previousLabel}.`;
}

export function CategoriesScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { receipts, settings, reload } = useStore();
  useEffect(() => {
    void reload();
  }, [reload]);
  const [scope, setScope] = useState<"year" | "all">("year");
  const [selected, setSelected] = useState<Category | null>(null);
  const [windowId, setWindowId] = useState<VisitWindow>("month");
  const summary = useMemo(() => buildYearSummary(receipts, settings, new Date()), [receipts, settings]);
  const visible = useMemo(() => {
    if (scope === "all") return receipts;
    return receipts.filter((receipt) => receipt.purchasedAt.startsWith(String(summary.year)));
  }, [receipts, scope, summary.year]);
  const rewards = scope === "year" ? summary.actual : summarizeReceipts(visible, settings);
  const rows = scope === "year" ? summary.byCategory : categoryRows(visible.flatMap((receipt) => receipt.items));
  const spent = scope === "year" ? summary.spent : visible.reduce((sum, receipt) => sum + receipt.total, 0);
  const today = useMemo(() => new Date(), []);
  const visits = useMemo(() => visitSnapshots(receipts, today, selected), [receipts, today, selected]);
  const activeVisit = visits.find((visit) => visit.id === windowId) ?? visits[0];
  const peak = Math.max(...activeVisit.bars.map((bar) => bar.amount), 1);
  const barColor = selected ? categoryMeta(selected).color : "#e31b3c";
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

      <section className="panel">
        <p className="sticker">{selected ? categoryMeta(selected).label : "All categories"}</p>
        <h2>How often you go</h2>
        <p className="help">{trendCopy(activeVisit)}</p>
        <div className="visit-strip" role="group" aria-label="Time span">
          {visits.map((visit) => (
            <button
              key={visit.id}
              type="button"
              className={visit.id === activeVisit.id ? "visit-chip on" : "visit-chip"}
              aria-pressed={visit.id === activeVisit.id}
              onClick={() => setWindowId(visit.id)}
            >
              <span>{visit.label}</span>
              <strong>{visit.trips}</strong>
              <small>{formatMoney(visit.spent)}</small>
            </button>
          ))}
        </div>
        <p className="help">{activeVisit.hint}</p>
        {activeVisit.bars.every((bar) => bar.amount <= 0) ? (
          <p className="help">No spending in this stretch yet.</p>
        ) : (
          <div
            className="spend-chart"
            role="img"
            aria-label={activeVisit.bars.map((bar) => `${bar.label} ${formatMoney(bar.amount)}`).join(", ")}
          >
            {activeVisit.bars.map((bar) => (
              <div className="spend-col" key={bar.key}>
                <div className="spend-stack" style={{ height: `${Math.max(bar.amount > 0 ? 8 : 0, (bar.amount / peak) * 100)}%` }}>
                  {bar.amount > 0 ? <span style={{ flexGrow: 1, background: barColor }} /> : null}
                </div>
                <small>{bar.label}</small>
              </div>
            ))}
          </div>
        )}
      </section>

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
