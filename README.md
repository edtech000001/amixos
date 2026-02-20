# Amixos

> The business management platform built for the culture.

Bilingual (Spanish/English) SaaS platform for Hispanic small business owners and their teams. Modular, offline-first, web + mobile.

---

## Monorepo Structure

```
app/
├── web/          # Next.js web app
├── mobile/       # React Native (Expo) mobile app
├── api/          # Node.js + Express backend API
└── shared/       # Shared types, utils, constants
```

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Web      | Next.js 14 (React)                |
| Mobile   | React Native (Expo)               |
| API      | Node.js + Express + TypeScript    |
| Database | PostgreSQL + Prisma ORM           |
| Cache    | Redis                             |
| Auth     | JWT + OAuth (Google, Apple, etc.) |
| Storage  | AWS S3 (photos, docs, logos)      |
| VOIP     | Twilio                            |
| Payments | Stripe                            |
| Offline  | WatermelonDB (mobile)             |
| i18n     | react-i18next (ES/EN)             |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run API
cd api && npm run dev

# Run Web
cd web && npm run dev

# Run Mobile
cd mobile && npx expo start
```

## Branches

- `main` — stable production
- `development` — active development (PRs go here)
- `edvin` — Edvin's working branch

## Modules

Core app ships with universal features. Industry-specific modules are activated at onboarding or via the in-app module store.

See `/docs/modules.md` for module architecture.
