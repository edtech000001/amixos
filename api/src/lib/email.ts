// Outbound email from the API, via Resend's REST API.
//
// Distinct from the Supabase auth emails: those are rendered by GoTrue from
// the templates in supabase/email-templates/ and sent over Resend's SMTP
// bridge. This is for mail the API originates itself — currently one case,
// described in routes/invites.ts.
//
// Deliberately no `resend` npm package: Node 22 has global fetch, the API is
// two fields and a POST, and a dependency here would be weight in the image
// for no gain.
//
// Uses its OWN key (RESEND_API_KEY), separate from the SMTP credential
// Supabase holds, so either can be revoked without taking down the other.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'not_configured' | 'rejected' | 'network'; detail?: string };

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Worth setting: HTML-only mail scores worse with
   *  spam filters, and some clients render nothing without it. */
  text?: string;
}

/**
 * Sends one email. NEVER throws — every caller so far treats delivery as
 * non-fatal (the invite row and its shareable link exist either way), so a
 * result object keeps that decision at the call site instead of forcing a
 * try/catch around business logic.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not an error — a deploy without the key configured should degrade to
    // "no email sent", which the caller already reports honestly.
    return { ok: false, reason: 'not_configured' };
  }

  const from = process.env.EMAIL_FROM ?? 'Amixos <soporte@amixos.com>';

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: 'rejected', detail: detail.slice(0, 300) };
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? null };
  } catch (e) {
    return {
      ok: false,
      reason: 'network',
      detail: e instanceof Error ? e.message.slice(0, 300) : undefined,
    };
  }
}
