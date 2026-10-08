import type { Category, PayCadence, PlanCadence, PlanItem, Receipt } from "../types";
import { daysBetween, money, parseISODate } from "./money";

export type SpendBucket = "food" | "clothes" | "gas" | "other";

export const BUCKETS: { id: SpendBucket; label: string; color: string }[] = [
  { id: "food", label: "Food", color: "#12a86a" },
  { id: "clothes", label: "Clothes", color: "#ff4d8d" },
  { id: "gas", label: "Gas", color: "#ef8a00" },
  { id: "other", label: "Other", color: "#1d7ef2" },
];

export function spendBucket(category: Category): SpendBucket {
  if (category === "groceries" || category === "food-court") return "food";
  if (category === "clothing") return "clothes";
  if (category === "gas") return "gas";
  return "other";
}

export function itemKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface FoodHistory {
  key: string;
  name: string;
  tripCount: number;
  typicalQuantity: number;
  latestUnitPrice: number;
  firstUnitPrice: number;
  risePercent: number;
}

function median(values: number[]): number {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return money(raw) || 1;
}

export function discoverFoods(receipts: Receipt[]): FoodHistory[] {
  const sorted = [...receipts].sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt) || a.createdAt.localeCompare(b.createdAt));
  const groups = new Map<
    string,
    { name: string; trips: Set<string>; quantities: number[]; prices: { unit: number }[] }
  >();

  for (const receipt of sorted) {
    const seen = new Set<string>();
    for (const item of receipt.items) {
      if (item.category !== "groceries") continue;
      const key = itemKey(item.description);
      if (!key) continue;
      const quantity = item.quantity > 0 ? item.quantity : 1;
      const unit = item.unitPrice && item.unitPrice > 0 ? item.unitPrice : item.amount / quantity;
      if (!Number.isFinite(unit) || unit < 0) continue;
      const group = groups.get(key) ?? { name: item.description.trim(), trips: new Set<string>(), quantities: [], prices: [] };
      group.name = item.description.trim() || group.name;
      group.quantities.push(quantity);
      group.prices.push({ unit: money(unit) });
      if (!seen.has(key)) group.trips.add(receipt.id);
      seen.add(key);
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const firstUnitPrice = group.prices[0]?.unit ?? 0;
      const latestUnitPrice = group.prices[group.prices.length - 1]?.unit ?? 0;
      return {
        key,
        name: group.name,
        tripCount: group.trips.size,
        typicalQuantity: median(group.quantities),
        latestUnitPrice,
        firstUnitPrice,
        risePercent: firstUnitPrice > 0 ? (latestUnitPrice - firstUnitPrice) / firstUnitPrice : 0,
      };
    })
    .sort((a, b) => b.tripCount - a.tripCount || b.latestUnitPrice * b.typicalQuantity - a.latestUnitPrice * a.typicalQuantity);
}

export interface PlanLine {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number;
  risePercent: number;
  custom: boolean;
  lineTotal: number;
}

function toLine(food: FoodHistory, quantity: number, custom = false): PlanLine {
  const safeQuantity = quantity > 0 ? quantity : 1;
  return {
    key: food.key,
    name: food.name,
    quantity: safeQuantity,
    unitPrice: food.latestUnitPrice,
    risePercent: food.risePercent,
    custom,
    lineTotal: money(safeQuantity * food.latestUnitPrice),
  };
}

export function resolvePlan(receipts: Receipt[], saved: PlanItem[]): { lines: PlanLine[]; suggestions: FoodHistory[] } {
  const foods = discoverFoods(receipts);
  const known = new Map(foods.map((food) => [food.key, food]));
  if (!saved.length) {
    const lines = foods.filter((food) => (receipts.length < 2 ? true : food.tripCount >= 2)).map((food) => toLine(food, food.typicalQuantity));
    const suggestions = receipts.length < 2 ? [] : foods.filter((food) => food.tripCount < 2);
    return { lines, suggestions };
  }

  const lines = saved
    .filter((item) => item.necessary)
    .map((item) => {
      const history = known.get(item.key);
      const quantity = item.quantity > 0 ? item.quantity : 1;
      const unitPrice = item.price && item.price > 0 ? item.price : history?.latestUnitPrice ?? 0;
      return {
        key: item.key,
        name: item.name || history?.name || "Item",
        quantity,
        unitPrice: money(unitPrice),
        risePercent: item.price && item.price > 0 ? 0 : history?.risePercent ?? 0,
        custom: Boolean(item.custom),
        lineTotal: money(quantity * unitPrice),
      };
    });
  const onPlan = new Set(lines.map((line) => line.key));
  return {
    lines,
    suggestions: foods.filter((food) => !onPlan.has(food.key) && !saved.some((item) => item.key === food.key && !item.necessary)),
  };
}

export function snapshotPlan(lines: PlanLine[], dismissed: { key: string; name: string }[]): PlanItem[] {
  return [
    ...lines.map((line) => ({
      key: line.key,
      name: line.name,
      quantity: line.quantity,
      necessary: true,
      price: line.custom ? line.unitPrice : undefined,
      custom: line.custom || undefined,
    })),
    ...dismissed.map((item) => ({
      key: item.key,
      name: item.name,
      quantity: 1,
      necessary: false,
    })),
  ];
}

export function tripRhythm(receipts: Receipt[]): { tripCount: number; averageDays: number | null; suggestion: PlanCadence } {
  const dates = [...receipts].map((receipt) => receipt.purchasedAt).filter(Boolean).sort();
  if (dates.length < 2) return { tripCount: dates.length, averageDays: null, suggestion: "biweekly" };
  let gap = 0;
  for (let index = 1; index < dates.length; index += 1) {
    gap += Math.max(0, daysBetween(parseISODate(dates[index - 1]), parseISODate(dates[index])));
  }
  const averageDays = Math.max(1, Math.round(gap / (dates.length - 1)));
  return { tripCount: dates.length, averageDays, suggestion: averageDays <= 10 ? "weekly" : "biweekly" };
}

export function averageGas(receipts: Receipt[]): number {
  if (!receipts.length) return 0;
  const total = receipts.reduce(
    (sum, receipt) => sum + receipt.items.filter((item) => item.category === "gas").reduce((inner, item) => inner + item.amount, 0),
    0,
  );
  return money(total / receipts.length);
}

export function foodPlanTotal(lines: PlanLine[]): number {
  return money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
}

export function riseCost(lines: PlanLine[], foods: FoodHistory[]): number {
  let rise = 0;
  for (const line of lines) {
    if (line.custom) continue;
    const food = foods.find((entry) => entry.key === line.key);
    if (!food || food.risePercent <= 0) continue;
    rise += line.quantity * (food.latestUnitPrice - food.firstUnitPrice);
  }
  return money(rise);
}

export function payForPlan(payAmount: number, payCadence: PayCadence, planCadence: PlanCadence): number {
  if (payAmount <= 0) return 0;
  const payDays = payCadence === "weekly" ? 7 : payCadence === "biweekly" ? 14 : 30;
  const planDays = planCadence === "weekly" ? 7 : 14;
  return money(payAmount * (planDays / payDays));
}

export interface MonthSpend {
  key: string;
  label: string;
  food: number;
  clothes: number;
  gas: number;
  other: number;
  total: number;
}

export function monthlySpend(receipts: Receipt[]): MonthSpend[] {
  const rows = new Map<string, MonthSpend>();
  for (const receipt of receipts) {
    const key = receipt.purchasedAt.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    let row = rows.get(key);
    if (!row) {
      const label = parseISODate(`${key}-01`).toLocaleDateString("en-US", { month: "short" });
      row = { key, label, food: 0, clothes: 0, gas: 0, other: 0, total: 0 };
      rows.set(key, row);
    }
    for (const item of receipt.items) {
      const bucket = spendBucket(item.category);
      row[bucket] = money(row[bucket] + item.amount);
      row.total = money(row.total + item.amount);
    }
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function bucketTotals(receipts: Receipt[]): Record<SpendBucket, number> {
  const totals: Record<SpendBucket, number> = { food: 0, clothes: 0, gas: 0, other: 0 };
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const bucket = spendBucket(item.category);
      totals[bucket] = money(totals[bucket] + item.amount);
    }
  }
  return totals;
}

export function gallonsOf(item: { category: Category; description: string; quantity: number; unitPrice?: number; amount: number }): {
  gallons: number;
  perGallon: number;
} | null {
  if (item.category !== "gas") return null;
  if (item.quantity > 0 && item.unitPrice && item.unitPrice > 0 && item.quantity !== 1) {
    return { gallons: item.quantity, perGallon: item.unitPrice };
  }
  const gallons = item.description.match(/(\d+(?:\.\d+)?)\s*gal/i);
  const price = item.description.match(/@\s*\$?(\d+\.\d{2,3})/);
  if (gallons && price) return { gallons: Number(gallons[1]), perGallon: Number(price[1]) };
  return null;
}

export function gasPumpSavings(receipts: Receipt[], nearbyPrice: number): {
  spent: number;
  gallons: number;
  saved: number | null;
  costcoPrice: number | null;
} {
  let spent = 0;
  let gallons = 0;
  let weighted = 0;
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      if (item.category !== "gas") continue;
      spent += item.amount;
      const parsed = gallonsOf(item);
      if (!parsed) continue;
      gallons += parsed.gallons;
      weighted += parsed.gallons * parsed.perGallon;
    }
  }
  const costcoPrice = gallons > 0 ? money(weighted / gallons) : null;
  const saved = nearbyPrice > 0 && costcoPrice !== null ? money(gallons * (nearbyPrice - costcoPrice)) : null;
  return { spent: money(spent), gallons: money(gallons), saved, costcoPrice };
}

export function tripAgainstPlan(receipt: Receipt, lines: PlanLine[]): number {
  const keys = new Set(lines.map((line) => line.key));
  let spent = 0;
  for (const item of receipt.items) {
    if (item.category === "gas" || keys.has(itemKey(item.description))) spent += item.amount;
  }
  return money(spent);
}
