import { ExternalLink } from "lucide-react";

// The team's Google Sheet of creators, profiles and ideas. Shown inside the Calendar page as the real
// sheet: editing it here edits it in Google Sheets, and everyone's changes appear live, as in Google.
export const CREATORS_SHEET = {
  title: "Creators, Profiles and ideas",
  url: "https://docs.google.com/spreadsheets/d/1VeTjbxaLSEzoyf-tsHWVGb8BseG0JjdMwr2VU5aIofw/edit?gid=0#gid=0",
};

export function GoogleSheetEmbed({ title, url }: { title: string; url: string }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            The team&apos;s Google Sheet, live. Edits here go straight into it. To edit, be signed in to Google with your
            BuildableLabs account in this browser.
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto"
        >
          Open in Google Sheets
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <iframe
          src={url}
          title={title}
          // Google's editor needs the clipboard for copy and paste inside the sheet.
          allow="clipboard-read; clipboard-write; fullscreen"
          className="block h-[calc(100dvh-17rem)] min-h-[28rem] w-full border-0"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        If the sheet asks you to sign in or stays blank (some phone browsers block Google sign-in inside other sites), use
        Open in Google Sheets.
      </p>
    </section>
  );
}
