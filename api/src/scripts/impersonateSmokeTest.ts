// Step-1 smoke test for the "Ver como" feature. Proves that an HS256 token
// minted from SUPABASE_JWT_SECRET is accepted by Supabase and that RLS filters
// data to the impersonated member — BEFORE any UI is built.
//
// Usage (from api/):
//   npx ts-node src/scripts/impersonateSmokeTest.ts <member-email-or-userId>
//
// It compares row counts seen by the service role (RLS bypassed = the truth)
// against row counts seen through the minted user token (RLS applied). For a
// field worker the token counts should be a strict subset.

import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseUrlPublic } from '../config/supabase';
import { mintImpersonationToken } from '../lib/impersonationToken';

async function resolveUser(arg: string): Promise<{ id: string; email: string | null }> {
  // Accept either a uuid or an email. For email, look it up via the
  // service-role admin API.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg);
  if (isUuid) return { id: arg, email: null };

  // admin.listUsers is paged; scan for the email (smoke test only).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find(u => u.email?.toLowerCase() === arg.toLowerCase());
    if (match) return { id: match.id, email: match.email ?? null };
    if (data.users.length < 200) break;
  }
  throw new Error(`No auth user found for "${arg}"`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: ts-node src/scripts/impersonateSmokeTest.ts <member-email-or-userId>');
    process.exit(1);
  }

  const target = await resolveUser(arg);
  console.log(`\n🎯 Target user: ${target.id}${target.email ? ` (${target.email})` : ''}`);

  // Role / employee context (service role — the ground truth).
  const { data: memberships } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', target.id);
  console.log('🗂  Memberships:', memberships ?? []);

  // Mint the impersonation token and build a client that uses it. apikey stays
  // the service key for the gateway, but the Authorization bearer is the user
  // token, so PostgREST applies RLS as that member.
  const { token, expiresAt } = mintImpersonationToken(target.id);
  console.log(`🔑 Minted token, expires in ${expiresAt - Math.floor(Date.now() / 1000)}s`);

  const asMember = createClient(supabaseUrlPublic, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Sanity: the token must be accepted at all.
  const probe = await asMember.from('jobs').select('id', { count: 'exact', head: true });
  if (probe.error) {
    console.error('\n❌ Token REJECTED by Supabase:', probe.error.message);
    console.error('   → HS256 minting is not accepted (asymmetric keys?). Stop and reassess.');
    process.exit(2);
  }
  console.log('\n✅ Token accepted by Supabase — RLS is evaluating as the member.');

  // Compare counts: service role (truth) vs impersonated (RLS-filtered).
  for (const table of ['jobs', 'clients', 'invoices', 'timesheets'] as const) {
    const truth = await supabase.from(table).select('id', { count: 'exact', head: true });
    const seen = await asMember.from(table).select('id', { count: 'exact', head: true });
    const t = truth.count ?? 0;
    const s = seen.count ?? 0;
    const flag = s < t ? '🔒 filtered' : s === t ? '— same' : '⚠️  MORE (unexpected)';
    console.log(`   ${table.padEnd(11)} service=${String(t).padStart(5)}  asMember=${String(s).padStart(5)}  ${flag}`);
  }

  console.log('\nDone. If "asMember" counts are a subset for a field worker, RLS impersonation works.\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
