# Auth email templates

Supabase stores these in the dashboard, not in the repo, so they live here to
be reviewed and diffed like everything else. **Editing a file changes nothing
on its own** — paste it into the dashboard.

## Where each one goes

Authentication → Emails → pick the template → paste the file into the message
body → Save.

| File | Dashboard template | Subject to set |
|---|---|---|
| `recovery.html` | Reset Password | `Restablece tu contraseña · Reset your password` |
| `confirmation.html` | Confirm signup | `Confirma tu correo · Confirm your email` |
| `magic-link.html` | Magic Link | `Tu enlace de acceso · Your sign-in link` |
| `email-change.html` | Change Email Address | `Confirma tu nuevo correo · Confirm your new email` |

"Invite user" is deliberately not here: team invites go through our own API
(`/api/v1/invites`) with our own copy, not `admin.inviteUserByEmail`, so the
Supabase invite template is never sent.

## How the language switch works

`{{ .Data }}` is the user's `raw_user_meta_data`. Both register routes write
`locale` into it at signup for exactly this reason, so `{{ if eq .Data.locale
"en" }}` picks the language. Anything else — an older account, or a Google
signup that never set it — falls through to **Spanish**, which is the app's
default rather than a fallback.

`{{ .Data.first_name }}` personalizes the greeting. It can be absent (OAuth
signups store `name`/`full_name` instead), so every greeting has a nameless
form; "Hola ," reads worse than "Hola.".

After editing, send yourself one of each from a real account — a Go template
error does not surface in the dashboard, it just sends the raw `{{ ... }}` text
to a customer.

## Before launch: the sender address

These arrive from **`noreply@mail.app.supabase.io`**, labelled "Supabase Auth".
Branding the body does not change that, and Supabase's built-in sender is a
development convenience: it is rate limited (Authentication → Rate Limits shows
the current ceiling, which is low enough that a burst of signups will silently
drop mail) and it is not intended for production traffic.

Fixing it means configuring custom SMTP under Authentication → Emails → SMTP
Settings with a provider (Resend, Postmark, SendGrid) sending as
`soporte@amixos.com`, which also requires the SPF/DKIM DNS records that keep
these out of spam. That is a separate task from the templates; do it before the
App Store listing goes live, because a password reset that never arrives looks
identical to a broken app.
