'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import {
  CheckCircle2, ChevronDown, Menu, X,
  Users, FileText, Clock, Package, Calendar, Globe,
  ArrowRight, Star, Zap, Shield, Smartphone,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
type Lang = 'es' | 'en';

const T = {
  es: {
    nav_login: 'Iniciar sesión',
    nav_cta: 'Únete gratis',
    hero_tag: '🚀 Acceso anticipado — gratis durante beta',
    hero_h1_1: 'Tu negocio.',
    hero_h1_2: 'En tu idioma.',
    hero_sub: 'Amixos es el sistema de administración de negocios diseñado para dueños de negocios hispanos en Estados Unidos. Clientes, facturas, empleados e inventario — todo en un solo lugar, en español.',
    form_name: 'Tu nombre',
    form_email: 'Tu correo',
    form_biz: 'Tipo de negocio',
    form_biz_opt: ['Construcción', 'Jardinería', 'Limpieza', 'Plomería', 'Electricidad', 'Otro'],
    form_cta: 'Quiero acceso anticipado →',
    form_note: 'Gratis durante el período beta. Sin tarjeta de crédito.',
    form_success: '¡Listo! Te avisamos cuando esté disponible.',
    form_dup: 'Ese correo ya está registrado.',
    problem_tag: 'El problema',
    problem_h: '¿Reconoces esto?',
    problem_items: [
      'Apuntas las horas de tus empleados en papel o WhatsApp',
      'Tus facturas las haces en Excel o a mano',
      'Pierdes clientes porque no tienes seguimiento',
      'Los softwares en inglés son confusos y caros',
      'No sabes exactamente cuánto ganaste este mes',
    ],
    solution_tag: 'La solución',
    solution_h: 'Todo lo que necesitas, en uno',
    features: [
      { icon: '👥', title: 'Clientes', desc: 'Organiza todos tus contactos, historial de trabajos y facturas por cliente.' },
      { icon: '📄', title: 'Facturas', desc: 'Crea y envía facturas profesionales en segundos. Rastrea pagos pendientes.' },
      { icon: '👷', title: 'Empleados', desc: 'Registra horas, calcula nómina y maneja tu equipo sin complicaciones.' },
      { icon: '📦', title: 'Inventario', desc: 'Controla tus materiales. Alertas de stock bajo automáticas.' },
      { icon: '📅', title: 'Calendario', desc: 'Agenda trabajos, citas y entregas. Tu equipo siempre al tanto.' },
      { icon: '🌐', title: 'Bilingüe', desc: 'Funciona en español e inglés. Tú decides el idioma de cada sección.' },
    ],
    how_tag: 'Cómo funciona',
    how_h: 'Listo en minutos, no en horas',
    how_steps: [
      { n: '1', title: 'Crea tu cuenta', desc: 'Registra tu negocio en 2 minutos. Sin contratos, sin letra chica.' },
      { n: '2', title: 'Importa tus datos', desc: 'Sube tu lista de clientes desde Excel o empieza desde cero.' },
      { n: '3', title: 'Administra todo', desc: 'Facturas, empleados, inventario — desde tu teléfono o computadora.' },
    ],
    story_tag: 'Por qué Amixos',
    story_h: 'Construido por alguien como tú',
    story_p1: 'Soy Edvin, ingeniero eléctrico y dueño de dos empresas de construcción. Manejo más de 40 trabajadores entre Nebraska y Georgia.',
    story_p2: 'Por años usé Excel, WhatsApp y papel para todo. Los softwares existentes estaban en inglés y costaban una fortuna para lo que ofrecían.',
    story_p3: 'Construí Amixos para mí primero. Ahora lo estoy abriendo para todos los dueños de negocios hispanos que merecen una herramienta que hable su idioma.',
    pricing_tag: 'Precio',
    pricing_h: 'Gratis durante el beta',
    pricing_sub: 'Los primeros 500 usuarios en la lista de espera obtienen 6 meses gratis cuando lancemos.',
    pricing_features: [
      'Clientes ilimitados',
      'Facturas ilimitadas',
      'Hasta 25 empleados',
      'Inventario completo',
      'Calendario',
      'Soporte en español',
    ],
    pricing_cta: 'Asegurar mi lugar gratis →',
    faq_tag: 'Preguntas',
    faq_h: 'Preguntas frecuentes',
    faqs: [
      { q: '¿Cuándo estará disponible?', a: 'Estamos en beta activa ahora. Los usuarios en lista de espera serán los primeros en obtener acceso, gratis por 6 meses.' },
      { q: '¿Necesito saber de computadoras?', a: 'No. Si puedes usar WhatsApp, puedes usar Amixos. Está diseñado para ser simple.' },
      { q: '¿Funciona en el teléfono?', a: 'Sí. La versión web funciona en cualquier teléfono. La app móvil nativa está en desarrollo.' },
      { q: '¿Qué pasa con mis datos?', a: 'Tus datos son tuyos. Puedes exportarlos en cualquier momento. Nunca los vendemos.' },
      { q: '¿Hay contratos?', a: 'No. Mes a mes, cancela cuando quieras. Sin letra chica.' },
    ],
    final_h: '¿Listo para ordenar tu negocio?',
    final_sub: 'Únete a los primeros dueños de negocios hispanos que están transformando cómo administran su operación.',
    footer_tagline: 'Donde negocios prosperan.',
  },
  en: {
    nav_login: 'Log in',
    nav_cta: 'Join free',
    hero_tag: '🚀 Early access — free during beta',
    hero_h1_1: 'Your business.',
    hero_h1_2: 'Your language.',
    hero_sub: 'Amixos is the business management platform built for Hispanic small business owners in the US. Clients, invoices, employees, and inventory — all in one place, in Spanish.',
    form_name: 'Your name',
    form_email: 'Your email',
    form_biz: 'Business type',
    form_biz_opt: ['Construction', 'Landscaping', 'Cleaning', 'Plumbing', 'Electrical', 'Other'],
    form_cta: 'Get early access →',
    form_note: 'Free during beta. No credit card needed.',
    form_success: "You're in! We'll notify you when it's ready.",
    form_dup: 'That email is already registered.',
    problem_tag: 'The problem',
    problem_h: 'Sound familiar?',
    problem_items: [
      "You track employee hours on paper or WhatsApp",
      "Invoices are done in Excel or by hand",
      "You lose clients because there's no follow-up system",
      "English-only software is confusing and expensive",
      "You don't know exactly how much you made this month",
    ],
    solution_tag: 'The solution',
    solution_h: 'Everything you need, in one place',
    features: [
      { icon: '👥', title: 'Clients', desc: 'Organize all your contacts, job history and invoices by client.' },
      { icon: '📄', title: 'Invoices', desc: 'Create and send professional invoices in seconds. Track outstanding payments.' },
      { icon: '👷', title: 'Employees', desc: 'Log hours, calculate payroll and manage your team without the headache.' },
      { icon: '📦', title: 'Inventory', desc: 'Track your materials. Automatic low-stock alerts.' },
      { icon: '📅', title: 'Calendar', desc: 'Schedule jobs, appointments and deliveries. Keep your team informed.' },
      { icon: '🌐', title: 'Bilingual', desc: 'Works in Spanish and English. You choose the language.' },
    ],
    how_tag: 'How it works',
    how_h: 'Ready in minutes, not hours',
    how_steps: [
      { n: '1', title: 'Create your account', desc: 'Register your business in 2 minutes. No contracts, no fine print.' },
      { n: '2', title: 'Import your data', desc: 'Upload your client list from Excel or start from scratch.' },
      { n: '3', title: 'Manage everything', desc: 'Invoices, employees, inventory — from your phone or computer.' },
    ],
    story_tag: 'Why Amixos',
    story_h: 'Built by someone like you',
    story_p1: "I'm Edvin, electrical engineer and owner of two construction companies. I manage 40+ workers between Nebraska and Georgia.",
    story_p2: "For years I used Excel, WhatsApp and paper for everything. Existing software was in English and cost a fortune for what it offered.",
    story_p3: "I built Amixos for myself first. Now I'm opening it to every Hispanic business owner who deserves a tool that speaks their language.",
    pricing_tag: 'Pricing',
    pricing_h: 'Free during beta',
    pricing_sub: 'The first 500 users on the waitlist get 6 months free when we launch.',
    pricing_features: [
      'Unlimited clients',
      'Unlimited invoices',
      'Up to 25 employees',
      'Full inventory',
      'Calendar',
      'Spanish support',
    ],
    pricing_cta: 'Secure my free spot →',
    faq_tag: 'FAQ',
    faq_h: 'Frequently asked questions',
    faqs: [
      { q: 'When will it be available?', a: "We're in active beta now. Waitlist users will be the first to get access, free for 6 months." },
      { q: 'Do I need to be tech-savvy?', a: "No. If you can use WhatsApp, you can use Amixos. It's designed to be simple." },
      { q: 'Does it work on my phone?', a: 'Yes. The web version works on any phone. A native mobile app is in development.' },
      { q: 'What happens to my data?', a: 'Your data is yours. Export anytime. We never sell it.' },
      { q: 'Are there contracts?', a: 'No. Month to month, cancel anytime. No fine print.' },
    ],
    final_h: 'Ready to get organized?',
    final_sub: 'Join the first Hispanic business owners transforming how they run their operation.',
    footer_tagline: 'Where businesses thrive.',
  },
};

// ─── Waitlist Form ────────────────────────────────────────────────────────────
function WaitlistForm({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const t = T[lang];
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
        <p className="text-emerald-700 font-semibold">{t.form_success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 w-full">
      {!compact && (
        <>
          <input type="text" placeholder={t.form_name} value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"/>
          <select value={bizType} onChange={e => setBizType(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm appearance-none">
            <option value="">{t.form_biz}</option>
            {t.form_biz_opt.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </>
      )}
      <div className="flex gap-2">
        <input type="email" required placeholder={t.form_email} value={email}
          onChange={e => setEmail(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"/>
        <button type="submit" disabled={status === 'loading'}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors whitespace-nowrap text-sm disabled:opacity-60">
          {status === 'loading' ? '...' : compact ? (lang === 'es' ? 'Unirme →' : 'Join →') : t.form_cta}
        </button>
      </div>
      {status === 'dup' && <p className="text-xs text-orange-500">{t.form_dup}</p>}
      {status === 'error' && <p className="text-xs text-red-500">{lang === 'es' ? 'Error, intenta de nuevo.' : 'Error, try again.'}</p>}
      {!compact && <p className="text-xs text-gray-400 text-center">{t.form_note}</p>}
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
function AppMockup() {
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
          <p className="text-white/70 text-xs">Bienvenido, Edvin</p>
          <p className="text-white font-bold text-xl mt-1">$24,500</p>
          <p className="text-white/60 text-xs">Ingresos este mes</p>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 -mt-2">
          {[['12', lang === 'es' ? 'Clientes' : 'Clients'], ['8', lang === 'es' ? 'Facturas' : 'Invoices'], ['6', lang === 'es' ? 'Empleados' : 'Employees']].map(([n, l]) => (
            <div key={l} className="bg-white text-center py-3">
              <p className="text-lg font-bold text-gray-900">{n}</p>
              <p className="text-xs text-gray-400">{l}</p>
            </div>
          ))}
        </div>
        {/* Recent items */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Actividad reciente</p>
          {[
            { name: 'Carlos Mendoza', amount: '$3,200', status: 'Pagada', color: 'text-emerald-600 bg-emerald-50' },
            { name: 'Miguel Torres', amount: '$1,800', status: 'Enviada', color: 'text-blue-600 bg-blue-50' },
            { name: 'Rosa García', amount: '$950', status: 'Borrador', color: 'text-gray-500 bg-gray-100' },
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
        <p className="text-xs font-semibold text-gray-900">Nueva factura</p>
        <p className="text-xs text-emerald-600 font-bold">+$1,200 ✓</p>
      </div>
      <div className="absolute -left-6 bottom-20 bg-white rounded-2xl shadow-lg px-3 py-2 border border-gray-100">
        <p className="text-xs font-semibold text-gray-900">6 empleados</p>
        <p className="text-xs text-indigo-600">activos hoy</p>
      </div>
    </div>
  );
}

// Hack to use lang inside AppMockup without prop drilling
let lang: Lang = 'es';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [currentLang, setCurrentLang] = useState<Lang>('es');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  lang = currentLang;
  const t = T[currentLang];

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
            <button onClick={() => setCurrentLang(currentLang === 'es' ? 'en' : 'es')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors font-medium">
              <Globe size={15}/>
              {currentLang === 'es' ? 'English' : 'Español'}
            </button>
            <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t.nav_login}
            </Link>
            <Link href="/auth/register"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              {t.nav_cta}
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
            <button onClick={() => setCurrentLang(currentLang === 'es' ? 'en' : 'es')}
              className="flex items-center gap-2 text-sm text-gray-600 font-medium">
              <Globe size={15}/> {currentLang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
            </button>
            <Link href="/auth/login" className="text-sm font-medium text-gray-700" onClick={() => setMobileMenu(false)}>{t.nav_login}</Link>
            <Link href="/auth/register" onClick={() => setMobileMenu(false)}
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-3 rounded-xl text-center transition-colors">
              {t.nav_cta}
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
                {t.hero_tag}
              </div>
              <h1 className="text-5xl md:text-6xl font-black text-gray-900 leading-tight mb-4">
                {t.hero_h1_1}<br/>
                <span className="text-indigo-600">{t.hero_h1_2}</span>
              </h1>
              <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-md">
                {t.hero_sub}
              </p>
              <WaitlistForm lang={currentLang}/>
            </div>
            <div className="hidden md:block">
              <AppMockup/>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ──────────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-5 px-5">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-sm text-gray-400">
          {[
            { icon: <Shield size={15}/>, text: currentLang === 'es' ? 'Datos seguros' : 'Secure data' },
            { icon: <Zap size={15}/>, text: currentLang === 'es' ? 'Sin contratos' : 'No contracts' },
            { icon: <Globe size={15}/>, text: currentLang === 'es' ? '100% en español' : '100% in Spanish' },
            { icon: <Smartphone size={15}/>, text: currentLang === 'es' ? 'Funciona en móvil' : 'Mobile ready' },
            { icon: <Star size={15}/>, text: currentLang === 'es' ? 'Soporte en tu idioma' : 'Support in your language' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-1.5">{icon}<span>{text}</span></div>
          ))}
        </div>
      </section>

      {/* ── Problem ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.problem_tag}</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-10">{t.problem_h}</h2>
          <div className="flex flex-col gap-3 text-left">
            {t.problem_items.map(item => (
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
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.solution_tag}</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">{t.solution_h}</h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
            {t.features.map(f => (
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
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.how_tag}</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">{t.how_h}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {t.how_steps.map(step => (
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
          <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-3">{t.story_tag}</p>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-8">{t.story_h}</h2>
          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-left backdrop-blur-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-indigo-400 flex items-center justify-center text-white font-black text-xl">E</div>
              <div>
                <p className="text-white font-bold">Edvin Ramirez</p>
                <p className="text-indigo-200 text-sm">{currentLang === 'es' ? 'Fundador · Ingeniero eléctrico · Contratista' : 'Founder · Electrical engineer · Contractor'}</p>
              </div>
            </div>
            <div className="space-y-4">
              {[t.story_p1, t.story_p2, t.story_p3].map((p, i) => (
                <p key={i} className="text-indigo-100 text-sm leading-relaxed">{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.pricing_tag}</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.pricing_h}</h2>
          <p className="text-gray-500 text-sm mb-8">{t.pricing_sub}</p>
          <div className="bg-white border-2 border-indigo-600 rounded-3xl p-8 shadow-xl">
            <div className="flex items-end justify-center gap-1 mb-6">
              <span className="text-5xl font-black text-indigo-600">$0</span>
              <span className="text-gray-400 mb-2">/mes</span>
            </div>
            <div className="flex flex-col gap-3 mb-8 text-left">
              {t.pricing_features.map(f => (
                <div key={f} className="flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>
                  <span className="text-sm text-gray-700">{f}</span>
                </div>
              ))}
            </div>
            <WaitlistForm lang={currentLang} compact/>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-3">{t.faq_tag}</p>
            <h2 className="text-3xl font-black text-gray-900">{t.faq_h}</h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 divide-y divide-gray-100">
            {t.faqs.map(f => <FaqItem key={f.q} q={f.q} a={f.a}/>)}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">{t.final_h}</h2>
          <p className="text-gray-500 mb-8">{t.final_sub}</p>
          <WaitlistForm lang={currentLang}/>
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
            <span className="text-gray-400 text-sm">— {t.footer_tagline}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <Link href="/auth/login" className="hover:text-gray-700 transition-colors">{t.nav_login}</Link>
            <Link href="/auth/register" className="hover:text-gray-700 transition-colors">{t.nav_cta}</Link>
            <button onClick={() => setCurrentLang(currentLang === 'es' ? 'en' : 'es')} className="hover:text-gray-700 transition-colors">
              {currentLang === 'es' ? 'English' : 'Español'}
            </button>
          </div>
          <p className="text-xs text-gray-300">© {new Date().getFullYear()} Amixos. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
