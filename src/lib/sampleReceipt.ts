import { todayISO } from "./money";

export const SAMPLE_BODY = `E 966019 KS ORG EGGS 24CT 8.79
E 134560 BANANAS 2.49
E 1122334 ROTISSERIE CHICKEN 4.99
E 223344 KS ORGANIC MILK 9.49
E 334455 SLICED CHEDDAR 11.29
A 2487912 KIRKLAND PAPER TOWELS 24.99
/2487912 INSTANT SAVINGS -3.00
A 556677 KS VITAMIN D 14.49
A 778899 KS DOG FOOD 32.99
A 889900 CABERNET WINE 16.99
998877 FUEL UNLEADED 45.20
E 445566 PIZZA SLICE 1.99

SUBTOTAL 170.70
TAX 8.65
TOTAL 179.35`;

export function defaultSampleDate(today = new Date()): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
  if (date.getFullYear() !== today.getFullYear()) return `${today.getFullYear()}-01-01`;
  return todayISO(date);
}

export function buildSampleText(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `COSTCO WHOLESALE
SEATTLE WA
${month}/${day}/${year} 14:22

${SAMPLE_BODY}`;
}
