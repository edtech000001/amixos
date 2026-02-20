// ─── App Constants ────────────────────────────────────────────────────────────

export const APP_NAME = 'Amixos';
export const APP_VERSION = '0.1.0';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;

export const USER_ROLES = ['owner', 'manager', 'worker'] as const;

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;

export const LOYALTY_STATUSES = ['good_standing', 'flagged', 'vip'] as const;

export const AVAILABLE_MODULES = [
  'inventory',
  'voip',
  'appointments',
  'job_assignment',
  'project_planner',
  'loyalty_program',
  'money_transfer',
  'equipment_tracking',
  'table_seating',
  'landlord',
  'hangout',
  'fundraising',
  'sales_analytics',
  'case_files',
  'file_storage',
  'marketing',
  'leads',
  'courses',
  'trainer',
  'phone_repair',
  'real_estate',
  'car_dealership',
  'wedding_planner',
] as const;

// Design tokens (matching CSS variables)
export const COLORS = {
  primary: '#4F46E5',
  primaryDark: '#3730A3',
  accent: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  surface: '#F9FAFB',
  text: '#111827',
  muted: '#6B7280',
} as const;
