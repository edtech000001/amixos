// Which version of each document a user's consent refers to.
//
// Dated, not numbered: a consent row saying "privacy 2026-09-22" is readable a
// year later without cross-referencing a changelog, and the date already
// appears in the document's own "Última actualización" line.
//
// BUMP THESE WHENEVER THE TEXT CHANGES. A consent record is only worth
// anything if it identifies what was actually agreed to; leaving the version
// alone after an edit silently backdates everyone's consent to text they never
// saw.
//
// `material` is the separate, deliberate decision. Terms section 14 promises
// an in-app notice for important changes and treats continued use as
// acceptance of the rest — so a typo fix bumps the version quietly, and a real
// change re-prompts. Without this split you either nag people over
// whitespace or never tell them anything.
//
// Whether a given change is material is a legal judgement, not a technical
// one. When unsure, mark it material: the cost is one dismissible sheet.

export type PolicyDoc = 'privacy' | 'terms';

export interface PolicyVersion {
  /** Matches the document's own "last updated" date. */
  version: string;
  /** True when this change should re-prompt people who already accepted. */
  material: boolean;
}

export const POLICY_VERSIONS: Record<PolicyDoc, PolicyVersion> = {
  // 2026-09-30: unpaid businesses kept 12 months, then erased after 30/7/1-day
  // warnings (migration 243). Material: a new way data gets deleted without
  // the owner asking.
  // 2026-09-30.3: full provider list, cookies + Do-Not-Track, US data
  // location, how a business's own clients make privacy requests. Material
  // (supersedes the same-day 2026-09-30 retention release).
  privacy: { version: '2026-09-30.3', material: true },
  // 2026-09-30.3: arbitration + class waiver + opt-out (§13), indemnification
  // (§12), Douglas County venue (§16), plus license/ownership (§9), AI (§10),
  // conspicuous warranty disclaimer (§11), Apple EULA terms (§8), billing
  // auto-renewal/proration/taxes/disputes (§3), survival, e-communications,
  // language (English controls), third-party beneficiaries (§15). Material.
  terms:   { version: '2026-09-30.3', material: true },
};

export const POLICY_DOCS: PolicyDoc[] = ['privacy', 'terms'];

/**
 * Does this user need to see the consent screen?
 *
 * Never accepted → yes, always. Accepted an older version → only when that
 * change was flagged material.
 */
export function needsConsent(
  accepted: Partial<Record<PolicyDoc, string>>,
): boolean {
  return POLICY_DOCS.some((doc) => {
    const current = POLICY_VERSIONS[doc];
    const have = accepted[doc];
    if (!have) return true;
    if (have === current.version) return false;
    return current.material;
  });
}

/** The docs actually out of date, for wording the prompt. */
export function staleDocs(
  accepted: Partial<Record<PolicyDoc, string>>,
): PolicyDoc[] {
  return POLICY_DOCS.filter((doc) => {
    const have = accepted[doc];
    if (!have) return true;
    return have !== POLICY_VERSIONS[doc].version && POLICY_VERSIONS[doc].material;
  });
}
