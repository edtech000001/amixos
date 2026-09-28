// Web-only PolicyConsentScreen — see LoginScreen.web.tsx for the why.
//
// Same contract and same rules as the native variant: both documents in one
// continuous scroll (tabs would let someone accept having read one), Accept
// always visible but disabled until the scroll reaches the end, and
// `scrolled_to_end` recorded rather than assumed.

import { useMemo, useRef, useState, type UIEvent, type ReactNode } from 'react';
import { useLang } from '../../i18n';
import { termsOfService } from '../../legal/terms';
import { privacyPolicy } from '../../legal/privacy';
import type { LegalContent, Lang } from '../../legal/types';

export interface PolicyConsentScreenProps {
  isUpdate: boolean;
  onAccept: (scrolledToEnd: boolean) => Promise<void>;
  onSignOut: () => void;
}

export function PolicyConsentScreen({ isUpdate, onAccept, onSignOut }: PolicyConsentScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.common.legalConsent;
  const lang: Lang = locale === 'en' ? 'en' : 'es';

  const [atEnd, setAtEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reachedEnd = useRef(false);

  const docs = useMemo(
    () => [
      { label: t.docTerms, content: termsOfService[lang] },
      { label: t.docPrivacy, content: privacyPolicy[lang] },
    ],
    [lang, t],
  );

  const markRead = () => {
    if (reachedEnd.current) return;
    reachedEnd.current = true;
    setAtEnd(true);
  };

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 24px of slack — exact equality is unreliable with fractional device
    // pixel ratios, and a button that will not enable at the very bottom of a
    // long document is maddening.
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) markRead();
  };

  // A viewport tall enough to show everything never scrolls; don't trap them.
  const onRef = (el: HTMLDivElement | null) => {
    if (el && el.scrollHeight <= el.clientHeight + 24) markRead();
  };

  const accept = async () => {
    if (busy || !atEnd) return;
    setBusy(true);
    setError('');
    try {
      await onAccept(reachedEnd.current);
    } catch {
      setError(t.error);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-surface flex flex-col">
      <div className="px-6 pt-8 pb-4 border-b border-border-soft">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
          <p className="text-sm text-muted mt-1">
            {isUpdate ? t.subtitleUpdated : t.subtitleNew}
          </p>
        </div>
      </div>

      <div ref={onRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-3xl">
          {docs.map((doc, i) => (
            <div key={doc.label} className={i > 0 ? 'mt-12 pt-12 border-t border-border-soft' : ''}>
              <LegalBody content={doc.content} />
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pt-4 pb-6 border-t border-border-soft bg-card">
        <div className="mx-auto w-full max-w-3xl">
          {error ? (
            <p className="text-xs text-red-600 mb-2 text-center">{error}</p>
          ) : !atEnd ? (
            <p className="text-xs text-faint mb-2 text-center">{t.scrollHint}</p>
          ) : null}

          <button
            type="button"
            onClick={accept}
            disabled={!atEnd || busy}
            className={`w-full rounded-2xl py-3.5 font-semibold transition-opacity ${
              atEnd && !busy
                ? 'bg-primary text-white hover:opacity-90'
                : 'bg-border text-faint cursor-not-allowed'
            }`}
          >
            {busy ? t.accepting : t.accept}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="w-full mt-3 text-sm font-medium text-muted hover:text-ink"
          >
            {t.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}

function LegalBody({ content }: { content: LegalContent }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-ink">{content.title}</h2>
      <p className="text-xs text-faint mt-1 mb-5">{content.updated}</p>
      <div className="space-y-3">
        {content.intro.map((p, i) => <Para key={`i${i}`} text={p} />)}
      </div>
      {content.sections.map((s, i) => (
        <section key={i} className="mt-8">
          <h3 className="text-base font-semibold text-ink">{s.heading}</h3>
          <div className="mt-2 space-y-2">
            {s.body.map((p, j) => <Para key={j} text={p} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Para({ text }: { text: string }): ReactNode {
  if (text.startsWith('- ')) {
    return (
      <p className="flex gap-2 text-sm leading-relaxed text-muted">
        <span aria-hidden className="text-faint">•</span>
        <span>{bold(text.slice(2))}</span>
      </p>
    );
  }
  return <p className="text-sm leading-relaxed text-muted">{bold(text)}</p>;
}

function bold(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
