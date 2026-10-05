-- Content Board (BuildableLabs Team Connect)
--
-- 1. Assignment emails: people assigned to a content idea now also get an email, which is logged in
--    notification_logs like every other email the app sends.
alter type public.notification_type add value if not exists 'content_idea_assigned';

-- 2. Posts download as one PDF. It is made from all of an idea's images and PDFs and kept next to
--    them (<workspace>/<idea>/exports/), so it can be bigger than any single upload. Uploads are
--    still limited to 15 MB each by the app itself.
update storage.buckets
set file_size_limit = 52428800
where id = 'content-attachments';

-- Rollback (the enum value cannot be dropped without recreating the type; it is harmless to keep):
-- update storage.buckets set file_size_limit = 15728640 where id = 'content-attachments';
