import type { Category, Receipt } from "../types";
import { daysBetween, money, parseISODate, todayISO } from "./money";

export type VisitWindow = "week" | "twoWeeks" | "month" | "quarter" | "half" | "year" | "ytd";

export interface SpendBar {
  key: string;
  label: string;
  amount: number;
}

export interface VisitSnapshot {
  id: VisitWindow;
  label: string;
  hint: string;
  previousLabel: string;
  trips: number;
  spent: number;
  previousTrips: number;
  previousSpent: number;
  change: number;
  direction: "up" | "down" | "flat";
  bars: SpendBar[];
}

const WINDOWS: { id: VisitWindow; label: string; hint: string; previousLabel: string }[] = [
  { id: "week", label: "Week", hint: "Since Monday", previousLabel: "the previous week" },
  { id: "twoWeeks", label: "2 weeks", hint: "Last 14 days", previousLabel: "the 14 days before" },
  { id: "month", label: "Month", hint: "Since the 1st", previousLabel: "the same days last month" },
  { id: "quarter", label: "Quarter", hint: "This quarter", previousLabel: "the same days last quarter" },
  { id: "half", label: "6 months", hint: "Last 6 months", previousLabel: "the 6 months before" },
  { id: "year", label: "Year", hint: "Last 365 days", previousLabel: "the year before" },
  { id: "ytd", label: "YTD", hint: "Since Jan 1", previousLabel: "the same dates last year" },
];

function day(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, count: number): Date {
  const next = day(date);
  next.setDate(next.getDate() + count);
  return next;
}

function clampDay(year: number, month: number, date: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date, last));
}

function mondayOf(date: Date): Date {
  const start = day(date);
  const weekday = start.getDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  return addDays(start, -delta);
}

function iso(date: Date): string {
  return todayISO(date);
}

interface Span {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}

function span(id: VisitWindow, today: Date): Span {
  const end = day(today);
  if (id === "week") {
    const start = mondayOf(end);
    return { start: iso(start), end: iso(end), previousStart: iso(addDays(start, -7)), previousEnd: iso(addDays(end, -7)) };
  }
  if (id === "twoWeeks") {
    const start = addDays(end, -13);
    return { start: iso(start), end: iso(end), previousStart: iso(addDays(start, -14)), previousEnd: iso(addDays(end, -14)) };
  }
  if (id === "month") {
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const previousStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const previousEnd = clampDay(previousStart.getFullYear(), previousStart.getMonth(), end.getDate());
    return { start: iso(start), end: iso(end), previousStart: iso(previousStart), previousEnd: iso(previousEnd) };
  }
  if (id === "quarter") {
    const quarterStart = Math.floor(end.getMonth() / 3) * 3;
    const start = new Date(end.getFullYear(), quarterStart, 1);
    const previousStart = new Date(end.getFullYear(), quarterStart - 3, 1);
    const previousEnd = addDays(previousStart, daysBetween(start, end));
    return { start: iso(start), end: iso(end), previousStart: iso(previousStart), previousEnd: iso(previousEnd) };
  }
  if (id === "half") {
    const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const previousStart = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const previousEnd = addDays(previousStart, daysBetween(start, end));
    return { start: iso(start), end: iso(end), previousStart: iso(previousStart), previousEnd: iso(previousEnd) };
  }
  if (id === "year") {
    const start = addDays(end, -364);
    return { start: iso(start), end: iso(end), previousStart: iso(addDays(start, -365)), previousEnd: iso(addDays(end, -365)) };
  }
  const start = new Date(end.getFullYear(), 0, 1);
  const previousEnd = clampDay(end.getFullYear() - 1, end.getMonth(), end.getDate());
  return {
    start: iso(start),
    end: iso(end),
    previousStart: iso(new Date(end.getFullYear() - 1, 0, 1)),
    previousEnd: iso(previousEnd),
  };
}

function spentOn(receipt: Receipt, category: Category | null): number {
  const items = category ? receipt.items.filter((item) => item.category === category) : receipt.items;
  return money(items.reduce((sum, item) => sum + item.amount, 0));
}

function inSpan(receipts: Receipt[], start: string, end: string, category: Category | null) {
  return receipts.filter((receipt) => {
    if (receipt.purchasedAt < start || receipt.purchasedAt > end) return false;
    if (!category) return true;
    return receipt.items.some((item) => item.category === category);
  });
}

function totalSpent(receipts: Receipt[], category: Category | null): number {
  return money(receipts.reduce((sum, receipt) => sum + spentOn(receipt, category), 0));
}

function barsFor(id: VisitWindow, startIso: string, endIso: string, receipts: Receipt[], category: Category | null): SpendBar[] {
  const start = parseISODate(startIso);
  const end = parseISODate(endIso);
  if (id === "week" || id === "twoWeeks") {
    const bars: SpendBar[] = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const key = iso(cursor);
      bars.push({
        key,
        label: id === "week" ? cursor.toLocaleDateString("en-US", { weekday: "narrow" }) : String(cursor.getDate()),
        amount: totalSpent(inSpan(receipts, key, key, category), category),
      });
    }
    return bars;
  }
  if (id === "month" || id === "quarter") {
    const bars: SpendBar[] = [];
    let cursor = start;
    while (cursor <= end) {
      const chunkEnd = addDays(cursor, 6);
      const last = chunkEnd < end ? chunkEnd : end;
      const from = iso(cursor);
      const to = iso(last);
      bars.push({
        key: from,
        label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        amount: totalSpent(inSpan(receipts, from, to, category), category),
      });
      cursor = addDays(last, 1);
    }
    return bars;
  }
  const bars: SpendBar[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= lastMonth) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const from = iso(cursor < start ? start : cursor);
    const to = iso(monthEnd > end ? end : monthEnd);
    bars.push({
      key: from.slice(0, 7),
      label: cursor.toLocaleDateString("en-US", { month: "short" }),
      amount: totalSpent(inSpan(receipts, from, to, category), category),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return bars;
}

export function visitSnapshots(receipts: Receipt[], today: Date, category: Category | null = null): VisitSnapshot[] {
  return WINDOWS.map((window) => {
    const range = span(window.id, today);
    const current = inSpan(receipts, range.start, range.end, category);
    const previous = inSpan(receipts, range.previousStart, range.previousEnd, category);
    const spent = totalSpent(current, category);
    const previousSpent = totalSpent(previous, category);
    const change = money(spent - previousSpent);
    const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
    return {
      ...window,
      trips: current.length,
      spent,
      previousTrips: previous.length,
      previousSpent,
      change,
      direction,
      bars: barsFor(window.id, range.start, range.end, receipts, category),
    };
  });
}
