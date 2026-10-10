export function OriginalReceipt({ src, fileName }: { src: string; fileName: string }) {
  if (fileName.toLowerCase().endsWith(".pdf")) {
    return <iframe className="original-frame" title="Original receipt PDF" src={src} />;
  }
  return <img className="original-photo" src={src} alt="Original receipt" />;
}
