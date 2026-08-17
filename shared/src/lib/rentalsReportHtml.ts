// Owner statement for one month: income by property, expenses by category,
// net. Shared by web (rendered into a print container → window.print) and
// mobile (expo-print → PDF → share sheet), exactly like priceSheetHtml.ts.
//
// Always light-on-white: this is a document, not the app UI, so it must print
// legibly regardless of the viewer's theme.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface StatementRow {
  label: string;
  amount: number;
}

export interface StatementLabels {
  title: string;              // "Estado de cuenta · Agosto 2026"
  incomeHeading: string;
  expensesHeading: string;
  categoryColumn: string;
  amountColumn: string;
  totalIncome: string;
  totalExpenses: string;
  net: string;
  generatedOn: string;        // "Generado el {{date}}" — already interpolated
}

export function buildRentalStatementHtml(opts: {
  businessName: string;
  logoUrl?: string | null;
  /** Pre-built address / contact lines. */
  businessLines: string[];
  income: StatementRow[];
  expenses: StatementRow[];
  labels: StatementLabels;
  accentColor?: string;
}): string {
  const accent = opts.accentColor ?? '#0D9488';
  const money = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalIncome = opts.income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = opts.expenses.reduce((s, r) => s + r.amount, 0);
  const net = totalIncome - totalExpenses;

  const section = (heading: string, rows: StatementRow[], totalLabel: string, total: number) => `
    <div class="section">
      <div class="section-title">${esc(heading)}</div>
      <table>
        <thead>
          <tr><th>${esc(opts.labels.categoryColumn)}</th><th class="num">${esc(opts.labels.amountColumn)}</th></tr>
        </thead>
        <tbody>
          ${rows.length === 0
            ? '<tr><td colspan="2" class="empty">—</td></tr>'
            : rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${esc(money(r.amount))}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td>${esc(totalLabel)}</td><td class="num">${esc(money(total))}</td></tr>
        </tfoot>
      </table>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(opts.labels.title)}</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; font-size: 13px; background: #ffffff; }
    .header { text-align: center; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0; }
    .header img { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; margin-bottom: 6px; }
    .biz-name { font-size: 22px; font-weight: 700; margin: 0; }
    .biz-line { font-size: 11px; color: #64748b; margin: 1px 0 0; }
    .doc-title { font-size: 17px; font-weight: 600; margin: 12px 0 0; color: ${esc(accent)}; }
    .meta { font-size: 10px; color: #94a3b8; margin-top: 3px; }
    .section { margin-top: 20px; }
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${esc(accent)}; border-bottom: 1.5px solid ${esc(accent)}; padding-bottom: 4px; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; padding: 4px 0; }
    td { padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .num { text-align: right; white-space: nowrap; }
    .empty { color: #94a3b8; }
    tfoot td { font-weight: 700; border-bottom: none; border-top: 1.5px solid #e2e8f0; }
    .net { margin-top: 22px; padding: 12px 14px; border-radius: 10px; background: #f8fafc; display: flex; justify-content: space-between; align-items: baseline; }
    .net-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
    .net-value { font-size: 20px; font-weight: 700; color: ${net < 0 ? '#dc2626' : '#047857'}; }
  </style>
</head>
<body>
  <div class="header">
    ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="">` : ''}
    <p class="biz-name">${esc(opts.businessName)}</p>
    ${opts.businessLines.filter(Boolean).map(l => `<p class="biz-line">${esc(l)}</p>`).join('')}
    <p class="doc-title">${esc(opts.labels.title)}</p>
    <p class="meta">${esc(opts.labels.generatedOn)}</p>
  </div>
  ${section(opts.labels.incomeHeading, opts.income, opts.labels.totalIncome, totalIncome)}
  ${section(opts.labels.expensesHeading, opts.expenses, opts.labels.totalExpenses, totalExpenses)}
  <div class="net">
    <span class="net-label">${esc(opts.labels.net)}</span>
    <span class="net-value">${esc(money(net))}</span>
  </div>
</body>
</html>`;
}
