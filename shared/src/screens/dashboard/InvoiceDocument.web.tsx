'use client';

// Config-driven invoice DOCUMENT (web). This is the printable/shareable body —
// no app chrome. Driven entirely by the view-model from buildInvoiceViewModel,
// so the in-app detail screen, the public /factura page, and the print/PDF
// HTML all stay visually in sync. Renders sections in vm.sections order.

import type { CSSProperties, ReactNode } from 'react';
import { resolveFieldValue, cssFontFamily, fieldUsesAccent, onAccentColor, withAlpha, type InvoiceViewModel, type InvoiceSectionId, type InvoiceElement } from '../../lib/invoiceTemplate';

function Logo({ url, maxHeight, maxWidth = 220, center }: { url: string; maxHeight: number; maxWidth?: number; center?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{ maxHeight, maxWidth, objectFit: 'contain', marginBottom: 8, display: 'block', ...(center ? { marginLeft: 'auto', marginRight: 'auto' } : null) }} />
  );
}

function elStyle(el: InvoiceElement, accent: string): CSSProperties {
  const s = el.style ?? {};
  return {
    fontSize: s.fontSize,
    fontWeight: s.bold ? 700 : undefined,
    color: s.color ?? (el.kind === 'field' && fieldUsesAccent(el.field) ? accent : undefined),
    textAlign: s.align,
    fontFamily: s.font ? cssFontFamily(s.font) : undefined,
  };
}

export function InvoiceDocument({ vm }: { vm: InvoiceViewModel }) {
  const st = vm.style;
  const accent = st.accent;
  const cols = vm.columns;
  const h = vm.header;
  const small = st.fontPx - 2;
  const gap = st.density === 'compact' ? 14 : 22;
  const onAcc = onAccentColor(accent);
  const subtleOnAcc = onAcc === '#FFFFFF' ? 'rgba(255,255,255,0.82)' : 'rgba(17,24,39,0.68)';
  const tint = withAlpha(accent, 0.1);

  const metaLines = (subtle?: boolean) => (
    <>
      <div style={{ fontSize: small, marginTop: 4, color: subtle ? subtleOnAcc : '#374151' }}>
        <span style={{ color: subtle ? subtleOnAcc : '#9ca3af' }}>{h.issueLabel}:</span> {h.issueValue}
      </div>
      {h.dueValue ? (
        <div style={{ fontSize: small, color: subtle ? subtleOnAcc : '#374151' }}>
          <span style={{ color: subtle ? subtleOnAcc : '#9ca3af' }}>{h.dueLabel}:</span> {h.dueValue}
        </div>
      ) : null}
    </>
  );

  const renderHeader = (): ReactNode => {
    switch (vm.archetype) {
      case 'band':
        return (
          <div className="flex justify-between gap-6" style={{ background: accent, padding: `${gap}px ${gap + 4}px`, borderRadius: 10 }}>
            <div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4, color: onAcc }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} style={{ fontSize: small, marginTop: 2, color: subtleOnAcc }}>{l}</div>
              ))}
            </div>
            <div className="text-right">
              <div className="font-bold uppercase" style={{ color: onAcc, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 2, color: onAcc }}>{h.invoiceNumber}</div>
              <div className="uppercase" style={{ fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: '0.04em', color: subtleOnAcc }}>{h.statusLabel}</div>
              {metaLines(true)}
            </div>
          </div>
        );
      case 'centered':
        return (
          <div className="text-center pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
            {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} center /> : null}
            <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
            {h.businessLines.map((l, i) => (
              <div key={i} className="text-gray-500" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
            ))}
            <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.12em', fontSize: st.fontPx + 8, marginTop: 12 }}>{h.invoiceTitle}</div>
            <div className="font-semibold text-gray-600" style={{ fontSize: small, marginTop: 2 }}>{h.invoiceNumber} · {h.statusLabel}</div>
            <div className="flex justify-center gap-4" style={{ marginTop: 2 }}>{metaLines()}</div>
          </div>
        );
      case 'sidebar':
        return (
          <div className="flex gap-4 items-stretch">
            <div style={{ background: tint, borderRadius: 12, padding: 16, width: '40%' }}>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} maxWidth={160} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} className="text-gray-600" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
              ))}
            </div>
            <div className="flex-1" style={{ paddingTop: 4 }}>
              <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 2 }}>{h.invoiceNumber}</div>
              <div className="uppercase text-gray-500" style={{ fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: '0.04em' }}>{h.statusLabel}</div>
              {metaLines()}
            </div>
          </div>
        );
      case 'minimal':
        return (
          <div className="pb-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
            <div className="flex justify-between items-center">
              <div className="uppercase text-gray-500 font-semibold" style={{ fontSize: small, letterSpacing: '0.12em' }}>{h.businessName}</div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={Math.round(st.logoPx * 0.7)} maxWidth={160} /> : null}
            </div>
            <div style={{ width: 32, height: 3, background: accent, borderRadius: 2, margin: '14px 0 8px' }} />
            <div style={{ fontWeight: 300, fontSize: st.fontPx + 16, color: '#111827', letterSpacing: '0.02em' }}>{h.invoiceTitle}</div>
            <div className="text-gray-500" style={{ fontSize: small, marginTop: 6 }}>
              {h.invoiceNumber} · {h.statusLabel} · {h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}
            </div>
          </div>
        );
      default: // classic
        return (
          <div className="flex justify-between gap-6 pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
            <div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} className="text-gray-500" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
              ))}
            </div>
            <div className="text-right">
              <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 2 }}>{h.invoiceNumber}</div>
              <div className="uppercase text-gray-500" style={{ fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: '0.04em' }}>{h.statusLabel}</div>
              {metaLines()}
            </div>
          </div>
        );
    }
  };

  const renderers: Record<InvoiceSectionId, () => ReactNode> = {
    header: renderHeader,
    billTo: () => (
      <div>
        <SectLabel st={st}>{vm.labels.billTo}</SectLabel>
        {vm.billTo.map((c, i) => (
          <div key={i} className={i > 0 ? 'mt-1.5' : ''}>
            <div className="font-semibold">{c.name}</div>
            {c.lines.map((l, j) => (
              <div key={j} className="text-gray-500" style={{ fontSize: small }}>{l}</div>
            ))}
          </div>
        ))}
      </div>
    ),
    lineItems: () => (
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-gray-400 uppercase" style={{ fontSize: st.fontPx - 3, letterSpacing: '0.04em' }}>
            <th className="text-left font-semibold py-2 border-b border-gray-200">{vm.labels.item}</th>
            {cols.qty ? <th className="text-center font-semibold py-2 border-b border-gray-200 w-16">{vm.labels.qty}</th> : null}
            {cols.rate ? <th className="text-right font-semibold py-2 border-b border-gray-200 w-28">{vm.labels.rate}</th> : null}
            {cols.total ? <th className="text-right font-semibold py-2 border-b border-gray-200 w-32">{vm.labels.total}</th> : null}
          </tr>
        </thead>
        <tbody>
          {vm.items.map((it, i) => (
            <tr key={i} style={{ breakInside: 'avoid' }}>
              <td className="text-left py-2 border-b border-gray-50 align-top">{it.description}</td>
              {cols.qty ? <td className="text-center py-2 border-b border-gray-50 text-gray-500">{it.qty}</td> : null}
              {cols.rate ? <td className="text-right py-2 border-b border-gray-50 text-gray-500">{it.rate}</td> : null}
              {cols.total ? <td className="text-right py-2 border-b border-gray-50 font-semibold text-gray-900">{it.total}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    totals: () => (
      <div className="flex flex-col items-end gap-1.5" style={{ breakInside: 'avoid' }}>
        <Row label={vm.labels.subtotal} value={vm.totals.subtotal} />
        {vm.totals.taxLabel ? <Row label={vm.totals.taxLabel} value={vm.totals.taxValue ?? ''} /> : null}
        <div className="flex gap-12 border-t-2 border-gray-200 pt-2 mt-0.5">
          <span className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{vm.labels.total}</span>
          <span className="font-bold text-right" style={{ fontSize: st.fontPx + 4, minWidth: 110, color: accent }}>
            {vm.totals.total}
          </span>
        </div>
      </div>
    ),
    customFields: () => (
      <div style={{ breakInside: 'avoid' }}>
        <SectLabel st={st}>{vm.labels.customFields}</SectLabel>
        {vm.customFields.map((f, i) => (
          <div key={i} className="flex justify-between gap-4 py-0.5" style={{ fontSize: small }}>
            <span className="text-gray-500">{f.label}</span>
            <span className="font-medium text-gray-900">{f.value}</span>
          </div>
        ))}
      </div>
    ),
    notes: () => (
      <div style={{ breakInside: 'avoid' }}>
        <SectLabel st={st}>{vm.labels.notes}</SectLabel>
        <div className="text-gray-600 whitespace-pre-wrap" style={{ fontSize: small, lineHeight: 1.5 }}>{vm.notes}</div>
      </div>
    ),
    paymentInstructions: () => (
      <div style={{ breakInside: 'avoid' }}>
        <SectLabel st={st}>{vm.lang === 'es' ? 'Instrucciones de pago' : 'Payment instructions'}</SectLabel>
        <div className="text-gray-600 whitespace-pre-wrap" style={{ fontSize: small, lineHeight: 1.5 }}>{vm.paymentInstructions}</div>
      </div>
    ),
    footer: () => (
      <div className="border-t border-gray-200 pt-2.5 text-center text-gray-400 whitespace-pre-wrap" style={{ fontSize: small }}>
        {vm.footer}
      </div>
    ),
  };

  if (vm.layoutMode === 'freeform') {
    const renderEl = (el: InvoiceElement): ReactNode => {
      if (el.kind === 'logo') {
        return vm.header.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vm.header.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : null;
      }
      if (el.kind === 'field' && el.field === 'lineItems') return renderers.lineItems();
      const text = el.kind === 'text' ? (el.text ?? '') : resolveFieldValue(vm, el.field!);
      return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35, ...elStyle(el, accent) }}>{text}</div>;
    };
    return (
      <div className="bg-white text-gray-800" style={{ fontFamily: st.cssFontFamily, fontSize: st.fontPx }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '8.5 / 11' }}>
          {vm.elements.map(el => (
            <div key={el.id} style={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, overflow: 'hidden' }}>
              {renderEl(el)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white text-gray-800"
      style={{ fontFamily: st.cssFontFamily, fontSize: st.fontPx, padding: st.pad }}
    >
      {vm.sections.map((id, i) => (
        <div key={id} style={{ marginBottom: i < vm.sections.length - 1 ? gap : 0 }}>
          {renderers[id]()}
        </div>
      ))}
    </div>
  );
}

function SectLabel({ children, st }: { children: ReactNode; st: InvoiceViewModel['style'] }) {
  return (
    <div
      className="uppercase text-gray-400 font-semibold mb-1.5"
      style={{ fontSize: st.fontPx - 3, letterSpacing: '0.05em' }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-12 text-gray-700">
      <span>{label}</span>
      <span className="text-right" style={{ minWidth: 110 }}>{value}</span>
    </div>
  );
}
