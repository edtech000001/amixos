import { useEffect, useState } from 'react';
import { WEB_APP_URL } from '@/lib/webUrl';
import {
  Modal as RNModal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Sparkles, X, ChevronLeft, Globe, ExternalLink } from 'lucide-react-native';
import { useLang } from '@/lib/i18n/LangProvider';
import { useThemeColors } from '@/lib/ThemeProvider';
import { Input } from '@amixos/shared/ui';
import { useAuthStore } from '@/lib/auth/store';
import { createSupabaseClient } from '@/lib/supabase';
import {
  PLANS,
  planMonthlyEquivalent,
  planAnnualSavings,
  type BillingPeriod,
  type PlanKey,
} from '@amixos/shared/lib/plans';

// Pricing / plans bottom sheet (UI only — no billing/Stripe yet). One-handed:
// a slide-up sheet, not a centered dialog. Mirrors the LogJobSheet structure
// (RNModal + backdrop + rounded-t sheet + drag handle + X dismiss). All copy is
// bilingual via the active locale; plan data comes from @amixos/shared/lib/plans.
//
// The Enterprise (`custom`) tier has no price and no trial — its CTA flips the
// sheet into an in-app contact-sales lead form (writes to `enterprise_leads`).
export interface PricingModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan?: (key: PlanKey, period: BillingPeriod) => void;
}

export function PricingModal({ visible, onClose, onSelectPlan }: PricingModalProps) {
  const { locale } = useLang();
  const en = locale === 'en';
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const c = useThemeColors();

  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);

  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [view, setView] = useState<'plans' | 'contact'>('plans');

  // Lead form state
  const [contactName, setContactName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything whenever the sheet opens, prefilling from auth state.
  useEffect(() => {
    if (visible) {
      setView('plans');
      setContactName(user?.name ?? '');
      setBusinessName(business?.name ?? '');
      setEmail(user?.email ?? '');
      setPhone('');
      setTeamSize('');
      setMessage('');
      setSubmitting(false);
      setSubmitted(false);
      setError(null);
    }
  }, [visible, user?.name, user?.email, business?.name]);

  const canSubmit = email.trim().length > 0 || phone.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
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
      setSubmitted(true);
    } catch (e) {
      const msg = en
        ? 'Something went wrong. Please try again.'
        : 'Algo salió mal. Inténtalo de nuevo.';
      setError(msg);
      Alert.alert(en ? 'Error' : 'Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const headerTitle =
    view === 'contact'
      ? en
        ? 'Contact sales'
        : 'Contáctanos'
      : en
        ? 'Plans & pricing'
        : 'Planes y precios';

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        {/* Backdrop sits BEHIND the sheet as an absolute sibling — wrapping the
           sheet in a Pressable would steal the touch responder and block the
           ScrollView from scrolling anywhere but the buttons. */}
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/40" />
        <View
          className="bg-card rounded-t-3xl px-5 pt-4"
          style={{ maxHeight: height * 0.9, paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        >
          <View className="items-center mb-3">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center flex-1">
              {view === 'contact' ? (
                <Pressable
                  onPress={() => setView('plans')}
                  hitSlop={8}
                  className="p-1 -ml-1 mr-1"
                >
                  <ChevronLeft size={22} color={c.ink} />
                </Pressable>
              ) : null}
              <Text className="text-lg font-bold text-ink">{headerTitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="p-1">
              <X size={20} color={c.muted} />
            </Pressable>
          </View>

          {view === 'plans' ? (
            <>
              {/* Monthly / annual segmented toggle */}
              <View className="flex-row items-center self-start bg-border-soft rounded-full p-1 mb-2">
                {(['monthly', 'annual'] as BillingPeriod[]).map((p) => {
                  const active = period === p;
                  const label =
                    p === 'monthly' ? (en ? 'Monthly' : 'Mensual') : en ? 'Annual' : 'Anual';
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPeriod(p)}
                      className={`flex-row items-center gap-1.5 px-4 py-1.5 rounded-full ${active ? 'bg-primary' : ''}`}
                    >
                      <Text
                        className={`text-sm font-semibold ${active ? 'text-white' : 'text-muted'}`}
                      >
                        {label}
                      </Text>
                      {p === 'annual' ? (
                        <View
                          className={`rounded-full px-1.5 py-0.5 ${active ? 'bg-white/25' : 'bg-green-100'}`}
                        >
                          <Text
                            className={`text-[10px] font-bold ${active ? 'text-white' : 'text-green-700'}`}
                          >
                            {en ? '−2 mo' : '−2 meses'}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {/* Always-on incentive — advertise the annual deal even on monthly. */}
              <View className="self-start flex-row items-center bg-green-500/10 border border-green-200 rounded-full px-3 py-1.5 mb-1">
                <Text className="text-xs font-bold text-green-700">
                  🎁 {en ? '2 months free when you pay yearly' : '2 meses gratis al pagar por año'}
                </Text>
              </View>

              {/* iOS: external-purchase link, permitted for US users under the
                 2025 Epic v. Apple injunction (no entitlement / no commission).
                 Opens the web billing page. */}
              {Platform.OS === 'ios' ? (
                <Pressable
                  onPress={() => {
                    Linking.openURL(
                      `${WEB_APP_URL}/dashboard/ajustes?tab=cuenta`,
                    ).catch(() => {});
                    onClose();
                  }}
                  className="flex-row items-center gap-2.5 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3 mt-3 active:opacity-80"
                >
                  <Globe size={18} color={c.primary} />
                  <Text className="flex-1 text-sm font-semibold text-primary">
                    {en ? 'Subscribe at amixos.com' : 'Suscríbete en amixos.com'}
                  </Text>
                  <ExternalLink size={16} color={c.primary} />
                </Pressable>
              ) : null}

              <ScrollView showsVerticalScrollIndicator={false} className="mt-3">
                <View className="gap-3">
                  {PLANS.map((plan) => {
                    const copy = plan.copy[locale];
                    const recommended = !!plan.recommended;
                    const custom = !!plan.custom;
                    const perMonth = Math.round(planMonthlyEquivalent(plan, period));
                    return (
                      <View
                        key={plan.key}
                        className={`rounded-2xl border p-4 ${
                          recommended ? 'border-primary' : 'border-border'
                        }`}
                      >
                        {recommended ? (
                          <View className="flex-row items-center self-start gap-1 bg-primary/10 rounded-full px-2.5 py-1 mb-2">
                            <Sparkles size={12} color={c.primary} />
                            <Text className="text-xs font-semibold text-primary">
                              {en ? 'Most popular' : 'Más popular'}
                            </Text>
                          </View>
                        ) : null}

                        {/* Name + tagline */}
                        <Text className="text-base font-bold text-ink">{copy.name}</Text>
                        <Text className="text-xs text-muted mt-0.5">{copy.tagline}</Text>

                        {/* Price (or custom-pricing label for the contact-sales tier) */}
                        {custom ? (
                          <View className="mt-3">
                            <Text className="text-2xl font-bold text-ink">
                              {en ? 'Custom pricing' : 'Precio personalizado'}
                            </Text>
                          </View>
                        ) : (
                          <>
                            <View className="flex-row items-end mt-3">
                              <Text className="text-3xl font-bold text-ink">${perMonth}</Text>
                              <Text className="text-sm text-muted mb-1 ml-1">
                                {en ? '/mo' : '/mes'}
                              </Text>
                            </View>
                            {period === 'annual' ? (
                              <View className="mt-1">
                                <Text className="text-xs text-muted">
                                  {en
                                    ? `billed annually · $${plan.annualTotal}/yr`
                                    : `facturado anualmente · $${plan.annualTotal}/año`}
                                </Text>
                                <Text className="text-xs font-semibold text-green-700 mt-0.5">
                                  {en
                                    ? `Save $${planAnnualSavings(plan)}/yr`
                                    : `Ahorra $${planAnnualSavings(plan)}/año`}
                                </Text>
                              </View>
                            ) : null}
                          </>
                        )}

                        {/* Features */}
                        <View className="gap-2 mt-3">
                          {copy.features.map((f, i) => (
                            <View key={i} className="flex-row items-start gap-2">
                              <View className="mt-0.5">
                                <Check size={16} color={c.primary} />
                              </View>
                              <Text className="flex-1 text-sm text-ink">{f}</Text>
                            </View>
                          ))}
                        </View>

                        {/* CTA */}
                        {custom ? (
                          <Pressable
                            onPress={() => setView('contact')}
                            className="mt-4 py-3 rounded-2xl items-center border border-primary active:opacity-90"
                          >
                            <Text className="text-base font-semibold text-primary">
                              {en ? 'Contact us' : 'Contáctanos'}
                            </Text>
                          </Pressable>
                        ) : Platform.OS === 'ios' ? (
                          // App Store guideline 3.1.1: no in-app button/link to an
                          // external (non-IAP) purchase flow for digital subs. On
                          // iOS we display the plan but omit any subscribe CTA.
                          null
                        ) : (
                          <Pressable
                            onPress={() => {
                              // Subscriptions are bought on the web — opening the
                              // web billing page avoids the Apple/Google IAP cut
                              // (store rules bar selling digital subs in-app).
                              Linking.openURL(
                                `${WEB_APP_URL}/dashboard/ajustes?tab=cuenta`,
                              ).catch(() => {});
                              onClose();
                            }}
                            className="mt-4 py-3 rounded-2xl items-center bg-primary active:opacity-90"
                          >
                            <Text className="text-base font-semibold text-white">
                              {en ? 'Subscribe on the web' : 'Suscribirse en la web'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Footer */}
                <Text className="text-xs text-faint text-center mt-4">
                  {en
                    ? '14-day free trial · no credit card'
                    : '14 días gratis · sin tarjeta de crédito'}
                </Text>
              </ScrollView>
            </>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              className="mt-1"
            >
              {submitted ? (
                <View className="items-center py-10 px-4">
                  <View className="w-14 h-14 rounded-full bg-green-100 items-center justify-center mb-4">
                    <Check size={28} color={c.success} />
                  </View>
                  <Text className="text-base font-semibold text-ink text-center">
                    {en
                      ? "Thanks! We'll be in touch soon."
                      : '¡Gracias! Te contactaremos pronto.'}
                  </Text>
                  <Pressable
                    onPress={onClose}
                    className="mt-6 py-3 px-8 rounded-2xl items-center bg-primary active:opacity-90"
                  >
                    <Text className="text-base font-semibold text-white">
                      {en ? 'Close' : 'Cerrar'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text className="text-sm text-muted mb-4">
                    {en
                      ? "Tell us about your team and we'll reach out with a custom plan."
                      : 'Cuéntanos sobre tu equipo y te contactaremos con un plan personalizado.'}
                  </Text>

                  <View className="gap-4">
                    <Input
                      label={en ? 'Name' : 'Nombre'}
                      value={contactName}
                      onChangeText={setContactName}
                      placeholder={en ? 'Your name' : 'Tu nombre'}
                    />
                    <Input
                      label={en ? 'Business' : 'Negocio'}
                      value={businessName}
                      onChangeText={setBusinessName}
                      placeholder={en ? 'Business name' : 'Nombre del negocio'}
                    />
                    <Input
                      label="Email"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="email@ejemplo.com"
                    />
                    <Input
                      label={en ? 'Phone' : 'Teléfono'}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      placeholder="(555) 123-4567"
                    />
                    <Input
                      label={en ? 'Team size' : 'Tamaño del equipo'}
                      value={teamSize}
                      onChangeText={setTeamSize}
                      keyboardType="number-pad"
                      placeholder={en ? 'e.g. 75' : 'ej. 75'}
                    />
                    <Input
                      label={en ? 'Message' : 'Mensaje'}
                      value={message}
                      onChangeText={setMessage}
                      multiline
                      placeholder={
                        en ? 'How can we help?' : '¿Cómo podemos ayudarte?'
                      }
                    />
                  </View>

                  {error ? (
                    <Text className="text-sm text-red-600 mt-3">{error}</Text>
                  ) : null}

                  <Pressable
                    onPress={handleSubmit}
                    disabled={!canSubmit || submitting}
                    className={`mt-5 py-3 rounded-2xl items-center flex-row justify-center gap-2 ${
                      !canSubmit || submitting ? 'bg-gray-300' : 'bg-primary active:opacity-90'
                    }`}
                  >
                    {submitting ? <ActivityIndicator color="#fff" size="small" /> : null}
                    <Text className="text-base font-semibold text-white">
                      {en ? 'Send' : 'Enviar'}
                    </Text>
                  </Pressable>

                  <Text className="text-xs text-faint text-center mt-3">
                    {en
                      ? 'Enter an email or phone so we can reach you.'
                      : 'Ingresa un correo o teléfono para contactarte.'}
                  </Text>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </RNModal>
  );
}
