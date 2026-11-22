'use client';

import { useEffect, useRef, useState } from 'react';

// Draw-to-sign canvas. Reports the PNG data-URL after each finished stroke
// (null when cleared) so the parent always holds the latest signature.
// Used by the public estimate accept page and the in-person signing modal
// on the job detail.
//
// `typed` adds a "Type" mode: the signer's typed name is rendered to a PNG in a
// script font. Keyboard / screen-reader users can't draw, so the public
// estimate page must offer it (accessibility statement promises it).
export function SignaturePad({ hint, clearLabel, onChange, typed }: {
  hint: string; clearLabel: string; onChange: (dataUrl: string | null) => void;
  typed?: { name: string; drawLabel: string; typeLabel: string; hint: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const typedName = typed?.name.trim() ?? '';

  useEffect(() => {
    if (mode !== 'type') return;
    if (!typedName) { onChange(null); return; }
    const cv = document.createElement('canvas');
    cv.width = 600; cv.height = 160;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'middle';
    let size = 64;
    const font = (n: number) => `italic ${n}px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive`;
    ctx.font = font(size);
    while (size > 20 && ctx.measureText(typedName).width > cv.width - 40) ctx.font = font(size -= 4);
    ctx.fillText(typedName, 20, cv.height / 2);
    onChange(cv.toDataURL('image/png'));
    // onChange is a state setter at every call site; leaving it out avoids a loop on inline callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedName]);

  const switchMode = (m: 'draw' | 'type') => {
    if (m === mode) return;
    const cv = canvasRef.current;
    if (cv) cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height);
    setHasInk(false);
    onChange(null);
    setMode(m);
  };

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
    <div>
    {typed && (
      <div role="group" className="inline-flex rounded-full border border-gray-200 p-0.5 mb-2">
        {(['draw', 'type'] as const).map(m => (
          <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={mode === m}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${mode === m ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
            {m === 'draw' ? typed.drawLabel : typed.typeLabel}
          </button>
        ))}
      </div>
    )}
    {typed && mode === 'type' && (
      <div className="w-full h-32 bg-white border border-gray-200 rounded-xl flex items-center px-5 overflow-hidden" aria-live="polite">
        {typedName
          ? <span className="text-4xl text-gray-900 truncate" style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive', fontStyle: 'italic' }}>{typedName}</span>
          : <span className="text-sm text-gray-500 w-full text-center">{typed.hint}</span>}
      </div>
    )}
    <div className={`relative ${mode === 'type' ? 'hidden' : ''}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-32 bg-white border border-gray-200 rounded-xl"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label={hint}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!hasInk && (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none select-none">
          {hint}
        </span>
      )}
      {hasInk && (
        <button type="button" onClick={clear}
          className="absolute top-2 right-2 text-xs text-gray-600 hover:text-gray-900 bg-white/80 px-2 py-0.5 rounded-lg border border-gray-200">
          {clearLabel}
        </button>
      )}
    </div>
    </div>
  );
}
