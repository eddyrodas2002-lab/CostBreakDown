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

  it("reads item names and prices when a pdf splits them apart", () => {
    const parsed = parseReceipt(`Kirkland Signature Organic Eggs, 24 Count
8.79
Kirkland Signature Paper Towels, 12 Rolls
21.99
Rotisserie Chicken
4.99
SUBTOTAL 35.77
TOTAL 35.77`);
    const byName = Object.fromEntries(parsed.items.map((item) => [item.description, item]));
    expect(byName["Kirkland Signature Organic Eggs, 24 Count"].category).toBe("groceries");
    expect(byName["Kirkland Signature Organic Eggs, 24 Count"].amount).toBe(8.79);
    expect(byName["Kirkland Signature Paper Towels, 12 Rolls"].category).toBe("household");
    expect(byName["Kirkland Signature Paper Towels, 12 Rolls"].amount).toBe(21.99);
    expect(byName["Rotisserie Chicken"].category).toBe("groceries");
    expect(byName["Rotisserie Chicken"].amount).toBe(4.99);
    expect(parsed.total).toBe(35.77);
    expect(parsed.items).toHaveLength(3);
  });

  it("pairs a column of names with the column of prices", () => {
    const parsed = parseReceipt(`Organic Eggs
Paper Towels
Vitamin D
8.79
21.99
14.49
TOTAL 45.27`);
    expect(parsed.items.map((item) => [item.description, item.amount, item.category])).toEqual([
      ["Organic Eggs", 8.79, "groceries"],
      ["Paper Towels", 21.99, "household"],
      ["Vitamin D", 14.49, "health"],
    ]);
  });

  it("reads a Costco warehouse receipt with wrapped item names", () => {
    const parsed = parseReceipt(`CARMEL MOUNTAIN #452
12350 CARMEL MOUNTAIN RD
SAN DIEGO, CA 92128
E 1446716 CHPTLECHICKN 11.99 N
E 164950 KS PEPPRCORN 6.89 N
SUBTOTAL 18.88
TAX 0.00
**** TOTAL 18.88
09/15/2026 20:14`);
    expect(parsed.purchasedAt).toBe("2026-09-15");
    expect(parsed.warehouse).toBe("Carmel Mountain, San Diego, CA");
    expect(parsed.total).toBe(18.88);
    expect(parsed.tax).toBe(0);
    expect(parsed.items.map((item) => [item.description, item.amount, item.category])).toEqual([
      ["Chipotle Chicken", 11.99, "groceries"],
      ["KS Peppercorn", 6.89, "groceries"],
    ]);
  });

  it("reads a Costco fuel invoice down to the pump, gallons, and grade", () => {
    const parsed = parseReceipt(`Poway #775
12155 TECH CENTER DR
POWAY, CA 92064
Date: 09/22/26
Pump Gallons Price
17 15.693 $6.059
Product Amount
Regular $95.08
Total Sale $95.08`);
    expect(parsed.purchasedAt).toBe("2026-09-22");
    expect(parsed.warehouse).toBe("Poway, CA");
    expect(parsed.total).toBe(95.08);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].description).toBe("Pump 17 Regular");
    expect(parsed.items[0].quantity).toBe(15.693);
    expect(parsed.items[0].amount).toBe(95.08);
    expect(parsed.items[0].category).toBe("gas");
    expect(parsed.items[0].executiveEligible).toBe(false);
    expect(parsed.items[0].visaRate).toBe(0.05);
  });

  it("reads the printed Costco myaccount warehouse receipt", () => {
    const parsed = parseReceipt(`Firefox https://www.costco.com/myaccount/
CARMEL MOUNTAIN #452
12350 CARMEL MOUNTAIN RD
SAN DIEGO, CA 92128
Member
E 1446716 CHPTLECHICKN 11.99 N
E 164950 KS PEPPRCORN 6.89 N
SUBTOTAL 18.88
TAX 0.00
**** TOTAL 18.88
XXXXXXXXXXXXX2178 CHIP read
APPROVED - PURCHASE
AMOUNT: $18.88
09/15/2026 20:14 452 203 335 703
COSTCO VISA 18.88
CHANGE 0
TOTAL TAX 0.00
TOTAL NUMBER OF ITEMS SOLD = 2
Thank You!
Please Come Again
Whse: 452 Trm: 203 Trn: 335 OPT: 703
Items Sold: 2
P7 09/15/2026 08:14
1 of 1 10/7/26, 6:26 PM`);
    expect(parsed.purchasedAt).toBe("2026-09-15");
    expect(parsed.warehouse).toBe("Carmel Mountain, San Diego, CA");
    expect(parsed.tax).toBe(0);
    expect(parsed.total).toBe(18.88);
    expect(parsed.items.map((item) => [item.description, item.amount, item.category])).toEqual([
      ["Chipotle Chicken", 11.99, "groceries"],
      ["KS Peppercorn", 6.89, "groceries"],
    ]);
  });

  it("ignores the printed page footer on a Costco myaccount PDF", () => {
    const parsed = parseReceipt(`Poway #775
POWAY, CA 92064
Date: 10/09/26
Pump Gallons Price
18 5.434 $6.259
Product Amount
Regular $34.01
Total Sale $34.01
1 of 1 10/9/26, 7:05 PM`);
    expect(parsed.purchasedAt).toBe("2026-10-09");
    expect(parsed.items.map((item) => item.description)).toEqual(["Pump 18 Regular"]);
    expect(parsed.items[0].amount).toBe(34.01);
  });

  it("treats tax-exempt leftovers as groceries when the receipt charges tax on other items", () => {
    const parsed = parseReceipt(`E 111111 KIRKLAND SIGNATURE 9.99
A 222222 HDMI CABLE 14.99`);
    expect(parsed.items[0].category).toBe("groceries");
    expect(parsed.items[1].category).toBe("other");
  });
});
