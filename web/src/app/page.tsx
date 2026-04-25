'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import {
  CheckCircle2, ChevronDown, Menu, X,
  Globe, ArrowRight, Star, Zap, Shield, Smartphone,
} from 'lucide-react';
import { useLang } from '@/i18n/LangProvider';
import type { LandingDict } from '@amixos/shared';

// ─── Waitlist Form ────────────────────────────────────────────────────────────
function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const { t: full } = useLang();
  const t = full.landing;
  const supabase = createSupabaseClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bizType, setBizType] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'dup' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    const { error } = await supabase.from('waitlist').insert({
      email: email.trim().toLowerCase(),
      first_name: name.trim() || null,
      business_type: bizType || null,
      referrer: typeof window !== 'undefined' ? document.referrer || null : null,
    });
    if (!error) { setStatus('success'); return; }
    if (error.code === '23505') { setStatus('dup'); return; }
    setStatus('error');
  };

  if (status === 'success') {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
        <CheckCircle2 size={22} className="text-emerald-500 shrink-0"/>
        <p className="text-emerald-700 font-semibold">{t.form.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 w-full">
      {!compact && (
        <>
          <input type="text" placeholder={t.form.name} value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"/>
          <select value={bizType} onChange={e => setBizType(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm appearance-none">
            <option value="">{t.form.biz}</option>
            {t.form.bizOpts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </>
      )}
      <div className="flex gap-2">
        <input type="email" required placeholder={t.form.email} value={email}
          onChange={e => setEmail(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"/>
        <button type="submit" disabled={status === 'loading'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors whitespace-nowrap text-sm disabled:opacity-60">
          {status === 'loading' ? '...' : compact ? t.form.ctaCompact : t.form.cta}
        </button>
      </div>
      {status === 'dup' && <p className="text-xs text-orange-500">{t.form.dup}</p>}
      {status === 'error' && <p className="text-xs text-red-500">{t.form.error}</p>}
      {!compact && <p className="text-xs text-gray-400 text-center">{t.form.note}</p>}
    </form>
  );
}

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
        {/* Nav bar */}
        <div className="border-t border-gray-100 px-4 py-3 flex justify-around">
          {['🏠', '👥', '📄', '👷', '⚙️'].map(icon => (
            <span key={icon} className="text-lg">{icon}</span>
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">A</span>
            </div>
            <span className="font-black text-lg text-gray-900">Amixos</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => setLocale(nextLocale)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors font-medium">
              <Globe size={15}/>
              {otherLocaleLabel}
            </button>
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
              <WaitlistForm/>
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
      <section className="py-20 px-5">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.pricing.tag}</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.pricing.h}</h2>
          <p className="text-gray-500 text-sm mb-8">{t.pricing.sub}</p>
          <div className="bg-white border-2 border-indigo-600 rounded-3xl p-8 shadow-xl">
            <div className="flex items-end justify-center gap-1 mb-6">
              <span className="text-5xl font-black text-indigo-600">$0</span>
              <span className="text-gray-400 mb-2">{t.pricing.perMonth}</span>
            </div>
            <div className="flex flex-col gap-3 mb-8 text-left">
              {t.pricing.features.map(f => (
                <div key={f} className="flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>
                  <span className="text-sm text-gray-700">{f}</span>
                </div>
              ))}
            </div>
            <WaitlistForm compact/>
          </div>
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

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.finalCta.h}</h2>
          <p className="text-gray-500 mb-8">{t.finalCta.sub}</p>
          <WaitlistForm/>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-8 px-5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <span className="text-white font-black text-xs">A</span>
            </div>
            <span className="font-black text-gray-900">Amixos</span>
            <span className="text-gray-400 text-sm">— {t.footer.tagline}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <Link href="/auth/login" className="hover:text-gray-700 transition-colors">{t.nav.login}</Link>
            <Link href="/auth/register" className="hover:text-gray-700 transition-colors">{t.nav.cta}</Link>
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
