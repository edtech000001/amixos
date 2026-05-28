'use client';

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';

/**
 * Top-of-page banner shown to mobile-browser users nudging them toward
 * the native app. Sits in the root layout so it appears on every route
 * (auth + dashboard) — catches users right when they land, before they
 * commit to the mobile-web flow.
 *
 * Behavior:
 *   - User-Agent sniff to detect iOS/Android. Skipped on desktop.
 *   - Dismissal persisted to localStorage so it doesn't re-appear after
 *     the user has already said no.
 *   - "Open" links to the URL in NEXT_PUBLIC_IOS_APP_URL (TestFlight for
 *     now, App Store later). If the env var is missing the banner is a
 *     no-op so we never link to a broken page.
 */

const DISMISS_KEY = 'mobile_app_banner_dismissed_v1';

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  // iPadOS 13+ reports as Macintosh w/ touch — check that explicitly.
  if (/iphone|ipad|ipod/.test(ua) || (ua.includes('mac') && 'ontouchend' in document)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

export function MobileAppBanner() {
  const { t: full } = useLang();
  const t = full.common.mobileAppBanner;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const platform = detectPlatform();
    if (platform === 'desktop') return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  // For now we only have an iOS TestFlight URL. Once Android joins, swap
  // this to detect platform → pick URL.
  const url = process.env.NEXT_PUBLIC_IOS_APP_URL;
  if (!url) return null;

  return (
    <div className="bg-primary text-white px-4 py-2.5 flex items-center gap-3 md:hidden">
      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
        <Smartphone size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight">{t.title}</p>
        <p className="text-[11px] opacity-90 leading-tight">{t.subtitle}</p>
      </div>
      <a
        href={url}
        className="bg-white text-primary text-xs font-semibold px-3 py-1.5 rounded-full shrink-0"
      >
        {t.openBtn}
      </a>
      <button
        type="button"
        onClick={dismiss}
        className="p-1 -mr-1 shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
