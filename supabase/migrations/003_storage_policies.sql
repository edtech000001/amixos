-- Migration 003: Storage policies for business-assets bucket

-- Allow authenticated users to upload files
create policy "Authenticated users can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'business-assets'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to update/replace their files
create policy "Authenticated users can update"
  on storage.objects for update
  using (
    bucket_id = 'business-assets'
    and auth.role() = 'authenticated'
  );

-- Allow anyone to read (bucket is public)
create policy "Public read access"
  on storage.objects for select
  using (bucket_id = 'business-assets');
