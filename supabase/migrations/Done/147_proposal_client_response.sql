-- 147_proposal_client_response.sql
-- Client-facing accept & e-sign / decline on shared estimates.
--
-- The public /propuesta/<token> page gains "Aceptar y firmar" / "Rechazar"
-- actions. The client's response writes back through a token-gated
-- SECURITY DEFINER RPC (same pattern as 063's read RPCs): anon never gets
-- table access, must present the share token, and can only move a live
-- estimate (proposal/sent) to accepted/declined — never any other row or
-- any other transition. The drawn signature is stored on the job as proof.
--
-- Run manually in the Supabase SQL Editor. Safe to re-run (additive).

alter table public.jobs
  add column if not exists client_response text
    check (client_response in ('accepted','declined')),
  add column if not exists client_responded_at timestamptz,
  add column if not exists client_signed_name text,
  -- data-URL PNG drawn on the public page (small canvas, ~5-30 KB)
  add column if not exists client_signature text;

-- ── Client responds to a shared estimate ────────────────────────────────────
create or replace function public.respond_shared_proposal(
  p_token text,
  p_action text,
  p_name text default null,
  p_signature text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job
  from public.jobs
  where share_token = p_token and estimate_number is not null
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Only a live, unanswered estimate can be responded to. Anything past
  -- 'sent' (already accepted, in progress, declined, cancelled…) is locked.
  if v_job.status not in ('proposal', 'sent') then
    return jsonb_build_object('ok', false, 'error', 'already_responded', 'status', v_job.status);
  end if;

  if p_action = 'accepted' then
    if v_job.expiry_date is not null and v_job.expiry_date < current_date then
      return jsonb_build_object('ok', false, 'error', 'expired');
    end if;
    if coalesce(trim(p_name), '') = '' or coalesce(p_signature, '') = '' then
      return jsonb_build_object('ok', false, 'error', 'missing_signature');
    end if;
    -- Signature must be a reasonable-size inline image (a drawn PNG is tiny;
    -- the cap stops anon from stuffing megabytes into the row).
    if p_signature not like 'data:image/%' or length(p_signature) > 200000 then
      return jsonb_build_object('ok', false, 'error', 'bad_signature');
    end if;

    update public.jobs set
      status              = 'accepted',
      accepted_at         = now(),
      client_response     = 'accepted',
      client_responded_at = now(),
      client_signed_name  = trim(p_name),
      client_signature    = p_signature
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'accepted');

  elsif p_action = 'declined' then
    update public.jobs set
      status              = 'declined',
      declined_at         = now(),
      client_response     = 'declined',
      client_responded_at = now()
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'declined');

  else
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;
end;
$$;

grant execute on function public.respond_shared_proposal(text, text, text, text) to anon, authenticated;

-- ── get_shared_proposal: expose the client-response fields ──────────────────
-- Same shape as 063, plus client_response / client_responded_at /
-- client_signed_name / client_signature so the public page can render the
-- signed/declined state instead of the response form.
create or replace function public.get_shared_proposal(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'job', (
      select to_jsonb(jrow)
        || jsonb_build_object(
             'clients', (
               select to_jsonb(c) from (
                 select first_name, last_name, company
                 from public.clients where id = j.client_id
               ) c
             ),
             'businesses', (
               select to_jsonb(b) from (
                 select name, logo_url, city, state
                 from public.businesses where id = j.business_id
               ) b
             )
           )
      from (
        select j.id, j.title, j.description, j.estimate_number, j.status,
               j.issue_date, j.expiry_date, j.scheduled_date, j.subtotal_amount,
               j.tax_rate, j.tax_amount, j.discount, j.total_amount, j.notes,
               j.client_response, j.client_responded_at, j.client_signed_name,
               j.client_signature
      ) jrow
    ),
    'items', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', ji.id, 'description', ji.description,
                 'quantity', ji.quantity, 'unit_price', ji.unit_price, 'total', ji.total
               ) order by ji.created_at
             )
      from public.job_items ji
      where ji.job_id = j.id
    ), '[]'::jsonb)
  )
  from public.jobs j
  where j.share_token = p_token
  limit 1;
$$;

grant execute on function public.get_shared_proposal(text) to anon, authenticated;
