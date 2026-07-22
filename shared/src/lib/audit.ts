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
  | 'loan.repaid';

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
  | 'employee';

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
  'business.deleted':    { es: 'Negocio eliminado',         en: 'Business deleted' },
  'module.enabled':      { es: 'Módulo activado',           en: 'Module enabled' },
  'module.disabled':     { es: 'Módulo desactivado',        en: 'Module disabled' },
  'import.completed':    { es: 'Importación realizada',    en: 'Import completed' },
  'payroll.paid':        { es: 'Pago de nómina registrado', en: 'Payroll payment recorded' },
  'payroll.payment_deleted': { es: 'Pago de nómina eliminado', en: 'Payroll payment deleted' },
  'payroll.payments_cleared': { es: 'Pagos de nómina eliminados', en: 'Payroll payments deleted' },
  'loan.given':          { es: 'Préstamo otorgado', en: 'Loan given' },
  'loan.repaid':         { es: 'Abono a préstamo', en: 'Loan repayment' },
};
