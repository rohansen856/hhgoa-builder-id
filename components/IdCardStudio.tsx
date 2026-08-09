"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  TEMPLATE_SRC,
  PHOTO_R,
  CARD_WIDTH,
  CARD_HEIGHT,
  PhotoTransform,
  buildTweetCaption,
  canvasToBlob,
  composeIdCard,
  downloadBlob,
  loadImage,
  normalizePhoto,
  randomBuilderId,
} from "@/lib/idcard";
import { ensureDecodableImage } from "@/lib/heic";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const DEFAULT_TRANSFORM: PhotoTransform = { x: 0, y: 0, zoom: 1 };

type Mode = "single" | "bulk";

export default function IdCardStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const [builderId, setBuilderId] = useState("#HH-GOA-----");
  const [transform, setTransform] = useState<PhotoTransform>(DEFAULT_TRANSFORM);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [bulkCount, setBulkCount] = useState(0);
  const [bulkDone, setBulkDone] = useState(0);

  // Client-only ID so SSR HTML matches first paint (avoids hydration mismatch)
  useEffect(() => {
    const t = requestAnimationFrame(() => setBuilderId(randomBuilderId()));
    return () => cancelAnimationFrame(t);
  }, []);

  const redraw = (next = transform) => {
    const canvas = canvasRef.current;
    const template = templateRef.current;
    if (!canvas || !template) return;
    composeIdCard(template, photoRef.current, next, canvas);
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
    if (ready) redraw(transform);
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

  const scaleForPointer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    return CARD_WIDTH / canvas.getBoundingClientRect().width;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!hasPhoto || mode !== "single") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origin: transform,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    const s = scaleForPointer();
    setTransform({
      ...drag.origin,
      x: drag.origin.x + (e.clientX - drag.startX) * s,
      y: drag.origin.y + (e.clientY - drag.startY) * s,
    });
  };

  const onPointerUp = () => {
    if (dragRef.current) dragRef.current.active = false;
  };

  const exportPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPhoto) return null;
    redraw(transform);
    return canvasToBlob(canvas);
  };

  const onDownload = async () => {
    const blob = await exportPng();
    if (!blob) return;
    downloadBlob(blob, `HH-Goa-Builder-Card-${builderId.replace("#", "")}.png`);
  };

  const onShare = async () => {
    if (!hasPhoto) return;
    setBusy(true);
    try {
      const blob = await exportPng();
      if (!blob) return;
      downloadBlob(blob, `HH-Goa-Builder-Card-${builderId.replace("#", "")}.png`);
      const caption = buildTweetCaption(builderId, window.location.origin);
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
    setBusy(true);
    setBulkCount(list.length);
    setBulkDone(0);
    setStatus(`Generating 0 / ${list.length}…`);

    try {
      const zip = new JSZip();
      const ids: string[] = [];
      const offscreen = document.createElement("canvas");

      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const id = randomBuilderId();
        ids.push(`${file.name}\t${id}`);
        try {
          const decoded = await ensureDecodableImage(file);
          const photo = await normalizePhoto(decoded);
          composeIdCard(templateRef.current, photo, DEFAULT_TRANSFORM, offscreen);
          const blob = await canvasToBlob(offscreen);
          const num = String(i + 1).padStart(3, "0");
          zip.file(`HH-Goa-Builder-Card-${num}-${id.replace("#", "")}.png`, blob);
        } catch {
          ids.push(`${file.name}\tERROR`);
        }
        setBulkDone(i + 1);
        setStatus(`Generating ${i + 1} / ${list.length}…`);
      }

      zip.file("builder-ids.txt", ids.join("\n"));
      const out = await zip.generateAsync({ type: "blob" });
      downloadBlob(out, `HH-Goa-Builder-Cards-${list.length}.zip`);
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
              <div className="field">
                <span>Builder ID</span>
                <div className="builder-id" suppressHydrationWarning>
                  {builderId}
                </div>
              </div>

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

              {hasPhoto ? (
                <div className="field">
                  <span>Crop</span>
                  <label className="zoom-row">
                    <span>Zoom</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={transform.zoom}
                      onChange={(e) =>
                        setTransform((t) => ({ ...t, zoom: Number(e.target.value) }))
                      }
                    />
                    <em>{transform.zoom.toFixed(2)}×</em>
                  </label>
                  <div className="crop-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setTransform(DEFAULT_TRANSFORM)}
                    >
                      Reset crop
                    </button>
                  </div>
                  <p className="hint">Drag the preview to pan. Zoom in to crop tighter.</p>
                </div>
              ) : null}

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
              <p className="bulk-copy">
                Upload many photos at once. Each gets a centered crop and its own Builder ID.
                You get a ZIP of PNGs plus a matching ID list.
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
            className={`preview-frame${hasPhoto && mode === "single" ? " is-interactive" : ""}`}
            style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas
              ref={canvasRef}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              className="preview-canvas"
              aria-label="Builder card preview"
            />
            {!hasPhoto && ready ? (
              <div
                className="preview-empty"
                style={{ ["--photo-r" as string]: `${(PHOTO_R / CARD_WIDTH) * 100}%` }}
              >
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
