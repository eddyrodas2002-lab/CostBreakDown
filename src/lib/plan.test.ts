import { describe, expect, it } from "vitest";
import { averageGas, bucketTotals, discoverFoods, gasPumpSavings, payForPlan, resolvePlan, tripAgainstPlan, tripRhythm } from "./plan";
import type { LineItem, Receipt } from "../types";

function item(partial: Partial<LineItem> & Pick<LineItem, "description" | "amount" | "category">): LineItem {
  return {
    id: partial.id ?? partial.description,
    description: partial.description,
    quantity: partial.quantity ?? 1,
    unitPrice: partial.unitPrice,
    amount: partial.amount,
    category: partial.category,
    executiveEligible: partial.category !== "gas",
    visaRate: partial.category === "gas" ? 0.05 : 0.02,
  };
}

function trip(id: string, date: string, items: LineItem[]): Receipt {
  return {
    id,
    purchasedAt: date,
    warehouse: "Costco",
    items,
    tax: 0,
    total: items.reduce((sum, entry) => sum + entry.amount, 0),
    createdAt: `${date}T12:00:00.000Z`,
  };
}

const trips = [
  trip("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-09-01", [
    item({ description: "KS ORG EGGS", amount: 8, category: "groceries" }),
    item({ description: "MILK", amount: 4, category: "groceries" }),
    item({ description: "FUEL", amount: 40, quantity: 10, unitPrice: 4, category: "gas" }),
  ]),
  trip("bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-09-15", [
    item({ description: "KS ORG EGGS", amount: 10, category: "groceries" }),
    item({ description: "JEANS", amount: 16, category: "clothing" }),
    item({ description: "FUEL", amount: 45, quantity: 10, unitPrice: 4.5, category: "gas" }),
  ]),
];

describe("plan", () => {
  it("treats repeat groceries as the necessary list and keeps one-off foods as suggestions", () => {
    const foods = discoverFoods(trips);
    const eggs = foods.find((food) => food.key === "ks org eggs");
    expect(eggs?.tripCount).toBe(2);
    expect(eggs?.latestUnitPrice).toBe(10);
    expect(eggs?.risePercent).toBeCloseTo(0.25);

    const plan = resolvePlan(trips, []);
    expect(plan.lines.map((line) => line.name)).toEqual(["KS ORG EGGS"]);
    expect(plan.suggestions.map((food) => food.name)).toEqual(["MILK"]);
    expect(plan.lines[0].lineTotal).toBe(10);
  });

  it("keeps an edited list, including removals", () => {
    const plan = resolvePlan(trips, [
      { key: "milk", name: "MILK", quantity: 2, necessary: true },
      { key: "ks org eggs", name: "KS ORG EGGS", quantity: 1, necessary: false },
    ]);
    expect(plan.lines.map((line) => line.name)).toEqual(["MILK"]);
    expect(plan.lines[0].lineTotal).toBe(8);
    expect(plan.suggestions.map((food) => food.key)).not.toContain("ks org eggs");
  });

  it("measures how often you go and the usual gas stop", () => {
    expect(tripRhythm(trips)).toMatchObject({ tripCount: 2, averageDays: 14, suggestion: "biweekly" });
    expect(averageGas(trips)).toBe(42.5);
    expect(tripRhythm([trips[0]]).averageDays).toBeNull();
  });

  it("splits spending into food, clothes, gas, and everything else", () => {
    expect(bucketTotals(trips)).toEqual({ food: 22, clothes: 16, gas: 85, other: 0 });
  });

  it("counts gas savings against the other station and pay for the plan length", () => {
    const gas = gasPumpSavings(trips, 5);
    expect(gas.gallons).toBe(20);
    expect(gas.costcoPrice).toBe(4.25);
    expect(gas.saved).toBe(15);
    expect(payForPlan(2000, "biweekly", "weekly")).toBe(1000);
  });

  it("compares a trip with the food list plus gas", () => {
    const { lines } = resolvePlan(trips, []);
    expect(tripAgainstPlan(trips[1], lines)).toBe(55);
  });
});
