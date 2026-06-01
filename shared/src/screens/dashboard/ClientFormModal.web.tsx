'use client';

// Web-only ClientFormModal — plain HTML + Tailwind. Same exported API as
// ClientFormModal.tsx so the web clients page resolves this variant
// automatically instead of rendering the RN modal through react-native-web.

import { useEffect, useState } from 'react';
import { Building2, Phone, Mail, MapPin, X } from 'lucide-react';
import { useLang } from '../../i18n';
import { isValidEmail } from '../../lib/validation';

export interface ClientFieldTemplate {
  field_key: string;
  field_label: string;
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
}

export interface ClientFormValues {
  first_name: string;
  last_name: string;
  company: string;
  phone_cell: string;
  phone_office: string;
  email_office: string;
  email_home: string;
  address: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  notes: string;
  custom_fields: Record<string, string>;
}

const EMPTY: ClientFormValues = {
  first_name: '', last_name: '', company: '',
  phone_cell: '', phone_office: '',
  email_office: '', email_home: '',
  address: '', address_line2: '', city: '', state: '', zip_code: '',
  notes: '',
  custom_fields: {},
};

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

function fmtPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export interface ClientFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initial?: Partial<ClientFormValues>;
  templates: ClientFieldTemplate[];
  /** Field-keyed map of `required` flags pulled from business config. */
  requiredFlags: Record<string, boolean>;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: ClientFormValues) => Promise<void> | void;
}

const INPUT_CLS =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary';
const INPUT_WITH_ICON_CLS =
  'w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary';

export function ClientFormModal({
  open,
  mode,
  initial,
  templates,
  requiredFlags,
  saving,
  error,
  onClose,
  onSubmit,
}: ClientFormModalProps) {
  const { t: full } = useLang();
  const t = full.dashboard.clients;
  const tc = full.common;

  const [form, setForm] = useState<ClientFormValues>(EMPTY);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...initial, custom_fields: { ...(initial?.custom_fields ?? {}) } });
      setEmailError('');
    }
  }, [open, initial]);

  // Validate optional emails before handing off to the caller's onSubmit.
  const submit = () => {
    for (const em of [form.email_office, form.email_home]) {
      if (em.trim() && !isValidEmail(em)) { setEmailError(tc.validation.invalidEmail); return; }
    }
    setEmailError('');
    onSubmit(form);
  };

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const isReq = (key: string) => !!requiredFlags[key];
  const rLabel = (key: string, base: string) => (isReq(key) ? `${base} *` : base);
  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setForm(f => ({ ...f, [key]: value }));
  const setCustom = (key: string, val: string) =>
    setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'add' ? t.modal.addTitle : t.modal.editTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto py-6 px-7 flex flex-col gap-5">
          {/* Basic info */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{t.sections.basicInfo}</p>
            <div className="flex flex-col gap-3">
              <Field label={rLabel('first_name', t.fields.firstName)}>
                <input
                  className={INPUT_CLS}
                  placeholder={t.fields.placeholders.firstName}
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                />
              </Field>
              <Field label={rLabel('last_name', t.fields.lastName)}>
                <input
                  className={INPUT_CLS}
                  placeholder={t.fields.placeholders.lastName}
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                />
              </Field>
              <Field label={rLabel('company', t.fields.company)}>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={INPUT_WITH_ICON_CLS}
                    placeholder={t.fields.placeholders.company}
                    value={form.company}
                    onChange={e => set('company', e.target.value)}
                  />
                </div>
              </Field>
            </div>
          </section>

          {/* Phones */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{t.sections.phones}</p>
            <div className="flex flex-col gap-3">
              <Field label={rLabel('phone_cell', t.fields.phoneCell)}>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={INPUT_WITH_ICON_CLS}
                    placeholder={t.fields.placeholders.phone}
                    value={fmtPhoneInput(form.phone_cell)}
                    onChange={e => set('phone_cell', fmtPhoneInput(e.target.value))}
                    inputMode="tel"
                  />
                </div>
              </Field>
              <Field label={rLabel('phone_office', t.fields.phoneOffice)}>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={INPUT_WITH_ICON_CLS}
                    placeholder={t.fields.placeholders.phone}
                    value={fmtPhoneInput(form.phone_office)}
                    onChange={e => set('phone_office', fmtPhoneInput(e.target.value))}
                    inputMode="tel"
                  />
                </div>
              </Field>
            </div>
          </section>

          {/* Emails */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{t.sections.emails}</p>
            <div className="flex flex-col gap-3">
              <Field label={rLabel('email_office', t.fields.emailOffice)}>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={INPUT_WITH_ICON_CLS}
                    type="email"
                    autoCapitalize="none"
                    placeholder={t.fields.placeholders.emailOffice}
                    value={form.email_office}
                    onChange={e => set('email_office', e.target.value)}
                  />
                </div>
              </Field>
              <Field label={rLabel('email_home', t.fields.emailHome)}>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={INPUT_WITH_ICON_CLS}
                    type="email"
                    autoCapitalize="none"
                    placeholder={t.fields.placeholders.emailHome}
                    value={form.email_home}
                    onChange={e => set('email_home', e.target.value)}
                  />
                </div>
              </Field>
            </div>
          </section>

          {/* Address */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{t.sections.address}</p>
            <div className="flex flex-col gap-3">
              <Field label={rLabel('address', t.fields.addressLine1)}>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={INPUT_WITH_ICON_CLS}
                    placeholder={t.fields.placeholders.address}
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                  />
                </div>
              </Field>
              <Field label={t.fields.addressLine2}>
                <input
                  className={INPUT_CLS}
                  placeholder={t.fields.placeholders.addressLine2}
                  value={form.address_line2}
                  onChange={e => set('address_line2', e.target.value)}
                />
              </Field>
              <Field label={rLabel('city', t.fields.city)}>
                <input
                  className={INPUT_CLS}
                  placeholder={t.fields.placeholders.city}
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                />
              </Field>
              <Field label={rLabel('state', t.fields.state)}>
                <select
                  className={`${INPUT_CLS} appearance-none`}
                  value={form.state}
                  onChange={e => set('state', e.target.value)}
                >
                  <option value="">—</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label={rLabel('zip_code', t.fields.zipCode)}>
                <input
                  className={INPUT_CLS}
                  placeholder={t.fields.placeholders.zipCode}
                  value={form.zip_code}
                  onChange={e => set('zip_code', e.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </section>

          {/* Custom fields */}
          {templates.length > 0 ? (
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{t.sections.customFields}</p>
              <div className="flex flex-col gap-3">
                {templates.map(tpl => {
                  const value = form.custom_fields[tpl.field_key] ?? '';
                  const labelText = `${tpl.field_label}${tpl.required ? ' *' : ''}`;

                  if (tpl.field_type === 'select' && tpl.field_options) {
                    return (
                      <Field key={tpl.field_key} label={labelText}>
                        <select
                          className={`${INPUT_CLS} appearance-none`}
                          value={value}
                          onChange={e => setCustom(tpl.field_key, e.target.value)}
                        >
                          <option value="">—</option>
                          {tpl.field_options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </Field>
                    );
                  }
                  if (tpl.field_type === 'boolean') {
                    // Three states — '', 'true', 'false'. Clicking the active
                    // button clears so the user can return to "unanswered".
                    const yesActive = value === 'true';
                    const noActive = value === 'false';
                    return (
                      <Field key={tpl.field_key} label={labelText}>
                        <div className="flex gap-2">
                          <button type="button"
                            onClick={() => setCustom(tpl.field_key, yesActive ? '' : 'true')}
                            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${yesActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                            {tc.states.yes}
                          </button>
                          <button type="button"
                            onClick={() => setCustom(tpl.field_key, noActive ? '' : 'false')}
                            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${noActive ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                            {tc.states.no}
                          </button>
                        </div>
                      </Field>
                    );
                  }
                  return (
                    <Field key={tpl.field_key} label={labelText}>
                      <input
                        className={INPUT_CLS}
                        type={tpl.field_type === 'date' ? 'date' : tpl.field_type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={e => setCustom(tpl.field_key, e.target.value)}
                      />
                    </Field>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Notes */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{t.sections.notes}</p>
            <textarea
              rows={3}
              placeholder={t.fields.placeholders.notes}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
          </section>

          {(emailError || error) ? <p className="text-xs text-red-500">{emailError || error}</p> : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {tc.buttons.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? '…' : t.modal.saveBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
