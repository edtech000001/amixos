// Subscription plan catalog — the single source of truth for the pricing modal
// on web + mobile. Pure data (no billing yet); Stripe wiring comes later. Each
// plan is per-business: a business carries its own plan + trial.
//
// Annual billing = "2 months free": annualTotal = monthly × 10.

export type PlanKey = 'basico' | 'profesional' | 'negocio' | 'corporativo' | 'empresa';
export type BillingPeriod = 'monthly' | 'annual';

export interface PlanCopy {
  name: string;
  tagline: string;
  features: string[];
}

export interface Plan {
  key: PlanKey;
  /** USD per month on the monthly plan. 0 for a `custom` (contact-sales) tier. */
  monthly: number;
  /** USD per year on the annual plan (= monthly × 10, i.e. 2 months free). */
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

/** Months you effectively pay for on the annual plan (12 − 2 free). */
const ANNUAL_PAID_MONTHS = 10;

const annual = (monthly: number) => monthly * ANNUAL_PAID_MONTHS;

export const PLANS: Plan[] = [
  {
    key: 'basico',
    monthly: 49,
    annualTotal: annual(49),
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
    monthly: 99,
    annualTotal: annual(99),
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
    monthly: 150,
    annualTotal: annual(150),
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
    monthly: 200,
    annualTotal: annual(200),
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

/** The price to show on a card for the chosen billing period (per-month). */
export function planMonthlyEquivalent(plan: Plan, period: BillingPeriod): number {
  return period === 'annual' ? plan.annualTotal / 12 : plan.monthly;
}

/** Dollars saved per year by paying annually vs 12× monthly. */
export function planAnnualSavings(plan: Plan): number {
  return plan.monthly * 12 - plan.annualTotal;
}
