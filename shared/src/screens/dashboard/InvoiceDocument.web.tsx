'use client';

// Config-driven invoice DOCUMENT (web). This is the printable/shareable body —
// no app chrome. Driven entirely by the view-model from buildInvoiceViewModel,
// so the in-app detail screen, the public /factura page, and the print/PDF
// HTML all stay visually in sync. Renders sections in vm.sections order.

import type { ReactNode } from 'react';
import type { InvoiceViewModel, InvoiceSectionId } from '../../lib/invoiceTemplate';

export function InvoiceDocument({ vm }: { vm: InvoiceViewModel }) {
  const st = vm.style;
  const accent = st.accent;
  const cols = vm.columns;
  const small = st.fontPx - 2;
  const gap = st.density === 'compact' ? 14 : 22;

  const renderers: Record<InvoiceSectionId, () => ReactNode> = {
    header: () => (
      <div className="flex justify-between gap-6 pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
        <div>
          {vm.header.showLogo && vm.header.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vm.header.logoUrl}
              alt=""
              style={{ maxHeight: st.logoPx, maxWidth: 220, objectFit: 'contain', marginBottom: 8 }}
            />
          ) : null}
          <div className="font-bold" style={{ fontSize: st.fontPx + 4 }}>{vm.header.businessName}</div>
          {vm.header.businessLines.map((l, i) => (
            <div key={i} className="text-gray-500" style={{ fontSize: small, marginTop: 2 }}>{l}</div>
          ))}
        </div>
        <div className="text-right">
          <div className="font-bold uppercase" style={{ color: accent, letterSpacing: '0.08em', fontSize: st.fontPx + 6 }}>
            {vm.header.invoiceTitle}
          </div>
          <div className="font-semibold" style={{ marginTop: 2 }}>{vm.header.invoiceNumber}</div>
          <div className="uppercase text-gray-500" style={{ fontSize: st.fontPx - 3, marginTop: 4, letterSpacing: '0.04em' }}>
            {vm.header.statusLabel}
          </div>
          <div className="text-gray-700" style={{ fontSize: small, marginTop: 4 }}>
            <span className="text-gray-400">{vm.header.issueLabel}:</span> {vm.header.issueValue}
          </div>
          {vm.header.dueValue ? (
            <div className="text-gray-700" style={{ fontSize: small }}>
              <span className="text-gray-400">{vm.header.dueLabel}:</span> {vm.header.dueValue}
            </div>
          ) : null}
        </div>
      </div>
    ),
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
    // No page padding in freeform — section rects provide their own insets, and
    // this makes the builder wireframe line up with the rendered output.
    return (
      <div
        className="bg-white text-gray-800"
        style={{ fontFamily: st.cssFontFamily, fontSize: st.fontPx }}
      >
        <div style={{ position: 'relative', width: '100%', aspectRatio: '8.5 / 11' }}>
          {vm.sections.map(id => {
            const r = vm.rects[id];
            if (!r) return null;
            return (
              <div
                key={id}
                style={{ position: 'absolute', left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, overflow: 'hidden' }}
              >
                {renderers[id]()}
              </div>
            );
          })}
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
