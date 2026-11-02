// Sensitive-event audit log writer. Mirror of the DB shape in migration 022.
//
// Usage: import { logAudit, AuditAction } from '@amixos/shared/lib/audit';
//        await logAudit(supabase, businessId, 'job.delegated', 'job', jobId, { target_business_id: t });
//
// Failures are swallowed (logged to console only) so the calling action
// can never be blocked by an audit-log issue. The action itself is the
// product feature; the audit log is observability.

export type AuditAction =
  // Jobs
  | 'job.created'
  | 'job.updated'
  | 'job.deleted'
  | 'job.archived'
  | 'job.unarchived'
  | 'job.status_changed'
  | 'job.signature_cleared'
  | 'job.delegated'
  | 'job.completion_logged'
  // Invoices
  | 'invoice.created'
  | 'invoice.deleted'
  | 'invoice.sent'
  | 'invoice.unsent'
  | 'invoice.payment'
  | 'invoice.payment_deleted'
  | 'invoice.payment_edited'
  | 'invoice.autoname'
  | 'invoice.unpaid'
  | 'invoice.paid'
  | 'invoice.voided'
  // Clients
  | 'client.deleted'
  // Members + invites
  | 'member.added'
  | 'member.removed'
  | 'member.role_changed'
  | 'invite.sent'
  | 'invite.revoked'
  | 'invite.accepted'
  // Business
  | 'business.updated'
  | 'business.deleted'
  | 'business.ownership_transferred'
  // Modules (Addon Store)
  | 'module.enabled'
  | 'module.disabled'
  // Imports (any of the 8 hub steps)
  | 'import.completed'
  // Payroll
  | 'payroll.paid'
  | 'payroll.payment_deleted'
  | 'payroll.payments_cleared'
  // Worker loans
  | 'loan.given'
  | 'loan.repaid'
  // Rentals module
  | 'rental_property.created'
  | 'rental_property.updated'
  | 'rental_property.deleted'
  | 'rental_tenant.created'
  | 'rental_tenant.updated'
  | 'rental_tenant.deleted'
  | 'rental_lease.created'
  | 'rental_lease.updated'
  | 'rental_lease.deleted'
  | 'rental_payment.recorded'
  | 'rental_payment.deleted'
  // Price sheet copy / auto-sync (written by the database, migrations 242/260)
  | 'price_sheet.synced'
  | 'price_sheet.autosync_on'
  | 'price_sheet.autosync_off'
  | 'price_sheet.autosync_auto_off';

export type EntityType =
  | 'import'
  | 'payroll'
  | 'job'
  | 'invoice'
  | 'client'
  | 'member'
  | 'invite'
  | 'business'
  | 'module'
  | 'employee'
  | 'rental_property'
  | 'rental_tenant'
  | 'rental_lease'
  | 'rental_payment';

// Accept any Supabase client variant — web and mobile create slightly
// different generic instantiations and the strict shape pinning was tripping
// callers up. We only ever call .from('audit_log').insert(...).
type AnySupabase = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function logAudit(
  supabase: AnySupabase,
  businessId: string,
  action: AuditAction,
  entityType: EntityType | null,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      business_id: businessId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[audit] insert failed', action, error);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[audit] threw', action, e);
  }
}

// Human-readable labels for audit actions. Used by the activity viewer.
export const AUDIT_ACTION_LABEL: Record<AuditAction, { es: string; en: string }> = {
  'job.created':         { es: 'Trabajo creado',           en: 'Job created' },
  'job.updated':         { es: 'Trabajo actualizado',      en: 'Job updated' },
  'job.deleted':         { es: 'Trabajo eliminado',        en: 'Job deleted' },
  'job.archived':        { es: 'Trabajo archivado',        en: 'Job archived' },
  'job.unarchived':      { es: 'Trabajo desarchivado',     en: 'Job unarchived' },
  'job.status_changed':  { es: 'Estado de trabajo cambiado', en: 'Job status changed' },
  'job.signature_cleared': { es: 'Firma del cliente eliminada', en: 'Client signature removed' },
  'job.delegated':       { es: 'Trabajo delegado',         en: 'Job delegated' },
  'job.completion_logged': { es: 'Trabajo finalizado registrado', en: 'Job completion logged' },
  'invoice.created':     { es: 'Factura creada',           en: 'Invoice created' },
  'invoice.deleted':     { es: 'Factura eliminada',        en: 'Invoice deleted' },
  'invoice.sent':        { es: 'Factura enviada',          en: 'Invoice sent' },
  'invoice.unsent':      { es: 'Factura devuelta a borrador', en: 'Invoice reverted to draft' },
  'invoice.payment':     { es: 'Pago registrado',           en: 'Payment recorded' },
  'invoice.payment_deleted': { es: 'Pago eliminado',        en: 'Payment deleted' },
  'invoice.payment_edited': { es: 'Pago editado',           en: 'Payment edited' },
  'invoice.autoname':      { es: 'Nombres de trabajos normalizados', en: 'Job names normalized' },
  'invoice.unpaid':      { es: 'Factura marcada como no pagada', en: 'Invoice marked unpaid' },
  'invoice.paid':        { es: 'Factura pagada',           en: 'Invoice paid' },
  'invoice.voided':      { es: 'Factura anulada',          en: 'Invoice voided' },
  'client.deleted':      { es: 'Cliente eliminado',        en: 'Client deleted' },
  'member.added':        { es: 'Miembro agregado',         en: 'Member added' },
  'member.removed':      { es: 'Miembro eliminado',        en: 'Member removed' },
  'member.role_changed': { es: 'Rol de miembro cambiado',  en: 'Member role changed' },
  'invite.sent':         { es: 'Invitación enviada',        en: 'Invite sent' },
  'invite.revoked':      { es: 'Invitación revocada',       en: 'Invite revoked' },
  'invite.accepted':     { es: 'Invitación aceptada',       en: 'Invite accepted' },
  'business.updated':    { es: 'Negocio actualizado',       en: 'Business updated' },
  'business.ownership_transferred': { es: 'Propiedad del negocio transferida', en: 'Business ownership transferred' },
  'business.deleted':    { es: 'Negocio eliminado',         en: 'Business deleted' },
  'module.enabled':      { es: 'Módulo activado',           en: 'Module enabled' },
  'module.disabled':     { es: 'Módulo desactivado',        en: 'Module disabled' },
  'import.completed':    { es: 'Importación realizada',    en: 'Import completed' },
  'payroll.paid':        { es: 'Pago de nómina registrado', en: 'Payroll payment recorded' },
  'payroll.payment_deleted': { es: 'Pago de nómina eliminado', en: 'Payroll payment deleted' },
  'payroll.payments_cleared': { es: 'Pagos de nómina eliminados', en: 'Payroll payments deleted' },
  'loan.given':          { es: 'Préstamo otorgado', en: 'Loan given' },
  'loan.repaid':         { es: 'Abono a préstamo', en: 'Loan repayment' },
  'rental_property.created': { es: 'Propiedad en renta creada',      en: 'Rental property created' },
  'rental_property.updated': { es: 'Propiedad en renta actualizada', en: 'Rental property updated' },
  'rental_property.deleted': { es: 'Propiedad en renta eliminada',   en: 'Rental property deleted' },
  'rental_tenant.created':   { es: 'Inquilino creado',               en: 'Tenant created' },
  'rental_tenant.updated':   { es: 'Inquilino actualizado',          en: 'Tenant updated' },
  'rental_tenant.deleted':   { es: 'Inquilino eliminado',            en: 'Tenant deleted' },
  'rental_lease.created':    { es: 'Contrato de renta creado',       en: 'Lease created' },
  'rental_lease.updated':    { es: 'Contrato de renta actualizado',  en: 'Lease updated' },
  'rental_lease.deleted':    { es: 'Contrato de renta eliminado',    en: 'Lease deleted' },
  'rental_payment.recorded': { es: 'Pago de renta registrado',       en: 'Rent payment recorded' },
  'rental_payment.deleted':  { es: 'Pagos de renta eliminados',      en: 'Rent payments removed' },
  'price_sheet.synced':            { es: 'Precios copiados',                         en: 'Prices copied' },
  'price_sheet.autosync_on':       { es: 'Auto-sincronización de precios activada',  en: 'Price auto-sync turned on' },
  'price_sheet.autosync_off':      { es: 'Auto-sincronización de precios desactivada', en: 'Price auto-sync turned off' },
  'price_sheet.autosync_auto_off': { es: 'Auto-sincronización de precios apagada automáticamente', en: 'Price auto-sync switched off automatically' },
};

/**
 * Full sentence for a price-sheet copy / auto-sync entry, or null for any
 * other action. These rows are written by the database (migrations 242 + 260)
 * with details { direction: 'out' (this company shares its prices) | 'in'
 * (this company receives them), other company, … }, so the sentence reads
 * right from either company's Activity log.
 */
export function describePriceSheetAudit(action: string, details: Record<string, unknown> | null | undefined, lang: 'es' | 'en'): string | null {
  if (!action.startsWith('price_sheet.')) return null;
  const d = details ?? {};
  const es = lang === 'es';
  const out = d.direction !== 'in';
  const other = String(
    d.other_business_name ?? (out ? d.target_business_name : d.source_business_name) ?? (es ? 'otra empresa' : 'another company'),
  );
  switch (action) {
    case 'price_sheet.synced': {
      const counts = es
        ? `${Number(d.updated) || 0} actualizados, ${Number(d.added) || 0} agregados, ${Number(d.removed) || 0} eliminados`
        : `${Number(d.updated) || 0} updated, ${Number(d.added) || 0} added, ${Number(d.removed) || 0} removed`;
      return es
        ? (out ? `Precios copiados a ${other} — ${counts}` : `Precios copiados desde ${other} — ${counts}`)
        : (out ? `Prices copied to ${other} — ${counts}` : `Prices copied from ${other} — ${counts}`);
    }
    case 'price_sheet.autosync_on':
      return es
        ? (out ? `Auto-sincronización activada: ${other} ahora sigue estos precios` : `Auto-sincronización activada: estos precios ahora siguen a ${other}`)
        : (out ? `Price auto-sync turned on: ${other} now follows these prices` : `Price auto-sync turned on: these prices now follow ${other}`);
    case 'price_sheet.autosync_off':
      return es
        ? `Auto-sincronización de precios con ${other} desactivada`
        : `Price auto-sync with ${other} turned off`;
    case 'price_sheet.autosync_auto_off': {
      const who = d.lost_access_name ? String(d.lost_access_name) : (es ? 'quien la activó' : 'the person who turned it on');
      return es
        ? `Auto-sincronización de precios con ${other} apagada automáticamente — ${who} ya no es dueño/admin de ambas empresas`
        : `Price auto-sync with ${other} switched off automatically — ${who} is no longer an owner/admin of both companies`;
    }
    default:
      return null;
  }
}
