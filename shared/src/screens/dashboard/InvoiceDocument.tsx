// Config-driven invoice DOCUMENT (React Native). Printable/shareable body —
// no app chrome. Driven entirely by the view-model so it stays in sync with the
// web document and the print/PDF HTML. Renders sections in vm.sections order.

import { Fragment, useState, type ReactNode } from 'react';
import { View, Text, Image, Platform, type TextStyle } from 'react-native';
import Svg, { Path, Circle, Rect, Ellipse, Line, Polyline, Polygon } from 'react-native-svg';
import {
  resolveFieldValue,
  customFieldElementText,
  fieldUsesAccent,
  onAccentColor,
  withAlpha,
  decorationRender,
  RN_FONTS,
  type InvoiceViewModel,
  type InvoiceSectionId,
  type InvoiceFont,
  type InvoiceElement,
  type DecoSpec,
} from '../../lib/invoiceTemplate';
import { INVOICE_ICON_NODES } from '../../lib/invoiceIconNodes';

function DecoSvg({ spec }: { spec: DecoSpec }) {
  return (
    <Svg width="100%" height="100%" viewBox={spec.viewBox} preserveAspectRatio="none">
      {spec.shapes.map((s, i) =>
        s.kind === 'circle' ? (
          <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />
        ) : (
          <Path key={i} d={s.d ?? ''} fill={s.fill} fillOpacity={s.opacity} />
        ),
      )}
    </Svg>
  );
}

function rnFont(font: InvoiceFont): string | undefined {
  const def = RN_FONTS[font];
  if (!def) return undefined; // sans → system
  return Platform.select({ ios: def.ios, android: def.android, default: def.android });
}

// Freeform icon glyph — same lucide-derived catalog the HTML/PDF + web use,
// stroked in the element color.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RNS_TAGS: Record<string, any> = {
  path: Path, circle: Circle, line: Line, rect: Rect, polyline: Polyline, polygon: Polygon, ellipse: Ellipse,
};
function IconGlyph({ icon, color }: { icon: string; color: string }) {
  const nodes = INVOICE_ICON_NODES[icon] ?? INVOICE_ICON_NODES.star ?? [];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 24 24">
      {nodes.map((n, i) => {
        const { t, ...attrs } = n;
        const Comp = RNS_TAGS[t];
        if (!Comp) return null;
        return <Comp key={i} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...attrs} />;
      })}
    </Svg>
  );
}

// Freeform shape — rendered via SVG so the ellipse / corner radius matches web.
function ShapeGlyph({ el, accent }: { el: InvoiceElement; accent: string }) {
  const fill = el.style?.fill ?? accent;
  if (el.shape === 'ellipse') {
    return (
      <Svg width="100%" height="100%">
        <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={fill} />
      </Svg>
    );
  }
  return (
    <Svg width="100%" height="100%">
      <Rect x="0" y="0" width="100%" height="100%" rx={el.style?.radius ?? 0} fill={fill} />
    </Svg>
  );
}

export function InvoiceDocument({ vm }: { vm: InvoiceViewModel }) {
  const [pageW, setPageW] = useState(0);
  const st = vm.style;
  const accent = st.accent;
  const cols = vm.columns;
  const h = vm.header;
  const small = st.fontPx - 2;
  const gap = st.density === 'compact' ? 14 : 22;
  const ff = rnFont(st.font);
  const onAcc = onAccentColor(accent);
  const subtleOnAcc = onAcc === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(17,24,39,0.68)';
  const tint = withAlpha(accent, 0.1);
  // Every Text gets the chosen family (RN doesn't inherit font through View).
  const T = ({ style, children, ...rest }: { style?: TextStyle; children: ReactNode; numberOfLines?: number }) => (
    <Text style={[{ fontFamily: ff }, style]} {...rest}>{children}</Text>
  );

  const SectLabel = ({ children }: { children: ReactNode }) => (
    <T style={{ fontSize: st.fontPx - 3, letterSpacing: 0.5, textTransform: 'uppercase', color: '#9CA3AF', fontWeight: '600', marginBottom: 6 }}>
      {children}
    </T>
  );

  const Logo = ({ width = 160, scale = 1 }: { width?: number; scale?: number }) =>
    h.showLogo && h.logoUrl ? (
      <Image source={{ uri: h.logoUrl }} resizeMode="contain" style={{ height: st.logoPx * scale, width, marginBottom: 8 }} />
    ) : null;

  const MetaLines = ({ subtle }: { subtle?: boolean }) => (
    <>
      <T style={{ color: subtle ? subtleOnAcc : '#374151', fontSize: small, marginTop: 4 }}>
        <T style={{ color: subtle ? subtleOnAcc : '#9CA3AF', fontSize: small }}>{h.issueLabel}: </T>{h.issueValue}
      </T>
      {h.dueValue ? (
        <T style={{ color: subtle ? subtleOnAcc : '#374151', fontSize: small }}>
          <T style={{ color: subtle ? subtleOnAcc : '#9CA3AF', fontSize: small }}>{h.dueLabel}: </T>{h.dueValue}
        </T>
      ) : null}
    </>
  );

  const FromBlock = () => (
    <View style={{ flex: 1 }}>
      <Logo />
      <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827' }}>{h.businessName}</T>
      {h.businessLines.map((l, i) => (
        <T key={i} style={{ color: '#6B7280', fontSize: small, marginTop: 2 }}>{l}</T>
      ))}
    </View>
  );
  const MetaBlock = ({ align }: { align: 'flex-start' | 'flex-end' }) => (
    <View style={{ alignItems: align }}>
      <T style={{ fontWeight: '700', textTransform: 'uppercase', color: accent, letterSpacing: 1, fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</T>
      <T style={{ fontWeight: '600', marginTop: 2, color: '#111827' }}>{h.invoiceNumber}</T>
      <T style={{ textTransform: 'uppercase', color: '#6B7280', fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: 0.4 }}>{h.statusLabel}</T>
      <MetaLines />
    </View>
  );

  const renderHeader = (): ReactNode => {
    switch (vm.archetype) {
      case 'leftbar':
        return (
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
            <View style={{ width: 5, borderRadius: 3, backgroundColor: accent }} />
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
              <FromBlock />
              <MetaBlock align="flex-end" />
            </View>
          </View>
        );
      case 'split':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <FromBlock />
            <View style={{ backgroundColor: tint, borderRadius: 12, padding: 14, minWidth: '42%' }}>
              <MetaBlock align="flex-end" />
            </View>
          </View>
        );
      case 'stamp':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
            <FromBlock />
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ backgroundColor: accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                <T style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, fontSize: st.fontPx + 4, color: onAcc }}>{h.invoiceTitle}</T>
                <T style={{ fontWeight: '600', fontSize: st.fontPx, color: onAcc, marginTop: 1 }}>{h.invoiceNumber}</T>
                <T style={{ textTransform: 'uppercase', fontSize: st.fontPx - 3, letterSpacing: 0.4, color: subtleOnAcc, marginTop: 2 }}>{h.statusLabel}</T>
              </View>
              <View style={{ marginTop: 8, alignItems: 'flex-end' }}><MetaLines /></View>
            </View>
          </View>
        );
      case 'band':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, backgroundColor: accent, borderRadius: 10, padding: gap }}>
            <View style={{ flex: 1 }}>
              <Logo />
              <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: onAcc }}>{h.businessName}</T>
              {h.businessLines.map((l, i) => (
                <T key={i} style={{ color: subtleOnAcc, fontSize: small, marginTop: 2 }}>{l}</T>
              ))}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontWeight: '700', textTransform: 'uppercase', color: onAcc, letterSpacing: 1, fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</T>
              <T style={{ fontWeight: '600', marginTop: 2, color: onAcc }}>{h.invoiceNumber}</T>
              <T style={{ textTransform: 'uppercase', color: subtleOnAcc, fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: 0.4 }}>{h.statusLabel}</T>
              <MetaLines subtle />
            </View>
          </View>
        );
      case 'centered':
        return (
          <View style={{ alignItems: 'center', borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 12 }}>
            <Logo />
            <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827', textAlign: 'center' }}>{h.businessName}</T>
            {h.businessLines.map((l, i) => (
              <T key={i} style={{ color: '#6B7280', fontSize: small, marginTop: 2, textAlign: 'center' }}>{l}</T>
            ))}
            <T style={{ fontWeight: '700', textTransform: 'uppercase', color: accent, letterSpacing: 1.4, fontSize: st.fontPx + 8, marginTop: 12, textAlign: 'center' }}>{h.invoiceTitle}</T>
            <T style={{ fontWeight: '600', color: '#6B7280', fontSize: small, marginTop: 2, textAlign: 'center' }}>{h.invoiceNumber} · {h.statusLabel}</T>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}><MetaLines /></View>
          </View>
        );
      case 'sidebar':
        return (
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'stretch' }}>
            <View style={{ backgroundColor: tint, borderRadius: 12, padding: 14, width: '40%' }}>
              <Logo width={120} />
              <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827' }}>{h.businessName}</T>
              {h.businessLines.map((l, i) => (
                <T key={i} style={{ color: '#4B5563', fontSize: small, marginTop: 2 }}>{l}</T>
              ))}
            </View>
            <View style={{ flex: 1, paddingTop: 4 }}>
              <T style={{ fontWeight: '700', textTransform: 'uppercase', color: accent, letterSpacing: 1, fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</T>
              <T style={{ fontWeight: '600', marginTop: 2, color: '#111827' }}>{h.invoiceNumber}</T>
              <T style={{ textTransform: 'uppercase', color: '#6B7280', fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: 0.4 }}>{h.statusLabel}</T>
              <MetaLines />
            </View>
          </View>
        );
      case 'minimal':
        return (
          <View style={{ borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T style={{ textTransform: 'uppercase', color: '#6B7280', fontSize: small, letterSpacing: 1.4, fontWeight: '600' }}>{h.businessName}</T>
              {h.showLogo && h.logoUrl ? <Image source={{ uri: h.logoUrl }} resizeMode="contain" style={{ height: st.logoPx * 0.7, width: 120 }} /> : null}
            </View>
            <View style={{ width: 32, height: 3, backgroundColor: accent, borderRadius: 2, marginTop: 14, marginBottom: 8 }} />
            <T style={{ fontWeight: '300', fontSize: st.fontPx + 16, color: '#111827', letterSpacing: 0.4 }}>{h.invoiceTitle}</T>
            <T style={{ color: '#6B7280', fontSize: small, marginTop: 6 }}>
              {h.invoiceNumber} · {h.statusLabel} · {h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}
            </T>
          </View>
        );
      case 'hero':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <FromBlock />
            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <T style={{ fontWeight: '800', textTransform: 'uppercase', color: accent, fontSize: st.fontPx + 30 }}>{h.invoiceTitle}</T>
              <T style={{ fontWeight: '600', marginTop: 6, color: '#111827' }}>{h.invoiceNumber}</T>
              <T style={{ textTransform: 'uppercase', color: '#6B7280', fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: 0.4 }}>{h.statusLabel}</T>
              <MetaLines />
            </View>
          </View>
        );
      case 'wordmark':
        return (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <FromBlock />
              <T style={{ fontWeight: '800', textTransform: 'uppercase', color: accent, letterSpacing: 1, fontSize: st.fontPx + 16, flexShrink: 0 }}>{h.invoiceTitle}</T>
            </View>
            <View style={{ height: 2, backgroundColor: '#E5E7EB', marginTop: 12, marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T style={{ color: '#6B7280', fontSize: small }}>{h.invoiceNumber} · {h.statusLabel}</T>
              <T style={{ color: '#6B7280', fontSize: small }}>{h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}</T>
            </View>
          </View>
        );
      case 'panel':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, backgroundColor: accent, borderRadius: 12, padding: 18 }}>
            <View style={{ flex: 1 }}>
              <Logo />
              <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: onAcc }}>{h.businessName}</T>
              {h.businessLines.map((l, i) => (
                <T key={i} style={{ color: subtleOnAcc, fontSize: small, marginTop: 2 }}>{l}</T>
              ))}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '800', fontSize: st.fontPx + 12, color: onAcc }}>{h.invoiceTitle}</T>
              <T style={{ fontWeight: '600', marginTop: 4, color: onAcc }}>{h.invoiceNumber}</T>
              <T style={{ textTransform: 'uppercase', color: subtleOnAcc, fontSize: st.fontPx - 3, marginTop: 3, letterSpacing: 0.4 }}>{h.statusLabel}</T>
              <MetaLines subtle />
            </View>
          </View>
        );
      case 'elegant':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <T style={{ textTransform: 'uppercase', letterSpacing: 2, fontWeight: '400', fontSize: st.fontPx + 18, color: '#111827' }}>{h.invoiceTitle}</T>
              <T style={{ color: '#6B7280', fontSize: small, marginTop: 4 }}>{h.invoiceNumber} · {h.statusLabel}</T>
              <T style={{ color: '#9CA3AF', fontSize: small, marginTop: 6 }}>{h.issueLabel} {h.issueValue}{h.dueValue ? `  ·  ${h.dueLabel} ${h.dueValue}` : ''}</T>
            </View>
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {h.showLogo && h.logoUrl ? <Image source={{ uri: h.logoUrl }} resizeMode="contain" style={{ height: 40, width: 70, marginBottom: 4 }} /> : null}
              <T style={{ textTransform: 'uppercase', letterSpacing: 1, color: '#6B7280', fontSize: st.fontPx - 3, textAlign: 'center', paddingHorizontal: 8 }}>{h.businessName}</T>
            </View>
          </View>
        );
      case 'titleLeft':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T style={{ textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: '700', fontSize: st.fontPx + 14, color: accent }}>{h.invoiceTitle}</T>
              <T style={{ fontWeight: '600', color: '#6B7280', fontSize: small, marginTop: 4 }}>{h.invoiceNumber} · {h.statusLabel}</T>
              <MetaLines />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {h.showLogo && h.logoUrl ? <Image source={{ uri: h.logoUrl }} resizeMode="contain" style={{ height: st.logoPx, width: 140, marginBottom: 6 }} /> : null}
              <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827' }}>{h.businessName}</T>
              {h.businessLines.map((l, i) => (
                <T key={i} style={{ color: '#6B7280', fontSize: small, marginTop: 2 }}>{l}</T>
              ))}
            </View>
          </View>
        );
      case 'bandCenter':
        return (
          <View style={{ alignItems: 'center' }}>
            <Logo />
            <View style={{ alignSelf: 'stretch', backgroundColor: accent, paddingVertical: 10, marginVertical: 8 }}>
              <T style={{ color: onAcc, textTransform: 'uppercase', letterSpacing: 4, fontWeight: '700', fontSize: st.fontPx + 6, textAlign: 'center' }}>{h.invoiceTitle}</T>
            </View>
            <T style={{ color: '#6B7280', fontSize: small, textAlign: 'center' }}>
              {h.invoiceNumber} · {h.statusLabel} · {h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}
            </T>
          </View>
        );
      default: // classic
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Logo />
              <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827' }}>{h.businessName}</T>
              {h.businessLines.map((l, i) => (
                <T key={i} style={{ color: '#6B7280', fontSize: small, marginTop: 2 }}>{l}</T>
              ))}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontWeight: '700', textTransform: 'uppercase', color: accent, letterSpacing: 1, fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</T>
              <T style={{ fontWeight: '600', marginTop: 2, color: '#111827' }}>{h.invoiceNumber}</T>
              <T style={{ textTransform: 'uppercase', color: '#6B7280', fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: 0.4 }}>{h.statusLabel}</T>
              <MetaLines />
            </View>
          </View>
        );
    }
  };

  const th = vm.tableHeader;
  const thFilled = th !== 'plain';
  const thBg = th === 'accent' ? accent : th === 'dark' ? '#1F2937' : th === 'tint' ? tint : undefined;
  const thColor = th === 'accent' ? onAcc : th === 'dark' ? '#FFFFFF' : th === 'tint' ? '#4B5563' : '#9CA3AF';
  const hPad = thFilled ? 8 : 0;
  const hCell: TextStyle = { fontSize: st.fontPx - 3, textTransform: 'uppercase', color: thColor, fontWeight: '600' };

  const renderers: Record<InvoiceSectionId, () => ReactNode> = {
    header: renderHeader,
    billTo: () => (
      <View>
        <SectLabel>{vm.labels.billTo}</SectLabel>
        {vm.billTo.map((c, i) => (
          <View key={i} style={{ marginTop: i > 0 ? 6 : 0 }}>
            <T style={{ fontWeight: '600', color: '#111827' }}>{c.name}</T>
            {c.lines.map((l, j) => (
              <T key={j} style={{ color: '#6B7280', fontSize: small }}>{l}</T>
            ))}
          </View>
        ))}
      </View>
    ),
    lineItems: () => (
      <View>
        <View
          style={[
            { flexDirection: 'row', alignItems: 'center' },
            thFilled
              ? { backgroundColor: thBg, borderRadius: th === 'accent' ? 8 : 0, paddingVertical: 7, paddingHorizontal: hPad, marginBottom: 4 }
              : { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 6, marginBottom: 4 },
          ]}
        >
          <T style={{ flex: 1, ...hCell }}>{vm.labels.item}</T>
          {cols.qty ? <T style={{ width: 44, textAlign: 'center', ...hCell }}>{vm.labels.qty}</T> : null}
          {cols.rate ? <T style={{ width: 76, textAlign: 'right', ...hCell }}>{vm.labels.rate}</T> : null}
          {cols.total ? <T style={{ width: 84, textAlign: 'right', ...hCell }}>{vm.labels.total}</T> : null}
        </View>
        {vm.items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, paddingHorizontal: hPad, borderBottomWidth: i < vm.items.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
            <T style={{ flex: 1, color: '#1F2937' }}>{it.description}</T>
            {cols.qty ? <T style={{ width: 44, textAlign: 'center', color: '#6B7280' }}>{it.qty}</T> : null}
            {cols.rate ? <T style={{ width: 76, textAlign: 'right', color: '#6B7280' }}>{it.rate}</T> : null}
            {cols.total ? <T style={{ width: 84, textAlign: 'right', fontWeight: '600', color: '#111827' }}>{it.total}</T> : null}
          </View>
        ))}
      </View>
    ),
    totals: () =>
      vm.totalBar ? (
        <View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 48 }}>
              <T style={{ color: '#374151' }}>{vm.labels.subtotal}</T>
              <T style={{ minWidth: 110, textAlign: 'right', color: '#111827' }}>{vm.totals.subtotal}</T>
            </View>
            {vm.totals.taxLabel ? (
              <View style={{ flexDirection: 'row', gap: 48 }}>
                <T style={{ color: '#374151' }}>{vm.totals.taxLabel}</T>
                <T style={{ minWidth: 110, textAlign: 'right', color: '#111827' }}>{vm.totals.taxValue}</T>
              </View>
            ) : null}
          </View>
          <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 }}>
            <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: onAcc }}>{vm.labels.total}</T>
            <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: onAcc }}>{vm.totals.total}</T>
          </View>
        </View>
      ) : (
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 48 }}>
            <T style={{ color: '#374151' }}>{vm.labels.subtotal}</T>
            <T style={{ minWidth: 110, textAlign: 'right', color: '#111827' }}>{vm.totals.subtotal}</T>
          </View>
          {vm.totals.taxLabel ? (
            <View style={{ flexDirection: 'row', gap: 48 }}>
              <T style={{ color: '#374151' }}>{vm.totals.taxLabel}</T>
              <T style={{ minWidth: 110, textAlign: 'right', color: '#111827' }}>{vm.totals.taxValue}</T>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 48, borderTopWidth: 2, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 2 }}>
            <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827' }}>{vm.labels.total}</T>
            <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, minWidth: 110, textAlign: 'right', color: accent }}>{vm.totals.total}</T>
          </View>
        </View>
      ),
    customFields: () => (
      <View>
        <SectLabel>{vm.labels.customFields}</SectLabel>
        {vm.customFields.map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 2 }}>
            <T style={{ color: '#6B7280', fontSize: small, flex: 1 }}>{f.label}</T>
            <T style={{ color: '#111827', fontSize: small, fontWeight: '500', flex: 1, textAlign: 'right' }}>{f.value}</T>
          </View>
        ))}
      </View>
    ),
    notes: () => (
      <View>
        <SectLabel>{vm.labels.notes}</SectLabel>
        <T style={{ color: '#4B5563', fontSize: small, lineHeight: small * 1.5 }}>{vm.notes}</T>
      </View>
    ),
    paymentInstructions: () => (
      <View>
        <SectLabel>{vm.lang === 'es' ? 'Instrucciones de pago' : 'Payment instructions'}</SectLabel>
        <T style={{ color: '#4B5563', fontSize: small, lineHeight: small * 1.5 }}>{vm.paymentInstructions}</T>
      </View>
    ),
    footer: () => (
      <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 }}>
        <T style={{ color: '#9CA3AF', fontSize: small, textAlign: 'center' }}>{vm.footer}</T>
      </View>
    ),
  };

  // Freeform overlay element (drawn on top of the base document).
  const renderEl = (el: InvoiceElement): ReactNode => {
    if (el.kind === 'logo') {
      return vm.header.logoUrl ? (
        <Image source={{ uri: vm.header.logoUrl }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      ) : null;
    }
    if (el.kind === 'shape') return <ShapeGlyph el={el} accent={accent} />;
    if (el.kind === 'icon') return <IconGlyph icon={el.icon ?? 'star'} color={el.style?.color ?? accent} />;
    if (el.kind === 'field' && el.field === 'lineItems') return renderers.lineItems();
    const txt = el.kind === 'text' ? (el.text ?? '') : el.kind === 'customField' ? customFieldElementText(vm, el) : resolveFieldValue(vm, el.field!);
    const s = el.style ?? {};
    const color = s.color ?? (el.kind === 'field' && fieldUsesAccent(el.field) ? accent : '#1F2937');
    return (
      <T
        style={{
          fontSize: s.fontSize,
          fontWeight: s.bold ? '700' : undefined,
          color,
          textAlign: s.align,
          lineHeight: s.fontSize ? s.fontSize * 1.35 : undefined,
          fontFamily: s.font ? rnFont(s.font) : ff,
        }}
      >
        {txt}
      </T>
    );
  };

  const deco = decorationRender(vm.decoration, accent);
  const fullPage = vm.decoration !== 'none' || vm.footerBar || vm.pageTint;
  const minHeight = fullPage && pageW > 0 ? pageW * (11 / 8.5) : undefined;
  const flowDoc = (
    <View
      onLayout={fullPage ? e => setPageW(e.nativeEvent.layout.width) : undefined}
      style={{ position: 'relative', overflow: 'hidden', backgroundColor: vm.pageTint ? withAlpha(accent, 0.06) : '#FFFFFF', minHeight }}
    >
      {deco.full ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
          <DecoSvg spec={deco.full} />
        </View>
      ) : null}
      {deco.topBand ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: deco.topBand.height, zIndex: 0 }}>
          <DecoSvg spec={deco.topBand.spec} />
        </View>
      ) : null}
      {deco.bottomBand ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: deco.bottomBand.height, zIndex: 0 }}>
          <DecoSvg spec={deco.bottomBand.spec} />
        </View>
      ) : null}
      <View style={{ paddingTop: st.pad + deco.padTop, paddingBottom: st.pad + deco.padBottom, paddingHorizontal: st.pad, zIndex: 1, ...(fullPage ? { flex: 1 } : null) }}>
        {vm.sections.map((id, i) => (
          <Fragment key={id}>
            <View style={{ marginBottom: i < vm.sections.length - 1 ? gap : 0 }}>{renderers[id]()}</View>
          </Fragment>
        ))}
      </View>
      {vm.footerBar && vm.footerContact.length ? (
        <View style={{ zIndex: 1, marginTop: gap, marginHorizontal: st.pad, marginBottom: st.pad, backgroundColor: accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          {vm.footerContact.map((l, i) => (
            <T key={i} style={{ color: i === 0 ? onAcc : subtleOnAcc, fontWeight: i === 0 ? '700' : '400', fontSize: small }}>
              {i > 0 ? '   ·   ' : ''}{l}
            </T>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (vm.layoutMode === 'freeform') {
    return (
      <View>
        {flowDoc}
        {vm.elements.length ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2 }}>
            {vm.elements.map(el => (
              <View
                key={el.id}
                style={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, overflow: 'hidden', opacity: el.style?.opacity ?? 1 }}
              >
                {renderEl(el)}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  return flowDoc;
}
