// Subscription plan catalog — the single source of truth for the pricing modal
// on web + mobile. Each plan is per-business: a business carries its own plan
// + trial.
//
// PRICES HERE MUST MATCH STRIPE EXACTLY. They are what the customer is shown;
// Stripe is what the card is actually charged, and the two disagreeing is a
// complaint waiting to happen. Every amount below was read off the Stripe
// dashboard, so `annualTotal` is a literal rather than a computed monthly × 10
// — the real annual prices don't land on a clean multiple.
//
// Annual billing vs paying monthly for 12 months:
//   Básico       $599.88 → $490.99     saves $108.89  = 2.18 months
//   Profesional  $1,199.88 → $990.99   saves $208.89  = 2.09 months
//   Negocio      $1,799.88 → $1,499.99 saves $299.89  = 1.9994 months
//   Corporativo  $2,399.88 → $1,999.99 saves $399.89  = 1.9995 months
//
// The "2 months free" badge is exact on the first two and 9¢ short on the last
// two (2 months would be $1,499.90 / $1,999.90). Immaterial, but don't tighten
// the wording to a guarantee without changing those Stripe prices first.

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
  /** USD per year on the annual plan — the exact Stripe amount, NOT derived
   *  from `monthly`. */
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

export const PLANS: Plan[] = [
  {
    key: 'basico',
    monthly: 49.99,
    annualTotal: 490.99,
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
    annualTotal: 990.99,
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
    annualTotal: 1499.99,
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
    annualTotal: 1999.99,
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
 *  annual this is a derived EQUIVALENT ($490.99/12), not an amount anyone is
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
