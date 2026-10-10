import { applyTaxHint, categorize, makeItem, readableCostcoName } from "./categories";
import { money, todayISO } from "./money";
import type { Draft, LineItem, Receipt } from "../types";

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

const FUEL_LINE = /\b(pumps?|gallons?|gals?|unleaded|diesel|gasoline|fuel)\b/i;

const NOISE =
  /^(costco\b|wholesale|member|thank|subtotal\b|tax\b|sales tax|total\b|\*+|change\b|visa\b|mastercard|debit\b|cash\b|amex|discover|approval|approved|ref\b|aid\b|whse\b|items sold|amount\b|www\.|https?:|phone|auth|seq\b|term\b|trace\b|card\b|acct\b|account\b|tender|you saved|instant savings total|ebt\b|balance|invoice|operator|store\b|st#|reg\b|tc#|date\b|firefox\b|product\s+amount\b|pump\s+gallons\b|search\b|visit\b|\d+\s+of\s+\d+\b)/i;

function cleanMoneyText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[|]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/\$/g, "")
    .replace(/(\d),(\d{2})\b/g, "$1.$2")
    .replace(/(?<!\d)(\d{1,4})[^\S\n]+(\d{2})(?![\d/])/g, "$1.$2")
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
  const labeled = lines.find((line) => /\bdate\s*:/i.test(line));
  const pool = labeled ?? lines.slice(0, 24).join("\n");
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

function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseWarehouse(lines: string[]): string {
  const head = lines.filter((line) => !/firefox|https?:|^\d+\s+of\s+\d+$/i.test(line)).slice(0, 12);
  for (const line of head) {
    const match = line.match(/^([A-Z][A-Z .'-]{2,})\s+([A-Z]{2})$/);
    if (match && !/COSTCO|WHOLESALE|TOTAL|SUBTOTAL/.test(match[1])) {
      return `${titleCase(match[1])}, ${match[2]}`;
    }
  }
  const city = head
    .map((line) => line.match(/^([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\s+\d{5}\b/))
    .find(Boolean);
  const warehouse = head.find((line) => /#\d{2,4}\s*$/.test(line) && !/\d{3,}\s/.test(line));
  if (city) {
    const place = `${titleCase(city[1])}, ${city[2]}`;
    if (!warehouse) return place;
    const name = titleCase(warehouse.replace(/\s+#\d{2,4}\s*$/, ""));
    if (name.toLowerCase() === city[1].trim().toLowerCase()) return place;
    return `${name}, ${place}`;
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
  const amounts = [...line.matchAll(/-?\d+\.\d{2}(?!\d)/g)];
  if (!amounts.length) {
    const pending = line.match(/^(?:([A-Z])\s+)?(\d{5,})\s+(.+)$/);
    if (!pending || !/[A-Za-z]{2,}/.test(pending[3])) return null;
    return {
      description: pending[3].replace(/\s+/g, " ").trim(),
      itemNumber: pending[2],
      quantity: 1,
      taxCode: pending[1]?.toUpperCase(),
    };
  }

  const last = amounts[amounts.length - 1];
  let cut = last.index ?? 0;
  const amount = money(Number(last[0]));
  let unitPrice: number | undefined;
  if (amounts.length >= 2) {
    const previous = amounts[amounts.length - 2];
    const gap = line.slice((previous.index ?? 0) + previous[0].length, cut).trim();
    if (gap === "") {
      unitPrice = money(Number(previous[0]));
      cut = previous.index ?? cut;
    }
  }

  let head = line.slice(0, cut).trim();
  const after = line.slice((last.index ?? 0) + last[0].length).trim();
  let taxCode = /^[EA]$/.test(after) ? after : undefined;
  const leadTax = head.match(/^([A-Z])\s+/);
  if (leadTax) {
    taxCode = taxCode || leadTax[1];
    head = head.slice(leadTax[0].length).trim();
  }
  let itemNumber: string | undefined;
  const leadNumber = head.match(/^(\d{5,})\s+/);
  if (leadNumber) {
    itemNumber = leadNumber[1];
    head = head.slice(leadNumber[0].length).trim();
  }
  let quantity = 1;
  const quantityMatch = head.match(/^(.*[A-Za-z].*)\s+(\d{1,2})$/);
  if (quantityMatch && Number(quantityMatch[2]) >= 1 && Number(quantityMatch[2]) <= 12) {
    quantity = Number(quantityMatch[2]);
    head = quantityMatch[1].trim();
  }
  const description = head.replace(/\s+/g, " ").trim();
  if (!/[A-Za-z]{2,}/.test(description)) return null;
  return { description, itemNumber, quantity, unitPrice, amount, taxCode };
}

function looseDescription(line: string): boolean {
  if (FUEL_LINE.test(line) || /\d+\.\d{2}/.test(line)) return false;
  return /[A-Za-z]{3,}/.test(line) && line.length <= 80;
}

function bindSplitPrices(lines: string[]): string[] {
  const bound: string[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!looseDescription(lines[index])) {
      bound.push(lines[index]);
      index += 1;
      continue;
    }
    const names: string[] = [];
    while (index < lines.length && looseDescription(lines[index])) {
      names.push(lines[index]);
      index += 1;
    }
    const prices: string[] = [];
    while (index < lines.length && priceOnly(lines[index])) {
      prices.push(lines[index]);
      index += 1;
    }
    if (!prices.length) {
      bound.push(...names);
      continue;
    }
    const pairCount = names.length >= 2 && prices.length >= 2 ? Math.min(names.length, prices.length) : 1;
    const chosen = names.slice(names.length - pairCount);
    bound.push(...names.slice(0, names.length - pairCount));
    for (let pair = 0; pair < pairCount; pair += 1) bound.push(`${chosen[pair]} ${prices[pair]}`);
    bound.push(...prices.slice(pairCount));
  }
  return bound;
}

function fuelFromText(text: string): RawItem | null {
  const pump = text.match(/pump\s+gallons\s+price\s+(\d+)\s+(\d+(?:\.\d+)?)\s+\$?(\d+\.\d+)/i);
  const product = text.match(/product\s+amount\s+(regular|premium|diesel|unleaded)\s+\$?(\d+\.\d{2})/i);
  if (!pump && !product) return null;
  const grade = product ? product[1][0].toUpperCase() + product[1].slice(1).toLowerCase() : "Fuel";
  const gallons = pump ? Number(pump[2]) : undefined;
  const perGallon = pump ? Number(pump[3]) : undefined;
  const amount = product ? money(Number(product[2])) : gallons && perGallon ? money(gallons * perGallon) : undefined;
  if (amount === undefined) return null;
  return {
    description: pump ? `Pump ${pump[1]} ${grade}` : grade,
    quantity: gallons && gallons > 0 ? gallons : 1,
    unitPrice: perGallon ? money(perGallon) : undefined,
    amount,
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
  const lines = bindSplitPrices(
    normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

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
    const foundTax = labeledAmount(line, /^(sales\s+)?tax\b|^total\s+tax\b/i);
    if (foundTax !== null) {
      tax = foundTax;
      continue;
    }
    const foundTotal = labeledAmount(line, /^(grand\s+)?total\b(?!\s+tax)|amount due/i);
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
    if (!next) {
      if (!FUEL_LINE.test(line)) continue;
      if (pending && !FUEL_LINE.test(pending.description)) pushPending();
      if (!pending) pending = { description: line, quantity: 1 };
      const gallons = line.match(/(\d+(?:\.\d+)?)\s*gals?\b/i);
      const perGallon = line.match(/@\s*\$?(\d+\.\d{2,3})/);
      if (gallons) pending.quantity = Number(gallons[1]);
      if (!/\bpumps?\b/i.test(pending.description)) pending.description = gallons ? `${gallons[1]} GAL` : line;
      if (perGallon) pending.unitPrice = money(Number(perGallon[1]));
      const trailing = line.match(/(-?\d+\.\d{2})\s*$/);
      const trailingIsUnit = Boolean(trailing && perGallon && perGallon[1].startsWith(trailing[1]));
      if (trailing && !trailingIsUnit) {
        pending.amount = money(Number(trailing[1]));
        pushPending();
      }
      continue;
    }
    pushPending();
    pending = next;
    if (heldQty) {
      applyQuantity(pending, heldQty);
      heldQty = null;
    }
    if (pending.amount !== undefined) pushPending();
  }
  pushPending();

  const named = foldSavings(rawItems).map((item) => ({
    ...item,
    description: readableCostcoName(item.description),
  }));
  let items = applyTaxHint(
    named.map((item) =>
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
  const fuel = fuelFromText(rawText);
  if (fuel) {
    items = [
      ...items.filter((item) => !/^(regular|premium|diesel|unleaded)$/i.test(item.description)),
      makeItem({
        description: fuel.description,
        quantity: fuel.quantity,
        unitPrice: fuel.unitPrice,
        amount: fuel.amount ?? 0,
        category: "gas",
      }),
    ];
  }

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

const COLLAPSED = /^(regular|premium|diesel|unleaded|\d+\s+of)$/i;

export function improveReceipt(receipt: Receipt): Receipt | null {
  if (!receipt.rawText?.trim()) return null;
  const parsed = parseReceipt(receipt.rawText, receipt.purchasedAt);
  if (!parsed.items.length) return null;
  const collapsed = receipt.items.some((item) => COLLAPSED.test(item.description.trim()));
  if (!collapsed) return null;
  const items = parsed.items.map((item) => {
    const previous = receipt.items.find(
      (old) => old.description === item.description && old.quantity === item.quantity && old.amount === item.amount,
    );
    if (!previous) return item;
    return {
      ...item,
      id: previous.id,
      category: previous.category,
      executiveEligible: previous.executiveEligible,
      visaRate: previous.visaRate,
    };
  });
  const same =
    items.length === receipt.items.length &&
    items.every((item, index) => item.id === receipt.items[index].id && item.description === receipt.items[index].description);
  if (same) return null;
  return {
    ...receipt,
    purchasedAt: parsed.purchasedAt,
    warehouse: parsed.warehouse,
    items,
    tax: parsed.tax ?? receipt.tax,
    total: parsed.total && parsed.total > 0 ? parsed.total : receipt.total,
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
