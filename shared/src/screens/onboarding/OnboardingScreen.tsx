import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { clsx } from 'clsx';
import {
  Building2,
  Wrench,
  HardHat,
  Scissors,
  Utensils,
  Home,
  Phone,
  Car,
  ShoppingBag,
  MoreHorizontal,
  MapPin,
  Image as ImageIcon,
  Upload,
  X,
  Package,
  Check,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react-native';
import { useLang } from '../../i18n';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OnboardingData {
  businessName: string;
  serviceType: string;
  city: string;
  state: string;
  country: string;
  logoUrl: string | null;
  needsInventory: boolean;
  needsVirtualNumber: boolean;
}

/** Result of a logo pick + upload attempt. `null` = user cancelled. */
export type PickLogoResult = { url: string } | { error: string } | null;

export interface OnboardingScreenProps {
  /**
   * Pick an image and upload it. Each platform implements pick + upload
   * differently (web: file input + Supabase; mobile: expo-image-picker +
   * Supabase). Resolve to `{ url }` on success, `{ error }` for an error
   * we should surface, or `null` if the user cancelled the picker.
   */
  onPickLogo: () => Promise<PickLogoResult>;
  /**
   * Persist the collected onboarding data and create the business. The
   * route wrapper does the actual DB writes + post-finish navigation.
   */
  onFinish: (data: OnboardingData) => Promise<{ ok: true } | { ok: false; error?: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 5;

const ICONS: Record<string, typeof Wrench> = {
  construction: HardHat,
  mechanics: Wrench,
  landscaping: Home,
  cleaning: Scissors,
  restaurant: Utensils,
  phone_repair: Phone,
  car_dealership: Car,
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

// ---------------------------------------------------------------------------
// Wizard root
// ---------------------------------------------------------------------------

// Universal onboarding wizard. Pure UI + callbacks — both web (via
// react-native-web) and mobile (via Expo) render the same component.
// Platform-specific concerns (Supabase, image pickers, post-finish nav)
// are supplied by the route-level wrapper on each platform.
export function OnboardingScreen({ onPickLogo, onFinish }: OnboardingScreenProps) {
  const { t: full } = useLang();
  const t = full.onboarding;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [data, setData] = useState<OnboardingData>({
    businessName: '',
    serviceType: '',
    city: '',
    state: '',
    country: 'US',
    logoUrl: null,
    needsInventory: false,
    needsVirtualNumber: false,
  });

  const update = (fields: Partial<OnboardingData>) =>
    setData((d) => ({ ...d, ...fields }));
  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS + 1));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const handleFinish = async () => {
    setLoading(true);
    setFinishError('');
    const result = await onFinish(data);
    if ('error' in result || result.ok === false) {
      setFinishError(
        ('error' in result && result.error) || t.page.finishGenericError,
      );
      setLoading(false);
      return;
    }
    // Success — advance to the complete view. The route wrapper will
    // handle the actual navigation to the dashboard.
    setLoading(false);
    setStep(TOTAL_STEPS + 1);
  };

  const progress = Math.min(step, TOTAL_STEPS);

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerClassName="flex-grow items-center justify-center px-4 py-10"
      keyboardShouldPersistTaps="handled"
    >
      {/* Progress bar */}
      <View className="w-full max-w-lg mb-8">
        <View className="flex-row justify-between mb-2">
          <Text className="text-xs text-gray-400">{t.page.progressLabel}</Text>
          <Text className="text-xs text-gray-400">
            {progress} {t.page.progressOf} {TOTAL_STEPS}
          </Text>
        </View>
        <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <View
            className="h-full bg-primary rounded-full"
            style={{ width: `${(progress / TOTAL_STEPS) * 100}%` }}
          />
        </View>
      </View>

      {/* Step content */}
      <View className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 p-8">
        {step === 1 && (
          <StepBusinessName
            value={data.businessName}
            onChange={(v) => update({ businessName: v })}
            onNext={next}
          />
        )}
        {step === 2 && (
          <StepServiceType
            value={data.serviceType}
            onChange={(v) => update({ serviceType: v })}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 3 && (
          <StepLocation
            city={data.city}
            state={data.state}
            onChange={update}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && (
          <StepLogo
            logoUrl={data.logoUrl}
            onChange={(url) => update({ logoUrl: url })}
            onPickLogo={onPickLogo}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 5 && (
          <StepAddOns
            needsInventory={data.needsInventory}
            needsVirtualNumber={data.needsVirtualNumber}
            onChange={update}
            onFinish={handleFinish}
            onBack={back}
            loading={loading}
            error={finishError}
          />
        )}
        {step > TOTAL_STEPS && <StepComplete />}
      </View>

      {/* Footer note */}
      {step < TOTAL_STEPS + 1 && (
        <Text className="text-xs text-gray-400 mt-4 text-center">
          {t.page.footerNote}
        </Text>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Business name
// ---------------------------------------------------------------------------

interface StepBusinessNameProps {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}

function StepBusinessName({ value, onChange, onNext }: StepBusinessNameProps) {
  const { t: full } = useLang();
  const t = full.onboarding.businessName;
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!value.trim()) {
      setError(t.error);
      return;
    }
    setError('');
    onNext();
  };

  return (
    <View className="flex-col gap-6">
      <View>
        <View className="w-12 h-12 bg-primary/10 rounded-2xl items-center justify-center mb-4">
          <Building2 color="#4F46E5" size={24} />
        </View>
        <Text className="text-xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-1">{t.sub}</Text>
      </View>

      <Input
        label={t.label}
        placeholder={t.placeholder}
        value={value}
        onChangeText={onChange}
        error={error}
        onSubmitEditing={handleNext}
        returnKeyType="next"
        autoFocus
      />

      <Button onPress={handleNext} fullWidth size="lg">
        {t.cta}
      </Button>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Service type
// ---------------------------------------------------------------------------

interface StepServiceTypeProps {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function StepServiceType({ value, onChange, onNext, onBack }: StepServiceTypeProps) {
  const { t: full } = useLang();
  const t = full.onboarding.serviceType;
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!value) {
      setError(t.error);
      return;
    }
    setError('');
    onNext();
  };

  return (
    <View className="flex-col gap-6">
      <View>
        <Text className="text-xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-1">{t.sub}</Text>
      </View>

      <View className="flex-row flex-wrap -m-1.5">
        {t.options.map(({ key, label }) => {
          const Icon = ICONS[key] ?? MoreHorizontal;
          const active = value === key;
          return (
            <View key={key} className="w-1/3 p-1.5">
              <Pressable
                onPress={() => {
                  onChange(key);
                  setError('');
                }}
                className={clsx(
                  'flex-col items-center gap-2 p-3 rounded-xl border-2',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-100',
                )}
              >
                <Icon size={22} color={active ? '#4F46E5' : '#4B5563'} />
                <Text
                  className={clsx(
                    'text-sm font-medium text-center',
                    active ? 'text-primary' : 'text-gray-600',
                  )}
                >
                  {label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button variant="secondary" onPress={onBack} size="lg" fullWidth>
            {t.back}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={handleNext} size="lg" fullWidth>
            {t.next}
          </Button>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Location (city + state)
// ---------------------------------------------------------------------------

interface StepLocationProps {
  city: string;
  state: string;
  onChange: (fields: { city?: string; state?: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

function StepLocation({ city, state, onChange, onNext, onBack }: StepLocationProps) {
  const { t: full } = useLang();
  const t = full.onboarding.location;
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleNext = () => {
    if (!city.trim() || !state.trim()) {
      setError(t.error);
      return;
    }
    setError('');
    onNext();
  };

  return (
    <View className="flex-col gap-6">
      <View>
        <View className="w-12 h-12 bg-primary/10 rounded-2xl items-center justify-center mb-4">
          <MapPin color="#4F46E5" size={24} />
        </View>
        <Text className="text-xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-1">{t.sub}</Text>
      </View>

      <View className="flex-col gap-3">
        <Input
          label={t.cityLabel}
          placeholder={t.cityPlaceholder}
          value={city}
          onChangeText={(v) => onChange({ city: v })}
          autoFocus
        />

        {/* State picker — universal: tap to open inline list. RN has no
            native <select>, so we render a Pressable that toggles a list. */}
        <View className="flex-col gap-1.5">
          <Text className="text-sm font-medium text-gray-700">{t.stateLabel}</Text>
          <Pressable
            onPress={() => setPickerOpen((o) => !o)}
            className="flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5"
          >
            <Text className={clsx('text-sm', state ? 'text-gray-900' : 'text-gray-400')}>
              {state || t.statePlaceholder}
            </Text>
            <ChevronDown size={16} color="#9CA3AF" />
          </Pressable>
          {pickerOpen && (
            <View className="rounded-xl border border-gray-200 bg-white max-h-64 overflow-hidden">
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {US_STATES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => {
                      onChange({ state: s });
                      setPickerOpen(false);
                    }}
                    className={clsx(
                      'px-4 py-2.5',
                      state === s && 'bg-primary/5',
                    )}
                  >
                    <Text
                      className={clsx(
                        'text-sm',
                        state === s ? 'text-primary font-medium' : 'text-gray-900',
                      )}
                    >
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button variant="secondary" onPress={onBack} size="lg" fullWidth>
            {t.back}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={handleNext} size="lg" fullWidth>
            {t.next}
          </Button>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Logo upload
// ---------------------------------------------------------------------------

interface StepLogoProps {
  logoUrl: string | null;
  onChange: (url: string | null) => void;
  onPickLogo: () => Promise<PickLogoResult>;
  onNext: () => void;
  onBack: () => void;
}

function StepLogo({ logoUrl, onChange, onPickLogo, onNext, onBack }: StepLogoProps) {
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
    if (!result) return; // cancelled
    if ('error' in result) {
      setError(result.error || t.uploadError);
      return;
    }
    onChange(result.url);
  };

  return (
    <View className="flex-col gap-6">
      <View>
        <View className="w-12 h-12 bg-primary/10 rounded-2xl items-center justify-center mb-4">
          <ImageIcon color="#4F46E5" size={24} />
        </View>
        <Text className="text-xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-1">{t.sub}</Text>
      </View>

      <Pressable
        onPress={handlePick}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-8 items-center justify-center',
          logoUrl ? 'border-accent bg-accent/5' : 'border-gray-200',
        )}
      >
        {logoUrl ? (
          <View className="items-center gap-3">
            <Image
              source={{ uri: logoUrl }}
              className="h-20 w-20 rounded-xl"
              resizeMode="contain"
            />
            <Pressable
              onPress={() => onChange(null)}
              className="flex-row items-center gap-1"
            >
              <X size={12} color="#F87171" />
              <Text className="text-xs text-red-400">{t.remove}</Text>
            </Pressable>
          </View>
        ) : (
          <View className="items-center gap-3">
            <Upload size={28} color="#D1D5DB" />
            <View className="items-center">
              <Text className="text-sm font-medium text-gray-700">{t.uploadPrimary}</Text>
              <Text className="text-xs text-gray-400">{t.uploadSecondary}</Text>
            </View>
          </View>
        )}
      </Pressable>

      {error ? <Text className="text-xs text-red-500">{error}</Text> : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button variant="secondary" onPress={onBack} size="lg" fullWidth>
            {t.back}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={onNext} loading={uploading} size="lg" fullWidth>
            {logoUrl ? t.next : t.skip}
          </Button>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Add-ons
// ---------------------------------------------------------------------------

interface StepAddOnsProps {
  needsInventory: boolean;
  needsVirtualNumber: boolean;
  onChange: (fields: { needsInventory?: boolean; needsVirtualNumber?: boolean }) => void;
  onFinish: () => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

function StepAddOns({
  needsInventory,
  needsVirtualNumber,
  onChange,
  onFinish,
  onBack,
  loading,
  error,
}: StepAddOnsProps) {
  const { t: full } = useLang();
  const t = full.onboarding.addOns;
  const values = { needsInventory, needsVirtualNumber };

  const addOns = [
    {
      key: 'needsInventory' as const,
      icon: Package,
      title: t.inventoryTitle,
      description: t.inventoryDesc,
      note: t.inventoryNote,
    },
    {
      key: 'needsVirtualNumber' as const,
      icon: Phone,
      title: t.voipTitle,
      description: t.voipDesc,
      note: t.voipNote,
    },
  ];

  return (
    <View className="flex-col gap-6">
      <View>
        <Text className="text-xl font-bold text-gray-900">{t.heading}</Text>
        <Text className="text-sm text-gray-500 mt-1">{t.sub}</Text>
      </View>

      <View className="flex-col gap-3">
        {addOns.map(({ key, icon: Icon, title, description, note }) => {
          const active = values[key];
          return (
            <Pressable
              key={key}
              onPress={() => onChange({ [key]: !active })}
              className={clsx(
                'flex-row gap-4 p-4 rounded-2xl border-2',
                active ? 'border-primary bg-primary/5' : 'border-gray-100',
              )}
            >
              <View
                className={clsx(
                  'w-10 h-10 rounded-xl items-center justify-center',
                  active ? 'bg-primary' : 'bg-gray-100',
                )}
              >
                {active ? (
                  <Check size={18} color="#FFFFFF" />
                ) : (
                  <Icon size={18} color="#6B7280" />
                )}
              </View>
              <View className="flex-1">
                <Text
                  className={clsx(
                    'font-semibold text-sm',
                    active ? 'text-primary' : 'text-gray-800',
                  )}
                >
                  {title}
                </Text>
                <Text className="text-xs text-gray-500 mt-0.5">{description}</Text>
                <Text className="text-xs text-gray-400 mt-1 italic">{note}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <Text className="text-red-600 text-sm">{error}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button variant="secondary" onPress={onBack} size="lg" fullWidth>
            {t.back}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={onFinish} loading={loading} size="lg" fullWidth>
            {t.finish}
          </Button>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Complete
// ---------------------------------------------------------------------------

function StepComplete() {
  const { t: full } = useLang();
  const t = full.onboarding.complete;

  // The route wrapper handles the actual post-finish navigation (it knows
  // about the platform router). We just render the success state here.
  // A timer-based hard redirect like the old web version is no longer needed
  // because onFinish() callers redirect once they get { ok: true }.
  return (
    <View className="items-center gap-4 py-6">
      <View className="w-16 h-16 bg-accent/10 rounded-full items-center justify-center">
        <CheckCircle2 color="#10B981" size={36} />
      </View>
      <Text className="text-xl font-bold text-gray-900">{t.heading}</Text>
      <Text className="text-sm text-gray-500 text-center">{t.sub}</Text>
      <View className="flex-row gap-1 mt-2">
        {[0, 1, 2].map((i) => (
          <View key={i} className="w-2 h-2 rounded-full bg-primary" />
        ))}
      </View>
    </View>
  );
}
