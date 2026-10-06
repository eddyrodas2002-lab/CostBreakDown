import { describe, expect, it } from "vitest";
import { parseReceipt } from "./parseReceipt";
import { buildSampleText } from "./sampleReceipt";
import { lineSum } from "./money";

describe("parseReceipt", () => {
  it("breaks a Costco receipt into categorized items", () => {
    const parsed = parseReceipt(buildSampleText("2026-01-15"), "2026-10-05");
    expect(parsed.purchasedAt).toBe("2026-01-15");
    expect(parsed.warehouse).toBe("Seattle, WA");
    expect(parsed.subtotal).toBe(170.7);
    expect(parsed.tax).toBe(8.65);
    expect(parsed.total).toBe(179.35);
    expect(parsed.items).toHaveLength(11);
    expect(lineSum(parsed.items)).toBe(170.7);

    const byName = Object.fromEntries(parsed.items.map((item) => [item.description, item]));
    expect(byName["KS ORG EGGS 24CT"].category).toBe("groceries");
    expect(byName["KS ORG EGGS 24CT"].amount).toBe(8.79);
    expect(byName.BANANAS.category).toBe("groceries");
    expect(byName["ROTISSERIE CHICKEN"].category).toBe("groceries");
    expect(byName["KS ORGANIC MILK"].category).toBe("groceries");
    expect(byName["SLICED CHEDDAR"].category).toBe("groceries");
    expect(byName["KIRKLAND PAPER TOWELS"].category).toBe("household");
    expect(byName["KIRKLAND PAPER TOWELS"].amount).toBe(21.99);
    expect(byName["KS VITAMIN D"].category).toBe("health");
    expect(byName["KS DOG FOOD"].category).toBe("pet");
    expect(byName["CABERNET WINE"].category).toBe("alcohol");
    expect(byName["FUEL UNLEADED"].category).toBe("gas");
    expect(byName["FUEL UNLEADED"].executiveEligible).toBe(false);
    expect(byName["FUEL UNLEADED"].visaRate).toBe(0.05);
    expect(byName["PIZZA SLICE"].category).toBe("food-court");
    expect(byName["PIZZA SLICE"].executiveEligible).toBe(false);
    expect(byName["KS ORG EGGS 24CT"].executiveEligible).toBe(true);
    expect(byName["KS ORG EGGS 24CT"].visaRate).toBe(0.02);
  });

  it("reads a price printed under the item and keeps the extended total", () => {
    const parsed = parseReceipt(`A 2487912 PAPER TOWELS
2 @ 21.99
43.98`);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].description).toBe("PAPER TOWELS");
    expect(parsed.items[0].quantity).toBe(2);
    expect(parsed.items[0].amount).toBe(43.98);
    expect(parsed.items[0].category).toBe("household");
  });

  it("treats tax-exempt leftovers as groceries when the receipt charges tax on other items", () => {
    const parsed = parseReceipt(`E 111111 KIRKLAND SIGNATURE 9.99
A 222222 HDMI CABLE 14.99`);
    expect(parsed.items[0].category).toBe("groceries");
    expect(parsed.items[1].category).toBe("other");
  });
});
