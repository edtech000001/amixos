// Employee field layout (sections + order) — the jobs model applied to the
// employee form/settings. Built-in fields locked to their section; custom
// fields default into 'additional' and can move between sections.

import { makeFieldLayout, type FieldEntry } from './fieldLayout';

export type EmployeeFieldSection =
  | 'general' | 'contact' | 'employment' | 'location' | 'emergency' | 'additional';
export const EMPLOYEE_FIELD_SECTIONS: readonly EmployeeFieldSection[] =
  ['general', 'contact', 'employment', 'location', 'emergency', 'additional'] as const;

export const EMPLOYEE_FIELDS_ALWAYS_SHOWN: readonly string[] = ['first_name', 'last_name'];

export const EMPLOYEE_SECTION_FIELDS: Record<EmployeeFieldSection, string[]> = {
  general: ['first_name', 'last_name', 'check_name'],
  contact: ['phone', 'email'],
  employment: ['hire_date', 'birthday', 'pay_type', 'pay_rate'],
  location: ['address', 'city', 'state', 'zip_code'],
  emergency: ['emergency_contact_name', 'emergency_contact_phone'],
  additional: [],
};

const defaultSection: Record<string, EmployeeFieldSection> = {};
for (const sec of EMPLOYEE_FIELD_SECTIONS) for (const k of EMPLOYEE_SECTION_FIELDS[sec]) defaultSection[k] = sec;

export type EmployeeFieldEntry = FieldEntry<EmployeeFieldSection>;

const helpers = makeFieldLayout<EmployeeFieldSection>({
  sections: EMPLOYEE_FIELD_SECTIONS,
  defaultSection,
  customSection: 'additional',
  sectionFields: EMPLOYEE_SECTION_FIELDS,
});

export const parseEmployeeLayout = helpers.parseLayout;
export const employeeFieldsInSection = helpers.fieldsInSection;
export const employeeSectionHasVisibleField = helpers.sectionHasVisibleField;
