'use client';

import { ImagePlus } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';

/**
 * "Drop photos here" highlight laid over a drop target while a file hovers
 * (see `useDropImages`). The parent must be `relative`. pointer-events-none so
 * the drag keeps reaching the target underneath.
 */
export function DropOverlay({ show }: { show: boolean }) {
  const { t } = useLang();
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-primary">
      <ImagePlus size={28} />
      <span className="text-sm font-semibold">{t.common.dropImagesHere}</span>
    </div>
  );
}
