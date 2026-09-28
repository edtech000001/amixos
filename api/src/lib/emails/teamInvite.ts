// The "you've been added to a business" email, for people who ALREADY have an
// Amixos account.
//
// Supabase's admin.inviteUserByEmail refuses a registered address — it exists
// to create a pending user, and there is nothing to create. Before this, the
// invite row was written and no mail was ever sent, silently. That hits a
// perfectly ordinary case: a contractor working for two businesses, someone
// re-added after being removed, anyone who signed up and never finished
// onboarding.
//
// They also need different copy. A registered user is not being asked to
// "create your access" — they already have it. They are being told they now
// have a second workspace, and pointed at it.
//
// Bilingual and stacked, same as supabase/email-templates/invite.html: we
// could read this user's locale, but the two documents should look alike, and
// stacking is what keeps an English speaker from being handed a Spanish-only
// email they cannot act on.

export interface TeamInviteEmailData {
  businessName: string | null;
  inviterName: string | null;
  acceptUrl: string;
}

export function teamInviteSubject(data: TeamInviteEmailData): string {
  return data.businessName
    ? `Te agregaron a ${data.businessName} · You were added to ${data.businessName}`
    : 'Te agregaron a un negocio en Amixos · You were added to a business on Amixos';
}

export function teamInviteText(data: TeamInviteEmailData): string {
  const who = data.inviterName ?? 'Alguien';
  const biz = data.businessName ?? 'un negocio';
  return [
    `${who} te agregó a ${biz} en Amixos.`,
    '',
    `Abre este enlace para aceptar: ${data.acceptUrl}`,
    '',
    'Ya tienes una cuenta de Amixos — entra con el correo de siempre y',
    'encontrarás este negocio en el selector, arriba a la izquierda.',
    '',
    '---',
    '',
    `${data.inviterName ?? 'Someone'} added you to ${data.businessName ?? 'a business'} on Amixos.`,
    `Accept here: ${data.acceptUrl}`,
    'You already have an Amixos account — sign in as usual and this business',
    'will be in the workspace switcher.',
  ].join('\n');
}

export function teamInviteHtml(data: TeamInviteEmailData): string {
  const who = esc(data.inviterName ?? 'Alguien');
  const whoEn = esc(data.inviterName ?? 'Someone');
  const biz = data.businessName ? esc(data.businessName) : null;
  const url = esc(data.acceptUrl);

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
            <div style="font-size:20px;font-weight:700;color:#0F172A;">
              ${biz ? `Te agregaron a ${biz}` : 'Te agregaron a un negocio'}
            </div>
            <div style="font-size:15px;line-height:24px;color:#475569;padding-top:12px;">
              ${who} te agregó ${biz ? `al equipo de <strong style="color:#0F172A;">${biz}</strong>` : 'a un equipo'} en Amixos.
              <br><br>
              <strong style="color:#0F172A;">Ya tienes una cuenta de Amixos</strong>, así que no
              necesitas registrarte otra vez. Acepta y el negocio aparecerá en el
              selector, arriba a la izquierda.
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;">
            <a href="${url}"
               style="display:block;background:#2563EB;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;text-align:center;padding:14px 20px;border-radius:12px;">
              Aceptar invitación
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 0;">
            <div style="font-size:12px;line-height:20px;color:#94A3B8;">
              Si el botón no funciona, copia este enlace:<br>
              <a href="${url}" style="color:#2563EB;word-break:break-all;">${url}</a>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 28px;">
            <div style="border-top:1px solid #F1F5F9;padding-top:16px;font-size:13px;line-height:21px;color:#64748B;">
              Si no esperabas esto, ignora el correo — no se agrega nada a tu
              cuenta hasta que aceptes.
              <br><br>
              <strong style="color:#0F172A;">English:</strong> ${whoEn} added you to
              ${biz ?? 'their team'} on Amixos. You already have an account, so just
              tap the button to accept — the business will appear in your workspace
              switcher. If you were not expecting this, ignore this email; nothing is
              added until you accept.
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

/** Business names and personal names are user-supplied and land in HTML —
 *  escape them. A client called "Smith & Sons <Roofing>" should render, not
 *  break the layout or smuggle markup into someone's inbox. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
