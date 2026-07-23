// Standalone HTML for an estimate/proposal — the print/PDF rendering used by
// the mobile Download button (expo-print → native share sheet), mirroring the
// public /propuesta page's layout. All labels come in pre-localized via
// ProposalDict; dates come in pre-formatted so the builder stays dumb.

import type { ProposalDict } from '../i18n/dict/proposal';

export interface ProposalHtmlVM {
  business: { name: string; logoUrl: string | null; city: string | null; state: string | null };
  estimateNumber: string;
  clientName: string | null;
  clientCompany: string | null;
  /** Pre-formatted display dates (null = omit the row). */
  issueDate: string | null;
  expiryDate: string | null;
  scheduledDate: string | null;
  description: string | null;
  /** Terms & conditions / notes for the client. */
  notes: string | null;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  /** Signed approval block (data-URL image + pre-formatted byline). */
  signature: { image: string; line: string } | null;
  preparedBy: string | null;
  t: ProposalDict;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildProposalHtml(vm: ProposalHtmlVM): string {
  const { t, business } = vm;
  const hasFinancials = vm.taxRate > 0 || vm.discount > 0;

  const dateRow = (label: string, value: string | null) =>
    value
      ? `<div style="margin-bottom:8px"><div style="font-size:11px;color:#9ca3af">${esc(label)}</div>
         <div style="font-size:13px;font-weight:600;color:#111827">${esc(value)}</div></div>`
      : '';

  const itemRows = vm.items
    .map(
      i => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827">${esc(i.description)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#4b5563;text-align:center">${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#4b5563;text-align:right">$${money(i.unitPrice)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#111827;text-align:right">$${money(i.total)}</td>
      </tr>`,
    )
    .join('');

  const totalsRows = hasFinancials
    ? `<tr><td style="font-size:13px;color:#6b7280;padding:2px 0">${esc(t.subtotal)}</td>
         <td style="font-size:13px;text-align:right">$${money(vm.subtotal)}</td></tr>
       ${vm.taxRate > 0 ? `<tr><td style="font-size:13px;color:#6b7280;padding:2px 0">${esc(t.tax)} (${vm.taxRate}%)</td>
         <td style="font-size:13px;text-align:right">$${money(vm.taxAmount)}</td></tr>` : ''}
       ${vm.discount > 0 ? `<tr><td style="font-size:13px;color:#6b7280;padding:2px 0">${esc(t.discount)}</td>
         <td style="font-size:13px;color:#059669;text-align:right">-$${money(vm.discount)}</td></tr>` : ''}
       <tr><td style="font-size:15px;font-weight:700;padding-top:8px;border-top:1px solid #f3f4f6">${esc(t.total)}</td>
         <td style="font-size:15px;font-weight:700;text-align:right;padding-top:8px;border-top:1px solid #f3f4f6">$${money(vm.total)}</td></tr>`
    : `<tr><td style="font-size:15px;font-weight:700">${esc(t.total)}</td>
         <td style="font-size:15px;font-weight:700;text-align:right">$${money(vm.total)}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:32px;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#111827;background:#ffffff">

    <!-- Header -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px"><tr>
      <td style="vertical-align:top">
        ${business.logoUrl ? `<img src="${esc(business.logoUrl)}" style="height:44px;object-fit:contain;margin-bottom:10px"/><br/>` : ''}
        <span style="font-size:16px;font-weight:700">${esc(business.name)}</span><br/>
        ${business.city ? `<span style="font-size:12px;color:#6b7280">${esc(business.city)}${business.state ? `, ${esc(business.state)}` : ''}</span>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right">
        <span style="font-size:11px;font-family:ui-monospace,Menlo,monospace;color:#9ca3af">${esc(vm.estimateNumber)}</span><br/>
        <span style="font-size:19px;font-weight:700">${esc(t.proposalLabel)}</span>
      </td>
    </tr></table>

    <!-- Client + dates -->
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #f3f4f6;padding-top:14px;margin-bottom:20px"><tr>
      <td style="vertical-align:top;padding-top:14px">
        <div style="font-size:11px;color:#9ca3af">${esc(t.client)}</div>
        <div style="font-size:13px;font-weight:600">${esc(vm.clientName ?? t.noClient)}${vm.clientCompany ? ` <span style="color:#9ca3af;font-weight:400">· ${esc(vm.clientCompany)}</span>` : ''}</div>
        ${vm.preparedBy ? `<div style="margin-top:10px"><div style="font-size:11px;color:#9ca3af">${esc(t.preparedBy)}</div>
          <div style="font-size:13px;font-weight:500">${esc(vm.preparedBy)}</div></div>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right;padding-top:14px">
        ${dateRow(t.issueDate, vm.issueDate)}
        ${dateRow(t.validUntil, vm.expiryDate)}
        ${dateRow(t.scheduledDate, vm.scheduledDate)}
      </td>
    </tr></table>

    ${vm.description ? `<div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">${esc(t.description)}</div>
      <div style="font-size:13px;color:#374151;line-height:1.5">${esc(vm.description)}</div></div>` : ''}

    <!-- Items -->
    <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${esc(t.services)}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <tr>
        <th style="font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:left;padding-bottom:5px;border-bottom:1px solid #f3f4f6">${esc(t.colDescription)}</th>
        <th style="font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:center;padding-bottom:5px;border-bottom:1px solid #f3f4f6;width:56px">${esc(t.colQuantity)}</th>
        <th style="font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:right;padding-bottom:5px;border-bottom:1px solid #f3f4f6;width:84px">${esc(t.colUnitPrice)}</th>
        <th style="font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:right;padding-bottom:5px;border-bottom:1px solid #f3f4f6;width:90px">${esc(t.colTotal)}</th>
      </tr>
      ${itemRows || `<tr><td colspan="4" style="padding:14px 0;text-align:center;font-size:12px;color:#9ca3af">${esc(t.noItems)}</td></tr>`}
    </table>

    <!-- Totals -->
    <table style="width:230px;margin-left:auto;border-collapse:collapse;margin-bottom:24px">${totalsRows}</table>

    ${vm.notes ? `<div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">${esc(t.termsTitle)}</div>
      <div style="font-size:12px;color:#4b5563;line-height:1.5;white-space:pre-line">${esc(vm.notes)}</div></div>` : ''}

    ${vm.signature ? `<div style="border-top:1px solid #f3f4f6;padding-top:14px">
      <div style="font-size:11px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${esc(t.signatureTitle)}</div>
      <img src="${esc(vm.signature.image)}" style="height:56px;object-fit:contain"/>
      <div style="font-size:12px;color:#4b5563;margin-top:4px">${esc(vm.signature.line)}</div></div>` : ''}

  </body></html>`;
}
