'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Trash2, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { confirm } from '@amixos/shared/ui/confirmBus';
import {
  JOB_PHOTOS_BUCKET,
  MAX_PHOTOS_PER_JOB,
  JOB_PHOTO_MAX_EDGE,
  JOB_PHOTO_QUALITY,
  jobPhotoPath,
  jobPhotoFilename,
  nextRotation,
  type JobPhoto,
} from '@amixos/shared/lib/jobPhotos';
import { useSignedUrls } from '@amixos/shared/lib/storageUrls';
import { normalizeImageFiles } from '@/lib/imageFile';

interface Props {
  jobId: string;
  businessId: string;
  /** Office+ writers can add/remove; viewers see a read-only gallery. */
  canWrite: boolean;
}

// Resize the longest edge down + recompress to JPEG in a canvas before
// upload — same intent as the mobile expo-image-manipulator step, so a raw
// 10 MB browser upload becomes a few hundred KB. Falls back to the original
// file if anything in the canvas path fails. Exported for the new-job form,
// which stages photos and uploads them right after the job row is created.
export async function resizeImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > JOB_PHOTO_MAX_EDGE ? JOB_PHOTO_MAX_EDGE / longest : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JOB_PHOTO_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function JobPhotosSection({ jobId, businessId, canWrite }: Props) {
  const supabase = createSupabaseClient();
  const { user } = useApp();
  const { t: full } = useLang();
  const t = full.dashboard.jobs.detail.photos;

  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Fullscreen viewer zoom/pan. zoom===1 is the reset (fit-to-screen) state.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Active drag origin: image-space pan + pointer start, or null when not dragging.
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setPhotos((data as JobPhoto[] | null) ?? []);
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const onFilesChosen = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files ? await normalizeImageFiles(Array.from(ev.target.files)) : null;
    if (!files || files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS_PER_JOB) {
      setError(t.limitHit.replace('{{max}}', String(MAX_PHOTOS_PER_JOB)));
      ev.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      let order = photos.length;
      for (const file of Array.from(files)) {
        const blob = await resizeImage(file);
        const path = jobPhotoPath(businessId, jobId, jobPhotoFilename('jpg'));
        const { error: upErr } = await supabase.storage
          .from(JOB_PHOTOS_BUCKET)
          .upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('job_photos').insert({
          business_id: businessId,
          job_id: jobId,
          storage_path: path,
          sort_order: order++,
          created_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
      }
      await load();
    } catch {
      setError(t.uploadError);
    }
    setUploading(false);
    ev.target.value = '';
  };

  const removePhoto = async (photo: JobPhoto) => {
    if (!(await confirm({ message: t.deleteConfirm, destructive: true }))) return;
    // Deleting the row fires the AFTER DELETE trigger (057, hardened in 073)
    // which removes the storage object. Surface failures instead of swallowing
    // them — a silent error here looked like "delete does nothing" because
    // load() just re-showed the still-present row.
    // .select() so we can tell a real delete (returns the row) from an RLS
    // no-op (returns [] with no error) — both used to look like success.
    const { data: deleted, error: delErr } = await supabase
      .from('job_photos').delete().eq('id', photo.id).select('id');
    if (delErr || !deleted?.length) {
      setError(t.deleteError);
      return;
    }
    setError('');
    setViewerIndex(null);
    await load();
  };

  const rotateCurrent = async () => {
    if (viewerIndex === null) return;
    const photo = photos[viewerIndex];
    if (!photo) return;
    const rotation = nextRotation(photo.rotation ?? 0);
    setPhotos(prev => prev.map(p => (p.id === photo.id ? { ...p, rotation } : p)));
    await supabase.from('job_photos').update({ rotation }).eq('id', photo.id);
  };

  const goTo = (delta: number) =>
    setViewerIndex(i =>
      i === null ? i : Math.min(Math.max(i + delta, 0), photos.length - 1),
    );

  // Photos live in a private bucket — resolve short-lived signed URLs.
  const photoUrls = useSignedUrls(supabase, photos.map((p) => p.storage_path));

  const atLimit = photos.length >= MAX_PHOTOS_PER_JOB;
  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;
  const viewerRot = (viewerPhoto?.rotation ?? 0) % 360;
  const viewerSwap = viewerRot === 90 || viewerRot === 270;

  // Reset zoom/pan whenever the viewed photo (or its rotation) changes so each
  // photo opens fit-to-screen rather than inheriting the previous one's zoom.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [viewerIndex, viewerRot]);

  const clampZoom = (z: number) => Math.min(Math.max(z, 1), 5);
  // Wheel / trackpad-pinch to zoom. Snapping back to 1 re-centers the image.
  const onWheelZoom = (e: React.WheelEvent) => {
    setZoom(prev => {
      const next = clampZoom(prev - e.deltaY * 0.0025);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  // Double-click toggles between fit and 2.5×.
  const toggleZoom = () =>
    setZoom(prev => {
      const next = prev > 1 ? 1 : 2.5;
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  // Drag-to-pan, only meaningful once zoomed in.
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragRef.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">{t.heading}</h2>
        <span className="text-xs text-faint">
          {t.countLabel.replace('{{count}}', String(photos.length)).replace('{{max}}', String(MAX_PHOTOS_PER_JOB))}
        </span>
      </div>

      {error ? (
        <div className="mb-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-100 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {photos.length === 0 && !canWrite ? (
        <div className="py-8 flex flex-col items-center">
          <ImagePlus size={28} className="text-faint" />
          <p className="text-sm text-faint mt-2">{t.empty}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setViewerIndex(i)}
              className="relative aspect-square rounded-xl overflow-hidden bg-border-soft group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrls[p.storage_path] ?? undefined}
                alt=""
                className="w-full h-full object-cover"
                style={{ transform: `rotate(${p.rotation ?? 0}deg)` }}
              />
              {canWrite ? (
                <span
                  onClick={(e) => { e.stopPropagation(); void removePhoto(p); }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <Trash2 size={13} />
                </span>
              ) : null}
            </button>
          ))}

          {canWrite && !atLimit ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-faint hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <span className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                  <span className="text-[11px] mt-1.5">{t.uploading}</span>
                </>
              ) : (
                <>
                  <ImagePlus size={22} />
                  <span className="text-[11px] mt-1.5 font-medium">{t.addBtn}</span>
                </>
              )}
            </button>
          ) : null}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFilesChosen}
        className="hidden"
      />

      {/* Fullscreen viewer */}
      {viewerPhoto ? (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center overflow-hidden"
          // Clicking the backdrop closes — but not while zoomed in (the image
          // fills the screen and clicks are pans, not a close gesture).
          onClick={() => { if (zoom === 1) setViewerIndex(null); }}
          onWheel={onWheelZoom}
        >
          {/* Top bar — needs z-10: the photo has a CSS transform (rotation),
             which creates a stacking context that would otherwise paint over
             the counter/buttons since the img comes later in the DOM. */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewerIndex(null)}
              aria-label={t.viewerClose}
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <X size={20} />
            </button>
            <span className="text-sm text-white/70">{(viewerIndex ?? 0) + 1} / {photos.length}</span>
            <div className="flex items-center gap-2">
              {canWrite ? (
                <button
                  onClick={() => void rotateCurrent()}
                  aria-label="Rotate"
                  className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                >
                  <RotateCw size={18} />
                </button>
              ) : null}
              {canWrite ? (
                <button
                  onClick={() => void removePhoto(viewerPhoto)}
                  className="w-10 h-10 rounded-full bg-white/10 text-red-300 flex items-center justify-center hover:bg-white/20"
                >
                  <Trash2 size={18} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Prev */}
          {(viewerIndex ?? 0) > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(-1); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <ChevronLeft size={24} />
            </button>
          ) : null}
          {/* Next */}
          {(viewerIndex ?? 0) < photos.length - 1 ? (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            >
              <ChevronRight size={24} />
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrls[viewerPhoto.storage_path] ?? undefined}
            alt=""
            draggable={false}
            className="object-contain select-none"
            // When rotated 90/270 swap the max constraints so the rotated
            // image still fits the viewport instead of overflowing. Zoom/pan
            // layer on top of the rotation via scale + translate.
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${viewerRot}deg)`,
              maxWidth: viewerSwap ? '90vh' : '92vw',
              maxHeight: viewerSwap ? '92vw' : '90vh',
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
              touchAction: 'none',
              transition: dragRef.current ? 'none' : 'transform 0.15s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); toggleZoom(); }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </div>
      ) : null}
    </div>
  );
}
