// Daily digest of shake-to-report bug reports.
//
// Reports land in the bug_reports table (migration 241) and nothing announced
// them — you had to remember to open the table editor. A report nobody reads
// is the same as no report.
//
// English, not localised: there is exactly one recipient and it is us.

export interface BugDigestRow {
  created_at: string;
  message: string;
  route: string | null;
  platform: string | null;
  app_version: string | null;
  business_name: string | null;
  user_email: string | null;
}

/** HTML-escape — messages are user-written and go straight into the markup. */
function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

export function buildBugDigest(rows: BugDigestRow[], hours: number): {
  subject: string;
  html: string;
  text: string;
} {
  const n = rows.length;
  const subject = `${n} bug report${n === 1 ? '' : 's'} · Amixos`;

  const cards = rows.map(r => {
    // Context lines are all nullable by design — a report with no platform
    // still beats no report — so only render the ones that exist.
    const meta = [
      r.route && `<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px">${esc(r.route)}</code>`,
      r.platform && esc(r.platform),
      r.app_version && `v${esc(r.app_version)}`,
      r.business_name && esc(r.business_name),
      r.user_email && esc(r.user_email),
    ].filter(Boolean).join(' &middot; ');

    return `
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="font-size:12px;color:#64748b;margin-bottom:8px">${time(r.created_at)}</div>
        <div style="font-size:15px;color:#0f172a;white-space:pre-wrap;line-height:1.5">${esc(r.message)}</div>
        ${meta ? `<div style="font-size:12px;color:#64748b;margin-top:10px">${meta}</div>` : ''}
      </div>`;
  }).join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <h1 style="font-size:18px;color:#0f172a;margin:0 0 4px">${n} bug report${n === 1 ? '' : 's'}</h1>
    <p style="font-size:13px;color:#64748b;margin:0 0 20px">Last ${hours} hours</p>
    ${cards}
    <p style="font-size:12px;color:#94a3b8;margin-top:20px">
      Full history in Supabase &rarr; Table Editor &rarr; bug_reports
    </p>
  </div>
</body></html>`;

  const text = rows.map(r => {
    const meta = [r.route, r.platform, r.app_version && `v${r.app_version}`, r.business_name, r.user_email]
      .filter(Boolean).join(' · ');
    return `${time(r.created_at)}\n${r.message}${meta ? `\n${meta}` : ''}`;
  }).join('\n\n---\n\n');

  return { subject, html, text: `${n} bug report(s), last ${hours} hours\n\n${text}` };
}
