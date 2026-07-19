'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Sparkles, ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import {
  PLANS,
  planMonthlyEquivalent,
  planAnnualSavings,
  type BillingPeriod,
  type PlanKey,
} from '@amixos/shared/lib/plans';
import { useLang } from '@/i18n/LangProvider';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useApp } from '@/lib/AppContext';
import { createSupabaseClient } from '@/lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectPlan?: (key: PlanKey, period: BillingPeriod) => void;
}

type View = 'plans' | 'contact';

export function PricingModal({ open, onClose, onSelectPlan }: Props) {
  const { locale } = useLang();
  const es = locale === 'es';
  const { user, business } = useApp();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [view, setView] = useState<View>('plans');
  const [subscribingKey, setSubscribingKey] = useState<PlanKey | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  // Reset to the plans view every time the modal re-opens.
  useEffect(() => {
    if (open) {
      setView('plans');
      setSubscribeError(null);
    }
  }, [open]);

  async function handleSubscribe(plan: PlanKey) {
    if (!business) return;
    setSubscribingKey(plan);
    setSubscribeError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, plan, period }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(
          data?.error || (es ? 'No se pudo iniciar el pago.' : 'Could not start checkout.'),
        );
      }
      window.location.href = data.url;
    } catch (err) {
      setSubscribeError(
        err instanceof Error ? err.message : es ? 'Ocurrió un error.' : 'Something went wrong.',
      );
      setSubscribingKey(null);
    }
  }

  const title =
    view === 'contact'
      ? es
        ? 'Contáctanos'
        : 'Contact sales'
      : es
        ? 'Planes y precios'
        : 'Plans & pricing';

  return (
    <Modal open={open} onClose={onClose} title={title} size="2xl">
      {view === 'contact' ? (
        <ContactForm
          es={es}
          user={user}
          business={business}
          onBack={() => setView('plans')}
          onClose={onClose}
        />
      ) : (
        <>
          {/* Monthly / annual toggle */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="inline-flex items-center rounded-xl bg-border-soft p-1">
              {(['monthly', 'annual'] as BillingPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={clsx(
                    'flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors',
                    period === p ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted hover:text-ink'
                  )}
                >
                  {p === 'monthly' ? (es ? 'Mensual' : 'Monthly') : es ? 'Anual' : 'Annual'}
                  {p === 'annual' && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-1.5 py-0.5 leading-none">
                      {es ? '−2 meses' : '−2 mo'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* Always-on incentive — advertise the annual deal even on monthly. */}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-500/10 border border-green-200 rounded-full px-3 py-1">
              🎁 {es ? '2 meses gratis al pagar por año' : '2 months free when you pay yearly'}
            </span>
          </div>

          {/* Plan cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => {
              const copy = plan.copy[locale];
              const perMonth = Math.round(planMonthlyEquivalent(plan, period));
              const savings = planAnnualSavings(plan);
              const highlighted = plan.recommended;
              const isCustom = plan.custom;

              return (
                <div
                  key={plan.key}
                  className={clsx(
                    'relative flex flex-col rounded-2xl border p-5 shadow-sm bg-card',
                    highlighted ? 'border-primary ring-2 ring-primary/30' : 'border-border-soft'
                  )}
                >
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                      <Sparkles size={12} />
                      {es ? 'Más popular' : 'Most popular'}
                    </span>
                  )}

                  <h3 className="text-lg font-bold text-ink">{copy.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">{copy.tagline}</p>

                  <div className="mt-4">
                    {isCustom ? (
                      <div className="flex items-baseline">
                        <span className="text-2xl font-bold text-ink">
                          {es ? 'Precio personalizado' : 'Custom pricing'}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold text-ink">${perMonth}</span>
                          <span className="text-sm text-muted">{es ? '/mes' : '/mo'}</span>
                        </div>
                        {period === 'annual' && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-muted">
                              {es
                                ? `facturado anualmente · $${plan.annualTotal}/año`
                                : `billed annually · $${plan.annualTotal}/yr`}
                            </p>
                            <p className="text-xs font-semibold text-green-600">
                              {es ? `Ahorra $${savings}/año` : `Save $${savings}/yr`}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <ul className="mt-4 space-y-2 flex-1">
                    {copy.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink">
                        <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isCustom ? (
                    <Button
                      variant="secondary"
                      fullWidth
                      className="mt-5"
                      onClick={() => setView('contact')}
                    >
                      {es ? 'Contáctanos' : 'Contact us'}
                    </Button>
                  ) : (
                    <Button
                      variant={highlighted ? 'primary' : 'secondary'}
                      fullWidth
                      className="mt-5"
                      disabled={!business || subscribingKey !== null}
                      onClick={() => handleSubscribe(plan.key)}
                    >
                      {subscribingKey === plan.key
                        ? es
                          ? 'Redirigiendo…'
                          : 'Redirecting…'
                        : es
                          ? 'Suscribirse'
                          : 'Subscribe'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {subscribeError && (
            <p className="mt-4 text-center text-sm text-red-500">{subscribeError}</p>
          )}

          <p className="mt-6 text-center text-xs text-muted">
            {es
              ? '14 días gratis · sin tarjeta de crédito'
              : '14-day free trial · no credit card'}
          </p>
        </>
      )}
    </Modal>
  );
}

interface ContactFormProps {
  es: boolean;
  user: ReturnType<typeof useApp>['user'];
  business: ReturnType<typeof useApp>['business'];
  onBack: () => void;
  onClose: () => void;
}

function ContactForm({ es, user, business, onBack, onClose }: ContactFormProps) {
  const [contactName, setContactName] = useState(user?.name ?? '');
  const [businessName, setBusinessName] = useState(business?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = (email.trim() !== '' || phone.trim() !== '') && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { error: insertError } = await supabase.from('enterprise_leads').insert({
        user_id: user?.id ?? null,
        business_id: business?.id ?? null,
        contact_name: contactName.trim() || null,
        business_name: businessName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        team_size: teamSize.trim() || null,
        message: message.trim() || null,
      });
      if (insertError) throw insertError;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : es ? 'Ocurrió un error.' : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check size={28} className="text-green-600" />
        </div>
        <p className="text-lg font-semibold text-ink">
          {es ? '¡Gracias! Te contactaremos pronto.' : "Thanks! We'll be in touch soon."}
        </p>
        <Button variant="primary" onClick={onClose}>
          {es ? 'Cerrar' : 'Close'}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-ink"
      >
        <ChevronLeft size={16} />
        {es ? 'Volver a los planes' : 'Back to plans'}
      </button>

      <p className="text-sm text-muted">
        {es
          ? 'Cuéntanos sobre tu equipo y te prepararemos un plan a tu medida.'
          : 'Tell us about your team and we’ll put together a plan that fits.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={es ? 'Nombre' : 'Name'}
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
        <Input
          label={es ? 'Negocio' : 'Business'}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label={es ? 'Teléfono' : 'Phone'}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label={es ? 'Tamaño del equipo' : 'Team size'}
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">
          {es ? 'Mensaje' : 'Message'}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className={clsx(
            'w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-ink placeholder-faint',
            'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary focus:border-transparent',
            'transition duration-150'
          )}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <p className="text-xs text-faint">
        {es
          ? 'Incluye al menos un correo o teléfono para que podamos contactarte.'
          : 'Include at least an email or phone so we can reach you.'}
      </p>

      <Button type="submit" variant="primary" fullWidth disabled={!canSubmit}>
        {submitting
          ? es
            ? 'Enviando…'
            : 'Sending…'
          : es
            ? 'Enviar'
            : 'Send'}
      </Button>
    </form>
  );
}
