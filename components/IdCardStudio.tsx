"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  TEMPLATE_SRC,
  CARD_WIDTH,
  CARD_HEIGHT,
  PHOTO_R,
  PhotoTransform,
  buildTweetCaption,
  canvasToBlob,
  composeIdCard,
  coverCropRect,
  downloadBlob,
  loadImage,
  normalizePhoto,
  randomBuilderId,
} from "@/lib/idcard";
import { ensureDecodableImage } from "@/lib/heic";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const DEFAULT_TRANSFORM: PhotoTransform = { x: 0, y: 0, zoom: 1 };
const CROP_SIZE = 280;

type Mode = "single" | "bulk";

function safeSlug(value: string) {
  return (value.trim() || "team").replace(/[^\w.-]+/g, "-").slice(0, 40);
}

export default function IdCardStudio() {
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLImageElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origin: PhotoTransform;
  } | null>(null);

  const [mode, setMode] = useState<Mode>("single");
  const [teamName, setTeamName] = useState("");
  const [transform, setTransform] = useState<PhotoTransform>(DEFAULT_TRANSFORM);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [bulkCount, setBulkCount] = useState(0);
  const [bulkDone, setBulkDone] = useState(0);

  const redrawCard = (next = transform) => {
    const canvas = cardCanvasRef.current;
    const template = templateRef.current;
    if (!canvas || !template) return;
    composeIdCard(template, photoRef.current, next, canvas);
  };

  const redrawCrop = (next = transform) => {
    const canvas = cropCanvasRef.current;
    const photo = photoRef.current;
    if (!canvas) return;
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.fillStyle = "#0a5c32";
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

    if (!photo) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "600 14px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Your photo", CROP_SIZE / 2, CROP_SIZE / 2);
      return;
    }

    const scaleToCard = (PHOTO_R * 2) / CROP_SIZE;
    const mapped: PhotoTransform = {
      x: next.x / scaleToCard,
      y: next.y / scaleToCard,
      zoom: next.zoom,
    };
    const { x, y, drawW, drawH } = coverCropRect(
      photo.naturalWidth,
      photo.naturalHeight,
      CROP_SIZE,
      mapped,
    );

    ctx.save();
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, x, y, drawW, drawH);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#f5d000";
    ctx.lineWidth = 4;
    ctx.stroke();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const template = await loadImage(TEMPLATE_SRC);
        if (cancelled) return;
        templateRef.current = template;
        setReady(true);
      } catch {
        setStatus("Could not load card template.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    redrawCard(transform);
    redrawCrop(transform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform, ready, hasPhoto]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus(
      file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")
        ? "Preparing photo…"
        : null,
    );
    try {
      const decoded = await ensureDecodableImage(file);
      const photo = await normalizePhoto(decoded);
      photoRef.current = photo;
      setTransform(DEFAULT_TRANSFORM);
      setHasPhoto(true);
      setStatus(null);
    } catch {
      setStatus("Couldn’t read that photo. Try JPG or PNG.");
    } finally {
      setBusy(false);
    }
  };

  const onCropPointerDown = (e: React.PointerEvent) => {
    if (!hasPhoto) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origin: transform,
    };
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleToCard = (PHOTO_R * 2) / CROP_SIZE;
    const viewScale = CROP_SIZE / rect.width;
    setTransform({
      ...drag.origin,
      x: drag.origin.x + (e.clientX - drag.startX) * viewScale * scaleToCard,
      y: drag.origin.y + (e.clientY - drag.startY) * viewScale * scaleToCard,
    });
  };

  const onCropPointerUp = () => {
    if (dragRef.current) dragRef.current.active = false;
  };

  const exportPng = async () => {
    const canvas = cardCanvasRef.current;
    if (!canvas || !hasPhoto) return null;
    redrawCard(transform);
    return canvasToBlob(canvas);
  };

  const onDownload = async () => {
    const blob = await exportPng();
    if (!blob) return;
    downloadBlob(blob, `HH-Goa-Builder-Card-${safeSlug(teamName)}.png`);
  };

  const onShare = async () => {
    if (!hasPhoto) return;
    setBusy(true);
    try {
      const blob = await exportPng();
      if (!blob) return;
      downloadBlob(blob, `HH-Goa-Builder-Card-${safeSlug(teamName)}.png`);
      const caption = buildTweetCaption(teamName, window.location.origin);
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`,
        "_blank",
        "noopener,noreferrer",
      );
      setShareOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const onBulk = async (files: FileList | null) => {
    if (!files?.length || !templateRef.current) return;
    const list = Array.from(files);
    const team = safeSlug(teamName);
    setBusy(true);
    setBulkCount(list.length);
    setBulkDone(0);
    setStatus(`Generating 0 / ${list.length}…`);

    try {
      const zip = new JSZip();
      const manifest: string[] = [];
      const offscreen = document.createElement("canvas");

      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const id = randomBuilderId();
        try {
          const decoded = await ensureDecodableImage(file);
          const photo = await normalizePhoto(decoded);
          composeIdCard(templateRef.current, photo, DEFAULT_TRANSFORM, offscreen);
          const blob = await canvasToBlob(offscreen);
          const num = String(i + 1).padStart(3, "0");
          const name = `HH-Goa-${team}-${num}.png`;
          zip.file(name, blob);
          manifest.push(`${file.name}\t${name}\t${id}`);
        } catch {
          manifest.push(`${file.name}\tERROR`);
        }
        setBulkDone(i + 1);
        setStatus(`Generating ${i + 1} / ${list.length}…`);
      }

      zip.file("manifest.txt", manifest.join("\n"));
      const out = await zip.generateAsync({ type: "blob" });
      downloadBlob(out, `HH-Goa-${team}-cards.zip`);
      setStatus(`Done — ${list.length} cards downloaded as ZIP.`);
    } catch {
      setStatus("Bulk export failed. Try fewer photos.");
    } finally {
      setBusy(false);
      if (bulkRef.current) bulkRef.current.value = "";
    }
  };

  return (
    <div className="studio">
      <header className="studio-hero">
        <p className="studio-eyebrow">Hacker House Goa 2026</p>
        <h1 className="studio-title">
          Builder <span>Card</span>
        </h1>
        <p className="studio-sub">
          Drop your photo. Crop it. Get your pass. Share it with #FrameInGoa.
        </p>
        <div className="hero-chips" aria-hidden>
          <span className="hero-chip">Upload Photo</span>
          <span className="hero-chip">Crop &amp; Frame</span>
          <span className="hero-chip">Share Pass</span>
        </div>
      </header>

      <div className="mode-tabs" role="tablist" aria-label="Create mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "single"}
          className={`mode-tab${mode === "single" ? " is-active" : ""}`}
          onClick={() => setMode("single")}
        >
          Single
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "bulk"}
          className={`mode-tab${mode === "bulk" ? " is-active" : ""}`}
          onClick={() => setMode("bulk")}
        >
          Bulk team
        </button>
      </div>

      <div className="studio-grid">
        <section className="studio-panel">
          {mode === "single" ? (
            <>
              <label className="field">
                <span>Team name</span>
                <input
                  type="text"
                  value={teamName}
                  maxLength={48}
                  placeholder="e.g. CtrlCrew"
                  autoComplete="organization"
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </label>

              <div className="field">
                <span>Photo</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className="dropzone"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <strong>{hasPhoto ? "Replace photo" : "Upload photo"}</strong>
                  <span>JPG, PNG, WEBP or HEIC · Max ~10MB</span>
                </button>
              </div>

              <div className="field">
                <span>Crop &amp; frame</span>
                <div className="crop-editor">
                  <div
                    className={`crop-stage${hasPhoto ? " is-interactive" : ""}`}
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                    onPointerCancel={onCropPointerUp}
                  >
                    <canvas
                      ref={cropCanvasRef}
                      width={CROP_SIZE}
                      height={CROP_SIZE}
                      className="crop-canvas"
                      aria-label="Photo crop editor"
                    />
                  </div>
                  <div className="crop-controls">
                    <label className="zoom-row">
                      <span>Zoom</span>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={transform.zoom}
                        disabled={!hasPhoto}
                        onChange={(e) =>
                          setTransform((t) => ({ ...t, zoom: Number(e.target.value) }))
                        }
                      />
                      <em>{transform.zoom.toFixed(2)}×</em>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={!hasPhoto}
                      onClick={() => setTransform(DEFAULT_TRANSFORM)}
                    >
                      Reset crop
                    </button>
                    <p className="hint">Drag inside the circle to pan. Zoom to crop tighter.</p>
                  </div>
                </div>
              </div>

              {status && mode === "single" ? <p className="status">{status}</p> : null}

              <div className="actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!hasPhoto || busy}
                  onClick={onDownload}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!hasPhoto || busy}
                  onClick={onShare}
                >
                  Share to X
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>Team name</span>
                <input
                  type="text"
                  value={teamName}
                  maxLength={48}
                  placeholder="e.g. CtrlCrew"
                  autoComplete="organization"
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </label>
              <p className="bulk-copy">
                Upload many photos at once. Each card uses a centered crop. You get a ZIP of PNGs
                named with your team.
              </p>
              <input
                ref={bulkRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => onBulk(e.target.files)}
              />
              <button
                type="button"
                className="dropzone"
                disabled={busy || !ready}
                onClick={() => bulkRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onBulk(e.dataTransfer.files);
                }}
              >
                <strong>{busy ? "Generating…" : "Upload team photos"}</strong>
                <span>Select multiple JPG, PNG, WEBP or HEIC files</span>
              </button>
              {busy && bulkCount > 0 ? (
                <div className="bulk-progress" aria-live="polite">
                  <div
                    className="bulk-progress-bar"
                    style={{ width: `${Math.round((bulkDone / bulkCount) * 100)}%` }}
                  />
                  <span>
                    {bulkDone} / {bulkCount}
                  </span>
                </div>
              ) : null}
              {status && mode === "bulk" ? <p className="status">{status}</p> : null}
            </>
          )}
        </section>

        <section className="studio-preview">
          <div
            className="preview-frame"
            style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
          >
            <canvas
              ref={cardCanvasRef}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              className="preview-canvas"
              aria-label="Builder card preview"
            />
            {!hasPhoto && ready ? (
              <div className="preview-empty" style={{ ["--photo-r" as string]: "21%" }}>
                <span>Your photo</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {shareOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShareOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="modal-badge">Builder Card downloaded</p>
            <h2 id="share-title">Attach the image to your X post</h2>
            <p>
              Your PNG was saved and a pre-filled tweet opened. Attach the downloaded image before
              posting so the graphic shows up.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setShareOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
