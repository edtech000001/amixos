'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, ChevronDown, Menu, X, Home, Users, ClipboardList, FileText, LayoutGrid,
  Globe, Star, Zap, Shield, Smartphone, Mail, Building2,
} from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import { Logo } from '@amixos/shared/ui/Logo';
import { SUPPORT_EMAIL } from '@amixos/shared/lib/support';
import type { LandingDict } from '@amixos/shared';
import type { Locale } from '@amixos/shared';
import {
  PLANS, TRIAL_DAYS, formatPlanPrice, planMonthlyEquivalent,
  type BillingPeriod,
} from '@amixos/shared/lib/plans';

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 hover:text-indigo-600 transition-colors">
        <span className="text-sm font-semibold text-gray-900">{q}</span>
        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && <p className="text-sm text-gray-500 pb-4 leading-relaxed">{a}</p>}
    </div>
  );
}

// ─── App Mockup ───────────────────────────────────────────────────────────────
function AppMockup({ t }: { t: LandingDict }) {
  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Phone frame */}
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Top bar */}
        <div className="bg-indigo-600 px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-bold text-sm">Amixos</span>
            <div className="w-7 h-7 rounded-full bg-white/20"/>
          </div>
          <p className="text-white/70 text-xs">{t.mockup.welcome}</p>
          <p className="text-white font-bold text-xl mt-1">$24,500</p>
          <p className="text-white/60 text-xs">{t.mockup.monthlyIncome}</p>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 -mt-2">
          {[['12', t.mockup.clients], ['8', t.mockup.invoices], ['6', t.mockup.employees]].map(([n, l]) => (
            <div key={l} className="bg-white text-center py-3">
              <p className="text-lg font-bold text-gray-900">{n}</p>
              <p className="text-xs text-gray-400">{l}</p>
            </div>
          ))}
        </div>
        {/* Recent items */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t.mockup.recent}</p>
          {[
            { name: 'Carlos Mendoza', amount: '$3,200', status: t.mockup.paid, color: 'text-emerald-600 bg-emerald-50' },
            { name: 'Miguel Torres', amount: '$1,800', status: t.mockup.sent, color: 'text-blue-600 bg-blue-50' },
            { name: 'Rosa García', amount: '$950', status: t.mockup.draft, color: 'text-gray-500 bg-gray-100' },
          ].map(item => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-indigo-600 text-xs font-bold">{item.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.amount}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.color}`}>{item.status}</span>
            </div>
          ))}
        </div>
        {/* Dock — the real one: the five default apps from
            mobile/lib/dockApps.ts, with the same lucide icons the app uses.
            It used to be five emoji (including a hard-hat that maps to nothing
            in the product), which is the tell that a screenshot is fake. */}
        <div className="border-t border-gray-100 px-3 py-2.5 flex justify-around">
          {[
            { Icon: Home, label: t.mockup.dock.home, active: true },
            { Icon: ClipboardList, label: t.mockup.dock.jobs },
            { Icon: Users, label: t.mockup.dock.clients },
            { Icon: FileText, label: t.mockup.dock.invoices },
            { Icon: LayoutGrid, label: t.mockup.dock.more },
          ].map(({ Icon, label, active }) => (
            <div key={label} className="flex flex-col items-center gap-1 w-12">
              <Icon size={17} className={active ? 'text-indigo-600' : 'text-gray-400'} strokeWidth={2}/>
              <span className={`text-[9px] font-medium ${active ? 'text-indigo-600' : 'text-gray-400'}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Floating badges */}
      <div className="absolute -right-4 top-12 bg-white rounded-2xl shadow-lg px-3 py-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-900">{t.mockup.newInvoice}</p>
        <p className="text-xs text-emerald-600 font-bold">+$1,200 ✓</p>
      </div>
      <div className="absolute -left-6 bottom-20 bg-white rounded-2xl shadow-lg px-3 py-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-900">6 {t.mockup.activeEmployees}</p>
        <p className="text-xs text-indigo-600">{t.mockup.activeToday}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { t: full, locale, locales, labels, setLocale } = useLang();
  const t = full.landing;
  const [mobileMenu, setMobileMenu] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [scrolled, setScrolled] = useState(false);

  const idx = locales.indexOf(locale);
  const nextLocale = locales[(idx + 1) % locales.length];
  const otherLocaleLabel = labels[nextLocale];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-100' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Amixos" className="flex items-center">
            <Logo variant="side" width={132} ink="black" />
          </Link>

          {/* Desktop nav.
              Three groups, not one row of five: where to go on this page, then
              the account actions, with a rule between them. Flat, they all
              read as equal weight and "Iniciar sesión" gets lost next to
              "Contacto" — they are different kinds of thing.

              No icons on the text links on purpose: the globe earns its place
              because "English" alone does not say what it does, but an icon
              beside "Precios" or "Contacto" is decoration that slows the scan
              rather than speeding it. */}
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => setLocale(nextLocale)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors font-medium">
              <Globe size={15}/>
              {otherLocaleLabel}
            </button>
            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t.pricing.tag}
            </a>
            <a href="#contacto" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t.contact.tag}
            </a>

            <span aria-hidden className="h-5 w-px bg-gray-300" />

            <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t.nav.login}
            </Link>
            <Link href="/auth/register"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              {t.nav.cta}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2" onClick={() => setMobileMenu(!mobileMenu)}>
            {mobileMenu ? <X size={22}/> : <Menu size={22}/>}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenu && (
          <div className="md:hidden bg-white border-t border-gray-100 px-5 py-4 flex flex-col gap-4">
            <button onClick={() => setLocale(nextLocale)}
              className="flex items-center gap-2 text-sm text-gray-600 font-medium">
              <Globe size={15}/> {t.nav.switchLang}
            </button>
            <a href="#pricing" className="text-sm font-medium text-gray-700" onClick={() => setMobileMenu(false)}>{t.pricing.tag}</a>
            <a href="#contacto" className="text-sm font-medium text-gray-700" onClick={() => setMobileMenu(false)}>{t.contact.tag}</a>

            <span aria-hidden className="h-px w-full bg-gray-200" />

            <Link href="/auth/login" className="text-sm font-medium text-gray-700" onClick={() => setMobileMenu(false)}>{t.nav.login}</Link>
            <Link href="/auth/register" onClick={() => setMobileMenu(false)}
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-3 rounded-xl text-center transition-colors">
              {t.nav.cta}
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="pt-24 pb-20 px-5 bg-gradient-to-b from-indigo-50 via-white to-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                {t.hero.tag}
              </div>
              <h1 className="text-5xl md:text-6xl font-black text-gray-900 leading-tight mb-4">
                {t.hero.h1_1}<br/>
                <span className="text-indigo-600">{t.hero.h1_2}</span>
              </h1>
              <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-md">
                {t.hero.sub}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/auth/register"
                  className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
                >
                  {t.hero.ctaPrimary}
                </Link>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center border border-gray-200 bg-white hover:border-gray-300 text-gray-700 font-semibold px-7 py-3.5 rounded-xl transition-colors"
                >
                  {t.hero.ctaSecondary}
                </a>
              </div>
              <p className="text-xs text-gray-400 mt-3">{t.hero.note}</p>
            </div>
            <div className="hidden md:block">
              <AppMockup t={t}/>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-5 px-5">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-sm text-gray-400">
          {[
            { icon: <Shield size={15}/>, text: t.trust.secureData },
            { icon: <Zap size={15}/>, text: t.trust.noContracts },
            { icon: <Globe size={15}/>, text: t.trust.spanishFirst },
            { icon: <Smartphone size={15}/>, text: t.trust.mobileReady },
            { icon: <Star size={15}/>, text: t.trust.support },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-1.5">{icon}<span>{text}</span></div>
          ))}
        </div>
      </section>

      {/* ── Problem ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.problem.tag}</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-10">{t.problem.h}</h2>
          <div className="flex flex-col gap-3 text-left">
            {t.problem.items.map(item => (
              <div key={item} className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
                <span className="text-red-400 mt-0.5 shrink-0 text-lg">✗</span>
                <p className="text-gray-700 text-sm font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.solution.tag}</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">{t.solution.h}</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {t.solution.features.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-base font-bold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.how.tag}</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">{t.how.h}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {t.how.steps.map(step => (
              <div key={step.n} className="relative text-center">
                <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-2xl font-black mx-auto mb-4">
                  {step.n}
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founder story ──────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-gradient-to-br from-indigo-600 to-indigo-800">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-3">{t.story.tag}</p>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-8">{t.story.h}</h2>
          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-left backdrop-blur-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-indigo-400 flex items-center justify-center text-white font-black text-xl">E</div>
              <div>
                <p className="text-white font-bold">Edvin Ramirez</p>
                <p className="text-indigo-200 text-sm">{t.story.role}</p>
              </div>
            </div>
            <div className="space-y-4">
              {[t.story.p1, t.story.p2, t.story.p3].map((p, i) => (
                <p key={i} className="text-indigo-100 text-sm leading-relaxed">{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      {/* Rendered straight from shared/lib/plans.ts — the same catalogue the
          in-app upgrade modal reads, which is itself pinned to the Stripe
          amounts. A hand-written price here would be a promise the checkout
          does not keep the moment either side moves. */}
      <section id="pricing" className="py-20 px-5 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.pricing.tag}</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.pricing.h}</h2>
            <p className="text-gray-500 text-sm mb-8">{t.pricing.sub}</p>
          </div>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
              {(['monthly', 'annual'] as BillingPeriod[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
                    period === p ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {p === 'monthly' ? t.pricing.monthly : t.pricing.annual}
                </button>
              ))}
            </div>
            <span className="hidden sm:inline text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              {t.pricing.annualBadge}
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-start">
            {PLANS.map(plan => {
              const copy = plan.copy[locale as Locale] ?? plan.copy.es;
              const perMonth = planMonthlyEquivalent(plan, period);
              return (
                <div
                  key={plan.key}
                  className={`relative flex flex-col h-full rounded-3xl p-6 bg-white transition-shadow ${
                    plan.recommended
                      ? 'border-2 border-indigo-600 shadow-xl'
                      : 'border border-gray-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  {plan.recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-indigo-600 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                      {t.pricing.popular}
                    </span>
                  )}

                  <h3 className="text-lg font-black text-gray-900">{copy.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 mb-5 min-h-[32px]">{copy.tagline}</p>

                  {plan.custom ? (
                    <p className="text-3xl font-black text-gray-900 mb-1">—</p>
                  ) : (
                    <>
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-black text-gray-900">${formatPlanPrice(perMonth)}</span>
                        <span className="text-gray-400 mb-1.5 text-sm">{t.pricing.perMonth}</span>
                      </div>
                      {/* Annual is shown as its monthly equivalent so the tiers stay
                          comparable; the real charge is stated underneath so nobody
                          is surprised by the amount on their card. */}
                      <p className="text-xs text-gray-400 mt-1 h-4">
                        {period === 'annual'
                          ? t.pricing.billedAnnually.replace('{total}', formatPlanPrice(plan.annualTotal))
                          : ''}
                      </p>
                    </>
                  )}

                  <div className="flex flex-col gap-2.5 my-6 flex-1">
                    {copy.features.map(f => (
                      <div key={f} className="flex items-start gap-2">
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5"/>
                        <span className="text-sm text-gray-600 leading-snug">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href={plan.custom ? '#contacto' : '/auth/register'}
                    className={`text-center text-sm font-semibold px-4 py-3 rounded-xl transition-colors ${
                      plan.recommended
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : 'border border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {plan.custom ? t.pricing.ctaContact : t.pricing.ctaTrial}
                  </Link>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            {t.pricing.note.replace('{days}', String(TRIAL_DAYS))}
          </p>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.faq.tag}</p>
            <h2 className="text-3xl font-black text-gray-900">{t.faq.h}</h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 divide-y divide-gray-100">
            {t.faq.items.map(f => <FaqItem key={f.q} q={f.q} a={f.a}/>)}
          </div>
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────────────────── */}
      {/* Deliberately mailto rather than a form: a public form on a marketing
          page is a spam target that needs its own rate limiting and captcha
          verification, and this reaches the same inbox. SUPPORT_EMAIL is the
          shared constant the in-app Settings card uses, so there is one
          address to change. */}
      <section id="contacto" className="py-20 px-5 bg-gray-50 scroll-mt-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.contact.tag}</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.contact.h}</h2>
            <p className="text-gray-500 text-sm">{t.contact.sub}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Mail size={22} className="text-indigo-600 mb-3"/>
              <h3 className="text-base font-bold text-gray-900 mb-1">{t.contact.supportTitle}</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{t.contact.supportBody}</p>
              <span className="text-sm font-semibold text-indigo-600 group-hover:underline break-all">
                {SUPPORT_EMAIL}
              </span>
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t.contact.salesSubject)}`}
              className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Building2 size={22} className="text-indigo-600 mb-3"/>
              <h3 className="text-base font-bold text-gray-900 mb-1">{t.contact.salesTitle}</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{t.contact.salesBody}</p>
              <span className="text-sm font-semibold text-indigo-600 group-hover:underline break-all">
                {SUPPORT_EMAIL}
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.finalCta.h}</h2>
          <p className="text-gray-500 mb-8">{t.finalCta.sub}</p>
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            {t.finalCta.cta}
          </Link>
          <p className="text-xs text-gray-400 mt-3">{t.hero.note}</p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-8 px-5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo variant="side" width={110} ink="black" />
            <span className="text-gray-400 text-sm">— {t.footer.tagline}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <Link href="/auth/login" className="hover:text-gray-700 transition-colors">{t.nav.login}</Link>
            <Link href="/auth/register" className="hover:text-gray-700 transition-colors">{t.nav.cta}</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-700 transition-colors">{t.contact.tag}</a>
            <Link href="/terms" className="hover:text-gray-700 transition-colors">{t.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-gray-700 transition-colors">{t.footer.privacy}</Link>
            <button onClick={() => setLocale(nextLocale)} className="hover:text-gray-700 transition-colors">
              {otherLocaleLabel}
            </button>
          </div>
          <p className="text-xs text-gray-300">© {new Date().getFullYear()} Amixos. {t.footer.rights}</p>
        </div>
      </footer>
    </div>
  );
}
