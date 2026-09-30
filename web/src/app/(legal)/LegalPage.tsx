'use client';

// Shell for the public legal pages (/privacy, /terms).
//
// Public on purpose: both apps link here from the signup screen BEFORE anyone
// has an account, and App Store Connect needs a privacy-policy URL that opens
// without a login. So no AppContext, no Supabase, no dashboard chrome — a
// dead-simple page that renders even when everything else is broken.
//
// Spanish is the default because the app and its users are Spanish-first; the
// EN toggle exists because App Review reads English and has to be able to
// check that the policy matches what the app does.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

// Types and text both come from shared/ — the consent gate inside the apps
// renders the same documents, and they must not drift.
import type { Lang, LegalContent, LegalDoc } from '@amixos/shared/legal/types';
export type { Lang, LegalContent } from '@amixos/shared/legal/types';

export function LegalPage({ content }: { content: LegalDoc }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('es');
  const c = content[lang];

  // The arrow used to be a hard link to "/", which sent anyone who opened the
  // terms from a form back to the marketing page with their work gone. Go back
  // where they came from when there is a there to go back to; a direct open
  // (App Store Connect, a shared link) has no history, so that still offers
  // the home page instead of a dead button.
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => setCanGoBack(window.history.length > 1), []);

  // These labels stay inline rather than coming from the i18n bundle: this
  // page deliberately has no app dependencies so it renders even when
  // everything else is broken.
  const backLabel = canGoBack ? (lang === 'en' ? 'Back' : 'Volver') : 'Amixos';

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-10">
          {canGoBack ? (
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
            >
              <ArrowLeft size={16} />
              {backLabel}
            </button>
          ) : (
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
              <ArrowLeft size={16} />
              {backLabel}
            </Link>
          )}
          <div className="inline-flex rounded-full border border-gray-200 p-0.5">
            {(['es', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  lang === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{c.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{c.updated}</p>

        <div className="mt-8 space-y-4">
          {c.intro.map((p, i) => (
            <Paragraph key={i} text={p} />
          ))}
        </div>

        {c.sections.map((s, i) => (
          <section key={i} className="mt-10">
            <h2 className="text-lg font-semibold">{s.heading}</h2>
            <div className="mt-3 space-y-3">
              {s.body.map((p, j) => (
                <Paragraph key={j} text={p} />
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-16 border-t border-gray-100 pt-6 text-xs text-gray-400">
          <p>
            Amixos ·{' '}
            <a href="mailto:soporte@amixos.com" className="underline hover:text-gray-600">
              soporte@amixos.com
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function Paragraph({ text }: { text: string }): ReactNode {
  if (text.startsWith('- ')) {
    return (
      <p className="flex gap-2 text-sm leading-relaxed text-gray-700">
        <span aria-hidden className="text-gray-400">•</span>
        <span>{bold(text.slice(2))}</span>
      </p>
    );
  }
  return <p className="text-sm leading-relaxed text-gray-700">{bold(text)}</p>;
}

/** **word** → bold, so the documents can emphasise without a markdown dep. */
function bold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
