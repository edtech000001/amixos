'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

/**
 * <img> that shows a pulsing skeleton until the picture has loaded, then
 * fades it in — so a slow photo reads as "loading", not a broken gray box.
 * Lazy + async decode so off-screen thumbnails don't compete for bandwidth.
 * The PARENT must be `relative` (the skeleton is absolute inset-0).
 */
export function SkeletonImg({
  src: primary,
  fallbackSrc,
  onFallback,
  className,
  onLoad,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & {
  /** Tried when `src` fails — e.g. the full photo when a thumbnail is missing. */
  fallbackSrc?: string;
  /** Called when the tile ends up showing `fallbackSrc` (e.g. to build the missing thumbnail). */
  onFallback?: () => void;
}) {
  const [failed, setFailed] = useState<string | undefined>();
  const src = primary && failed === primary && fallbackSrc ? fallbackSrc : primary;
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // Already in the browser cache → may have finished before React listened.
    const el = ref.current;
    setLoaded(!!(src && el?.complete && el.naturalWidth > 0));
  }, [src]);
  return (
    <>
      {!loaded && <span aria-hidden className="absolute inset-0 animate-pulse bg-border-soft" />}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        ref={ref}
        src={src || undefined}
        loading="lazy"
        decoding="async"
        onLoad={e => {
          setLoaded(true);
          // Showing the full photo in a thumbnail slot (missing thumbnail —
          // whether the thumb URL failed or was never signed).
          if (fallbackSrc && src === fallbackSrc) onFallback?.();
          onLoad?.(e);
        }}
        onError={() => {
          if (primary && src === primary && fallbackSrc && fallbackSrc !== primary) setFailed(primary);
          else setLoaded(true);
        }}
        className={`${className ?? ''} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...rest}
      />
    </>
  );
}
