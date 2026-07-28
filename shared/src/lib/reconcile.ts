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

/** Order lines by closest invoice date to a reference date (the job's date). */
export function sortLinesByDateNear(lines: UnlinkedLine[], nearDate: string | null): UnlinkedLine[] {
  return [...lines].sort((a, b) => dateDist(a.issueDate, nearDate) - dateDist(b.issueDate, nearDate));
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

/** Absolute distance (ms) between two date strings; Infinity if either missing.
 *  Used to prefer the invoice dated closest to the job. */
function dateDist(a: string | null, b: string | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb);
}

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
    // Closest invoice date to the job's date first (the invoice almost always
    // falls near the work). Used to order candidates + break score ties.
    const byDate = (a: UnlinkedLine, b: UnlinkedLine) => dateDist(a.issueDate, job.scheduledDate) - dateDist(b.issueDate, job.scheduledDate);
    const exact = pool.filter(l => normalizeName(l.description) === jn).sort(byDate);
    const scored = pool
      .map(l => ({ l, score: matchScore(jn, normalizeName(l.description)) }))
      .filter(x => x.score >= FUZZY_THRESHOLD)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : byDate(a.l, b.l)));

    if (exact.length === 1) {
      const primary = exact[0];
      const alternatives = scored.map(s => s.l).filter(l => lineKey(l) !== lineKey(primary)).slice(0, 6);
      return { job, line: primary, confidence: 'exact', alternatives };
    }
    if (exact.length > 1) {
      // Same name on multiple lines → can't be sure which; review. Closest date first.
      return { job, line: exact[0], confidence: 'fuzzy', alternatives: exact.slice(1).concat(scored.map(s => s.l).filter(l => !exact.some(e => lineKey(e) === lineKey(l)))).slice(0, 6) };
    }
    if (scored.length) {
      return { job, line: scored[0].l, confidence: 'fuzzy', alternatives: scored.slice(1).map(s => s.l).slice(0, 6) };
    }
    return { job, line: null, confidence: 'none', alternatives: [] };
  });
}
