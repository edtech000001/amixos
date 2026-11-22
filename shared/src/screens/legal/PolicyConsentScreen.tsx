// The consent gate: full terms + privacy, scrolled, then accepted.
//
// Shown before the dashboard to anyone who has not accepted the current
// versions — which covers people who signed up before this existed, invited
// members (who never see onboarding), and everyone again after a change
// flagged material in shared/legal/versions.ts.
//
// Both documents are one continuous scroll rather than two tabs. Tabs let
// someone accept having opened only one of them, and "they scrolled past it"
// is the whole evidentiary point.
//
// The Accept button is ALWAYS visible in a fixed footer, and disabled until
// the scroll reaches the end. Hiding it would leave people hunting for the
// next step; enabling it immediately would make `scrolled_to_end` a lie.

import { useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { PressableScale } from '../../ui/PressableScale';
import { useLang } from '../../i18n';
import { useThemeColors } from '../../theme';
import { termsOfService } from '../../legal/terms';
import { privacyPolicy } from '../../legal/privacy';
import type { LegalContent, Lang } from '../../legal/types';

export interface PolicyConsentScreenProps {
  /** True when this is a re-prompt after a material change, which needs
   *  different wording from a first-time acceptance. */
  isUpdate: boolean;
  /** Writes the acceptance. Rejecting keeps the user on the screen — a
   *  consent we failed to record must not look accepted. */
  onAccept: (scrolledToEnd: boolean) => Promise<void>;
  /** The only way out other than accepting. */
  onSignOut: () => void;
}

export function PolicyConsentScreen({ isUpdate, onAccept, onSignOut }: PolicyConsentScreenProps) {
  const { t: full, locale } = useLang();
  const t = full.common.legalConsent;
  const c = useThemeColors();

  // The documents follow the app's language; the user can read either on the
  // public pages, but the one they ACCEPT should be the one they can read.
  const lang: Lang = locale === 'en' ? 'en' : 'es';

  const [atEnd, setAtEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reachedEnd = useRef(false);
  // Reading progress (0–1) for the footer bar, and what "Keep reading" needs
  // to page down: people didn't realise the document scrolls.
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const viewH = useRef(0);
  const offsetY = useRef(0);

  const docs = useMemo(
    () => [
      { label: t.docTerms, content: termsOfService[lang] },
      { label: t.docPrivacy, content: privacyPolicy[lang] },
    ],
    [lang, t],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    offsetY.current = contentOffset.y;
    const range = contentSize.height - layoutMeasurement.height;
    setProgress(range > 0 ? Math.min(1, contentOffset.y / range) : 1);
    // 24px of slack: exact equality never fires reliably across devices with
    // fractional scaling, and a button that refuses to enable at the very
    // bottom of a long document is maddening.
    const bottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 24;
    if (bottom && !reachedEnd.current) {
      reachedEnd.current = true;
      setAtEnd(true);
    }
  };

  // A document short enough not to scroll must not trap the user.
  const onContentSizeChange = (_w: number, h: number) => {
    if (h > 0 && viewH.current > 0 && h <= viewH.current + 24 && !reachedEnd.current) {
      reachedEnd.current = true;
      setAtEnd(true);
    }
  };

  // Before the end, the main button pages down a screen (minus a little
  // overlap so no line is skipped) — they still scroll past every part.
  const pageDown = () => {
    scrollRef.current?.scrollTo({ y: offsetY.current + Math.max(200, viewH.current - 80), animated: true });
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
    <View className="flex-1 bg-surface">
      <View className="px-5 pt-14 pb-4 border-b border-border-soft">
        <Text className="text-2xl font-bold text-ink">{t.title}</Text>
        <Text className="text-sm text-muted mt-1">
          {isUpdate ? t.subtitleUpdated : t.subtitleNew}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-5 py-6"
        onLayout={e => { viewH.current = e.nativeEvent.layout.height; }}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={64}
      >
        {docs.map((doc, i) => (
          <View key={doc.label} className={i > 0 ? 'mt-10 pt-10 border-t border-border-soft' : ''}>
            <LegalBody content={doc.content} />
          </View>
        ))}
        {/* Padding so the last line clears the fixed footer. */}
        <View className="h-6" />
      </ScrollView>

      <View className="border-t border-border-soft bg-card">
      {/* Reading progress — shows at a glance there's more below. */}
      <View style={{ height: 3, backgroundColor: c.border }}>
        <View style={{ height: 3, width: `${Math.round((atEnd ? 1 : progress) * 100)}%`, backgroundColor: c.primary }} />
      </View>
      <View className="px-5 pt-4 pb-10">
        {error ? (
          <Text className="text-xs text-red-600 mb-2 text-center">{error}</Text>
        ) : null}

        <PressableScale scaleTo={0.97}
          onPress={atEnd ? accept : pageDown}
          disabled={busy}
          className={`w-full py-4 rounded-2xl items-center flex-row justify-center gap-2 ${atEnd ? 'bg-primary active:opacity-90' : 'bg-primary/15 border border-primary/40 active:opacity-80'}`}
        >
          {busy ? (
            <ActivityIndicator color={c.white} />
          ) : atEnd ? (
            <Text className="text-base font-semibold text-white">{t.accept}</Text>
          ) : (
            <>
              <ChevronDown size={18} color={c.primary} />
              <Text className="text-base font-semibold text-primary">{t.scrollHint}</Text>
            </>
          )}
        </PressableScale>

        <Pressable onPress={onSignOut} className="mt-3 py-2" hitSlop={8}>
          <Text className="text-sm font-medium text-muted text-center">{t.signOut}</Text>
        </Pressable>
      </View>
      </View>
    </View>
  );
}

/** Renders a LegalContent with the documents' two formatting rules: a leading
 *  "- " is a bullet, **text** is bold. */
function LegalBody({ content }: { content: LegalContent }) {
  return (
    <View>
      <Text className="text-xl font-bold text-ink">{content.title}</Text>
      <Text className="text-xs text-faint mt-1 mb-4">{content.updated}</Text>
      {content.intro.map((p, i) => <Para key={`i${i}`} text={p} />)}
      {content.sections.map((s, i) => (
        <View key={i} className="mt-6">
          <Text className="text-base font-semibold text-ink mb-2">{s.heading}</Text>
          {s.body.map((p, j) => <Para key={j} text={p} />)}
        </View>
      ))}
    </View>
  );
}

function Para({ text }: { text: string }) {
  const bullet = text.startsWith('- ');
  const body = bullet ? text.slice(2) : text;
  return (
    <View className={`flex-row ${bullet ? 'gap-2' : ''} mb-2`}>
      {bullet ? <Text className="text-faint">•</Text> : null}
      <Text className="flex-1 text-sm leading-6 text-muted">{bold(body)}</Text>
    </View>
  );
}

function bold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={i} className="font-semibold text-ink">{part.slice(2, -2)}</Text>
    ) : (
      <Text key={i}>{part}</Text>
    ),
  );
}
