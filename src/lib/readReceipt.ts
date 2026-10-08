import { readReceiptImage } from "./ocr";
import { receiptKind } from "./pdfText";

export async function readReceiptFile(
  file: File,
  onProgress: (value: number, label: string) => void,
): Promise<string> {
  const kind = receiptKind(file);
  if (kind === "pdf") {
    const { readReceiptPdf } = await import("./pdfReceipt");
    return readReceiptPdf(file, onProgress);
  }
  if (kind === "image") return readReceiptImage(file, onProgress);
  throw new Error("Choose a photo or a PDF of the receipt.");
}
