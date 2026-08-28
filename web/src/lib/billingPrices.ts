import type { BillingPeriod, PlanKey } from '@amixos/shared/lib/plans';

// Maps a plan + billing period to its Stripe Price id, read from server env
// vars. Create the 8 prices in the Stripe dashboard (4 plans × monthly/annual)
// and set these env vars. 'empresa' is contact-sales — no Stripe price.
const PRICE_ENV: Record<Exclude<PlanKey, 'empresa'>, Record<BillingPeriod, string | undefined>> = {
  basico: {
    monthly: process.env.STRIPE_PRICE_BASICO_MONTHLY,
    annual: process.env.STRIPE_PRICE_BASICO_ANNUAL,
  },
  profesional: {
    monthly: process.env.STRIPE_PRICE_PROFESIONAL_MONTHLY,
    annual: process.env.STRIPE_PRICE_PROFESIONAL_ANNUAL,
  },
  negocio: {
    monthly: process.env.STRIPE_PRICE_NEGOCIO_MONTHLY,
    annual: process.env.STRIPE_PRICE_NEGOCIO_ANNUAL,
  },
  corporativo: {
    monthly: process.env.STRIPE_PRICE_CORPORATIVO_MONTHLY,
    annual: process.env.STRIPE_PRICE_CORPORATIVO_ANNUAL,
  },
};

export function priceIdFor(plan: PlanKey, period: BillingPeriod): string | null {
  if (plan === 'empresa') return null;
  return PRICE_ENV[plan]?.[period] ?? null;
}
