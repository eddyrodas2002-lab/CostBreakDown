import { useMemo, useState } from "react";
import { SpendCharts } from "../components/SpendCharts";
import { formatMoney, money, uid } from "../lib/money";
import {
  averageGas,
  bucketTotals,
  discoverFoods,
  foodPlanTotal,
  gasPumpSavings,
  itemKey,
  monthlySpend,
  payForPlan,
  resolvePlan,
  riseCost,
  snapshotPlan,
  tripAgainstPlan,
  tripRhythm,
  type PlanLine,
} from "../lib/plan";
import { summarize } from "../lib/savings";
import { useStore } from "../lib/store";
import type { PayCadence, PlanCadence } from "../types";

export function PlanScreen() {
  const { receipts, settings, updateSettings } = useStore();
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newPrice, setNewPrice] = useState(0);
  const foods = useMemo(() => discoverFoods(receipts), [receipts]);
  const resolved = useMemo(() => resolvePlan(receipts, settings.necessary), [receipts, settings.necessary]);
  const rhythm = useMemo(() => tripRhythm(receipts), [receipts]);
  const gasEachTrip = averageGas(receipts);
  const foodTotal = foodPlanTotal(resolved.lines);
  const budget = money(foodTotal + gasEachTrip);
  const higherPrices = riseCost(resolved.lines, foods);
  const paycheck = payForPlan(settings.payAmount, settings.payCadence, settings.planCadence);
  const gas = gasPumpSavings(receipts, settings.nearbyGasPrice);
  const gasReward = summarize(
    receipts.flatMap((receipt) => receipt.items.filter((item) => item.category === "gas")),
    settings,
    true,
  ).visa;
  const latest = [...receipts].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt.localeCompare(a.createdAt))[0];
  const latestSpend = latest && (resolved.lines.length || gasEachTrip > 0) ? tripAgainstPlan(latest, resolved.lines) : null;
  const overBy = latestSpend === null ? 0 : money(latestSpend - budget);
  const cadenceLabel = settings.planCadence === "weekly" ? "every week" : "every 2 weeks";

  function dismissed(): { key: string; name: string }[] {
    return settings.necessary.filter((item) => !item.necessary).map((item) => ({ key: item.key, name: item.name }));
  }

  function saveLines(lines: PlanLine[], extraDismissed?: { key: string; name: string }) {
    const hidden = dismissed().filter((item) => !lines.some((line) => line.key === item.key));
    const nextHidden = extraDismissed ? [...hidden.filter((item) => item.key !== extraDismissed.key), extraDismissed] : hidden;
    updateSettings({ necessary: snapshotPlan(lines, nextHidden) });
  }

  function changeQuantity(key: string, quantity: number) {
    saveLines(
      resolved.lines.map((line) =>
        line.key === key ? { ...line, quantity: quantity > 0 ? quantity : 1, lineTotal: money((quantity > 0 ? quantity : 1) * line.unitPrice) } : line,
      ),
    );
  }

  function addFood(food: { key: string; name: string; typicalQuantity: number; latestUnitPrice: number; risePercent: number }) {
    saveLines([
      ...resolved.lines,
      {
        key: food.key,
        name: food.name,
        quantity: food.typicalQuantity,
        unitPrice: food.latestUnitPrice,
        risePercent: food.risePercent,
        custom: false,
        lineTotal: money(food.typicalQuantity * food.latestUnitPrice),
      },
    ]);
  }

  return (
    <div className="stack">
      <section className="hero">
        <p className="sticker">{rhythm.averageDays ? `About every ${rhythm.averageDays} days` : "Your list"}</p>
        <h2>Before you go</h2>
        <p className="hero-value">{formatMoney(budget)}</p>
        <p className="hero-sub">
          Food you usually buy, plus gas, {cadenceLabel}.
          {rhythm.tripCount > 1 ? ` That’s ${rhythm.tripCount} trips so far.` : " Add another trip and this gets sharper."}
        </p>
        <div className="segment" role="radiogroup" aria-label="How often to plan">
          <CadenceButton current={settings.planCadence} value="weekly" onPick={(planCadence) => updateSettings({ planCadence })}>
            Every week
          </CadenceButton>
          <CadenceButton current={settings.planCadence} value="biweekly" onPick={(planCadence) => updateSettings({ planCadence })}>
            Every 2 weeks
          </CadenceButton>
        </div>
        {rhythm.averageDays !== null && rhythm.suggestion !== settings.planCadence && (
          <p className="help">Your trips look closer to {rhythm.suggestion === "weekly" ? "every week" : "every 2 weeks"}.</p>
        )}
      </section>

      {latestSpend !== null && (
        <p className={overBy > 0.5 ? "banner warn" : "banner"}>
          {overBy > 0.5
            ? `The last trip was ${formatMoney(overBy)} over this list. The usual foods and gas came to ${formatMoney(latestSpend)}.`
            : `The last trip stayed within the list. Usual foods and gas were ${formatMoney(latestSpend)}.`}
        </p>
      )}

      <SpendCharts months={monthlySpend(receipts)} totals={bucketTotals(receipts)} />

      <section className="panel">
        <h2>The list</h2>
        <p className="help">
          These are the foods that keep showing up. The prices are the latest ones on your receipts
          {higherPrices > 0 ? `, which is ${formatMoney(higherPrices)} more than the older prices` : ""}. Change a quantity or take something off.
        </p>
        {resolved.lines.length === 0 ? (
          <p className="help">Save a grocery receipt and the repeat items land here. You can also add one yourself.</p>
        ) : (
          <ul className="plan-list">
            {resolved.lines.map((line) => (
              <li key={line.key}>
                <div>
                  <strong>{line.name}</strong>
                  <small>
                    {formatMoney(line.unitPrice)} each
                    {line.risePercent >= 0.03 ? ` · up ${Math.round(line.risePercent * 100)}%` : ""}
                  </small>
                </div>
                <label>
                  Qty
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={line.quantity}
                    onChange={(event) => changeQuantity(line.key, Number(event.target.value))}
                  />
                </label>
                <strong>{formatMoney(line.lineTotal)}</strong>
                <button type="button" className="btn btn-danger slim" onClick={() => saveLines(resolved.lines.filter((entry) => entry.key !== line.key), { key: line.key, name: line.name })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {resolved.suggestions.length > 0 && (
          <div className="chip-row suggest-row">
            {resolved.suggestions.map((food) => (
              <button type="button" key={food.key} className="btn btn-ghost slim" onClick={() => addFood(food)}>
                Add {food.name}
              </button>
            ))}
          </div>
        )}
        <form
          className="add-plan"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (!name || newPrice <= 0) return;
            const key = `custom ${itemKey(name)} ${uid().slice(0, 8)}`;
            saveLines([
              ...resolved.lines,
              {
                key,
                name,
                quantity: newQty > 0 ? newQty : 1,
                unitPrice: money(newPrice),
                risePercent: 0,
                custom: true,
                lineTotal: money((newQty > 0 ? newQty : 1) * newPrice),
              },
            ]);
            setNewName("");
            setNewQty(1);
            setNewPrice(0);
          }}
        >
          <label>
            Add to the list
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Oat milk" />
          </label>
          <label>
            Qty
            <input type="number" min="0.1" step="0.1" value={newQty} onChange={(event) => setNewQty(Number(event.target.value))} />
          </label>
          <label>
            Price
            <input type="number" min="0" step="0.01" value={newPrice} onChange={(event) => setNewPrice(Number(event.target.value))} />
          </label>
          <button type="submit" className="btn btn-sun">
            Add
          </button>
        </form>
        {settings.necessary.length > 0 && (
          <button type="button" className="text-button" onClick={() => updateSettings({ necessary: [] })}>
            Go back to the foods I buy most
          </button>
        )}
      </section>

      <section className="panel">
        <h2>Each trip</h2>
        <div className="stat-grid">
          <div>
            <span>Food on the list</span>
            <strong>{formatMoney(foodTotal)}</strong>
          </div>
          <div>
            <span>Gas</span>
            <strong>{formatMoney(gasEachTrip)}</strong>
          </div>
          <div>
            <span>Trip budget</span>
            <strong>{formatMoney(budget)}</strong>
          </div>
        </div>
        <p className="help">Gas sits with the trip, not in the food list. It’s the average from your receipts.</p>
      </section>

      <section className="panel">
        <h2>Gas savings</h2>
        <p className="help">
          You’ve spent {formatMoney(gas.spent)} on Costco gas
          {settings.costcoVisa ? `, and the Visa paid back ${formatMoney(gasReward)}` : ""}.
          {gas.gallons > 0 && gas.costcoPrice !== null ? ` That’s ${gas.gallons} gallons at about ${formatMoney(gas.costcoPrice)}.` : " Add the gallons as the quantity on a gas line to compare pumps."}
        </p>
        <label>
          Price per gallon at another station
          <input
            type="number"
            min="0"
            step="0.01"
            value={settings.nearbyGasPrice || ""}
            placeholder="4.89"
            onChange={(event) => updateSettings({ nearbyGasPrice: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>
        {gas.saved !== null && (
          <p className={gas.saved >= 0 ? "banner" : "banner warn"}>
            {gas.saved >= 0
              ? `Costco gas has saved you ${formatMoney(gas.saved)} versus that other price.`
              : `That other price is lower, by ${formatMoney(Math.abs(gas.saved))}.`}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Your pay</h2>
        <p className="help">The trip budget is set against one paycheck, stretched to the same length as the plan.</p>
        <div className="form-grid">
          <label>
            Paycheck
            <input
              type="number"
              min="0"
              step="1"
              value={settings.payAmount || ""}
              placeholder="1800"
              onChange={(event) => updateSettings({ payAmount: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          <label>
            How often
            <select
              value={settings.payCadence}
              onChange={(event) => updateSettings({ payCadence: event.target.value as PayCadence })}
            >
              <option value="weekly">Every week</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Every month</option>
            </select>
          </label>
        </div>
        {paycheck > 0 && (
          <div className="tile-grid">
            <article className="tile tile-sun">
              <p>Pay for this plan</p>
              <strong>{formatMoney(paycheck)}</strong>
              <span>{cadenceLabel}</span>
            </article>
            <article className={paycheck - budget >= 0 ? "tile tile-leaf" : "tile"}>
              <p>{paycheck - budget >= 0 ? "Left after Costco" : "Over your pay"}</p>
              <strong>{formatMoney(Math.abs(paycheck - budget))}</strong>
              <span>{paycheck - budget >= 0 ? "still yours to save" : "the plan costs more than this pay stretch"}</span>
            </article>
          </div>
        )}
      </section>
    </div>
  );
}

function CadenceButton({
  current,
  value,
  onPick,
  children,
}: {
  current: PlanCadence;
  value: PlanCadence;
  onPick: (value: PlanCadence) => void;
  children: string;
}) {
  return (
    <button type="button" className={current === value ? "segment-btn on" : "segment-btn"} role="radio" aria-checked={current === value} onClick={() => onPick(value)}>
      {children}
    </button>
  );
}
