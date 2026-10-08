import { describe, expect, it } from "vitest";
import { makeItem } from "./categories";
import { parseReceipt } from "./parseReceipt";
import { buildSampleText } from "./sampleReceipt";
import { buildYearSummary, summarize } from "./savings";
import { daysUntilYearEnd, money } from "./money";
import type { LineItem, Receipt, Settings } from "../types";

const both: Settings = {
  blackCard: true,
  costcoVisa: true,
  pace: "auto",
  payAmount: 0,
  payCadence: "biweekly",
  planCadence: "biweekly",
  nearbyGasPrice: 0,
  necessary: [],
};

function item(description: string, amount: number): LineItem {
  return makeItem({
    description,
    amount,
    category: description === "FUEL" ? "gas" : description === "PIZZA SLICE" ? "food-court" : "groceries",
  });
}

describe("summarize", () => {
  it("stacks 2% black card and 2% Visa on groceries, and skips gas and the food court for the black card", () => {
    const parsed = parseReceipt(buildSampleText("2026-01-15"));
    const result = summarize(parsed.items, both, true);
    expect(result.grocerySpend).toBe(37.05);
    expect(result.groceryRewards).toBe(1.48);
    expect(result.executive).toBe(2.47);
    expect(result.visa).toBe(4.77);
    expect(result.total).toBe(7.24);
    expect(result.executiveCapped).toBe(false);
  });

  it("turns each program off independently", () => {
    const eggs = [item("EGGS", 100)];
    expect(summarize(eggs, { ...both, costcoVisa: false }, true)).toMatchObject({
      executive: 2,
      visa: 0,
      groceryRewards: 2,
      total: 2,
    });
    expect(summarize(eggs, { ...both, blackCard: false }, true)).toMatchObject({
      executive: 0,
      visa: 2,
      groceryRewards: 2,
      total: 2,
    });
    expect(summarize(eggs, { ...both, blackCard: false, costcoVisa: false }, true).total).toBe(0);
  });

  it("caps the black card at $1,250 and Costco gas at $7,000", () => {
    const huge = summarize([item("EGGS", 100000)], both, true);
    expect(huge.executive).toBe(1250);
    expect(huge.visa).toBe(2000);
    expect(huge.groceryRewards).toBe(3250);
    expect(huge.executiveCapped).toBe(true);

    const gas = summarize([makeItem({ description: "FUEL UNLEADED", amount: 8000, category: "gas" })], both, true);
    expect(gas.executive).toBe(0);
    expect(gas.visa).toBe(360);
    expect(gas.gasCapped).toBe(true);

    const slice = summarize([makeItem({ description: "PIZZA SLICE", amount: 10, category: "food-court" })], both, true);
    expect(slice.executive).toBe(0);
    expect(slice.visa).toBe(0.2);
    expect(slice.groceryRewards).toBe(0);
  });
});

describe("buildYearSummary", () => {
  const parsed = parseReceipt(buildSampleText("2026-10-01"));
  const receipt: Receipt = {
    id: "trip",
    purchasedAt: "2026-10-01",
    warehouse: parsed.warehouse,
    items: parsed.items,
    tax: parsed.tax ?? 0,
    total: parsed.total ?? 0,
    createdAt: "2026-10-01",
  };

  it("projects the rest of the year from the pace of trips already saved", () => {
    const today = new Date(2026, 9, 5);
    const summary = buildYearSummary([receipt], both, today);
    const factor = (summary.daysCovered + summary.daysRemaining) / summary.daysCovered;
    expect(summary.daysCovered).toBe(5);
    expect(summary.daysRemaining).toBe(daysUntilYearEnd(today));
    expect(summary.early).toBe(true);
    expect(summary.actual.total).toBe(7.24);
    expect(Math.abs(summary.projected.grocerySpend - money(37.05 * factor))).toBeLessThanOrEqual(0.01);
  });

  it("uses a weekly shopping pace when that is selected", () => {
    const today = new Date(2026, 9, 5);
    const summary = buildYearSummary([receipt], { ...both, pace: "weekly" }, today);
    const factor = (1 + summary.daysRemaining / 7) / 1;
    expect(Math.abs(summary.projected.grocerySpend - money(37.05 * factor))).toBeLessThanOrEqual(0.01);
    expect(summary.projected.total).toBeGreaterThan(summary.actual.total);
  });

  it("stops projecting once the year is over", () => {
    const summary = buildYearSummary([receipt], { ...both, pace: "weekly" }, new Date(2026, 11, 31));
    expect(summary.daysRemaining).toBe(0);
    expect(summary.projected.total).toBe(summary.actual.total);
  });
});
