// Skeleton placeholders — WEB implementation. Same exports as Skeleton.tsx
// (the React Native one), so screens import from '../../ui/Skeleton' and the
// bundler picks the right file: webpack resolves .web.tsx first (see
// web/next.config.js), Metro takes the native one.
//
// Purpose: a bare spinner tells the user nothing. Blocking a screen with
// placeholders SHAPED LIKE the content that's coming makes the wait read as
// "this is loading" rather than "is this broken?", and the page doesn't lurch
// when the data lands.

import type { ReactNode } from 'react';

/** A single pulsing block. Size it with Tailwind classes. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-border-soft ${className ?? ''}`} />;
}

/** A list-row placeholder: avatar circle + two text lines. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-border-soft shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-3.5 w-3/5 rounded bg-border-soft" />
        <div className="h-3 w-2/5 rounded bg-border-soft" />
      </div>
    </div>
  );
}

/** N stacked rows in a card — the default list skeleton. */
export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={i > 0 ? 'border-t border-border-soft' : undefined}>
          <SkeletonRow />
        </div>
      ))}
    </div>
  );
}

/** A dashboard stat-tile placeholder. */
export function SkeletonStat() {
  return (
    <div className="bg-card rounded-2xl border border-border-soft p-4 flex flex-col gap-2.5 animate-pulse">
      <div className="h-3 w-1/2 rounded bg-border-soft" />
      <div className="h-6 w-2/5 rounded bg-border-soft" />
    </div>
  );
}

/** A row of stat tiles. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }, (_, i) => <SkeletonStat key={i} />)}
    </div>
  );
}

/** A generic content card: optional title bar + `lines` text lines. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3 animate-pulse ${className ?? ''}`}>
      <div className="h-3 w-1/4 rounded bg-border-soft" />
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3.5 rounded bg-border-soft"
          // Ragged widths read as text; equal bars read as a table.
          style={{ width: `${[92, 74, 83, 61, 88][i % 5]}%` }}
        />
      ))}
    </div>
  );
}

/** Detail-screen scaffold: back arrow + title block, then children. */
export function SkeletonDetail({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-border-soft shrink-0" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-52 rounded bg-border-soft" />
          <div className="h-3 w-32 rounded bg-border-soft" />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Placeholder for a chart card. */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={`bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4 animate-pulse ${className ?? ''}`}>
      <div className="h-3 w-1/3 rounded bg-border-soft" />
      <div className="flex items-end gap-2 h-32">
        {[55, 80, 40, 95, 65, 72, 48, 88, 60, 76, 52, 84].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-border-soft" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
