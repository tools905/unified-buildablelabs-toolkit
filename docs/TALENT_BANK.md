# Talent Bank

Admin-only tool for keeping candidates. Members never see it (Dashboard, sidebar, pages and database
rules all check for admin).

## What's built (phase 1)

- **Shelves:** New, Keep for later, In process, Rejected. Rejected people and their files are deleted
  for good 60 days after rejecting (daily cleanup, `/api/cron/content-cleanup`).
- **Add by hand:** drop a resume (PDF is read and fills in name, email, phone, LinkedIn, role, city
  for checking), add links, work files and notes. Only the name is required.
- **Application link:** one shared link per workspace, on/off, replaceable. The public form
  (`/apply/<token>`) collects name, email, phone, role, city, LinkedIn, resume, work links/files, two
  open questions and consent. Submissions land on New and admins get an email.
- **Storage:** private `talent-files` bucket, admins only; the form uploads through one-time signed
  links. Abandoned uploads are cleaned up after a day.
- Tables: `talent_candidates`, `talent_files`, `talent_form_links` (migration 068).

## Next phases (ideas, not built)

1. **Openings:** create roles (e.g. "Content designer, Dec 2026"), each with its own application link
   and questions; candidates attach to an opening.
2. **Automatic rating:** per opening, write the criteria (skills, years, portfolio quality, location);
   drop 8–10 resumes at once and get a score per criterion with the reasons quoted from the resume.
   Admins confirm or override; nobody is rejected automatically.
3. **Bulk intake:** drag a folder of resumes; each becomes a candidate on New, pre-filled and rated.
4. **Pipeline:** interview stages, scheduled calls, a shared scorecard per interviewer, and a reminder
   when "Keep for later" people match a new opening.
5. **Data requests:** a candidate can ask to be removed; one click deletes everything.
