import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUploadState } from "@/lib/mcp/upload-flow";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatISTDateTime } from "@/lib/utils/dates";
import { UploadBox } from "@/app/mcp-upload/[token]/upload-box";

// Where a person drops the file an app asked for. The link's token is the only credential (no sign-in), it works
// once and stops after 15 minutes, so the address must not leak: the page asks not to be indexed or passed on.

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Upload a file",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Shell({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        {children ? <CardContent className="space-y-4">{children}</CardContent> : null}
      </Card>
    </main>
  );
}

export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getUploadState(createAdminClient(), token);

  if (state.status === "expired") {
    return <Shell title="This link has expired" description="Upload links stop working after 15 minutes. Go back to the app and ask for a new one." />;
  }
  if (state.status === "used") {
    return <Shell title="This link was already used" description="Each link works once. If you still need to upload a file, go back to the app and ask for a new link." />;
  }
  if (state.status === "unknown") {
    return <Shell title="This link is not valid" description="Check that you opened the whole link, or go back to the app and ask for a new one." />;
  }

  const { limits } = state;
  const megabytes = Math.round(limits.max_bytes / (1024 * 1024));
  return (
    <Shell
      title={`Upload a file to “${state.idea_title}”`}
      description={
        state.replaces_file_name ? (
          <>
            This file will replace <span className="font-medium text-foreground">{state.replaces_file_name}</span>.
          </>
        ) : (
          <>
            The app asked for <span className="font-medium text-foreground">{state.file_name}</span>.
          </>
        )
      }
    >
      <UploadBox
        token={token}
        maxBytes={limits.max_bytes}
        notes={
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>A PDF or an image (PNG, JPG or WebP), up to {megabytes} MB.</li>
            <li>
              This idea has {limits.files_used} of {limits.files_max} files.
            </li>
            <li>This link works once and stops at {formatISTDateTime(state.expires_at)} IST.</li>
          </ul>
        }
      />
    </Shell>
  );
}
