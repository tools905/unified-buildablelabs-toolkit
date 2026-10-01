-- Preview (cover) image for newsletter posts, plus a public bucket for newsletter images.
-- Images must be publicly readable because the marketing site loads them directly.
alter table public.newsletter_posts
  add column if not exists cover_image_url text,
  add column if not exists cover_brightness smallint
    check (cover_brightness is null or cover_brightness between 0 and 100);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'newsletter-images',
  'newsletter-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live at <workspace_id>/<post_id>/<file>; members of the workspace manage them.
drop policy if exists "newsletter images read" on storage.objects;
create policy "newsletter images read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'newsletter-images'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

drop policy if exists "newsletter images upload" on storage.objects;
create policy "newsletter images upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'newsletter-images'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

drop policy if exists "newsletter images delete" on storage.objects;
create policy "newsletter images delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'newsletter-images'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- down migration:
-- drop policy if exists "newsletter images delete" on storage.objects;
-- drop policy if exists "newsletter images upload" on storage.objects;
-- drop policy if exists "newsletter images read" on storage.objects;
-- delete from storage.buckets where id = 'newsletter-images';
-- alter table public.newsletter_posts drop column if exists cover_brightness;
-- alter table public.newsletter_posts drop column if exists cover_image_url;
