import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { todayLocalISO } from '@amixos/shared/lib/format';

// Android home-screen widgets ("Hoy", "Cobros"). Same snapshot + meaning as
// the iOS widgets (targets/ami-widget/AmiHomeWidgets.swift); written by
// lib/widgetSnapshot.ts. Rendered by the headless widget task, so plain data
// in, no hooks.

export interface WidgetSnap {
  date: string;
  jobs: number;
  done: number;
  unassigned: number;
  next: string;
  nextTime: string;
  overdue: number;
  overdueAmount: string;
  paidMonth: string;
  labels: Record<string, string>;
}

type Theme = { bg: `#${string}`; ink: `#${string}`; muted: `#${string}`; accent: `#${string}`; warn: `#${string}` };
const LIGHT: Theme = { bg: '#FFFFFF', ink: '#111827', muted: '#6B7280', accent: '#2563EB', warn: '#D97706' };
const DARK: Theme = { bg: '#1F2937', ink: '#F9FAFB', muted: '#9CA3AF', accent: '#60A5FA', warn: '#FBBF24' };

const L = (s: WidgetSnap | null, k: string, fallback: string) => s?.labels?.[k] ?? fallback;

function Shell({ t, uri, children }: { t: Theme; uri: string; children: React.ReactNode }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: t.bg, borderRadius: 22, padding: 14, flexDirection: 'column' }}
    >
      {children}
    </FlexWidget>
  );
}

function Hint({ t, text }: { t: Theme; text: string }) {
  return <TextWidget text={text} style={{ fontSize: 13, color: t.muted }} />;
}

function today(s: WidgetSnap | null, t: Theme, wide: boolean) {
  if (!s || s.date !== todayLocalISO()) {
    return <Shell t={t} uri="amixos://dashboard"><Hint t={t} text={L(s, 'open', 'Abre Amixos para cargar')} /></Shell>;
  }
  return (
    <Shell t={t} uri="amixos://dashboard/trabajos">
      <TextWidget text={L(s, 'title', 'Hoy').toUpperCase()} style={{ fontSize: 11, fontWeight: '700', color: t.accent }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 }}>
        <TextWidget text={String(s.jobs)} style={{ fontSize: 30, fontWeight: '700', color: t.ink }} />
        <TextWidget text={` ${L(s, 'jobs', 'trabajos')}`} style={{ fontSize: 13, color: t.muted, marginBottom: 5 }} />
      </FlexWidget>
      {s.jobs === 0 ? (
        <Hint t={t} text={L(s, 'none', 'Sin trabajos hoy')} />
      ) : s.next ? (
        <TextWidget
          text={`${L(s, 'next', 'Sigue')}: ${[s.nextTime, s.next].filter(Boolean).join(' · ')}`}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 13, fontWeight: '600', color: t.ink }}
        />
      ) : (
        <Hint t={t} text={`${s.done} ${L(s, 'done', 'terminados')}`} />
      )}
      {s.unassigned > 0 ? (
        <TextWidget text={`${s.unassigned} ${L(s, 'unassigned', 'sin cuadrilla')}`} style={{ fontSize: 12, fontWeight: '600', color: t.warn, marginTop: 4 }} />
      ) : null}
      {wide && s.overdue > 0 ? (
        <TextWidget text={`${s.overdue} ${L(s, 'overdue', 'vencidas')} · ${s.overdueAmount}`} style={{ fontSize: 12, color: t.warn, marginTop: 2 }} />
      ) : null}
      {wide ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'amixos://ami/call' }}
          style={{ marginTop: 8, backgroundColor: t.accent, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 }}
        >
          <TextWidget text={L(s, 'talk', 'Hablar con Ami')} style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }} />
        </FlexWidget>
      ) : null}
    </Shell>
  );
}

function money(s: WidgetSnap | null, t: Theme) {
  if (!s) return <Shell t={t} uri="amixos://dashboard"><Hint t={t} text="Abre Amixos para cargar" /></Shell>;
  if (!s.paidMonth) return <Shell t={t} uri="amixos://dashboard"><Hint t={t} text={L(s, 'noAccess', 'Solo para dueños y administradores')} /></Shell>;
  return (
    <Shell t={t} uri="amixos://dashboard/facturas">
      <TextWidget text={L(s, 'money', 'Cobros').toUpperCase()} style={{ fontSize: 11, fontWeight: '700', color: t.accent }} />
      <TextWidget text={s.paidMonth} style={{ fontSize: 24, fontWeight: '700', color: t.ink, marginTop: 2 }} />
      <TextWidget text={L(s, 'paidMonth', 'cobrado este mes')} style={{ fontSize: 12, color: t.muted }} />
      {s.overdue > 0 ? (
        <TextWidget text={`${s.overdueAmount} ${L(s, 'owed', 'vencido por cobrar')}`} style={{ fontSize: 13, fontWeight: '600', color: t.warn, marginTop: 8 }} />
      ) : null}
    </Shell>
  );
}

/** Light + dark versions for a widget name and size. */
export function renderAmiWidget(name: string, snap: WidgetSnap | null, widthDp: number) {
  const wide = widthDp >= 220;
  const build = (t: Theme) => (name === 'AmiMoney' ? money(snap, t) : today(snap, t, wide));
  return { light: build(LIGHT), dark: build(DARK) };
}
