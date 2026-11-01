// Which business columns the app loads at start-up (web AppContext + mobile
// auth store).
//
// The ACTIVE business needs every setting (templates, field layouts, payroll
// config, map/weather settings…). The OTHER businesses a user belongs to are
// only ever read for the switcher, billing gate, delegate / bill-through /
// price-sync pickers — id, name, city, state and the subscription fields. So
// the list loads the LIGHT columns for all, and the full row only for the
// active business (in parallel). Switching fetches the new one's full row.

export const BUSINESS_LIGHT_COLUMNS =
  'id, name, logo_url, service_type, city, state, plan, subscription_status, billing_period, trial_ends_at, current_period_end';

export const BUSINESS_FULL_COLUMNS =
  'id, name, logo_url, service_type, city, state, address, postal_code, email, phone, website, tax_id, license_number, invoice_notes_default, invoice_due_days, invoice_start_number, invoice_tax_rate, invoice_qty_field, price_section_order, invoice_email_subject, invoice_email_body, invoice_email_delivery, invoice_field_required, invoice_field_order, invoice_field_hidden, invoice_field_layout, invoice_template, price_sheet_template, client_field_required, client_field_order, client_field_hidden, client_field_layout, employee_field_required, employee_field_order, employee_field_hidden, employee_field_layout, job_field_required, job_field_order, job_pipeline_disabled, job_crew_mode, job_item_types_enabled, crew_finder_enabled, job_private_on_invoice, job_field_hidden, job_field_layout, payroll_frequency, payroll_anchor_date, payroll_custom_days, payroll_config, job_alert_thresholds, assignment_field_required, assignment_field_order, map_pin_config, map_view_settings, weather_config, operating_hours, policy_agents, dashboard_layout, plan, subscription_status, billing_period, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id';

/** True for a row loaded with BUSINESS_FULL_COLUMNS. A light row has no
 *  `payroll_config` key at all (the full select always returns it, even null). */
export function isFullBusiness(b: object | null | undefined): boolean {
  return !!b && 'payroll_config' in b;
}

/**
 * Keep the previous object for any row whose content didn't change, so a
 * background refresh that returns the same data doesn't hand screens a NEW
 * `business` object — screens key their loads on it and would fetch twice.
 */
export function keepUnchanged<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const byId = new Map(prev.map(p => [p.id, p]));
  return next.map(n => {
    const p = byId.get(n.id);
    return p && JSON.stringify(p) === JSON.stringify(n) ? p : n;
  });
}
