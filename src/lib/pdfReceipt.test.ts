import { describe, expect, it } from "vitest";
import { parseReceipt } from "./parseReceipt";
import { readReceiptPdf } from "./pdfReceipt";
import { hasReadableText, linesFromTextItems, receiptKind } from "./pdfText";

function pdfBytes(lines: string[]): Uint8Array {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = lines
    .map((line, index) => `BT /F1 12 Tf 40 ${720 - index * 16} Td (${escape(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(new TextEncoder().encode(body).length);
    body += object;
  }
  const xrefAt = new TextEncoder().encode(body).length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

describe("receipt files", () => {
  it("treats a pdf and a photo as readable receipts", () => {
    expect(receiptKind({ type: "application/pdf", name: "trip.pdf" })).toBe("pdf");
    expect(receiptKind({ type: "", name: "Costco.PDF" })).toBe("pdf");
    expect(receiptKind({ type: "image/jpeg", name: "slip.jpg" })).toBe("image");
    expect(receiptKind({ type: "", name: "slip.PNG" })).toBe("image");
    expect(receiptKind({ type: "text/plain", name: "notes.txt" })).toBe("other");
  });

  it("keeps a description and its price on the same line", () => {
    const text = linesFromTextItems([
      { str: "KS ORG EGGS", transform: [12, 0, 0, 12, 40, 700], width: 90 },
      { str: "8.79", transform: [12, 0, 0, 12, 320, 701], width: 28 },
      { str: "TOTAL", transform: [12, 0, 0, 12, 40, 680], width: 40 },
    ]);
    expect(text).toBe("KS ORG EGGS 8.79\nTOTAL");
    expect(hasReadableText(text)).toBe(true);
    expect(hasReadableText("")).toBe(false);
  });

  it("reads a text pdf into receipt lines", async () => {
    const file = new File(
      [pdfBytes(["SEATTLE WA", "KS ORG EGGS 8.79", "KIRKLAND PAPER TOWELS 21.99", "SUBTOTAL 30.78", "TOTAL 30.78"])],
      "costco.pdf",
      { type: "application/pdf" },
    );
    const text = await readReceiptPdf(file, () => undefined);
    const parsed = parseReceipt(text, "2026-10-07");
    const byName = Object.fromEntries(parsed.items.map((item) => [item.description, item]));
    expect(byName["KS ORG EGGS"].amount).toBe(8.79);
    expect(byName["KIRKLAND PAPER TOWELS"].amount).toBe(21.99);
    expect(parsed.total).toBe(30.78);
  });
});
