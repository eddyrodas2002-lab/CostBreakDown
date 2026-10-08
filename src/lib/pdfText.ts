export type ReceiptFileKind = "pdf" | "image" | "other";

export function receiptKind(file: { type: string; name: string }): ReceiptFileKind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) return "image";
  return "other";
}

export function hasReadableText(text: string): boolean {
  return text.replace(/[^A-Za-z0-9]/g, "").length >= 12;
}

interface PlacedText {
  str: string;
  x: number;
  y: number;
  width: number;
}

function placedText(item: object): PlacedText | null {
  if (!("str" in item) || typeof item.str !== "string" || item.str.trim() === "") return null;
  const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : [];
  const x = typeof transform[4] === "number" ? transform[4] : 0;
  const y = typeof transform[5] === "number" ? transform[5] : 0;
  const width = "width" in item && typeof item.width === "number" ? item.width : 0;
  return { str: item.str, x, y, width };
}

export function linesFromTextItems(items: readonly object[]): string {
  const placed = items.flatMap((item) => {
    const text = placedText(item);
    return text ? [text] : [];
  });
  placed.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: PlacedText[][] = [];
  for (const item of placed) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= 3);
    if (row) row.push(item);
    else rows.push([item]);
  }

  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x);
      let line = "";
      let cursor = 0;
      for (const item of row) {
        if (line && item.x - cursor > 1.5) line += " ";
        line += item.str;
        cursor = Math.max(cursor, item.x + item.width);
      }
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
}
