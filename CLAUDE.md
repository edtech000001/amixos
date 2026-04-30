# AmiXOS

Spanish-first business management SaaS for Latino entrepreneurs / small service businesses in the US. All UI is in Spanish.

## Monorepo Layout

- `web/` — Next.js 14 app (Vercel deploys from `development`)
- `mobile/` — Expo SDK 51 app (React Native 0.74.5, expo-router, NativeWind, EAS dev client)
- `api/` — backend service (Prisma)
- `shared/` — cross-package code + Tailwind preset
- `supabase/migrations/` — SQL migrations (run manually in Supabase SQL Editor)

## Stack

- **Web:** Next.js 14, Tailwind, Supabase, `@supabase/ssr` (cookie-based sessions)
- **Mobile:** Expo SDK 51, expo-router, NativeWind, `@supabase/supabase-js`, EAS dev client
- **DB/Auth:** Supabase with RLS on auth-required tables
- **Deploy:** Vercel auto-deploys from the `development` branch

## Git Workflow

- Active branch: `development` | Default base for PRs: `main`
- **Always `git pull origin development` before committing** — branch moves frequently
- Use `git pull --rebase` if a push is rejected
- Quote bracket paths: `git add "web/src/app/dashboard/trabajos/[id]/page.tsx"`
- **Push after every change** — Vercel auto-deploys so the user can verify immediately

## Product Vision — Modular Architecture

Core handles universal business needs: clients, jobs/proposals, invoices, employees, calendar, inventory, reports, settings. Industry modules plug in on top (mechanic, salon, landscaping, etc.). Once core is solid, growth = new modules.

- Core must be **fully customizable**: pipeline steps, required fields, custom fields, etc.
- All core features must be **module-aware**: extensible, never hardcoded to one industry
- `Ajustes` (Settings) is the customization hub: pipeline config, field config, future module toggles

## Architecture Notes

- `AppContext` provides `user`, `business`, `loading`, `refetchBusiness`; redirects to login if no session
- Middleware refreshes token via `getUser()`
- Business model: one business per owner; all data scoped by `business_id`
- `use(params)` does NOT work in `'use client'` components — destructure directly: `const { id } = params`

## Key DB Details

- `clients` table uses `phone_cell` (NOT `phone`), `email_office`, `email_home`. Original schema had `mobile_phone` — be aware of legacy references.
- `businesses` table has `client_field_required` (JSONB) and `job_pipeline_disabled` (JSONB)
- `jobs` table is unified (proposals + work). Status flow:
  `proposal → sent → accepted → scheduled → in_progress → completed → invoiced`
- Client contacts: multiple people per client with roles

## Features Built

- **Trabajos (Jobs):** create, edit, delete, status pipeline, generate invoice
- **Propuestas (Proposals):** merged into jobs with `estimate_number` + proposal-specific fields
- **Facturas (Invoices):** create from jobs, detail view, bilingual support
- **Clientes (Clients):** expandable fields, custom field templates, CSV import
- **Empleados (Employees):** list, assignments to jobs
- **Ajustes (Settings):** Negocio, Trabajos (pipeline config), Clientes (required fields + custom fields), Cuenta

## Design Preferences

- Full-width left-aligned dashboard layout (no `max-w` + `mx-auto` centering)
- Form pages keep `max-w-4xl` but no `mx-auto`
- `Ajustes` uses sidebar tab navigation
- Modern card-based UI: `rounded-2xl`, `shadow-sm`, `border-gray-100`
- Pipeline/stepper UI for job status with timestamps
- Confirmation modals for destructive actions

## Migrations

Any new `.sql` file in `supabase/migrations/` must be run manually in the Supabase SQL Editor. Check whether columns already exist before running.

## Mobile Dev Quickstart

From `mobile/`:
- `npx expo run:ios` — local native build + install (needs Xcode + CocoaPods)
- `npm start` — start Metro only (use after dev client is installed)
- `eas build --profile development --platform ios` — cloud dev-client build
- `npx expo run:android` — Android equivalent

Do NOT run `npx expo` from the repo root — it won't find the local SDK 51 and npx will offer to install SDK 55.
