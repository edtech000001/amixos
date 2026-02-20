// ─── Shared Types ─────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'worker';
export type Language = 'en' | 'es';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type InvoiceType = 'invoice' | 'estimate';
export type LoyaltyStatus = 'good_standing' | 'flagged' | 'vip';
export type PayType = 'hourly' | 'salary';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  language: Language;
}

export interface Business {
  id: string;
  name: string;
  serviceType?: string;
  logoUrl?: string;
  city?: string;
  state?: string;
  country: string;
}

export interface Client {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  email?: string;
  mobilePhone?: string;
  loyaltyStatus: LoyaltyStatus;
}

export interface Invoice {
  id: string;
  businessId: string;
  clientId?: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  dueDate?: string;
}

export interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Employee {
  id: string;
  userId: string;
  businessId: string;
  role: UserRole;
  title?: string;
  payType?: PayType;
  payRate?: number;
}

export interface TimesheetEntry {
  id: string;
  userId: string;
  businessId: string;
  clockIn: string;
  clockOut?: string;
  hoursTotal?: number;
  approved: boolean;
}
