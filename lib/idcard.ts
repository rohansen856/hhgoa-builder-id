/** Fixed Figma Letter-1 layout (1855×2400). */
export const CARD_WIDTH = 1855;
export const CARD_HEIGHT = 2400;
export const PHOTO_CX = 927;
export const PHOTO_CY = 660;
export const PHOTO_R = 394;
export const TEMPLATE_SRC = "/idcard/template.png?v=8";
export const MAX_PHOTO_EDGE = 2048;

export type PhotoTransform = { x: number; y: number; zoom: number };

export function coverCropRect(
  imgW: number,
  imgH: number,
  destSize: number,
  transform: PhotoTransform = { x: 0, y: 0, zoom: 1 },
) {
  const base = Math.max(destSize / imgW, destSize / imgH);
  const scale = base * Math.max(1, transform.zoom);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const x = (destSize - drawW) / 2 + transform.x;
  const y = (destSize - drawH) / 2 + transform.y;
  return { x, y, drawW, drawH, scale };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/** Downscale huge camera photos so canvas work stays snappy. */
export async function normalizePhoto(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const maxEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = maxEdge > MAX_PHOTO_EDGE ? MAX_PHOTO_EDGE / maxEdge : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(img, 0, 0, w, h);
    return loadImage(c.toDataURL("image/jpeg", 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function composeIdCard(
  template: HTMLImageElement,
  photo: HTMLImageElement | null,
  transform: PhotoTransform = { x: 0, y: 0, zoom: 1 },
  target: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  target.width = CARD_WIDTH;
  target.height = CARD_HEIGHT;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = "#007032";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (photo) {
    const size = PHOTO_R * 2;
    const { x, y, drawW, drawH } = coverCropRect(
      photo.naturalWidth,
      photo.naturalHeight,
      size,
      transform,
    );
    ctx.save();
    ctx.beginPath();
    ctx.arc(PHOTO_CX, PHOTO_CY, PHOTO_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, PHOTO_CX - PHOTO_R + x, PHOTO_CY - PHOTO_R + y, drawW, drawH);
    ctx.restore();
  }

  ctx.drawImage(template, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  return target;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      type,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function randomBuilderId() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `#HH-GOA-${n}`;
}

export function buildTweetCaption(origin: string) {
  return `🌴 Built my Hacker Goa House Builder Card!

Excited to build, ship, and connect with amazing builders in Goa. 🚀

<--- add builder id image here --->

Create your own Builder Card:
${origin}

#FrameInGoa #HHGoa2026`;
}
