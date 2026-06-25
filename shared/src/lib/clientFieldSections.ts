// Client field layout (sections + order) — the jobs model applied to the client
// form/settings. Built-in fields are locked to their section (reorder within
// only); custom fields default into 'additional' and can move between sections.
// NB: distinct from clientSections.ts (that file is the A–Z LIST grouping).

import { makeFieldLayout, type FieldEntry } from './fieldLayout';

export type ClientFieldSection = 'general' | 'contact' | 'location' | 'notes' | 'additional';
export const CLIENT_FIELD_SECTIONS: readonly ClientFieldSection[] =
  ['general', 'contact', 'location', 'notes', 'additional'] as const;

// A client needs a name — first/last can't be hidden.
export const CLIENT_FIELDS_ALWAYS_SHOWN: readonly string[] = ['first_name', 'last_name'];

export const CLIENT_SECTION_FIELDS: Record<ClientFieldSection, string[]> = {
  general: ['first_name', 'last_name', 'company'],
  contact: ['phone_cell', 'phone_office', 'email_office', 'email_home'],
  location: ['address', 'city', 'state', 'zip_code'],
  notes: ['notes'],
  additional: [],
};

const defaultSection: Record<string, ClientFieldSection> = {};
for (const sec of CLIENT_FIELD_SECTIONS) for (const k of CLIENT_SECTION_FIELDS[sec]) defaultSection[k] = sec;

export type ClientFieldEntry = FieldEntry<ClientFieldSection>;

const helpers = makeFieldLayout<ClientFieldSection>({
  sections: CLIENT_FIELD_SECTIONS,
  defaultSection,
  customSection: 'additional',
  sectionFields: CLIENT_SECTION_FIELDS,
});

export const parseClientLayout = helpers.parseLayout;
export const clientFieldsInSection = helpers.fieldsInSection;
export const clientSectionHasVisibleField = helpers.sectionHasVisibleField;
