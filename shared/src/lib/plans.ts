// Subscription plan catalog — the single source of truth for the pricing modal
// on web + mobile. Each plan is per-business: a business carries its own plan
// + trial.
//
// PRICES HERE MUST MATCH STRIPE EXACTLY. They are what the customer is shown;
// Stripe is what the card is actually charged, and the two disagreeing is a
// complaint waiting to happen. Every amount below was read off the Stripe
// dashboard on 2026-08-28:
//
//   Básico       $49.99/mo   $499.90/yr
//   Profesional  $99.99/mo   $999.90/yr
//   Negocio     $149.99/mo   $1,499.90/yr
//   Corporativo $199.99/mo   $1,999.90/yr
//
// Annual = monthly × 10, i.e. exactly 2 months free on every tier — hence the
// annual() helper below. If a Stripe annual price is ever set to something
// that ISN'T 10× the monthly, replace that plan's annual() call with the
// literal Stripe amount rather than bending the helper; matching Stripe wins
// over keeping the formula tidy.

export type PlanKey = 'basico' | 'profesional' | 'negocio' | 'corporativo' | 'empresa';
export type BillingPeriod = 'monthly' | 'annual';

export interface PlanCopy {
  name: string;
  tagline: string;
  features: string[];
}

export interface Plan {
  key: PlanKey;
  /** USD per month on the monthly plan — the exact Stripe amount. 0 for a
   *  `custom` (contact-sales) tier. */
  monthly: number;
  /** USD per year on the annual plan — the exact Stripe amount. Currently
   *  monthly × 10 on every tier (see annual()), but it is a stored value, not
   *  a derived one: Stripe is the authority. */
  annualTotal: number;
  /** Highlight as the suggested plan ("Más popular"). */
  recommended?: boolean;
  /** Contact-sales tier: no fixed price, no trial — opens the lead form. */
  custom?: boolean;
  /** Combined storage allowance (photos + files), in GB. null = custom/unlimited.
   *  Storage is cheap (~$0.02/GB/mo) so these are generous abuse guardrails +
   *  an upgrade nudge, not a cost-recovery lever. Enforcement/usage meter TBD. */
  storageGb: number | null;
  /** People who can log in (business_members rows), ALL roles included — field
   *  crew and viewers count the same as office staff. null = custom/unlimited.
   *  This is the real price lever: enforced on invite, never by removing
   *  anyone who is already a member. See ./planLimits.ts. */
  maxMembers: number | null;
  copy: { es: PlanCopy; en: PlanCopy };
}

/** Free-trial length, in days. No credit card required. */
export const TRIAL_DAYS = 14;

/** Months you pay for on the annual plan — 12 billed, 2 free. */
const ANNUAL_PAID_MONTHS = 10;

/** Annual total for a monthly price, rounded to cents. The ×10 lands exactly
 *  on Stripe's annual amounts today ($49.99 → $499.90); the rounding is only
 *  to stop floating point turning 49.99 × 10 into 499.90000000000003. */
const annual = (monthly: number) => Math.round(monthly * ANNUAL_PAID_MONTHS * 100) / 100;

export const PLANS: Plan[] = [
  {
    key: 'basico',
    monthly: 49.99,
    annualTotal: annual(49.99),
    storageGb: 10,
    maxMembers: 2,
    copy: {
      es: {
        name: 'Básico',
        tagline: 'Para empezar — 1 o 2 personas',
        features: [
          'Hasta 2 miembros del equipo',
          '10 GB de almacenamiento',
          'Clientes, trabajos y facturas',
          'Calendario y agenda',
          'Sincronización con Google',
          'Reportes',
          'Soporte por correo',
        ],
      },
      en: {
        name: 'Basic',
        tagline: 'Getting started — 1 or 2 people',
        features: [
          'Up to 2 team members',
          '10 GB storage',
          'Clients, jobs & invoices',
          'Calendar & scheduling',
          'Google sync',
          'Reports',
          'Email support',
        ],
      },
    },
  },
  {
    key: 'profesional',
    monthly: 99.99,
    annualTotal: annual(99.99),
    recommended: true,
    storageGb: 50,
    maxMembers: 10,
    copy: {
      es: {
        name: 'Profesional',
        tagline: 'Para equipos en crecimiento',
        features: [
          'Hasta 10 miembros del equipo',
          '50 GB de almacenamiento',
          'Todo lo de Básico',
          'Módulos por industria',
          'Roles del equipo y horas/nómina',
        ],
      },
      en: {
        name: 'Professional',
        tagline: 'For growing crews',
        features: [
          'Up to 10 team members',
          '50 GB storage',
          'Everything in Basic',
          'Industry modules',
          'Team roles & hours/payroll',
        ],
      },
    },
  },
  {
    key: 'negocio',
    monthly: 149.99,
    annualTotal: annual(149.99),
    storageGb: 150,
    maxMembers: 20,
    copy: {
      es: {
        name: 'Negocio',
        tagline: 'Para operaciones con varias cuadrillas',
        features: [
          'Hasta 20 miembros del equipo',
          '150 GB de almacenamiento',
          'Todo lo de Profesional',
          'Todos los módulos',
          'Varias sucursales',
          'Soporte prioritario',
        ],
      },
      en: {
        name: 'Business',
        tagline: 'For multi-crew operations',
        features: [
          'Up to 20 team members',
          '150 GB storage',
          'Everything in Professional',
          'All modules',
          'Multiple locations',
          'Priority support',
        ],
      },
    },
  },
  {
    key: 'corporativo',
    monthly: 199.99,
    annualTotal: annual(199.99),
    storageGb: 400,
    maxMembers: 40,
    copy: {
      es: {
        name: 'Corporativo',
        tagline: 'Para empresas con equipos grandes',
        features: [
          'Hasta 40 miembros del equipo',
          '400 GB de almacenamiento',
          'Todo lo de Negocio',
          'Roles personalizados',
          'Registro de auditoría',
          'Soporte prioritario',
        ],
      },
      en: {
        name: 'Corporate',
        tagline: 'For companies with large teams',
        features: [
          'Up to 40 team members',
          '400 GB storage',
          'Everything in Business',
          'Custom roles',
          'Audit log',
          'Priority support',
        ],
      },
    },
  },
  {
    key: 'empresa',
    monthly: 0,
    annualTotal: 0,
    custom: true,
    storageGb: null,
    maxMembers: null,
    copy: {
      es: {
        name: 'Empresa',
        tagline: 'Para equipos de más de 40',
        features: [
          'Más de 40 miembros del equipo',
          'Almacenamiento personalizado',
          'Todo lo de Corporativo',
          'Precios por volumen',
          'Incorporación dedicada',
          'Gerente de cuenta',
        ],
      },
      en: {
        name: 'Enterprise',
        tagline: 'For teams over 40',
        features: [
          '40+ team members',
          'Custom storage',
          'Everything in Corporate',
          'Volume pricing',
          'Dedicated onboarding',
          'Account manager',
        ],
      },
    },
  },
];

/** The price to show on a card for the chosen billing period (per-month). On
 *  annual this is a derived EQUIVALENT ($499.90/12), not an amount anyone is
 *  charged — the annual total is shown beside it. Format with
 *  formatPlanPrice(), which does the rounding. */
export function planMonthlyEquivalent(plan: Plan, period: BillingPeriod): number {
  return period === 'annual' ? plan.annualTotal / 12 : plan.monthly;
}

/** Dollars saved per year by paying annually vs 12× monthly. Rounded to cents:
 *  49.99 × 12 evaluates to 599.8800000000001 in floating point, and the raw
 *  subtraction renders as "$108.89000000000004" on the card. */
export function planAnnualSavings(plan: Plan): number {
  return Math.round((plan.monthly * 12 - plan.annualTotal) * 100) / 100;
}

/**
 * Render a plan amount for display, WITHOUT a currency symbol (callers supply
 * the "$"). Thousands-grouped, and cents shown only when there are any —
 * "49.99", "1,499.99", "40.92", "50". Rounds to the nearest cent, so a derived
 * value like 490.99/12 lands on 40.92 instead of 40.915833333333335.
 */
export function formatPlanPrice(amount: number): string {
  const cents = Math.round(amount * 100) / 100;
  return cents.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(cents) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
