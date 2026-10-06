import { categoryMeta } from "../lib/categories";
import { formatMoney, formatPrettyDate, money } from "../lib/money";
import { receiptSpent, summarize } from "../lib/savings";
import type { Receipt, Settings } from "../types";

export function TripCard({
  receipt,
  settings,
  onOpen,
}: {
  receipt: Receipt;
  settings: Settings;
  onOpen: () => void;
}) {
  const rewards = summarize(receipt.items, settings, false);
  const grocery = money(
    receipt.items.filter((item) => item.category === "groceries").reduce((sum, item) => sum + item.amount, 0),
  );
  const categories = [...new Set(receipt.items.map((item) => item.category))].slice(0, 4);

  return (
    <button type="button" className="trip-card" onClick={onOpen}>
      <div className="trip-top">
        <div>
          <strong>{formatPrettyDate(receipt.purchasedAt)}</strong>
          <p>
            {receipt.warehouse}
            {receipt.sample ? " · Sample" : ""}
          </p>
        </div>
        <strong className="trip-total">{formatMoney(receiptSpent(receipt))}</strong>
      </div>
      <p className="trip-meta">
        Groceries {formatMoney(grocery)} · Rewards {formatMoney(rewards.total)}
      </p>
      <div className="chip-row">
        {categories.map((id) => {
          const meta = categoryMeta(id);
          return (
            <span key={id} className="chip" style={{ background: meta.soft, color: meta.color }}>
              {meta.emoji} {meta.label}
            </span>
          );
        })}
      </div>
    </button>
  );
}
