'use client';

// Web-only ClientFormModal — plain HTML + Tailwind. Same exported API as
// ClientFormModal.tsx so the web clients page resolves this variant
// automatically instead of rendering the RN modal through react-native-web.

import { useEffect, useMemo, useState } from 'react';
import { Building2, Phone, Mail, MapPin, X } from 'lucide-react';
import { useLang } from '../../i18n';
import { isValidEmail } from '../../lib/validation';
import { confirm } from '../../ui/confirmBus';
import { usStateName } from '../../lib/usStates';
import { parseHiddenFields, isFieldHidden } from '../../lib/fieldLayout';
import { groupNumberString, parseFieldConfig, sanitizeNumberInput, splitMultiValue, toggleMultiOption } from '../../lib/fieldTemplates';
import {
  CLIENT_FIELD_SECTIONS,
  CLIENT_FIELDS_ALWAYS_SHOWN,
  CLIENT_SECTION_FIELDS,
  parseClientLayout,
  clientFieldsInSection,
  type ClientFieldSection,
} from '../../lib/clientFieldSections';

export interface ClientFieldTemplate {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'note' | 'number' | 'date' | 'boolean' | 'select';
  field_options: string[] | null;
  required: boolean;
  field_config?: { integerOnly?: boolean; multi?: boolean; thousands?: boolean } | null;
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
  /** Field-keyed map of hidden flags (businesses.client_field_hidden). */
  hiddenFlags?: Record<string, boolean> | null;
  /** Saved per-field layout (businesses.client_field_layout). */
  fieldLayout?: { key: string; section: string }[] | null;
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
  hiddenFlags,
  fieldLayout,
  saving,
  error,
  onClose,
  onSubmit,
}: ClientFormModalProps) {
  const { t: full, locale } = useLang();
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

  // Unsaved-changes guard: dirty once the form diverges from the values it
  // opened with. Closing via backdrop / X / Cancel confirms first; a
  // successful submit closes through the parent's onClose (no prompt).
  const baseline = useMemo(
    () => JSON.stringify({ ...EMPTY, ...initial, custom_fields: { ...(initial?.custom_fields ?? {}) } }),
    [initial],
  );
  const dirty = open && JSON.stringify(form) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const guardedClose = () => {
    const s = full.common.unsavedChanges;
    if (!dirty) { onClose(); return; }
    void confirm({ title: s.title, message: s.body, destructive: true }).then(ok => { if (ok) onClose(); });
  };

  if (!open) return null;

  const isReq = (key: string) => !!requiredFlags[key];
  const rLabel = (key: string, base: string) => (isReq(key) ? `${base} *` : base);
  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setForm(f => ({ ...f, [key]: value }));
  const setCustom = (key: string, val: string) =>
    setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [key]: val } }));

  // Per-field show/hide (always-shown fields can never be hidden).
  const hidden = parseHiddenFields(hiddenFlags);
  const fHidden = (key: string) =>
    !CLIENT_FIELDS_ALWAYS_SHOWN.includes(key) && isFieldHidden(hidden, key);

  // Custom fields grouped by section, in saved layout order.
  const allKeys = [
    ...CLIENT_FIELD_SECTIONS.flatMap(s => CLIENT_SECTION_FIELDS[s]),
    ...templates.map(tpl => `custom:${tpl.id}`),
  ];
  const layout = parseClientLayout(fieldLayout, allKeys);
  const sectionLabel = (section: ClientFieldSection): string => {
    const es = locale === 'es';
    switch (section) {
      case 'general': return 'General';
      case 'contact': return es ? 'Contacto' : 'Contact';
      case 'location': return es ? 'Ubicación' : 'Location';
      case 'notes': return es ? 'Notas' : 'Notes';
      case 'additional': return es ? 'Detalles adicionales' : 'Additional details';
    }
  };

  const renderCustom = (tpl: ClientFieldTemplate) => {
    const value = form.custom_fields[tpl.field_key] ?? '';
    const labelText = `${tpl.field_label}${tpl.required ? ' *' : ''}`;
    const cfg = parseFieldConfig(tpl.field_config);

    if (tpl.field_type === 'note') {
      // Long free text — multiline.
      return (
        <Field key={tpl.field_key} label={labelText}>
          <textarea
            rows={4}
            className={`${INPUT_CLS} resize-y`}
            value={value}
            onChange={e => setCustom(tpl.field_key, e.target.value)}
          />
        </Field>
      );
    }
    if (tpl.field_type === 'select' && tpl.field_options) {
      // Multi-select: chips, value stored comma-joined ("A, B") so display
      // paths read naturally. Single-select keeps the dropdown.
      if (cfg.multi) {
        const selected = splitMultiValue(value);
        return (
          <Field key={tpl.field_key} label={labelText}>
            <div className="flex flex-wrap gap-2">
              {tpl.field_options.map(o => {
                const on = selected.includes(o);
                return (
                  <button key={o} type="button"
                    onClick={() => setCustom(tpl.field_key, toggleMultiOption(value, o))}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {o}
                  </button>
                );
              })}
            </div>
          </Field>
        );
      }
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
    if (tpl.field_type === 'number') {
      // type="text" + inputMode so we can enforce numeric (and optional
      // whole-number-only) as the user types — type="number" can't be sanitized.
      return (
        <Field key={tpl.field_key} label={labelText}>
          <input
            className={INPUT_CLS}
            type="text"
            inputMode={cfg.integerOnly ? 'numeric' : 'decimal'}
            value={cfg.thousands ? groupNumberString(value) : value}
            onChange={e => setCustom(tpl.field_key, sanitizeNumberInput(e.target.value, cfg.integerOnly))}
          />
        </Field>
      );
    }
    return (
      <Field key={tpl.field_key} label={labelText}>
        <input
          className={INPUT_CLS}
          type={tpl.field_type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={e => setCustom(tpl.field_key, e.target.value)}
        />
      </Field>
    );
  };

  // Full-width / stacked JSX for each built-in field key. The data-driven
  // section loop calls this in saved layout order (callers already gate on
  // fHidden, so this never receives a hidden key).
  const renderField = (key: string): React.ReactNode => {
    switch (key) {
      case 'first_name':
        return (
          <Field key={key} label={rLabel('first_name', t.fields.firstName)}>
            <input className={INPUT_CLS} placeholder={t.fields.placeholders.firstName}
              value={form.first_name} onChange={e => set('first_name', e.target.value)} />
          </Field>
        );
      case 'last_name':
        return (
          <Field key={key} label={rLabel('last_name', t.fields.lastName)}>
            <input className={INPUT_CLS} placeholder={t.fields.placeholders.lastName}
              value={form.last_name} onChange={e => set('last_name', e.target.value)} />
          </Field>
        );
      case 'company':
        return (
          <Field key={key} label={rLabel('company', t.fields.company)}>
            <div className="relative">
              <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={INPUT_WITH_ICON_CLS} placeholder={t.fields.placeholders.company}
                value={form.company} onChange={e => set('company', e.target.value)} />
            </div>
          </Field>
        );
      case 'phone_cell':
        return (
          <Field key={key} label={rLabel('phone_cell', t.fields.phoneCell)}>
            <div className="relative">
              <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={INPUT_WITH_ICON_CLS} placeholder={t.fields.placeholders.phone}
                value={fmtPhoneInput(form.phone_cell)}
                onChange={e => set('phone_cell', fmtPhoneInput(e.target.value))} inputMode="tel" />
            </div>
          </Field>
        );
      case 'phone_office':
        return (
          <Field key={key} label={rLabel('phone_office', t.fields.phoneOffice)}>
            <div className="relative">
              <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={INPUT_WITH_ICON_CLS} placeholder={t.fields.placeholders.phone}
                value={fmtPhoneInput(form.phone_office)}
                onChange={e => set('phone_office', fmtPhoneInput(e.target.value))} inputMode="tel" />
            </div>
          </Field>
        );
      case 'email_office':
        return (
          <Field key={key} label={rLabel('email_office', t.fields.emailOffice)}>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={INPUT_WITH_ICON_CLS} type="email" autoCapitalize="none"
                placeholder={t.fields.placeholders.emailOffice}
                value={form.email_office} onChange={e => set('email_office', e.target.value)} />
            </div>
          </Field>
        );
      case 'email_home':
        return (
          <Field key={key} label={rLabel('email_home', t.fields.emailHome)}>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={INPUT_WITH_ICON_CLS} type="email" autoCapitalize="none"
                placeholder={t.fields.placeholders.emailHome}
                value={form.email_home} onChange={e => set('email_home', e.target.value)} />
            </div>
          </Field>
        );
      case 'address':
        // address_line2 has no configurable key — it rides along with address.
        return (
          <div key={key} className="flex flex-col gap-3">
            <Field label={rLabel('address', t.fields.addressLine1)}>
              <div className="relative">
                <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className={INPUT_WITH_ICON_CLS} placeholder={t.fields.placeholders.address}
                  value={form.address} onChange={e => set('address', e.target.value)} />
              </div>
            </Field>
            <Field label={t.fields.addressLine2}>
              <input className={INPUT_CLS} placeholder={t.fields.placeholders.addressLine2}
                value={form.address_line2} onChange={e => set('address_line2', e.target.value)} />
            </Field>
          </div>
        );
      case 'city':
        return (
          <Field key={key} label={rLabel('city', t.fields.city)}>
            <input className={INPUT_CLS} placeholder={t.fields.placeholders.city}
              value={form.city} onChange={e => set('city', e.target.value)} />
          </Field>
        );
      case 'state':
        return (
          <Field key={key} label={rLabel('state', t.fields.state)}>
            <select className={`${INPUT_CLS} appearance-none`} value={form.state}
              onChange={e => set('state', e.target.value)}>
              <option value="">—</option>
              {US_STATES.map(s => <option key={s} value={s}>{usStateName(s, locale)}</option>)}
            </select>
          </Field>
        );
      case 'zip_code':
        return (
          <Field key={key} label={rLabel('zip_code', t.fields.zipCode)}>
            <input className={INPUT_CLS} placeholder={t.fields.placeholders.zipCode}
              value={form.zip_code}
              onChange={e => set('zip_code', e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
              inputMode="numeric" />
          </Field>
        );
      case 'notes':
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <textarea rows={3} placeholder={t.fields.placeholders.notes}
              value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={guardedClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'add' ? t.modal.addTitle : t.modal.editTitle}
          </h2>
          <button
            type="button"
            onClick={guardedClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body — fully data-driven: each section renders its visible fields
            (built-in + custom) in saved layout order. */}
        <div className="overflow-y-auto py-6 px-7 flex flex-col gap-5">
          {CLIENT_FIELD_SECTIONS.map(section => {
            const visibleKeys = clientFieldsInSection(layout, section)
              .filter(k => (k.startsWith('custom:') ? true : !fHidden(k)));
            if (visibleKeys.length === 0) return null;
            return (
              <section key={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-3">{sectionLabel(section)}</p>
                <div className="flex flex-col gap-3">
                  {visibleKeys.map(k => {
                    if (k.startsWith('custom:')) {
                      const tpl = templates.find(tp => `custom:${tp.id}` === k);
                      return tpl ? renderCustom(tpl) : null;
                    }
                    return renderField(k);
                  })}
                </div>
              </section>
            );
          })}

          {(emailError || error) ? <p className="text-xs text-red-500">{emailError || error}</p> : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={guardedClose}
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
