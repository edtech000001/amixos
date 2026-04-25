'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { StepBusinessName } from '@/components/onboarding/StepBusinessName';
import { StepServiceType } from '@/components/onboarding/StepServiceType';
import { StepLocation } from '@/components/onboarding/StepLocation';
import { StepLogo } from '@/components/onboarding/StepLogo';
import { StepAddOns } from '@/components/onboarding/StepAddOns';
import { StepComplete } from '@/components/onboarding/StepComplete';
import { useLang } from '@/i18n/LangProvider';

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

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const { t: full } = useLang();
  const t = full.onboarding;
  const supabase = createSupabaseClient();
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

  const update = (fields: Partial<OnboardingData>) => setData(d => ({ ...d, ...fields }));
  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS + 1));
  const back = () => setStep(s => Math.max(s - 1, 1));

  const finish = async () => {
    setLoading(true);
    setFinishError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        window.location.href = '/auth/login';
        return;
      }

      // Create the business
      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: data.businessName,
          service_type: data.serviceType,
          city: data.city,
          state: data.state,
          country: data.country,
          logo_url: data.logoUrl,
        })
        .select()
        .single();

      if (bizError) {
        console.error('Business insert error:', bizError);
        throw new Error(`${t.page.bizCreateError}: ${bizError.message}`);
      }

      // Add owner as a business member
      const { error: memberError } = await supabase.from('business_members').insert({
        business_id: business.id,
        user_id: user.id,
        role: 'owner',
      });
      if (memberError) console.warn('Member insert warning:', memberError.message);

      // Activate modules based on selections
      const modules = [data.serviceType];
      if (data.needsInventory) modules.push('inventory');
      if (data.needsVirtualNumber) modules.push('voip');

      const { error: modulesError } = await supabase.from('business_modules').insert(
        modules.map(key => ({ business_id: business.id, module_key: key }))
      );
      if (modulesError) console.warn('Modules insert warning:', modulesError.message);

      // Hard redirect so session state is fresh on dashboard
      window.location.href = '/dashboard';
    } catch (err: any) {
      console.error('Finish error:', err);
      setFinishError(err.message || t.page.finishGenericError);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>{t.page.progressLabel}</span>
          <span>{Math.min(step, TOTAL_STEPS)} {t.page.progressOf} {TOTAL_STEPS}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${(Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        {step === 1 && (
          <StepBusinessName value={data.businessName} onChange={v => update({ businessName: v })} onNext={next} />
        )}
        {step === 2 && (
          <StepServiceType value={data.serviceType} onChange={v => update({ serviceType: v })} onNext={next} onBack={back} />
        )}
        {step === 3 && (
          <StepLocation city={data.city} state={data.state} onChange={update} onNext={next} onBack={back} />
        )}
        {step === 4 && (
          <StepLogo logoUrl={data.logoUrl} onChange={url => update({ logoUrl: url })} onNext={next} onBack={back} />
        )}
        {step === 5 && (
          <StepAddOns
            needsInventory={data.needsInventory}
            needsVirtualNumber={data.needsVirtualNumber}
            onChange={update}
            onFinish={finish}
            onBack={back}
            loading={loading}
            error={finishError}
          />
        )}
        {step > TOTAL_STEPS && <StepComplete />}
      </div>

      {/* Note */}
      {step < TOTAL_STEPS + 1 && (
        <p className="text-xs text-gray-400 mt-4 text-center">
          {t.page.footerNote}
        </p>
      )}
    </div>
  );
}
