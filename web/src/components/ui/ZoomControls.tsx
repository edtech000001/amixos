'use client';

import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

const MIN = 1;
const MAX = 5;
const STEP = 0.5;
export const clampZoom = (z: number) => Math.min(Math.max(z, MIN), MAX);

/**
 * −  100%  +  for full-screen photo viewers — for mice without pinch. The %
 * button resets to fit. Keyboard: + / − / 0 while mounted. `onChange` gets the
 * clamped zoom; the caller re-centers its pan when it returns to 1.
 */
export function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (z: number) => void }) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser zoom alone
      if (e.key === '+' || e.key === '=') changeRef.current(clampZoom(zoomRef.current + STEP));
      else if (e.key === '-' || e.key === '_') changeRef.current(clampZoom(zoomRef.current - STEP));
      else if (e.key === '0') changeRef.current(MIN);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const btn = 'w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-1.5 py-1"
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <button type="button" aria-label="Zoom out" title="Zoom out (−)" disabled={zoom <= MIN}
        onClick={() => onChange(clampZoom(zoom - STEP))} className={btn}>
        <Minus size={18} />
      </button>
      <button type="button" aria-label="Reset zoom" title="Reset (0)" onClick={() => onChange(MIN)}
        className="min-w-[56px] h-10 px-2 rounded-full text-sm font-semibold text-white tabular-nums hover:bg-white/20">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in (+)" disabled={zoom >= MAX}
        onClick={() => onChange(clampZoom(zoom + STEP))} className={btn}>
        <Plus size={18} />
      </button>
    </div>
  );
}
