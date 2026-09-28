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
// `material` is the separate, deliberate decision. Terms section 11 promises
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
  privacy: { version: '2026-09-22', material: false },
  terms:   { version: '2026-09-22', material: false },
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
