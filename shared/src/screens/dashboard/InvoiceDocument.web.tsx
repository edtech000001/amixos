'use client';

// Config-driven invoice DOCUMENT (web). This is the printable/shareable body —
// no app chrome. Driven entirely by the view-model from buildInvoiceViewModel,
// so the in-app detail screen, the public /factura page, and the print/PDF
// HTML all stay visually in sync. Renders sections in vm.sections order.

import { createElement, type CSSProperties, type ReactNode } from 'react';
import { resolveFieldValue, customFieldElementText, cssFontFamily, fieldUsesAccent, onAccentColor, withAlpha, decorationRender, type InvoiceViewModel, type InvoiceSectionId, type InvoiceElement, type DecoSpec } from '../../lib/invoiceTemplate';
import { INVOICE_ICON_NODES } from '../../lib/invoiceIconNodes';

function Logo({ url, maxHeight, maxWidth = 220, center, invert }: { url: string; maxHeight: number; maxWidth?: number; center?: boolean; invert?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{ maxHeight, maxWidth, objectFit: 'contain', marginBottom: 8, display: 'block', ...(invert ? { filter: 'invert(1)' } : null), ...(center ? { marginLeft: 'auto', marginRight: 'auto' } : null) }} />
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

// An icon glyph from the shared lucide-derived catalog (same geometry the
// HTML/PDF + RN renderers use), stroked in the element color.
function IconGlyph({ icon, color }: { icon: string; color: string }) {
  const nodes = INVOICE_ICON_NODES[icon] ?? INVOICE_ICON_NODES.star ?? [];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
      {nodes.map((n, i) => { const { t, ...attrs } = n; return createElement(t, { key: i, ...attrs }); })}
    </svg>
  );
}

export function InvoiceDocument({ vm }: { vm: InvoiceViewModel }) {
  const st = vm.style;
  const accent = st.accent;
  const cols = vm.columns;
  const h = vm.header;
  const small = st.fontPx - 2;
  const gap = st.density === 'compact' ? 14 : 22;
  // Theme 9 (hero) fills a diagonal corner behind the sender + Bill To block,
  // so its grey address text reads poorly — darken it to near-black there.
  const isHero = vm.archetype === 'hero';
  const addrColor = isHero ? '#111827' : undefined;
  // Theme 9 tucks Bill To into the header's right column (right-aligned, under
  // the dates) instead of a full-width row, to save vertical space.
  const showBillTo = vm.sections.includes('billTo');
  const heroBillTo =
    isHero && showBillTo && vm.billTo.length ? (
      <div style={{ marginTop: gap }}>
        <SectLabel st={st} color="#374151">{vm.labels.billTo}</SectLabel>
        {vm.billTo.map((c, i) => (
          <div key={i} style={{ marginTop: i > 0 ? 6 : 0 }}>
            <div className="font-semibold">{c.name}</div>
            {c.lines.map((l, j) => (
              <div key={j} className="text-muted" style={{ fontSize: small, color: addrColor }}>{l}</div>
            ))}
          </div>
        ))}
      </div>
    ) : null;
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

  const fromBlock = (
    <div>
      {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} invert={h.logoInvert} /> : null}
      <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
      {h.businessLines.map((l, i) => (
        <div key={i} className="text-muted" style={{ fontSize: small, marginTop: 2, color: addrColor }}>{l}</div>
      ))}
    </div>
  );
  const metaBlock = (align: 'left' | 'right') => (
    <div style={{ textAlign: align }}>
      <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
      <div className="font-semibold" style={{ marginTop: 2 }}>{h.invoiceNumber}</div>
      {metaLines()}
    </div>
  );

  const renderHeader = (): ReactNode => {
    switch (vm.archetype) {
      case 'leftbar':
        return (
          <div className="flex gap-4 items-stretch">
            <div style={{ width: 5, borderRadius: 3, background: accent, flex: '0 0 auto' }} />
            <div className="flex-1 flex justify-between gap-6">
              {fromBlock}
              {metaBlock('right')}
            </div>
          </div>
        );
      case 'split':
        return (
          <div className="flex justify-between gap-4 items-start">
            {fromBlock}
            <div style={{ background: tint, borderRadius: 12, padding: '14px 18px', minWidth: '42%' }}>
              {metaBlock('right')}
            </div>
          </div>
        );
      case 'stamp':
        return (
          <div className="flex justify-between gap-6 items-start pb-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
            {fromBlock}
            <div className="text-right">
              <div style={{ display: 'inline-block', background: accent, color: onAcc, borderRadius: 8, padding: '8px 12px' }}>
                <div className="font-bold uppercase" style={{ letterSpacing: '0.08em', fontSize: st.fontPx + 4, color: onAcc }}>{h.invoiceTitle}</div>
                <div className="font-semibold" style={{ fontSize: st.fontPx, color: onAcc, marginTop: 1 }}>{h.invoiceNumber}</div>
              </div>
              <div style={{ marginTop: 8 }}>{metaLines()}</div>
            </div>
          </div>
        );
      case 'band':
        return (
          <div className="flex justify-between gap-6" style={{ background: accent, padding: `${gap}px ${gap + 4}px`, borderRadius: 10 }}>
            <div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} invert={h.logoInvert} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4, color: onAcc }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} style={{ fontSize: small, marginTop: 2, color: subtleOnAcc }}>{l}</div>
              ))}
            </div>
            <div className="text-right">
              <div className="font-bold uppercase" style={{ color: onAcc, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 2, color: onAcc }}>{h.invoiceNumber}</div>
              {metaLines(true)}
            </div>
          </div>
        );
      case 'centered':
        return (
          <div className="text-center pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
            {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} center invert={h.logoInvert} /> : null}
            <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
            {h.businessLines.map((l, i) => (
              <div key={i} className="text-muted" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
            ))}
            <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.12em', fontSize: st.fontPx + 8, marginTop: 12 }}>{h.invoiceTitle}</div>
            <div className="font-semibold text-muted" style={{ fontSize: small, marginTop: 2 }}>{h.invoiceNumber}</div>
            <div className="flex justify-center gap-4" style={{ marginTop: 2 }}>{metaLines()}</div>
          </div>
        );
      case 'sidebar':
        return (
          <div className="flex gap-4 items-stretch">
            <div style={{ background: tint, borderRadius: 12, padding: 16, width: '40%' }}>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} maxWidth={160} invert={h.logoInvert} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} className="text-muted" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
              ))}
            </div>
            <div className="flex-1" style={{ paddingTop: 4 }}>
              <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 2 }}>{h.invoiceNumber}</div>
              {metaLines()}
            </div>
          </div>
        );
      case 'minimal':
        return (
          <div className="pb-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
            <div className="flex justify-between items-center">
              <div className="uppercase text-muted font-semibold" style={{ fontSize: small, letterSpacing: '0.12em' }}>{h.businessName}</div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={Math.round(st.logoPx * 0.7)} maxWidth={160} invert={h.logoInvert} /> : null}
            </div>
            <div style={{ width: 32, height: 3, background: accent, borderRadius: 2, margin: '14px 0 8px' }} />
            <div style={{ fontWeight: 300, fontSize: st.fontPx + 16, color: '#111827', letterSpacing: '0.02em' }}>{h.invoiceTitle}</div>
            <div className="text-muted" style={{ fontSize: small, marginTop: 6 }}>
              {h.invoiceNumber} · {h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}
            </div>
          </div>
        );
      case 'hero':
        return (
          <div className="flex justify-between gap-6 items-start">
            {fromBlock}
            <div className="text-right">
              <div style={{ fontWeight: 800, textTransform: 'uppercase', color: accent, letterSpacing: '0.01em', fontSize: st.fontPx + 30, lineHeight: 1 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 6 }}>{h.invoiceNumber}</div>
              {metaLines()}
              {heroBillTo}
            </div>
          </div>
        );
      case 'wordmark':
        return (
          <div>
            <div className="flex justify-between items-start gap-6">
              {fromBlock}
              <div style={{ fontWeight: 800, textTransform: 'uppercase', color: accent, letterSpacing: '0.06em', fontSize: st.fontPx + 16 }}>{h.invoiceTitle}</div>
            </div>
            <div style={{ height: 2, background: '#e5e7eb', margin: '12px 0 8px' }} />
            <div className="flex justify-between gap-4 text-muted" style={{ fontSize: small }}>
              <span>{h.invoiceNumber}</span>
              <span>{h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}</span>
            </div>
          </div>
        );
      case 'panel':
        return (
          <div className="flex justify-between gap-6" style={{ background: accent, borderRadius: 12, padding: `${gap + 2}px ${gap + 6}px` }}>
            <div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} invert={h.logoInvert} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4, color: onAcc }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} style={{ fontSize: small, marginTop: 2, color: subtleOnAcc }}>{l}</div>
              ))}
            </div>
            <div className="text-right">
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, fontSize: st.fontPx + 12, color: onAcc }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 4, color: onAcc }}>{h.invoiceNumber}</div>
              {metaLines(true)}
            </div>
          </div>
        );
      case 'elegant':
        return (
          <div className="flex justify-between gap-6 items-center pb-4" style={{ borderBottom: '1px solid #e5e7eb' }}>
            <div>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 400, fontSize: st.fontPx + 18, color: '#111827' }}>{h.invoiceTitle}</div>
              <div className="text-muted" style={{ fontSize: small, marginTop: 4 }}>{h.invoiceNumber}</div>
              <div className="text-faint" style={{ fontSize: small, marginTop: 6 }}>{h.issueLabel} {h.issueValue}{h.dueValue ? `  ·  ${h.dueLabel} ${h.dueValue}` : ''}</div>
            </div>
            <div style={{ width: 122, height: 122, borderRadius: '50%', background: tint, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flex: '0 0 auto' }}>
              {h.showLogo && h.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.logoUrl} alt="" style={{ maxHeight: 44, maxWidth: 80, objectFit: 'contain', marginBottom: 4, ...(h.logoInvert ? { filter: 'invert(1)' } : null) }} />
              ) : null}
              <div className="uppercase text-muted" style={{ fontSize: st.fontPx - 3, letterSpacing: '0.1em', padding: '0 10px' }}>{h.businessName}</div>
            </div>
          </div>
        );
      case 'titleLeft':
        return (
          <div className="flex justify-between gap-6 items-start">
            <div>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, fontSize: st.fontPx + 14, color: accent }}>{h.invoiceTitle}</div>
              <div className="font-semibold text-muted" style={{ fontSize: small, marginTop: 4 }}>{h.invoiceNumber}</div>
              {metaLines()}
            </div>
            <div className="text-right">
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} center={false} invert={h.logoInvert} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} className="text-muted" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
              ))}
            </div>
          </div>
        );
      case 'bandCenter':
        return (
          <div className="text-center">
            {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} center invert={h.logoInvert} /> : null}
            <div style={{ background: accent, color: onAcc, textTransform: 'uppercase', letterSpacing: '0.3em', fontWeight: 700, fontSize: st.fontPx + 6, padding: '10px 0', margin: '8px 0' }}>{h.invoiceTitle}</div>
            <div className="text-muted" style={{ fontSize: small }}>
              {h.invoiceNumber} · {h.issueLabel} {h.issueValue}{h.dueValue ? ` · ${h.dueLabel} ${h.dueValue}` : ''}
            </div>
          </div>
        );
      default: // classic
        return (
          <div className="flex justify-between gap-6 pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
            <div>
              {h.showLogo && h.logoUrl ? <Logo url={h.logoUrl} maxHeight={st.logoPx} invert={h.logoInvert} /> : null}
              <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{h.businessName}</div>
              {h.businessLines.map((l, i) => (
                <div key={i} className="text-muted" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
              ))}
            </div>
            <div className="text-right">
              <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>{h.invoiceTitle}</div>
              <div className="font-semibold" style={{ marginTop: 2 }}>{h.invoiceNumber}</div>
              {metaLines()}
            </div>
          </div>
        );
    }
  };

  const th = vm.tableHeader;
  const thFilled = th !== 'plain';
  const thBg = th === 'accent' ? accent : th === 'dark' ? '#1f2937' : th === 'tint' ? tint : undefined;
  const thColor = th === 'accent' ? onAcc : th === 'dark' ? '#fff' : th === 'tint' ? '#4b5563' : '#9ca3af';
  const thCell = (align: 'left' | 'center' | 'right', first?: boolean, last?: boolean): CSSProperties => ({
    textAlign: align,
    fontWeight: 600,
    padding: '8px 8px',
    color: thColor,
    ...(thFilled
      ? { background: thBg, ...(th === 'accent' && first ? { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 } : null), ...(th === 'accent' && last ? { borderTopRightRadius: 8, borderBottomRightRadius: 8 } : null) }
      : { borderBottom: '1px solid #e5e7eb' }),
  });

  const renderers: Record<InvoiceSectionId, () => ReactNode> = {
    header: renderHeader,
    billTo: () => (
      <div>
        <SectLabel st={st} color={isHero ? '#374151' : undefined}>{vm.labels.billTo}</SectLabel>
        {vm.billTo.map((c, i) => (
          <div key={i} className={i > 0 ? 'mt-1.5' : ''}>
            <div className="font-semibold">{c.name}</div>
            {c.lines.map((l, j) => (
              <div key={j} className="text-muted" style={{ fontSize: small, color: addrColor }}>{l}</div>
            ))}
          </div>
        ))}
      </div>
    ),
    lineItems: () => {
      const lastTotal = cols.total, lastRate = !cols.total && cols.rate, lastQty = !cols.total && !cols.rate && cols.qty;
      const itemLast = !cols.total && !cols.rate && !cols.qty;
      return (
        <table className="w-full border-collapse" style={{ textTransform: 'uppercase' }}>
          <thead>
            <tr style={{ fontSize: st.fontPx - 3, letterSpacing: '0.04em' }}>
              <th style={thCell('left', true, itemLast)}>{vm.labels.item}</th>
              {cols.qty ? <th style={{ ...thCell('center', false, lastQty), width: 64 }}>{vm.labels.qty}</th> : null}
              {cols.rate ? <th style={{ ...thCell('right', false, lastRate), width: 112 }}>{vm.labels.rate}</th> : null}
              {cols.total ? <th style={{ ...thCell('right', false, lastTotal), width: 128 }}>{vm.labels.total}</th> : null}
            </tr>
          </thead>
          <tbody style={{ textTransform: 'none' }}>
            {vm.items.map((it, i) => (
              <tr key={i} style={{ breakInside: 'avoid' }}>
                <td className="text-left py-2 border-b border-border-soft align-top">{it.description}</td>
                {cols.qty ? <td className="text-center py-2 border-b border-border-soft text-muted">{it.qty}</td> : null}
                {cols.rate ? <td className="text-right py-2 border-b border-border-soft text-muted">{it.rate}</td> : null}
                {cols.total ? <td className="text-right py-2 border-b border-border-soft font-semibold text-ink">{it.total}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
    totals: () =>
      vm.totalBar ? (
        <div style={{ breakInside: 'avoid' }}>
          <div className="flex flex-col items-end gap-1.5">
            <Row label={vm.labels.subtotal} value={vm.totals.subtotal} />
            {vm.totals.taxLabel ? <Row label={vm.totals.taxLabel} value={vm.totals.taxValue ?? ''} /> : null}
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, background: accent, color: onAcc, padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: st.fontPx + 4 }}>
            <span>{vm.labels.total}</span>
            <span>{vm.totals.total}</span>
          </div>
        </div>
      ) : (
      <div className="flex flex-col items-end gap-1.5" style={{ breakInside: 'avoid' }}>
        <Row label={vm.labels.subtotal} value={vm.totals.subtotal} />
        {vm.totals.taxLabel ? <Row label={vm.totals.taxLabel} value={vm.totals.taxValue ?? ''} /> : null}
        <div className="flex gap-12 border-t-2 border-border pt-2 mt-0.5">
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
            <span className="text-muted">{f.label}</span>
            <span className="font-medium text-ink">{f.value}</span>
          </div>
        ))}
      </div>
    ),
    notes: () => (
      <div style={{ breakInside: 'avoid' }}>
        <SectLabel st={st}>{vm.labels.notes}</SectLabel>
        <div className="text-muted whitespace-pre-wrap" style={{ fontSize: small, lineHeight: 1.5 }}>{vm.notes}</div>
      </div>
    ),
    paymentInstructions: () => (
      <div style={{ breakInside: 'avoid' }}>
        <SectLabel st={st}>{vm.lang === 'es' ? 'Instrucciones de pago' : 'Payment instructions'}</SectLabel>
        <div className="text-muted whitespace-pre-wrap" style={{ fontSize: small, lineHeight: 1.5 }}>{vm.paymentInstructions}</div>
      </div>
    ),
    footer: () => (
      <div className="border-t border-border pt-2.5 text-center text-faint whitespace-pre-wrap" style={{ fontSize: small }}>
        {vm.footer}
      </div>
    ),
  };

  if (vm.layoutMode === 'freeform') {
    const ffDeco = decorationRender(vm.decoration, accent);
    const renderEl = (el: InvoiceElement): ReactNode => {
      if (el.kind === 'logo') {
        return vm.header.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vm.header.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', ...(vm.header.logoInvert ? { filter: 'invert(1)' } : null) }} />
        ) : null;
      }
      if (el.kind === 'shape') {
        return <div style={{ width: '100%', height: '100%', background: el.style?.fill ?? accent, borderRadius: el.shape === 'ellipse' ? '50%' : (el.style?.radius ?? 0) }} />;
      }
      if (el.kind === 'icon') {
        return <IconGlyph icon={el.icon ?? 'star'} color={el.style?.color ?? accent} />;
      }
      if (el.kind === 'field' && el.field === 'lineItems') return renderers.lineItems();
      const text = el.kind === 'text' ? (el.text ?? '') : el.kind === 'customField' ? customFieldElementText(vm, el) : resolveFieldValue(vm, el.field!);
      return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.35, ...elStyle(el, accent) }}>{text}</div>;
    };
    return (
      <div className="text-ink" style={{ background: vm.pageTint ? withAlpha(accent, 0.06) : '#fff', fontFamily: st.cssFontFamily, fontSize: st.fontPx }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '8.5 / 11', overflow: 'hidden' }}>
          {ffDeco.full ? <DecoSvg spec={ffDeco.full} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /> : null}
          {ffDeco.topBand ? <DecoSvg spec={ffDeco.topBand.spec} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ffDeco.topBand.height }} /> : null}
          {ffDeco.bottomBand ? <DecoSvg spec={ffDeco.bottomBand.spec} style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: ffDeco.bottomBand.height }} /> : null}
          {vm.elements.map(el => (
            <div key={el.id} style={{ position: 'absolute', zIndex: 1, left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`, overflow: 'hidden', opacity: el.style?.opacity ?? 1 }}>
              {renderEl(el)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const deco = decorationRender(vm.decoration, accent);
  const fullPage = vm.decoration !== 'none' || vm.footerBar || vm.pageTint;
  // Closing sections anchor to the page bottom on full-page themes (mirrors the
  // PDF): main sections flow from the top, the tail is pushed down via auto
  // margin so the footer sits at the bottom edge instead of under the total.
  const TAIL_SECTIONS: InvoiceSectionId[] = ['paymentInstructions', 'footer'];
  // Hero moves Bill To into the header, so drop the standalone row for it.
  const flowSections = isHero ? vm.sections.filter(id => id !== 'billTo') : vm.sections;
  const mainIds = flowSections.filter(id => !TAIL_SECTIONS.includes(id));
  const tailIds = flowSections.filter(id => TAIL_SECTIONS.includes(id));

  // Estimate-only blocks: description under Bill To (or the header when hero
  // relocated Bill To), terms + approval/signature at the bottom.
  const est = vm.estimate;
  const estAnchor: InvoiceSectionId = mainIds.includes('billTo') ? 'billTo' : 'header';
  const estDesc = est?.description ? (
    <div style={{ breakInside: 'avoid' }}>
      <SectLabel st={st}>{est.labels.description}</SectLabel>
      <div className="text-muted whitespace-pre-wrap" style={{ fontSize: small, lineHeight: 1.5 }}>{est.description}</div>
    </div>
  ) : null;
  const estBottom = est && (est.terms || est.preparedBy || est.signature) ? (
    <div className="flex flex-col" style={{ gap }}>
      {est.terms ? (
        <div style={{ breakInside: 'avoid' }}>
          <SectLabel st={st}>{est.labels.terms}</SectLabel>
          <div className="text-muted whitespace-pre-wrap" style={{ fontSize: small, lineHeight: 1.5 }}>{est.terms}</div>
        </div>
      ) : null}
      {est.preparedBy || est.signature ? (
        <div style={{ breakInside: 'avoid', borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
          <SectLabel st={st} color={accent}>{est.labels.approval}</SectLabel>
          {est.preparedBy ? <div className="text-muted" style={{ fontSize: small }}>{est.labels.preparedBy}: {est.preparedBy}</div> : null}
          {est.signature ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={est.signature.image} alt="" style={{ maxHeight: 56, maxWidth: 240, objectFit: 'contain', margin: '6px 0 2px', display: 'block' }} />
              <div className="text-muted" style={{ fontSize: small }}>{est.signature.line}</div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;
  const hasTail = tailIds.length > 0 || !!estBottom;
  return (
    <div
      className="text-ink inv-doc-page"
      style={{ position: 'relative', overflow: 'hidden', background: vm.pageTint ? withAlpha(accent, 0.06) : '#fff', fontFamily: st.cssFontFamily, fontSize: st.fontPx, ...(fullPage ? { display: 'flex', flexDirection: 'column', aspectRatio: '8.5 / 11' } : null) }}
    >
      {deco.full ? <DecoSvg spec={deco.full} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /> : null}
      {deco.topBand ? <DecoSvg spec={deco.topBand.spec} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: deco.topBand.height }} /> : null}
      {deco.bottomBand ? <DecoSvg spec={deco.bottomBand.spec} style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: deco.bottomBand.height }} /> : null}
      <div style={{ position: 'relative', zIndex: 1, padding: `${st.pad + deco.padTop}px ${st.pad}px ${st.pad + deco.padBottom}px`, ...(fullPage ? { flex: '1 0 auto', display: 'flex', flexDirection: 'column' } : null) }}>
        {(() => {
          const nodes: ReactNode[] = [];
          mainIds.forEach((id, i) => {
            const isLastMain = i === mainIds.length - 1;
            const injectDesc = id === estAnchor && !!estDesc;
            const lastOverall = !hasTail && isLastMain && !injectDesc;
            nodes.push(<div key={id} style={{ marginBottom: lastOverall ? 0 : gap }}>{renderers[id]()}</div>);
            if (injectDesc) nodes.push(<div key="est-desc" style={{ marginBottom: !hasTail && isLastMain ? 0 : gap }}>{estDesc}</div>);
          });
          return nodes;
        })()}
        {hasTail ? (
          <div className="inv-doc-tail" style={fullPage ? { marginTop: 'auto' } : undefined}>
            {tailIds.map((id, i) => (
              <div key={id} style={{ marginBottom: (i < tailIds.length - 1 || !!estBottom) ? gap : 0 }}>
                {renderers[id]()}
              </div>
            ))}
            {estBottom}
          </div>
        ) : null}
      </div>
      {vm.footerBar && (vm.footer || vm.footerContact.length) ? (
        // Full-bleed strip flush to the bottom edge. Shows the footer text/tagline
        // when set (the business-contact line it used to hold is redundant with the
        // header); otherwise falls back to the business contact.
        <div className="inv-footerbar" style={{ position: 'relative', zIndex: 1, marginTop: gap, background: accent, color: onAcc, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, padding: `13px ${st.pad}px`, fontSize: small, whiteSpace: 'pre-wrap', textAlign: 'center' }}>
          {vm.footer ? (
            <span>{vm.footer}</span>
          ) : (
            vm.footerContact.flatMap((l, i) => {
              const node = <span key={`t${i}`} style={{ fontWeight: i === 0 ? 700 : 400 }}>{l}</span>;
              return i === 0 ? [node] : [<span key={`s${i}`} style={{ color: subtleOnAcc }}>·</span>, node];
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function DecoSvg({ spec, style }: { spec: DecoSpec; style: CSSProperties }) {
  return (
    <svg viewBox={spec.viewBox} preserveAspectRatio="none" style={{ zIndex: 0, pointerEvents: 'none', ...style }}>
      {spec.shapes.map((s, i) =>
        s.kind === 'circle' ? (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} fillOpacity={s.opacity} />
        ) : (
          <path key={i} d={s.d} fill={s.fill} fillOpacity={s.opacity} />
        ),
      )}
    </svg>
  );
}

function SectLabel({ children, st, color }: { children: ReactNode; st: InvoiceViewModel['style']; color?: string }) {
  return (
    <div
      className="uppercase text-faint font-semibold mb-1.5"
      style={{ fontSize: st.fontPx - 3, letterSpacing: '0.05em', color }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-12 text-ink">
      <span>{label}</span>
      <span className="text-right" style={{ minWidth: 110 }}>{value}</span>
    </div>
  );
}
