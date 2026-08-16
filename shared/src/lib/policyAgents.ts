// Insurance/policy agent contacts (businesses.policy_agents, migration 198)
// and the "Enviar póliza" email builder: drafts a request asking the agent to
// send the business's COI / Workers' Comp certificate to a client, with the
// client's details in the body (mirrors the owner's long-standing manual
// email format).

export type PolicyDocKind = 'coi' | 'workcomp' | 'both';

export interface PolicyAgent {
  name: string;
  email: string;
}

export interface PolicyAgents {
  coi?: PolicyAgent | null;
  workcomp?: PolicyAgent | null;
}

export function parsePolicyAgents(raw: unknown): PolicyAgents {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, { name?: unknown; email?: unknown } | null>;
  const pick = (k: 'coi' | 'workcomp'): PolicyAgent | null => {
    const v = r[k];
    if (!v || typeof v !== 'object') return null;
    const name = typeof v.name === 'string' ? v.name.trim() : '';
    const email = typeof v.email === 'string' ? v.email.trim() : '';
    return name || email ? { name, email } : null;
  };
  return { coi: pick('coi'), workcomp: pick('workcomp') };
}

/** The agent to contact for a document kind — Workcomp falls back to the COI
 *  agent (many businesses use one agent for both). */
export function agentFor(agents: PolicyAgents, kind: 'coi' | 'workcomp'): PolicyAgent | null {
  if (kind === 'workcomp') return agents.workcomp?.email ? agents.workcomp : (agents.coi?.email ? agents.coi : null);
  return agents.coi?.email ? agents.coi : null;
}

export interface PolicyEmailStrings {
  subjectCoi: string;       // "Send Out Insurance | {{business}}"
  subjectWorkcomp: string;  // "Send Out WorkComp. | {{business}}"
  subjectBoth: string;      // "Send Out Policy | {{business}}"
  body: string;         // greeting/body with {{agent}} {{docs}} {{details}} {{business}}
  docsCoi: string;
  docsWorkcomp: string;
  docsBoth: string;
  nameLabel: string;
  companyLabel: string;
  addressLabel: string;
  phoneLabel: string;
  emailLabel: string;
}

export function buildPolicyEmail(opts: {
  agents: PolicyAgents;
  kind: PolicyDocKind;
  businessName: string;
  client: {
    name: string;
    company?: string | null;
    addressLines?: string[];
    phone?: string | null;
    email?: string | null;
  };
  t: PolicyEmailStrings;
}): { to: string; subject: string; body: string } | null {
  const coi = agentFor(opts.agents, 'coi');
  const wc = agentFor(opts.agents, 'workcomp');
  const targets =
    opts.kind === 'coi' ? [coi]
    : opts.kind === 'workcomp' ? [wc]
    : [coi, wc];
  const emails = Array.from(new Set(targets.filter((a): a is PolicyAgent => !!a).map(a => a.email)));
  if (emails.length === 0) return null;
  // Greet the primary agent by first name (like the manual emails did).
  const primary = (opts.kind === 'workcomp' ? wc : coi) ?? wc ?? coi;
  const agentFirst = (primary?.name ?? '').trim().split(/\s+/)[0] || '';

  const docs =
    opts.kind === 'coi' ? opts.t.docsCoi
    : opts.kind === 'workcomp' ? opts.t.docsWorkcomp
    : opts.t.docsBoth;

  const detailLines: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) detailLines.push(`${label}: ${value.trim()}`);
  };
  add(opts.t.nameLabel, opts.client.name);
  add(opts.t.companyLabel, opts.client.company);
  const addr = (opts.client.addressLines ?? []).filter(l => l && l.trim());
  if (addr.length) detailLines.push(`${opts.t.addressLabel}: ${addr.join('\n')}`);
  add(opts.t.phoneLabel, opts.client.phone);
  add(opts.t.emailLabel, opts.client.email);

  const subjectTpl =
    opts.kind === 'coi' ? opts.t.subjectCoi
    : opts.kind === 'workcomp' ? opts.t.subjectWorkcomp
    : opts.t.subjectBoth;
  const subject = subjectTpl.replace('{{business}}', opts.businessName);
  const body = opts.t.body
    .replace('{{agent}}', agentFirst)
    .replace('{{docs}}', docs)
    .replace('{{details}}', detailLines.join('\n\n'))
    .replace(/\{\{business\}\}/g, opts.businessName);

  return { to: emails.join(','), subject, body };
}
