import { useState } from "react";
import { OriginalReceipt } from "../components/OriginalReceipt";
import { CATEGORIES, categoryMeta } from "../lib/categories";
import { formatMoney, formatPrettyDate, lineSum, money } from "../lib/money";
import { summarize } from "../lib/savings";
import { useStore } from "../lib/store";

export function TripScreen({
  id,
  onEdit,
  onDeleted,
}: {
  id: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { receipts, settings, deleteReceipt, attachOriginal } = useStore();
  const [attachError, setAttachError] = useState("");
  const receipt = receipts.find((entry) => entry.id === id);
  if (!receipt) {
    return (
      <section className="panel">
        <h2>That trip isn’t here</h2>
        <p className="help">It may have been deleted from this browser.</p>
      </section>
    );
  }

  const rewards = summarize(receipt.items, settings, false);
  const groups = CATEGORIES.map((category) => ({
    ...category,
    items: receipt.items.filter((item) => item.category === category.id),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="stack">
      <section className="hero slim">
        <p className="sticker">{receipt.sample ? "Sample trip" : "Trip breakdown"}</p>
        <h2>{formatPrettyDate(receipt.purchasedAt)}</h2>
        <p className="hero-sub">{receipt.warehouse}</p>
        <div className="tile-grid">
          <article className="tile tile-sun">
            <p>You paid</p>
            <strong>{formatMoney(receipt.total)}</strong>
            <span>Tax {formatMoney(receipt.tax)}</span>
          </article>
          <article className="tile tile-leaf">
            <p>This trip pays back</p>
            <strong>{formatMoney(rewards.total)}</strong>
            <span>Groceries {formatMoney(rewards.groceryRewards)}</span>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>Original file</h2>
        {receipt.sourceFile ? (
          <>
            <p className="help">{receipt.sourceFile}</p>
            <OriginalReceipt src={`/api/receipt-file/${receipt.id}`} fileName={receipt.sourceFile} />
          </>
        ) : (
          <>
            <p className="help">
              This receipt was saved before its PDF was kept. Add the original file to check these items against it.
            </p>
            <label className="btn btn-sun">
              Add the PDF or photo
              <input
                type="file"
                accept="application/pdf,image/*,.pdf"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setAttachError("");
                  void attachOriginal(receipt.id, file).catch((caught: unknown) => {
                    setAttachError(caught instanceof Error ? caught.message : "That file could not be saved.");
                  });
                }}
              />
            </label>
            {attachError && <p className="banner warn">{attachError}</p>}
          </>
        )}
      </section>

      <article className="receipt-paper">
        <header>
          <strong>Costco</strong>
          <span>{receipt.items.length} items · merchandise {formatMoney(lineSum(receipt.items))}</span>
        </header>
        {groups.map((group) => {
          const spent = money(group.items.reduce((sum, item) => sum + item.amount, 0));
          return (
            <section key={group.id}>
              <h3 style={{ color: group.color }}>
                {group.emoji} {group.label}
                <span>{formatMoney(spent)}</span>
              </h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <small>
                        {item.quantity !== 1 ? `${item.quantity} × ` : ""}
                        {item.itemNumber ? `#${item.itemNumber}` : categoryMeta(item.category).label}
                        {item.executiveEligible && settings.blackCard ? " · black card" : ""}
                        {item.visaRate > 0 && settings.costcoVisa
                          ? ` · Visa ${Math.round(item.visaRate * 100)}%`
                          : ""}
                      </small>
                    </div>
                    <strong>{formatMoney(item.amount)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <footer>
          <p>
            <span>Tax</span>
            <span>{formatMoney(receipt.tax)}</span>
          </p>
          <p className="receipt-total">
            <span>Total</span>
            <span>{formatMoney(receipt.total)}</span>
          </p>
          <p className="thanks">Black card {formatMoney(rewards.executive)} · Visa {formatMoney(rewards.visa)}</p>
        </footer>
      </article>

      <div className="action-row">
        <button type="button" className="btn btn-primary" onClick={onEdit}>
          Edit items
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm("Delete this receipt? It is removed from the receipt folder.")) {
              deleteReceipt(receipt.id);
              onDeleted();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
