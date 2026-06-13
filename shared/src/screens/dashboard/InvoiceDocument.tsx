// Config-driven invoice DOCUMENT (React Native). Printable/shareable body —
// no app chrome. Driven entirely by the view-model so it stays in sync with the
// web document and the print/PDF HTML. Renders sections in vm.sections order.

import { Fragment, type ReactNode } from 'react';
import { View, Text, Image, Platform, type TextStyle } from 'react-native';
import {
  resolveFieldValue,
  type InvoiceViewModel,
  type InvoiceSectionId,
  type InvoiceFont,
  type InvoiceElement,
} from '../../lib/invoiceTemplate';

function rnFont(font: InvoiceFont): string | undefined {
  if (font === 'serif') return Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
  if (font === 'mono') return Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
  return undefined; // sans → system
}

export function InvoiceDocument({ vm }: { vm: InvoiceViewModel }) {
  const st = vm.style;
  const accent = st.accent;
  const cols = vm.columns;
  const small = st.fontPx - 2;
  const gap = st.density === 'compact' ? 14 : 22;
  const ff = rnFont(st.font);
  // Every Text gets the chosen family (RN doesn't inherit font through View).
  const T = ({ style, children, ...rest }: { style?: TextStyle; children: ReactNode; numberOfLines?: number }) => (
    <Text style={[{ fontFamily: ff }, style]} {...rest}>{children}</Text>
  );

  const SectLabel = ({ children }: { children: ReactNode }) => (
    <T style={{ fontSize: st.fontPx - 3, letterSpacing: 0.5, textTransform: 'uppercase', color: '#9CA3AF', fontWeight: '600', marginBottom: 6 }}>
      {children}
    </T>
  );

  const renderers: Record<InvoiceSectionId, () => ReactNode> = {
    header: () => (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 12 }}>
        <View style={{ flex: 1 }}>
          {vm.header.showLogo && vm.header.logoUrl ? (
            <Image source={{ uri: vm.header.logoUrl }} resizeMode="contain" style={{ height: st.logoPx, width: 160, marginBottom: 8 }} />
          ) : null}
          <T style={{ fontWeight: '700', fontSize: st.fontPx + 4, color: '#111827' }}>{vm.header.businessName}</T>
          {vm.header.businessLines.map((l, i) => (
            <T key={i} style={{ color: '#6B7280', fontSize: small, marginTop: 2 }}>{l}</T>
          ))}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T style={{ fontWeight: '700', textTransform: 'uppercase', color: accent, letterSpacing: 1, fontSize: st.fontPx + 6 }}>{vm.header.invoiceTitle}</T>
          <T style={{ fontWeight: '600', marginTop: 2, color: '#111827' }}>{vm.header.invoiceNumber}</T>
          <T style={{ textTransform: 'uppercase', color: '#6B7280', fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: 0.4 }}>{vm.header.statusLabel}</T>
          <T style={{ color: '#374151', fontSize: small, marginTop: 4 }}>
            <T style={{ color: '#9CA3AF', fontSize: small }}>{vm.header.issueLabel}: </T>{vm.header.issueValue}
          </T>
          {vm.header.dueValue ? (
            <T style={{ color: '#374151', fontSize: small }}>
              <T style={{ color: '#9CA3AF', fontSize: small }}>{vm.header.dueLabel}: </T>{vm.header.dueValue}
            </T>
          ) : null}
        </View>
      </View>
    ),
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
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 6, marginBottom: 4 }}>
          <T style={{ flex: 1, fontSize: st.fontPx - 3, textTransform: 'uppercase', color: '#9CA3AF', fontWeight: '600' }}>{vm.labels.item}</T>
          {cols.qty ? <T style={{ width: 44, textAlign: 'center', fontSize: st.fontPx - 3, textTransform: 'uppercase', color: '#9CA3AF', fontWeight: '600' }}>{vm.labels.qty}</T> : null}
          {cols.rate ? <T style={{ width: 76, textAlign: 'right', fontSize: st.fontPx - 3, textTransform: 'uppercase', color: '#9CA3AF', fontWeight: '600' }}>{vm.labels.rate}</T> : null}
          {cols.total ? <T style={{ width: 84, textAlign: 'right', fontSize: st.fontPx - 3, textTransform: 'uppercase', color: '#9CA3AF', fontWeight: '600' }}>{vm.labels.total}</T> : null}
        </View>
        {vm.items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: i < vm.items.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
            <T style={{ flex: 1, color: '#1F2937' }}>{it.description}</T>
            {cols.qty ? <T style={{ width: 44, textAlign: 'center', color: '#6B7280' }}>{it.qty}</T> : null}
            {cols.rate ? <T style={{ width: 76, textAlign: 'right', color: '#6B7280' }}>{it.rate}</T> : null}
            {cols.total ? <T style={{ width: 84, textAlign: 'right', fontWeight: '600', color: '#111827' }}>{it.total}</T> : null}
          </View>
        ))}
      </View>
    ),
    totals: () => (
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

  if (vm.layoutMode === 'freeform') {
    const renderEl = (el: InvoiceElement): ReactNode => {
      if (el.kind === 'logo') {
        return vm.header.logoUrl ? (
          <Image source={{ uri: vm.header.logoUrl }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        ) : null;
      }
      if (el.kind === 'field' && el.field === 'lineItems') return renderers.lineItems();
      const txt = el.kind === 'text' ? (el.text ?? '') : resolveFieldValue(vm, el.field!);
      const s = el.style ?? {};
      return (
        <T
          style={{
            fontSize: s.fontSize,
            fontWeight: s.bold ? '700' : undefined,
            color: s.color ?? '#1F2937',
            textAlign: s.align,
            lineHeight: s.fontSize ? s.fontSize * 1.35 : undefined,
          }}
        >
          {txt}
        </T>
      );
    };
    return (
      <View style={{ backgroundColor: '#FFFFFF' }}>
        <View style={{ width: '100%', aspectRatio: 8.5 / 11 }}>
          {vm.elements.map(el => (
            <View
              key={el.id}
              style={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, overflow: 'hidden' }}
            >
              {renderEl(el)}
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: '#FFFFFF', padding: st.pad }}>
      {vm.sections.map((id, i) => (
        <Fragment key={id}>
          <View style={{ marginBottom: i < vm.sections.length - 1 ? gap : 0 }}>{renderers[id]()}</View>
        </Fragment>
      ))}
    </View>
  );
}
