// Reconcile orphaned completed jobs with UNLINKED invoice line items — the
// import fix-up when a job's Project ID (external_ref) was missing from the
// invoice, so the two never auto-linked but the job NAME matches a line's
// description on the SAME client's invoice.
//
// Pure logic (no I/O) so it's testable; the UI loads the data + applies via
// linkLineToJob.

export interface OrphanJob {
  id: string;
  title: string;
  externalRef: string | null;
  clientId: string | null;
  clientName: string;
  scheduledDate: string | null;
}

export interface UnlinkedLine {
  invoiceId: string;
  invoiceNumber: string;
  /** Index of this line within its invoice's line_items array. */
  index: number;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  clientId: string | null;
  issueDate: string | null;
}

export type MatchConfidence = 'exact' | 'fuzzy' | 'none';

export interface ReconcileProposal {
  job: OrphanJob;
  /** Best matching line, or null when nothing on the client's invoices matches. */
  line: UnlinkedLine | null;
  confidence: MatchConfidence;
  /** Other plausible lines the user can switch to (same client, some overlap). */
  alternatives: UnlinkedLine[];
}

export function normalizeName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** 0..1 similarity: token Jaccard + a substring bonus. */
export function matchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  const union = ta.size + tb.size - inter;
  const jac = union ? inter / union : 0;
  const sub = a.includes(b) || b.includes(a) ? 0.3 : 0;
  return Math.min(1, jac + sub);
}

const FUZZY_THRESHOLD = 0.45;
const lineKey = (l: UnlinkedLine) => `${l.invoiceId}#${l.index}`;

/**
 * Build one proposal per job. A proposal is 'exact' only when there's exactly
 * ONE line on the same client whose normalized description equals the job title
 * — those are safe to auto-link. Everything else is 'fuzzy' (needs review) or
 * 'none'. Does NOT reserve lines; the caller reserves as matches are accepted.
 */
export function buildReconcileProposals(jobs: OrphanJob[], lines: UnlinkedLine[]): ReconcileProposal[] {
  const byClient = new Map<string, UnlinkedLine[]>();
  for (const l of lines) {
    const k = l.clientId ?? '';
    const arr = byClient.get(k);
    if (arr) arr.push(l); else byClient.set(k, [l]);
  }

  return jobs.map(job => {
    const pool = byClient.get(job.clientId ?? '') ?? [];
    const jn = normalizeName(job.title);
    const exact = pool.filter(l => normalizeName(l.description) === jn);
    const scored = pool
      .map(l => ({ l, score: matchScore(jn, normalizeName(l.description)) }))
      .filter(x => x.score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (exact.length === 1) {
      const primary = exact[0];
      const alternatives = scored.map(s => s.l).filter(l => lineKey(l) !== lineKey(primary)).slice(0, 6);
      return { job, line: primary, confidence: 'exact', alternatives };
    }
    if (exact.length > 1) {
      // Same name on multiple lines → can't be sure which; review.
      return { job, line: exact[0], confidence: 'fuzzy', alternatives: exact.slice(1).concat(scored.map(s => s.l)).slice(0, 6) };
    }
    if (scored.length) {
      return { job, line: scored[0].l, confidence: 'fuzzy', alternatives: scored.slice(1).map(s => s.l).slice(0, 6) };
    }
    return { job, line: null, confidence: 'none', alternatives: [] };
  });
}
