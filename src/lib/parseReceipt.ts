import { applyTaxHint, categorize, makeItem } from "./categories";
import { money, todayISO } from "./money";
import type { Draft, LineItem } from "../types";

export interface ParsedReceipt {
  purchasedAt: string;
  warehouse: string;
  items: LineItem[];
  tax?: number;
  total?: number;
  subtotal?: number;
  rawText: string;
}

interface RawItem {
  description: string;
  itemNumber?: string;
  quantity: number;
  unitPrice?: number;
  amount?: number;
  taxCode?: string;
}

const NOISE =
  /^(costco\b|wholesale|member|thank|subtotal\b|tax\b|sales tax|total\b|\*+|change\b|visa\b|mastercard|debit\b|cash\b|amex|discover|approval|approved|ref\b|aid\b|whse\b|items sold|amount\b|www\.|https?:|phone|auth|seq\b|term\b|trace\b|card\b|acct\b|account\b|tender|you saved|instant savings total|ebt\b|balance|invoice|operator|store\b|st#|reg\b|tc#|date\b)/i;

function cleanMoneyText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[|]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/\$/g, "")
    .replace(/(\d),(\d{2})\b/g, "$1.$2")
    .replace(/(?<!\d)(\d{1,4})\s+(\d{2})(?!\d)/g, "$1.$2")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function labeledAmount(line: string, label: RegExp): number | null {
  if (!label.test(line)) return null;
  const match = line.match(/-?\d+\.\d{2}/);
  return match ? money(Number(match[0])) : null;
}

function parseDate(lines: string[], fallback: string): string {
  const pool = lines.slice(0, 20).join("\n");
  const match = pool.match(
    /\b(0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])[\/\-.](\d{2}|\d{4})\b/,
  );
  if (!match) return fallback;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const isoMonth = String(month).padStart(2, "0");
  const isoDay = String(day).padStart(2, "0");
  return `${year}-${isoMonth}-${isoDay}`;
}

function parseWarehouse(lines: string[]): string {
  for (const line of lines.slice(0, 8)) {
    const match = line.match(/^([A-Z][A-Z .'-]{2,})\s+([A-Z]{2})$/);
    if (match && !/COSTCO|WHOLESALE|TOTAL|SUBTOTAL/.test(match[1])) {
      const city = match[1]
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      return `${city}, ${match[2]}`;
    }
  }
  return "Costco";
}

function priceOnly(line: string): { amount: number; taxCode?: string } | null {
  const match = line.match(/^(?:([A-Z])\s+)?(-?\d+\.\d{2})(?:\s+([A-Z]))?$/i);
  if (!match) return null;
  const taxCode = (match[3] || match[1] || "").toUpperCase();
  return {
    amount: money(Number(match[2])),
    taxCode: taxCode.length === 1 ? taxCode : undefined,
  };
}

function quantityLine(line: string): { quantity: number; unitPrice: number } | null {
  const match = line.match(/^(\d+(?:\.\d+)?)\s*@\s*(-?\d+\.\d{2})\b/);
  if (!match) return null;
  return { quantity: Number(match[1]), unitPrice: money(Number(match[2])) };
}

function itemLine(line: string): RawItem | null {
  const priced = line.match(
    /^(?:([A-Z])\s+)?(?:(\d{5,})\s+)?([A-Za-z][A-Za-z0-9 &'./#-]{1,}?)\s+(-?\d+\.\d{2})(?:\s+([A-Z]))?\s*$/,
  );
  if (priced) {
    const taxCode = (priced[5] || priced[1] || "").toUpperCase();
    return {
      description: priced[3].replace(/\s+/g, " ").trim(),
      itemNumber: priced[2],
      quantity: 1,
      amount: money(Number(priced[4])),
      taxCode: taxCode.length === 1 ? taxCode : undefined,
    };
  }
  const pending = line.match(/^(?:([A-Z])\s+)?(?:(\d{5,})\s+)([A-Za-z][A-Za-z0-9 &'./#-]{1,})$/);
  if (!pending) return null;
  const taxCode = (pending[1] || "").toUpperCase();
  return {
    description: pending[3].replace(/\s+/g, " ").trim(),
    itemNumber: pending[2],
    quantity: 1,
    taxCode: taxCode.length === 1 ? taxCode : undefined,
  };
}

function isSavings(description: string): boolean {
  return /instant savings|\binstant sav\b|^savings\b/i.test(description);
}

function foldSavings(items: RawItem[]): RawItem[] {
  const folded: RawItem[] = [];
  for (const item of items) {
    if (item.amount === undefined) continue;
    if (isSavings(item.description) && folded.length > 0) {
      const previous = folded[folded.length - 1];
      const delta = item.amount > 0 ? -item.amount : item.amount;
      previous.amount = money((previous.amount ?? 0) + delta);
      continue;
    }
    folded.push(item);
  }
  return folded;
}

function applyQuantity(item: RawItem, qty: { quantity: number; unitPrice: number }) {
  item.quantity = qty.quantity;
  item.unitPrice = qty.unitPrice;
  if (item.amount === undefined || item.amount === qty.unitPrice) {
    item.amount = money(qty.quantity * qty.unitPrice);
  }
}

export function parseReceipt(text: string, today = todayISO()): ParsedReceipt {
  const rawText = text.replace(/\r/g, "").trim();
  const normalized = cleanMoneyText(rawText);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let subtotal: number | undefined;
  let tax: number | undefined;
  let total: number | undefined;
  const rawItems: RawItem[] = [];
  let pending: RawItem | null = null;
  let heldQty: { quantity: number; unitPrice: number } | null = null;

  const pushPending = () => {
    if (!pending) return;
    if (pending.amount === undefined && pending.unitPrice !== undefined) {
      pending.amount = money(pending.quantity * pending.unitPrice);
    }
    if (pending.amount !== undefined && pending.description.length > 1) rawItems.push(pending);
    pending = null;
  };

  for (const original of lines) {
    const line = original.replace(/^[*\\/]+/, "").trim();
    if (!line) continue;

    const foundSubtotal = labeledAmount(line, /^subtotal\b/i);
    if (foundSubtotal !== null) {
      subtotal = foundSubtotal;
      continue;
    }
    const foundTax = labeledAmount(line, /^(sales\s+)?tax\b/i);
    if (foundTax !== null) {
      tax = foundTax;
      continue;
    }
    const foundTotal = labeledAmount(line, /^(grand\s+)?total\b|amount due/i);
    if (foundTotal !== null) {
      total = foundTotal;
      continue;
    }
    if (NOISE.test(line)) continue;

    const qty = quantityLine(line);
    if (qty) {
      if (pending) applyQuantity(pending, qty);
      else heldQty = qty;
      continue;
    }

    const lonePrice = priceOnly(line);
    if (lonePrice) {
      if (pending) {
        pending.amount = lonePrice.amount;
        pending.taxCode = pending.taxCode || lonePrice.taxCode;
        pushPending();
      }
      continue;
    }

    const next = itemLine(line);
    if (!next) continue;
    pushPending();
    pending = next;
    if (heldQty) {
      applyQuantity(pending, heldQty);
      heldQty = null;
    }
    if (pending.amount !== undefined) pushPending();
  }
  pushPending();

  const items = applyTaxHint(
    foldSavings(rawItems).map((item) =>
      makeItem({
        description: item.description,
        itemNumber: item.itemNumber,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount ?? 0,
        taxCode: item.taxCode,
        category: categorize(item.description),
      }),
    ),
  );

  return {
    purchasedAt: parseDate(lines, today),
    warehouse: parseWarehouse(lines),
    items,
    tax,
    total,
    subtotal,
    rawText,
  };
}

export function draftFromParsed(parsed: ParsedReceipt, extra?: Partial<Draft>): Draft {
  const tax = parsed.tax ?? 0;
  const sum = money(parsed.items.reduce((total, item) => total + item.amount, 0));
  return {
    purchasedAt: parsed.purchasedAt,
    warehouse: parsed.warehouse,
    items: parsed.items,
    tax,
    total: parsed.total ?? money(sum + tax),
    rawText: parsed.rawText,
    sample: false,
    detectedSubtotal: parsed.subtotal,
    ...extra,
  };
}
