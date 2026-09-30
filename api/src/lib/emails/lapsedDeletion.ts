// "Your business will be deleted in N days" — the warning sent to the OWNER of
// a business that has been unpaid for ~11 months (migration 243). Sent at 30,
// 7 and 1 days before deletion by the daily purge-due job.
//
// One language, chosen from the owner's own locale (auth user_metadata.locale,
// kept in sync by the app — see shared/src/lib/userLocale.ts). Spanish is the
// default, as everywhere else in the app.

export interface LapsedDeletionEmailData {
  businessName: string | null;
  /** Days until deletion (30 / 7 / 1). */
  days: number;
  /** When it will be deleted. */
  purgeAfter: Date;
  /** Where to renew (web Ajustes → Cuenta). */
  renewUrl: string;
  locale?: string | null;
}

const isEn = (d: LapsedDeletionEmailData) => d.locale === 'en';

function when(d: LapsedDeletionEmailData): string {
  return d.purgeAfter.toLocaleDateString(isEn(d) ? 'en-US' : 'es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
  });
}

function inDays(d: LapsedDeletionEmailData): string {
  if (isEn(d)) return d.days === 1 ? 'tomorrow' : `in ${d.days} days`;
  return d.days === 1 ? 'mañana' : `en ${d.days} días`;
}

export function lapsedDeletionSubject(d: LapsedDeletionEmailData): string {
  const biz = d.businessName ?? (isEn(d) ? 'Your business' : 'Tu negocio');
  return isEn(d)
    ? `${biz} will be deleted ${inDays(d)}`
    : `${biz} se eliminará ${inDays(d)}`;
}

export function lapsedDeletionText(d: LapsedDeletionEmailData): string {
  const biz = d.businessName ?? (isEn(d) ? 'your business' : 'tu negocio');
  if (isEn(d)) {
    return [
      `The subscription for ${biz} on Amixos ended almost a year ago.`,
      '',
      `On ${when(d)} we will permanently delete ${biz} and all its data:`,
      'clients, jobs, invoices, payroll, files and photos. This cannot be undone.',
      '',
      `To keep it, renew your plan before then: ${d.renewUrl}`,
      '',
      'If you no longer need it, you do not have to do anything.',
    ].join('\n');
  }
  return [
    `La suscripción de ${biz} en Amixos terminó hace casi un año.`,
    '',
    `El ${when(d)} eliminaremos ${biz} y toda su información de forma permanente:`,
    'clientes, trabajos, facturas, nómina, archivos y fotos. No se puede deshacer.',
    '',
    `Para conservarlo, renueva tu plan antes de esa fecha: ${d.renewUrl}`,
    '',
    'Si ya no lo necesitas, no tienes que hacer nada.',
  ].join('\n');
}

export function lapsedDeletionHtml(d: LapsedDeletionEmailData): string {
  const en = isEn(d);
  const biz = d.businessName ? esc(d.businessName) : (en ? 'your business' : 'tu negocio');
  const url = esc(d.renewUrl);
  const date = esc(when(d));

  const heading = en ? `${biz} will be deleted ${inDays(d)}` : `${biz} se eliminará ${inDays(d)}`;
  const lead = en
    ? `The subscription for <strong style="color:#0F172A;">${biz}</strong> on Amixos ended almost a year ago.`
    : `La suscripción de <strong style="color:#0F172A;">${biz}</strong> en Amixos terminó hace casi un año.`;
  const what = en
    ? `On <strong style="color:#0F172A;">${date}</strong> we will permanently delete it and all its data — clients, jobs, invoices, payroll, files and photos. <strong style="color:#DC2626;">This cannot be undone.</strong>`
    : `El <strong style="color:#0F172A;">${date}</strong> lo eliminaremos junto con toda su información — clientes, trabajos, facturas, nómina, archivos y fotos. <strong style="color:#DC2626;">No se puede deshacer.</strong>`;
  const cta = en ? 'Renew and keep my business' : 'Renovar y conservar mi negocio';
  const fallback = en ? 'If the button does not work, copy this link:' : 'Si el botón no funciona, copia este enlace:';
  const noAction = en
    ? 'If you no longer need this business, you do not have to do anything.'
    : 'Si ya no necesitas este negocio, no tienes que hacer nada.';

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFC;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;border:1px solid #E2E8F0;overflow:hidden;">

        <tr>
          <td style="padding:28px 32px 0;">
            <div style="font-size:24px;font-weight:700;color:#2563EB;letter-spacing:-0.5px;">Amixos</div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 0;">
            <div style="font-size:20px;font-weight:700;color:#0F172A;">${heading}</div>
            <div style="font-size:15px;line-height:24px;color:#475569;padding-top:12px;">
              ${lead}
              <br><br>
              ${what}
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;">
            <a href="${url}"
               style="display:block;background:#2563EB;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;text-align:center;padding:14px 20px;border-radius:12px;">
              ${cta}
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 0;">
            <div style="font-size:12px;line-height:20px;color:#94A3B8;">
              ${fallback}<br>
              <a href="${url}" style="color:#2563EB;word-break:break-all;">${url}</a>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 28px;">
            <div style="border-top:1px solid #F1F5F9;padding-top:16px;font-size:13px;line-height:21px;color:#64748B;">
              ${noAction}
            </div>
          </td>
        </tr>

      </table>

      <div style="max-width:480px;padding:16px 8px 0;font-size:12px;line-height:20px;color:#94A3B8;text-align:center;">
        Amixos · Prime Solutions LLC<br>
        <a href="mailto:soporte@amixos.com" style="color:#94A3B8;">soporte@amixos.com</a>
      </div>
    </td>
  </tr>
</table>`;
}

/** Business names are user-supplied and land in HTML — escape them. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
