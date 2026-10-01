-- How a newsletter post's preview image is framed: where the focus is, how far it is zoomed,
-- and an optional manual change to the automatic dark fade. The original image is never cut.
alter table public.newsletter_posts
  add column if not exists cover_focus_x smallint not null default 50
    check (cover_focus_x between 0 and 100),
  add column if not exists cover_focus_y smallint not null default 50
    check (cover_focus_y between 0 and 100),
  add column if not exists cover_zoom numeric(3, 2) not null default 1
    check (cover_zoom between 1 and 3),
  add column if not exists cover_fade text
    check (cover_fade is null or cover_fade in ('lighter', 'darker'));

-- down migration:
-- alter table public.newsletter_posts drop column if exists cover_fade;
-- alter table public.newsletter_posts drop column if exists cover_zoom;
-- alter table public.newsletter_posts drop column if exists cover_focus_y;
-- alter table public.newsletter_posts drop column if exists cover_focus_x;
