'use client';

// Route-level error boundary for a module screen.
//
// Modules are lazily-loaded chunks (next/dynamic), so their code only runs on
// this route — but WITHOUT this file a render error there bubbles past the
// dashboard layout and Next replaces the whole page with its generic error
// screen. With it, the failure stays inside the module's slot: the sidebar,
// the header and every other route keep working, and `reset()` re-mounts just
// this subtree.
//
// Deliberately plain: no data fetching, no context beyond i18n. A boundary
// that depends on the thing that broke renders nothing.

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';

export default function ModuleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t: full } = useLang();
  const t = full.dashboard.modules.crash;

  useEffect(() => {
    // Dev console + whatever reporter gets wired up later.
    console.error('[module error]', error);
  }, [error]);

  return (
    <div className="p-6">
      <Link
        href="/dashboard/ajustes/tienda"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink mb-4"
      >
        <ArrowLeft size={16} />
        {full.common.buttons.back}
      </Link>

      <div className="bg-card rounded-2xl border border-border-soft shadow-sm p-10 text-center max-w-xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={26} className="text-amber-500" />
        </div>
        <h1 className="text-lg font-bold text-ink">{t.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.body}</p>

        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <RotateCw size={15} />
          {t.retry}
        </button>

        {/* Technical detail stays behind a deliberate click and is capped at
            the error's own message: Postgres/PostgREST text names tables,
            columns and policies — no access on its own, but a free schema map
            if shown unprompted. Never includes record data. */}
        {error?.message ? (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs font-medium text-faint hover:text-muted">
              {t.details}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-surface p-3 text-[11px] leading-relaxed text-muted whitespace-pre-wrap">
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
