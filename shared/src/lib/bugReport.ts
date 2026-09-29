// Submitting a bug report (migration 241).
//
// The context fields are the whole point. A user writes "it broke" — which is
// all anyone ever writes, reasonably, because describing software is not their
// job — and the route, build number and platform make that findable anyway.

export interface BugReportContext {
  route?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  osVersion?: string | null;
  deviceModel?: string | null;
  locale?: string | null;
}

export interface SubmitBugReportArgs extends BugReportContext {
  userId: string;
  businessId?: string | null;
  message: string;
}

type MinimalClient = { from: (table: string) => any };

/** Longest message the table accepts (241). Enforced here too so the user is
 *  told before a round-trip, rather than by a constraint violation. */
export const BUG_REPORT_MAX = 5000;

export async function submitBugReport(
  supabase: MinimalClient,
  args: SubmitBugReportArgs,
): Promise<{ ok: true } | { ok: false; reason: 'empty' | 'too_long' | 'failed' }> {
  const message = args.message.trim();
  if (!message) return { ok: false, reason: 'empty' };
  if (message.length > BUG_REPORT_MAX) return { ok: false, reason: 'too_long' };

  const { error } = await supabase.from('bug_reports').insert({
    user_id: args.userId,
    business_id: args.businessId ?? null,
    message,
    route: args.route ?? null,
    platform: args.platform ?? null,
    app_version: args.appVersion ?? null,
    build_number: args.buildNumber ?? null,
    os_version: args.osVersion ?? null,
    device_model: args.deviceModel ?? null,
    locale: args.locale ?? null,
  });

  return error ? { ok: false, reason: 'failed' } : { ok: true };
}
