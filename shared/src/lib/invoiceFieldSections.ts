// Invoice field layout (sections + order) — the jobs model applied to the
// invoice form/settings. Built-in fields locked to their section; custom fields
// default into 'additional' and can move between sections. Line items, tax and
// totals are structural (not configurable fields) and live outside this layout.

import { makeFieldLayout, type FieldEntry } from './fieldLayout';

export type InvoiceFieldSection = 'general' | 'notes' | 'additional';
export const INVOICE_FIELD_SECTIONS: readonly InvoiceFieldSection[] =
  ['general', 'notes', 'additional'] as const;

// An invoice needs its number + a client.
export const INVOICE_FIELDS_ALWAYS_SHOWN: readonly string[] = ['invoice_number', 'client'];

export const INVOICE_SECTION_FIELDS: Record<InvoiceFieldSection, string[]> = {
  general: ['invoice_number', 'client', 'issue_date', 'due_date'],
  notes: ['notes'],
  additional: [],
};

const defaultSection: Record<string, InvoiceFieldSection> = {};
for (const sec of INVOICE_FIELD_SECTIONS) for (const k of INVOICE_SECTION_FIELDS[sec]) defaultSection[k] = sec;

export type InvoiceFieldEntry = FieldEntry<InvoiceFieldSection>;

const helpers = makeFieldLayout<InvoiceFieldSection>({
  sections: INVOICE_FIELD_SECTIONS,
  defaultSection,
  customSection: 'additional',
  sectionFields: INVOICE_SECTION_FIELDS,
});

export const parseInvoiceLayout = helpers.parseLayout;
export const invoiceFieldsInSection = helpers.fieldsInSection;
export const invoiceSectionHasVisibleField = helpers.sectionHasVisibleField;
