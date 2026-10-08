# App Review reply — Guideline 2.1 Information Needed

Paste sections 2–6 into **both** the App Store Connect reply **and** the
*App Review Information → Notes* field (Apple asks for both, and the Notes
version carries forward to future submissions).

Section 1 is a screen recording you have to capture yourself — shot list at the
bottom.

---

## 2. Purpose and target audience

Amixos is a business management app for small service businesses in the United
States — landscapers, contractors, cleaners, handymen and similar trades,
typically 1–15 people.

**The problem it solves.** These businesses run on paper, text messages and
memory. Quotes get lost, invoices go out late or not at all, hours are
reconstructed from recollection at the end of the week, and the owner has no
reliable picture of what was earned. Existing software is built for larger
companies, priced for them, and offered only in English.

**What makes it different.** Amixos is Spanish-first. It was designed in
Spanish, not translated into it, because a large share of small service
businesses in the US are owned and staffed by Spanish speakers. Each person
chooses their own language, so an owner can work in English while their crew
works in Spanish on the same business data.

**Who uses it.** The owner runs the business from the office or their truck:
clients, quotes, scheduling, invoicing, payroll. Crew members get a restricted
view showing only the jobs they are assigned to.

Amixos is a general-purpose product available to any small business that signs
up. It is not an internal or employee-only app for one organisation.

---

## 3. Setting up and accessing the main features

**Demo account** (already in App Review Information; repeated here):

- Email: *(the demo address in the Sign-In Information fields)*
- Password: *(the demo password in the Sign-In Information fields)*

The account is pre-loaded with sample clients, jobs, invoices, employees,
inventory and calendar entries, so every screen has data to review. There is
only one account type to test — it signs in as a business owner, which has
access to everything. Crew members have a reduced view, but that requires a
second invited user and is not needed to review the app.

**The interface defaults to Spanish.** To switch to English: **Más → Ajustes →
Cuenta → Idioma**. *(This in-app switcher is in the next build; in the
submitted build the app follows the device language, so an English device shows
English.)*

**Where to find the main features**

| Feature | Where |
|---|---|
| Dashboard — earnings, payroll, pending invoices | Home tab (Inicio) |
| Clients | Clientes tab |
| Jobs and quotes, with a status pipeline | Trabajos tab |
| Invoices — create, send, mark paid | Facturas tab |
| Calendar | Más → Calendario |
| Employees, hours, payroll | Más → Equipo / Nómina |
| Inventory, reports, settings | Más |
| **Account deletion** | Más → Ajustes → Cuenta → *Zona de peligro* |

**Account deletion** is implemented as required: the user deletes their own
account from Ajustes → Cuenta. Access ends immediately and the data is purged
after a 30-day recovery window, during which signing in restores the account.
The same screen separately offers deleting the business and all of its data.

**Permissions** — all optional, all requested in context, and declining any of
them leaves the rest of the app fully usable:

- **Location** — recording the address of a job site, and suggesting the
  nearest available crew.
- **Contacts** — importing clients from the phone's address book. Only accessed
  after the user taps "Import contacts".
- **Camera / Photos** — attaching photos to a job.
- **Notifications** — job and invoice reminders.

**No in-app purchases.** The app is free to use with a 14-day trial. Subscription
billing is handled on our website and is deliberately **not** linked from the
iOS app — iOS shows a plain, non-tappable note rather than a link, per guideline
3.1.1. No paid content is gated inside the app for review purposes.

---

## 4. External services used

| Service | What it does |
|---|---|
| **Supabase** | Primary database, authentication and file storage. All app data. |
| **Sign in with Apple** | Authentication option. |
| **Google Sign-In** | Authentication option. |
| **Cloudflare Turnstile** | Bot protection on sign-in, sign-up and password reset. |
| **Google Cloud Run** | Our own backend API (invoice email, scheduled jobs, assistant). |
| **Resend** | Transactional email — sending invoices and estimates to the user's clients, plus account email. |
| **Apple Maps** | Showing job locations on iOS. |
| **Google People API** | One-way export of the user's clients to their own Google Contacts. Opt-in; off by default; never reads or imports from Google. |
| **Anthropic (Claude)** | "Ami", an optional in-app assistant. Off until the user explicitly consents, and a consent screen names Anthropic before anything is sent. Can be turned off entirely in Ajustes. |
| **Google Cloud Text-to-Speech** | Spoken replies for Ami only, when voice is used. |
| **NOAA / National Weather Service (api.weather.gov)** | Optional severe-weather alerts on the job map. Public US government data. |
| **Stripe** | Subscription billing. **Web only — not reachable from the iOS app.** |

**Not active in this build:** the app contains groundwork for an SMS module
(Twilio / ClickSend). That module is marked "coming soon" and is not reachable
by users in this release — no SMS is sent.

---

## 5. Regional differences

**The app functions consistently across all regions.** There are no
region-gated features, no region-specific content, and no differences in
behaviour by country.

Availability is set to the **United States and Canada**, because the app is
built around US business practices — US address formats, state-based sales tax
on invoices, and US payroll conventions.

Two settings vary by user, not by region: the **interface language** (Spanish
or English, chosen per device) and the **invoice tax rate** (entered by the
business). Neither depends on where the app is downloaded.

---

## 6. Regulated industry / third-party material

Amixos does not operate in a regulated industry and includes no protected
third-party material.

It is general business record-keeping software — invoices, schedules, client
records and internal payroll calculations for the business's own employees. It
is not an accounting, tax-filing, payments, lending, healthcare or legal
service. It does not move money, file anything with any authority, or give
regulated advice. Payroll figures are the business's own arithmetic for its own
records.

All content in the app is created by the user or is our own. The only
third-party data displayed is public US National Weather Service information,
which is in the public domain.

---

## 1. Screen recording — shot list

Must be captured on a **physical device** running the current iOS, starting
from launching the app. A simulator recording will not satisfy this.

Install the TestFlight build on a real iPhone, then record (iOS Control Centre →
Screen Recording). Around 3–5 minutes.

1. **Launch** the app from the home screen — show the icon being tapped.
2. **Registration** — create a new account with email and password. *(Do this
   first with a throwaway address, so the whole account lifecycle is on tape.)*
3. **Sign out**, then **sign in** again with the demo account.
4. **Dashboard** — earnings, payroll, pending invoices.
5. **Clients** — open one, show its details and history.
6. **Jobs** — open one, show the status pipeline, line items and photos.
   Attaching a photo covers user-generated content.
7. **Invoices** — open a paid invoice, then create one and show it being sent.
8. **Calendar** and **Team / payroll**, briefly.
9. **Account deletion** — Más → Ajustes → Cuenta → *Zona de peligro* → Eliminar
   mi cuenta. **Complete the flow on the throwaway account from step 2.** Apple
   asks for this explicitly and it is the item most often missing.

Narration isn't required, but showing each tap clearly is. Upload the file in
the App Store Connect reply.

**Note on user-generated content:** all content is private to the business that
creates it. Nothing is shared publicly, between businesses, or with other
users, so there is no public feed requiring content reporting or blocking
mechanisms. Say this in the reply — it answers the UGC part of item 1 without
needing a reporting feature.
