-- 155_logos_business_scoped.sql
-- Scope logo writes so a business can't overwrite/delete another business's
-- logo. Previously logos_insert/update/delete gated only on
-- foldername[1]='logos' + authenticated → any logged-in user could clobber any
-- logo (public defacement of /factura and /propuesta pages).
--
-- New path shapes (both enforced here; the app writes these):
--   logos/<business_id>/<ts>.ext   — Settings (business exists)
--   logos/<user_id>/<ts>.ext       — Onboarding (business not created yet, so
--                                    the uploader scopes to their own uid)
-- Write is allowed only when segment 2 is the caller's own uid OR a business
-- they can write. The uuid cast is guarded by a shape regex so a crafted
-- non-uuid segment can't error the policy. Legacy flat logos (logos/<ts>.ext,
-- segment 2 = null) become immutable — safe, and they're still publicly
-- readable (the bucket is public-read).
--
-- IMPORTANT: run manually in the Supabase SQL Editor. Idempotent / safe to re-run.
-- After running, re-test a logo upload from BOTH onboarding and Settings.

-- Shared predicate, inlined per policy (storage.objects policies can't call a
-- custom helper referencing NEW easily, so we repeat it):
--   seg2 = auth.uid()  OR  (seg2 looks like a uuid AND can_write_business(seg2))

drop policy if exists "logos_insert" on storage.objects;
create policy "logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
    and (storage.foldername(name))[2] is not null
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        and public.can_write_business(((storage.foldername(name))[2])::uuid)
      )
    )
  );

drop policy if exists "logos_update" on storage.objects;
create policy "logos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
    and (storage.foldername(name))[2] is not null
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        and public.can_write_business(((storage.foldername(name))[2])::uuid)
      )
    )
  );

drop policy if exists "logos_delete" on storage.objects;
create policy "logos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-assets'
    and (storage.foldername(name))[1] = 'logos'
    and (storage.foldername(name))[2] is not null
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        and public.can_write_business(((storage.foldername(name))[2])::uuid)
      )
    )
  );
