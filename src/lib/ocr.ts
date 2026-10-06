function statusLabel(status: string): string {
  const text = status.toLowerCase();
  if (text.includes("language") || text.includes("traineddata")) {
    return "Downloading the reader. The first photo needs a connection.";
  }
  if (text.includes("core") || text.includes("initial")) return "Getting the reader ready";
  if (text.includes("recogn")) return "Reading your receipt";
  return "Working on your photo";
}

async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a JPG or PNG photo of the receipt.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That photo couldn't be opened. Try a JPG or PNG.");
  }
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't open that photo.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.3 + data[index + 1] * 0.59 + data[index + 2] * 0.11;
    const stretched = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    data[index] = stretched;
    data[index + 1] = stretched;
    data[index + 2] = stretched;
  }
  context.putImageData(pixels, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("This browser couldn't prepare that photo.");
  return blob;
}

export async function readReceiptImage(
  file: File,
  onProgress: (value: number, label: string) => void,
): Promise<string> {
  const prepared = await prepareImage(file);
  onProgress(0.08, "Getting the reader ready");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      const status = String(message.status ?? "");
      const progress = typeof message.progress === "number" ? message.progress : 0;
      if (status === "recognizing text") onProgress(0.2 + progress * 0.8, "Reading your receipt");
      else onProgress(0.1 + progress * 0.1, statusLabel(status));
    },
  });
  try {
    const result = await worker.recognize(prepared);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
