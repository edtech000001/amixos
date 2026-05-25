-- 029_oauth_client_id.sql
-- Track which Google OAuth client issued each refresh_token so the backend
-- knows how to refresh it. Refresh tokens are client-scoped: a token from
-- the iOS client (PKCE, no secret) can only be refreshed with that same
-- iOS client_id and no secret. A token from the Web client requires the
-- Web client_id + secret. Without this column we were always trying the
-- Web client's credentials and failing for tokens issued by iOS.
--
-- Idempotent: safe to re-run.

alter table public.user_oauth_credentials
  add column if not exists client_id text;

comment on column public.user_oauth_credentials.client_id is
  'The Google OAuth client_id that issued the stored refresh_token. The backend uses this at refresh time to determine which credentials to send to Google''s token endpoint.';
