import { useMemo } from "react";
import { PacePicker } from "../components/PacePicker";
import { ToggleRow } from "../components/ToggleRow";
import { TripCard } from "../components/TripCard";
import { categoryMeta } from "../lib/categories";
import { formatMoney, formatPrettyDate } from "../lib/money";
import { buildYearSummary, PACE_HELP } from "../lib/savings";
import { useStore } from "../lib/store";

export function HomeScreen({
  onOpen,
  onAdd,
  onSample,
  onPlan,
}: {
  onOpen: (id: string) => void;
  onAdd: () => void;
  onSample: () => void;
  onPlan: () => void;
}) {
  const { receipts, settings, updateSettings } = useStore();
  const summary = useMemo(() => buildYearSummary(receipts, settings, new Date()), [receipts, settings]);
  const recent = [...receipts].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const programs = [settings.blackCard ? "Black card" : "", settings.costcoVisa ? "Costco Visa" : ""].filter(Boolean).join(" + ");

  if (summary.tripCount === 0 && receipts.length === 0) {
    return (
      <section className="empty-home">
        <div className="receipt-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="sticker">Costco, decoded</p>
        <h2>See what each trip puts back in your pocket.</h2>
        <p className="lede">
          Upload a receipt and CostBreak sorts the cart, totals your groceries, and estimates the black card’s 2% plus the Costco Visa.
        </p>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            Add your first receipt
          </button>
          <button type="button" className="btn btn-sun" onClick={onSample}>
            Try a sample receipt
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="home-grid">
      <div className="stack">
        {summary.tripCount === 0 && (
          <p className="banner">You have older trips saved. This home screen follows {summary.year}.</p>
        )}
        <section className="hero" aria-labelledby="year-end-heading">
          <p className="sticker">{summary.early ? "Early estimate" : summary.year}</p>
          <h2 id="year-end-heading">Expected back by Dec 31</h2>
          <p className="hero-value" aria-live="polite">
            {formatMoney(summary.projected.total)}
          </p>
          <p className="hero-sub">
            {programs ? `${programs}. ` : "Both reward programs are off. "}
            Already earned {formatMoney(summary.actual.total)} in {summary.year}.
          </p>
          <PacePicker value={settings.pace} onChange={(pace) => updateSettings({ pace })} />
          <p className="help">{PACE_HELP[settings.pace]}</p>
          {summary.early && settings.pace === "auto" && (
            <p className="help">Quiet days count as no shopping. Choose Weekly if a Costco run is a regular habit.</p>
          )}
        </section>

        <div className="tile-grid">
          <article className="tile tile-leaf">
            <p>Grocery rewards so far</p>
            <strong>{formatMoney(summary.actual.groceryRewards)}</strong>
            <span>on {formatMoney(summary.actual.grocerySpend)} of groceries</span>
          </article>
          <article className="tile tile-sky">
            <p>Groceries by Dec 31</p>
            <strong>{formatMoney(summary.projected.groceryRewards)}</strong>
            <span>if this pace keeps going</span>
          </article>
        </div>

        <button type="button" className="btn btn-sun wide" onClick={onPlan}>
          Open the pre-Costco plan
        </button>

        <section className="panel">
          <h2>What’s counting</h2>
          <p className="help">These switches match Settings. Groceries earn 2% from each one you turn on, so both together is 4%.</p>
          <ToggleRow
            on={settings.blackCard}
            title="Black card"
            detail="Executive membership, 2% back"
            onChange={(blackCard) => updateSettings({ blackCard })}
          />
          <ToggleRow
            on={settings.costcoVisa}
            title="Costco Visa"
            detail="2% at the warehouse, 5% on Costco gas"
            onChange={(costcoVisa) => updateSettings({ costcoVisa })}
          />
          <div className="split">
            <div>
              <span>Black card this year</span>
              <strong>{formatMoney(summary.projected.executive)}</strong>
              <small>
                {formatMoney(summary.actual.executive)} earned · cap {formatMoney(1250)}
              </small>
            </div>
            <div>
              <span>Visa this year</span>
              <strong>{formatMoney(summary.projected.visa)}</strong>
              <small>{formatMoney(summary.actual.visa)} earned</small>
            </div>
          </div>
          {summary.actual.executiveCapped && <p className="banner">The black card is at its $1,250 yearly maximum.</p>}
        </section>
      </div>

      <div className="stack">
        <section className="panel">
          <div className="panel-head">
            <h2>This year, by category</h2>
          </div>
          {summary.byCategory.length === 0 ? (
            <p className="help">Categories show up after you add a {summary.year} receipt.</p>
          ) : (
            <ul className="bars">
              {summary.byCategory.map((row) => {
                const meta = categoryMeta(row.category);
                return (
                  <li key={row.category}>
                    <div className="bar-label">
                      <span>
                        {meta.emoji} {meta.label}
                      </span>
                      <strong>{formatMoney(row.spent)}</strong>
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <span style={{ width: `${Math.max(6, row.share * 100)}%`, background: meta.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Recent trips</h2>
          </div>
          {summary.firstDate && (
            <p className="help">
              Pace starts {formatPrettyDate(summary.firstDate)}. You’ve paid {formatMoney(summary.spent)} across {summary.tripCount}{" "}
              {summary.tripCount === 1 ? "trip" : "trips"} in {summary.year}.
            </p>
          )}
          <div className="stack">
            {recent.map((receipt) => (
              <TripCard key={receipt.id} receipt={receipt} settings={settings} onOpen={() => onOpen(receipt.id)} />
            ))}
          </div>
          <button type="button" className="btn btn-sun wide" onClick={onAdd}>
            Add another receipt
          </button>
        </section>

        <details className="panel how">
          <summary>How these numbers are counted</summary>
          <p>
            The black card is Costco’s Executive 2% reward on merchandise before tax. Gas, the food court, fees, and taxes are left out. It stops at $1,250 a year.
          </p>
          <p>
            The Costco Anywhere Visa adds 2% on warehouse purchases and 5% on gas at Costco, up to $7,000 of gas. The two stack, so groceries can come back at 4%.
          </p>
          <p>The Dec 31 number keeps your current pace going through the end of the year. It is an estimate from the receipts saved here.</p>
        </details>
      </div>
    </div>
  );
}
