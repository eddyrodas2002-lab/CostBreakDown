import {
  EXECUTIVE_CAP,
  EXECUTIVE_RATE,
  GAS_CAP,
  VISA_GAS_AFTER_CAP_RATE,
  VISA_GAS_RATE,
} from "./categories";
import { daysBetween, daysUntilYearEnd, money, parseISODate } from "./money";
import type {
  Category,
  CategorySpend,
  LineItem,
  Pace,
  Receipt,
  RewardBreakdown,
  Settings,
  YearSummary,
} from "../types";
import { CATEGORIES } from "./categories";

const EMPTY: RewardBreakdown = {
  executive: 0,
  visa: 0,
  total: 0,
  groceryRewards: 0,
  grocerySpend: 0,
  merchandise: 0,
  gasSpend: 0,
  executiveBase: 0,
  executiveCapped: false,
  gasCapped: false,
};

export function summarize(items: LineItem[], settings: Settings, applyCaps: boolean): RewardBreakdown {
  let executiveBase = 0;
  let grocerySpend = 0;
  let groceryExecBase = 0;
  let groceryVisaBase = 0;
  let gasForVisa = 0;
  let merchForVisa = 0;
  let merchandise = 0;

  for (const item of items) {
    const amount = Number(item.amount) || 0;
    merchandise += amount;
    if (item.category === "groceries") grocerySpend += amount;
    if (item.executiveEligible) executiveBase += amount;
    if (item.category === "groceries" && item.executiveEligible) groceryExecBase += amount;
    if (item.visaRate >= VISA_GAS_RATE && item.category === "gas") gasForVisa += amount;
    else if (item.visaRate > 0) merchForVisa += amount;
    if (item.category === "groceries" && item.visaRate > 0) groceryVisaBase += amount;
  }

  merchandise = money(merchandise);
  grocerySpend = money(grocerySpend);
  executiveBase = money(executiveBase);
  groceryExecBase = money(groceryExecBase);
  groceryVisaBase = money(groceryVisaBase);
  gasForVisa = money(gasForVisa);
  merchForVisa = money(merchForVisa);

  const uncappedExec = Math.max(0, executiveBase) * EXECUTIVE_RATE;
  const executive = settings.blackCard
    ? money(applyCaps ? Math.min(EXECUTIVE_CAP, uncappedExec) : uncappedExec)
    : 0;
  const execScale = settings.blackCard && uncappedExec > 0 ? executive / uncappedExec : 0;

  let visa = 0;
  let gasCapped = false;
  if (settings.costcoVisa) {
    const positiveGas = Math.max(0, gasForVisa);
    if (applyCaps && positiveGas > GAS_CAP) {
      gasCapped = true;
      visa += GAS_CAP * VISA_GAS_RATE + (positiveGas - GAS_CAP) * VISA_GAS_AFTER_CAP_RATE;
    } else {
      visa += positiveGas * VISA_GAS_RATE;
    }
    visa += Math.max(0, merchForVisa) * 0.02;
    visa = money(visa);
  }

  const groceryExec = Math.max(0, groceryExecBase) * EXECUTIVE_RATE * execScale;
  const groceryVisa = settings.costcoVisa ? Math.max(0, groceryVisaBase) * 0.02 : 0;

  return {
    executive,
    visa,
    total: money(executive + visa),
    groceryRewards: money(groceryExec + groceryVisa),
    grocerySpend: Math.max(0, grocerySpend),
    merchandise,
    gasSpend: Math.max(0, gasForVisa),
    executiveBase: Math.max(0, executiveBase),
    executiveCapped: Boolean(settings.blackCard && applyCaps && uncappedExec > EXECUTIVE_CAP),
    gasCapped,
  };
}

function scaleItems(items: LineItem[], factor: number): LineItem[] {
  if (factor === 1) return items;
  return items.map((item) => ({ ...item, amount: item.amount * factor }));
}

function paceFactor(pace: Pace, tripCount: number, daysCovered: number, daysRemaining: number): number {
  if (tripCount <= 0) return 1;
  if (pace === "auto") {
    if (daysCovered <= 0) return 1;
    return (daysCovered + daysRemaining) / daysCovered;
  }
  const interval = pace === "weekly" ? 7 : pace === "biweekly" ? 14 : 30;
  const remainingTrips = daysRemaining / interval;
  return (tripCount + remainingTrips) / tripCount;
}

export function buildYearSummary(receipts: Receipt[], settings: Settings, today: Date): YearSummary {
  const year = today.getFullYear();
  const inYear = receipts
    .filter((receipt) => receipt.purchasedAt.startsWith(String(year)))
    .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
  const olderTripCount = receipts.length - inYear.length;
  const items = inYear.flatMap((receipt) => receipt.items);
  const actual = items.length ? summarize(items, settings, true) : { ...EMPTY };
  const daysRemaining = daysUntilYearEnd(today);
  const spent = money(inYear.reduce((sum, receipt) => sum + (Number(receipt.total) || 0), 0));

  let daysCovered = 0;
  let firstDate: string | undefined;
  let projected = actual;
  if (inYear.length) {
    firstDate = inYear[0].purchasedAt;
    const first = parseISODate(firstDate);
    daysCovered = Math.max(1, daysBetween(first, today) + 1);
    const factor = paceFactor(settings.pace, inYear.length, daysCovered, daysRemaining);
    projected = summarize(scaleItems(items, factor), settings, true);
  }

  const byCategory = categoryRows(items);

  return {
    year,
    tripCount: inYear.length,
    olderTripCount,
    spent,
    daysCovered,
    daysRemaining,
    early: inYear.length > 0 && (inYear.length < 3 || daysCovered < 21),
    firstDate,
    actual,
    projected,
    byCategory,
  };
}

export function categoryRows(items: LineItem[]): CategorySpend[] {
  const totals = new Map<Category, number>();
  for (const item of items) totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
  const positive = [...totals.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
  return CATEGORIES.map((category) => {
    const spent = money(totals.get(category.id) ?? 0);
    return {
      category: category.id,
      spent,
      share: positive > 0 ? Math.max(0, spent) / positive : 0,
    };
  })
    .filter((row) => row.spent !== 0)
    .sort((a, b) => b.spent - a.spent);
}

export function summarizeReceipts(receipts: Receipt[], settings: Settings): RewardBreakdown {
  const groups = new Map<string, LineItem[]>();
  for (const receipt of receipts) {
    const year = receipt.purchasedAt.slice(0, 4) || "unknown";
    const list = groups.get(year) ?? [];
    list.push(...receipt.items);
    groups.set(year, list);
  }
  const totals: RewardBreakdown = { ...EMPTY };
  for (const items of groups.values()) {
    const part = summarize(items, settings, true);
    totals.executive = money(totals.executive + part.executive);
    totals.visa = money(totals.visa + part.visa);
    totals.total = money(totals.total + part.total);
    totals.groceryRewards = money(totals.groceryRewards + part.groceryRewards);
    totals.grocerySpend = money(totals.grocerySpend + part.grocerySpend);
    totals.merchandise = money(totals.merchandise + part.merchandise);
    totals.gasSpend = money(totals.gasSpend + part.gasSpend);
    totals.executiveBase = money(totals.executiveBase + part.executiveBase);
    totals.executiveCapped = totals.executiveCapped || part.executiveCapped;
    totals.gasCapped = totals.gasCapped || part.gasCapped;
  }
  return totals;
}

export function receiptSpent(receipt: Receipt): number {
  if (Number.isFinite(receipt.total) && receipt.total > 0) return money(receipt.total);
  const lines = receipt.items.reduce((sum, item) => sum + item.amount, 0);
  return money(lines + (receipt.tax || 0));
}

export const PACE_HELP: Record<Pace, string> = {
  auto: "Keeps spending the way you have since your first trip this year.",
  weekly: "Repeats your average trip once a week through December.",
  biweekly: "Repeats your average trip every two weeks through December.",
  monthly: "Repeats your average trip once a month through December.",
};
