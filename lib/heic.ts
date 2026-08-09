function isHeicFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/** Convert HEIC/HEIF to JPEG blob; pass through other formats. */
export async function ensureDecodableImage(file: File): Promise<Blob> {
  if (!isHeicFile(file)) return file;

  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  return Array.isArray(result) ? result[0] : result;
}
