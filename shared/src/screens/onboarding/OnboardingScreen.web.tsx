// Web-only OnboardingScreen — see LoginScreen.web.tsx for the why (shared
// RN + NativeWind screens render unstyled on web). Same exported API
// (OnboardingData, PickLogoResult, OnboardingScreenProps) so the web route
// wrapper (web/src/app/onboarding/page.tsx) needs no changes.

import { useState } from 'react';
import { clsx } from 'clsx';
import {
  Building2, MapPin, Image as ImageIcon, Upload, X, Package, Phone, Check,
  CheckCircle2, HardHat, Wrench, Trees, Sparkles, Utensils, Droplets, ShoppingBag,
  Forklift, FolderOpen, MoreHorizontal, type LucideIcon,
} from 'lucide-react';
import { useLang } from '../../i18n';
import {
  DAY_KEYS,
  DEFAULT_OPERATING_HOURS,
  type DayKey,
  type OperatingHours,
} from '../../lib/operatingHours';
import { featuresForIndustry } from '../../modules/industryFeatures';

export interface OnboardingData {
  businessName: string;
  serviceType: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  logoUrl: string | null;
  /** Weekly hours when the user added them, else null (not configured). */
  operatingHours: OperatingHours | null;
  /** Recommended module ids the user kept enabled. */
  features: string[];
}

// Module ids → icon for the tailored "Extras" step (web lucide set).
const FEATURE_ICONS: Record<string, LucideIcon> = {
  map: MapPin,
  files: FolderOpen,
  equipment: Forklift,
  inventory: Package,
};

export type PickLogoResult = { url: string } | { error: string } | null;

export interface OnboardingScreenProps {
  onPickLogo: () => Promise<PickLogoResult>;
  onFinish: (data: OnboardingData) => Promise<{ ok: true } | { ok: false; error?: string }>;
}

const TOTAL_STEPS = 5;

const ICONS: Record<string, LucideIcon> = {
  construction: HardHat,
  mechanics: Wrench,
  landscaping: Trees,
  cleaning: Sparkles,
  restaurant: Utensils,
  phone_repair: Phone,
  plumbing: Droplets,
  retail: ShoppingBag,
  other: MoreHorizontal,
};

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
  'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

export function OnboardingScreen({ onPickLogo, onFinish }: OnboardingScreenProps) {
  const { t: full } = useLang();
  const t = full.onboarding;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [data, setData] = useState<OnboardingData>({
    businessName: '',
    serviceType: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    logoUrl: null,
    operatingHours: null,
    features: [],
  });

  const update = (fields: Partial<OnboardingData>) => setData((d) => ({ ...d, ...fields }));
  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS + 1));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const handleFinish = async () => {
    setLoading(true);
    setFinishError('');
    const result = await onFinish(data);
    if ('error' in result || result.ok === false) {
      setFinishError(('error' in result && result.error) || t.page.finishGenericError);
      setLoading(false);
      return;
    }
    setLoading(false);
    setStep(TOTAL_STEPS + 1);
  };

  const progress = Math.min(step, TOTAL_STEPS);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex flex-col items-center justify-center px-4 py-10">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-gray-400">{t.page.progressLabel}</span>
          <span className="text-xs text-gray-400">{progress} {t.page.progressOf} {TOTAL_STEPS}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(progress / TOTAL_STEPS) * 100}%` }} />
        </div>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        {step === 1 && <StepBusinessName value={data.businessName} onChange={(v) => update({ businessName: v })} onNext={next} />}
        {step === 2 && <StepServiceType value={data.serviceType} onChange={(v) => update({ serviceType: v, features: featuresForIndustry(v) })} onNext={next} onBack={back} />}
        {step === 3 && <StepLocation address={data.address} city={data.city} state={data.state} postalCode={data.postalCode} operatingHours={data.operatingHours} onChange={update} onNext={next} onBack={back} />}
        {step === 4 && <StepLogo logoUrl={data.logoUrl} onChange={(url) => update({ logoUrl: url })} onPickLogo={onPickLogo} onNext={next} onBack={back} />}
        {step === 5 && <StepFeatures serviceType={data.serviceType} features={data.features} onChange={update} onFinish={handleFinish} onBack={back} loading={loading} error={finishError} />}
        {step > TOTAL_STEPS && <StepComplete />}
      </div>

      {step < TOTAL_STEPS + 1 ? (
        <p className="text-xs text-gray-400 mt-4 text-center">{t.page.footerNote}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary';
const primaryBtn =
  'w-full rounded-xl bg-primary text-white font-semibold py-3 hover:opacity-90 disabled:opacity-60 transition-opacity';
const secondaryBtn =
  'w-full rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold py-3 hover:bg-gray-50 transition-colors';

function StepBusinessName({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
  const { t: full } = useLang();
  const t = full.onboarding.businessName;
  const [error, setError] = useState('');
  const handleNext = () => {
    if (!value.trim()) { setError(t.error); return; }
    setError('');
    onNext();
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <Building2 color="#4F46E5" size={24} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{t.heading}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.label}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleNext(); }}
          placeholder={t.placeholder}
          className={inputCls}
        />
        {error ? <p className="text-xs text-red-500 mt-1">{error}</p> : null}
      </div>
      <button onClick={handleNext} className={primaryBtn}>{t.cta}</button>
    </div>
  );
}

function StepServiceType({ value, onChange, onNext, onBack }: { value: string; onChange: (v: string) => void; onNext: () => void; onBack: () => void }) {
  const { t: full } = useLang();
  const t = full.onboarding.serviceType;
  const [error, setError] = useState('');
  const handleNext = () => {
    if (!value) { setError(t.error); return; }
    setError('');
    onNext();
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t.heading}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {t.options.map(({ key, label }) => {
          const Icon = ICONS[key] ?? MoreHorizontal;
          const active = value === key;
          return (
            <button
              key={key}
              onClick={() => { onChange(key); setError(''); }}
              className={clsx(
                'flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors',
                active ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200',
              )}
            >
              <Icon size={22} color={active ? '#4F46E5' : '#4B5563'} />
              <span className={clsx('text-sm font-medium text-center', active ? 'text-primary' : 'text-gray-600')}>{label}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <div className="flex gap-3">
        <button onClick={onBack} className={secondaryBtn}>{t.back}</button>
        <button onClick={handleNext} className={primaryBtn}>{t.next}</button>
      </div>
    </div>
  );
}

function StepLocation({ address, city, state, postalCode, operatingHours, onChange, onNext, onBack }: { address: string; city: string; state: string; postalCode: string; operatingHours: OperatingHours | null; onChange: (f: Partial<OnboardingData>) => void; onNext: () => void; onBack: () => void }) {
  const { t: full } = useLang();
  const t = full.onboarding.location;
  const tb = full.dashboard.settings.business;
  const [error, setError] = useState('');
  const hours = operatingHours;
  const toggleHours = () => onChange({ operatingHours: hours ? null : DEFAULT_OPERATING_HOURS });
  const setDay = (dk: DayKey, patch: Partial<OperatingHours[DayKey]>) => {
    const base = hours ?? DEFAULT_OPERATING_HOURS;
    onChange({ operatingHours: { ...base, [dk]: { ...base[dk], ...patch } } });
  };
  const handleNext = () => {
    if (!address.trim() || !city.trim() || !state.trim() || !postalCode.trim()) { setError(t.error); return; }
    setError('');
    onNext();
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <MapPin color="#4F46E5" size={24} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{t.heading}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.addressLabel}</label>
          <input autoFocus value={address} onChange={(e) => onChange({ address: e.target.value })} placeholder={t.addressPlaceholder} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.cityLabel}</label>
          <input value={city} onChange={(e) => onChange({ city: e.target.value })} placeholder={t.cityPlaceholder} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.stateLabel}</label>
          <select
            value={state}
            onChange={(e) => onChange({ state: e.target.value })}
            className={clsx(inputCls, state ? 'text-gray-900' : 'text-gray-400')}
          >
            <option value="">{t.statePlaceholder}</option>
            {US_STATES.map((s) => <option key={s} value={s} className="text-gray-900">{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.zipLabel}</label>
          <input value={postalCode} onChange={(e) => onChange({ postalCode: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) })} placeholder={t.zipPlaceholder} inputMode="numeric" maxLength={5} className={inputCls} />
        </div>
      </div>

      {/* Optional business hours — same data as Settings → Negocio. */}
      <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={toggleHours} className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {t.addHoursLabel} <span className="text-gray-400 font-normal">· {t.addHoursHint}</span>
          </span>
          <span className={clsx('relative w-11 h-6 rounded-full transition-colors', hours ? 'bg-primary' : 'bg-gray-200')}>
            <span className={clsx('absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all', hours ? 'left-6' : 'left-1')} />
          </span>
        </button>
        {hours ? (
          <div className="flex flex-col divide-y divide-gray-50">
            {DAY_KEYS.map((dk) => {
              const d = hours[dk];
              return (
                <div key={dk} className="flex items-center py-2.5">
                  <span className="w-24 text-sm text-gray-800">{tb.days[dk]}</span>
                  <button
                    type="button"
                    onClick={() => setDay(dk, { enabled: !d.enabled })}
                    className={clsx('relative w-11 h-6 rounded-full transition-colors', d.enabled ? 'bg-primary' : 'bg-gray-200')}
                  >
                    <span className={clsx('absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all', d.enabled ? 'left-6' : 'left-1')} />
                  </button>
                  <div className="flex-1" />
                  {d.enabled ? (
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <input type="time" value={d.start} onChange={(e) => setDay(dk, { start: e.target.value })} className="bg-transparent border-0 p-0 text-gray-900 focus:outline-none focus:ring-0" />
                      <span className="text-gray-400 font-normal">–</span>
                      <input type="time" value={d.end} onChange={(e) => setDay(dk, { end: e.target.value })} className="bg-transparent border-0 p-0 text-gray-900 focus:outline-none focus:ring-0" />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">{tb.closedLabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <div className="flex gap-3">
        <button onClick={onBack} className={secondaryBtn}>{t.back}</button>
        <button onClick={handleNext} className={primaryBtn}>{t.next}</button>
      </div>
    </div>
  );
}

function StepLogo({ logoUrl, onChange, onPickLogo, onNext, onBack }: { logoUrl: string | null; onChange: (url: string | null) => void; onPickLogo: () => Promise<PickLogoResult>; onNext: () => void; onBack: () => void }) {
  const { t: full } = useLang();
  const t = full.onboarding.logo;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const handlePick = async () => {
    if (uploading || logoUrl) return;
    setUploading(true);
    setError('');
    const result = await onPickLogo();
    setUploading(false);
    if (!result) return;
    if ('error' in result) { setError(result.error || t.uploadError); return; }
    onChange(result.url);
  };
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <ImageIcon color="#4F46E5" size={24} />
        </div>
        <h1 className="text-xl font-bold text-gray-900">{t.heading}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>
      <button
        type="button"
        onClick={handlePick}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-8 flex items-center justify-center transition-colors',
          logoUrl ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 hover:border-gray-300',
        )}
      >
        {logoUrl ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="logo" className="h-20 w-20 rounded-xl object-contain" />
            <span
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="flex items-center gap-1 cursor-pointer"
            >
              <X size={12} color="#F87171" />
              <span className="text-xs text-red-400">{t.remove}</span>
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={28} color="#D1D5DB" />
            <div className="flex flex-col items-center">
              <span className="text-sm font-medium text-gray-700">{t.uploadPrimary}</span>
              <span className="text-xs text-gray-400">{t.uploadSecondary}</span>
            </div>
          </div>
        )}
      </button>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <div className="flex gap-3">
        <button onClick={onBack} className={secondaryBtn}>{t.back}</button>
        <button onClick={onNext} disabled={uploading} className={primaryBtn}>{logoUrl ? t.next : t.skip}</button>
      </div>
    </div>
  );
}

function StepFeatures({ serviceType, features, onChange, onFinish, onBack, loading, error }: { serviceType: string; features: string[]; onChange: (f: { features?: string[] }) => void; onFinish: () => void; onBack: () => void; loading: boolean; error?: string }) {
  const { t: full } = useLang();
  const t = full.onboarding.features;
  const modules = full.dashboard.modules.list;
  const recommended = featuresForIndustry(serviceType);
  const toggle = (id: string) =>
    onChange({ features: features.includes(id) ? features.filter((f) => f !== id) : [...features, id] });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t.heading}</h1>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>
      {recommended.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-5">
          <p className="text-sm text-gray-500 text-center">{t.fallback}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {recommended.map((id) => {
            const active = features.includes(id);
            const Icon = FEATURE_ICONS[id] ?? Package;
            const m = modules[id as keyof typeof modules];
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={clsx('flex gap-4 p-4 rounded-2xl border-2 text-left transition-colors', active ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200')}
              >
                <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', active ? 'bg-primary' : 'bg-gray-100')}>
                  {active ? <Check size={18} color="#FFFFFF" /> : <Icon size={18} color="#6B7280" />}
                </div>
                <div className="flex-1">
                  <p className={clsx('font-semibold text-sm', active ? 'text-primary' : 'text-gray-800')}>{m?.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m?.description}</p>
                  <p className="text-xs text-gray-400 mt-1 italic">{t.note}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {error ? (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      ) : null}
      <div className="flex gap-3">
        <button onClick={onBack} className={secondaryBtn}>{t.back}</button>
        <button onClick={onFinish} disabled={loading} className={primaryBtn}>{loading ? '…' : t.finish}</button>
      </div>
    </div>
  );
}

function StepComplete() {
  const { t: full } = useLang();
  const t = full.onboarding.complete;
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
        <CheckCircle2 color="#10B981" size={36} />
      </div>
      <h1 className="text-xl font-bold text-gray-900">{t.heading}</h1>
      <p className="text-sm text-gray-500 text-center">{t.sub}</p>
      <div className="flex gap-1 mt-2">
        {[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </div>
    </div>
  );
}
