'use client';

import { useEffect, useRef, useState } from 'react';

// Draw-to-sign canvas. Reports the PNG data-URL after each finished stroke
// (null when cleared) so the parent always holds the latest signature.
// Used by the public estimate accept page and the in-person signing modal
// on the job detail.
export function SignaturePad({ hint, clearLabel, onChange }: {
  hint: string; clearLabel: string; onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    cv.width = cv.offsetWidth * ratio;
    cv.height = cv.offsetHeight * ratio;
    const ctx = cv.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = cv.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A dot for taps so a single click still leaves ink.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setHasInk(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const cv = canvasRef.current!;
    const { x, y } = pos(e);
    const ctx = cv.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const cv = canvasRef.current!;
    cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-32 bg-white border border-gray-200 rounded-xl"
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!hasInk && (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none select-none">
          {hint}
        </span>
      )}
      {hasInk && (
        <button type="button" onClick={clear}
          className="absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-600 bg-white/80 px-2 py-0.5 rounded-lg border border-gray-200">
          {clearLabel}
        </button>
      )}
    </div>
  );
}
