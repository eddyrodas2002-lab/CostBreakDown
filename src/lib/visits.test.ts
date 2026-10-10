import { describe, expect, it } from "vitest";
import { categorize } from "./categories";
import { parseReceipt } from "./parseReceipt";
import type { Receipt } from "../types";
import { visitSnapshots } from "./visits";

function receipt(purchasedAt: string, amount: number, category: Receipt["items"][number]["category"] = "groceries"): Receipt {
  return {
    id: `receipt-${purchasedAt}`,
    purchasedAt,
    warehouse: "Costco",
    tax: 0,
    total: amount,
    createdAt: `${purchasedAt}T00:00:00.000Z`,
    items: [
      {
        id: `item-${purchasedAt}`,
        description: category === "gas" ? "PUMP 4" : "EGGS",
        quantity: 1,
        amount,
        category,
        executiveEligible: category !== "gas",
        visaRate: category === "gas" ? 0.05 : 0.02,
      },
    ],
  };
}

describe("fuel words", () => {
  it("reads pump and gallons as gas", () => {
    expect(categorize("PUMP 12")).toBe("gas");
    expect(categorize("15.2 GALLONS")).toBe("gas");
    expect(categorize("13.456 GAL")).toBe("gas");
    expect(categorize("PUMPKIN SEEDS")).not.toBe("gas");
  });

  it("keeps a pump line and the gallons that follow it as one fuel item", () => {
    const parsed = parseReceipt(`PUMP 12
13.456 GAL @ 3.459
46.55`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].category).toBe("gas");
    expect(parsed.items[0].description).toBe("PUMP 12");
    expect(parsed.items[0].quantity).toBe(13.456);
    expect(parsed.items[0].amount).toBe(46.55);
    expect(parsed.items[0].executiveEligible).toBe(false);
    expect(parsed.items[0].visaRate).toBe(0.05);
  });
});

describe("visit windows", () => {
  const today = new Date(2026, 9, 9);

  it("counts trips and tells whether spending rose", () => {
    const receipts = [
      receipt("2026-10-06", 20),
      receipt("2026-10-02", 10),
      receipt("2026-09-08", 40, "gas"),
      receipt("2025-10-04", 15),
    ];
    const windows = Object.fromEntries(visitSnapshots(receipts, today).map((window) => [window.id, window]));

    expect(windows.week.trips).toBe(1);
    expect(windows.week.spent).toBe(20);
    expect(windows.week.previousTrips).toBe(1);
    expect(windows.week.previousSpent).toBe(10);
    expect(windows.week.direction).toBe("up");
    expect(windows.week.change).toBe(10);

    expect(windows.twoWeeks.trips).toBe(2);
    expect(windows.month.trips).toBe(2);
    expect(windows.month.spent).toBe(30);
    expect(windows.month.previousTrips).toBe(1);
    expect(windows.month.previousSpent).toBe(40);
    expect(windows.month.direction).toBe("down");

    expect(windows.ytd.trips).toBe(3);
    expect(windows.ytd.previousTrips).toBe(1);
    expect(windows.ytd.previousSpent).toBe(15);
    expect(windows.ytd.direction).toBe("up");

    const gas = Object.fromEntries(visitSnapshots(receipts, today, "gas").map((window) => [window.id, window]));
    expect(gas.month.trips).toBe(0);
    expect(gas.half.trips).toBe(1);
    expect(gas.half.spent).toBe(40);
  });
});
