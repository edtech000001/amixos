'use client';

// Crop / zoom a logo before it's uploaded (web). Mobile gets the same job done
// by the OS picker's editor (`allowsEditing`), so this is the web counterpart.
//
// Why it exists: logos usually ship with generous transparent padding baked in,
// which makes them render small inside the invoice header's logo box. Cropping
// to the artwork lets the same box show a much larger mark.
//
// Output is always PNG so transparency survives — a JPEG round-trip would flood
// a transparent background with black, which is exactly the failure the invoice
// header can least afford.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Maximize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/i18n/LangProvider';

/** Rendered output edge, in px. Square: every logo box in the app is square. */
const OUTPUT_PX = 512;
/** On-screen viewport edge. */
const VIEW_PX = 288;

interface Props {
  /** The picked file, or null when the cropper is closed. */
  file: File | null;
  onCancel: () => void;
  /** Receives the cropped PNG, ready to upload. */
  onDone: (cropped: File) => void;
}

export function LogoCropper({ file, onCancel, onDone }: Props) {
  const { t: full } = useLang();
  const t = full.dashboard.settings.business.cropper;
  const tc = full.common;

  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Scale that makes the whole image fit inside the square viewport. Zoom is
  // expressed as a multiple of it, so zoom=1 always means "entire logo shown".
  const baseScale = img ? Math.min(VIEW_PX / img.width, VIEW_PX / img.height) : 1;

  useEffect(() => {
    if (!file) { setImg(null); return; }
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setImg(el); setZoom(1); setPan({ x: 0, y: 0 }); };
    el.src = url;
    // Not revoked on cleanup: React StrictMode double-invokes effects in dev and
    // would revoke the URL the loaded image still points at.
  }, [file]);

  // Paint the preview: transparency checkerboard, then the image at the current
  // zoom/pan. The canvas IS the crop — what you see is what gets uploaded.
  const paint = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, VIEW_PX, VIEW_PX);
    const s = baseScale * zoom;
    const w = img.width * s;
    const h = img.height * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (VIEW_PX - w) / 2 + pan.x, (VIEW_PX - h) / 2 + pan.y, w, h);
  }, [img, baseScale, zoom, pan]);

  useEffect(() => { paint(); }, [paint]);

  /** Zoom to the artwork: trim fully transparent margins, else uniform-colour
   *  ones (logos are often padded with white or the brand colour). */
  const autoFit = () => {
    if (!img) return;
    const w = img.width, h = img.height;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return; // cross-origin taint — shouldn't happen for a local File
    }
    const at = (x: number, y: number) => (y * w + x) * 4;
    const c0 = at(0, 0);
    const bg = { r: data[c0], g: data[c0 + 1], b: data[c0 + 2], a: data[c0 + 3] };
    // A pixel counts as "content" when it differs from the corner colour, or
    // when the corner is transparent and the pixel isn't.
    const isContent = (i: number) => {
      const a = data[i + 3];
      if (bg.a < 8) return a > 8;
      if (a < 8) return false;
      return Math.abs(data[i] - bg.r) > 12 || Math.abs(data[i + 1] - bg.g) > 12 || Math.abs(data[i + 2] - bg.b) > 12;
    };
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isContent(at(x, y))) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return; // blank image — nothing to fit
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    // Zoom so the longer side of the artwork fills the viewport, then pan the
    // artwork's centre to the middle.
    const nextZoom = Math.min(8, VIEW_PX / (Math.max(boxW, boxH) * baseScale));
    const s = baseScale * nextZoom;
    setZoom(nextZoom);
    setPan({
      x: (w / 2 - (minX + boxW / 2)) * s,
      y: (h / 2 - (minY + boxH / 2)) * s,
    });
  };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(8, Math.max(1, z - e.deltaY * 0.002)));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPan({ x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) });
  };
  const onPointerUp = () => { drag.current = null; };

  const save = async () => {
    if (!img || !file) return;
    setBusy(true);
    try {
      // Re-render at full output resolution: the preview canvas is only 288px,
      // so exporting it directly would ship a blurry logo.
      const out = document.createElement('canvas');
      out.width = OUTPUT_PX;
      out.height = OUTPUT_PX;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      const k = OUTPUT_PX / VIEW_PX;
      const s = baseScale * zoom * k;
      const w = img.width * s;
      const h = img.height * s;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (OUTPUT_PX - w) / 2 + pan.x * k, (OUTPUT_PX - h) / 2 + pan.y * k, w, h);
      const blob = await new Promise<Blob | null>(res => out.toBlob(res, 'image/png'));
      if (!blob) return;
      const name = file.name.replace(/\.[^.]+$/, '') + '.png';
      onDone(new File([blob], name, { type: 'image/png' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!file} onClose={onCancel} title={t.title} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{t.hint}</p>

        <div className="flex justify-center">
          <div
            className="relative rounded-2xl border border-border-soft overflow-hidden"
            style={{
              width: VIEW_PX,
              height: VIEW_PX,
              cursor: drag.current ? 'grabbing' : 'grab',
              // Checkerboard so transparent areas read as transparent, not white.
              backgroundImage:
                'linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
              backgroundColor: '#f9fafb',
              touchAction: 'none',
            }}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} width={VIEW_PX} height={VIEW_PX} className="block select-none" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-faint w-10">{t.zoomLabel}</span>
          <input
            type="range" min={1} max={8} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-xs text-faint tabular-nums w-10 text-right">{zoom.toFixed(1)}×</span>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={autoFit}>
            <Maximize2 size={13} className="mr-1.5" />{t.autoFitBtn}
          </Button>
          <Button variant="secondary" size="sm" onClick={reset}>
            <RotateCcw size={13} className="mr-1.5" />{t.resetBtn}
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{tc.buttons.cancel}</Button>
          <Button onClick={save} loading={busy} disabled={!img}>
            <Crop size={14} className="mr-1.5" />{t.applyBtn}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
