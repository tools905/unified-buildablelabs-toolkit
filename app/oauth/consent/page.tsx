import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import {
  CONNECTOR_CAN,
  CONNECTOR_CANNOT,
  describeScopes,
  isRecognisedRedirect,
  redirectHostLabel,
} from "@/lib/mcp/consent";
import { ConsentForm } from "@/app/oauth/consent/consent-form";

// Where Supabase sends a person when an app asks to connect (Authentication, OAuth Server, Authorization
// Path). It arrives with `authorization_id` in the address. Signed-out visitors are sent to log in first
// by the middleware, which brings them back here afterwards.

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{children}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) {
    return <Message title="Nothing to approve">Open this page from the app that wants to connect, not directly.</Message>;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return (
      <Message title="This request has expired">
        It was already used or took too long. Go back to the app and connect again.
      </Message>
    );
  }
  // Already approved before: Supabase hands back the way on, so there is nothing to ask.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const recognised = isRecognisedRedirect(data.redirect_uri);
  const scopes = describeScopes(data.scope);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Allow {data.client.name} to connect?</CardTitle>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{data.user.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!recognised ? (
            <Alert className="border-destructive/40">
              <AlertTitle className="text-destructive">This app is not recognised</AlertTitle>
              <AlertDescription>
                Only apps the toolkit knows can be connected. If you did not just start this yourself, cancel.
              </AlertDescription>
            </Alert>
          ) : null}

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">App</dt>
              <dd className="text-right font-medium">{data.client.name}</dd>
            </div>
            {data.client.uri ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Website</dt>
                <dd className="break-all text-right">{data.client.uri}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Returns you to</dt>
              <dd className="break-all text-right font-medium">{redirectHostLabel(data.redirect_uri)}</dd>
            </div>
          </dl>

          {recognised ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">If you allow it, it can:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {CONNECTOR_CAN.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="pt-1 font-medium">It cannot:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {CONNECTOR_CANNOT.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="pt-1 text-xs text-muted-foreground">
                It acts as you, in your workspace. You can disconnect it at any time.
              </p>
            </div>
          ) : null}

          {recognised && scopes.length > 0 ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium">Sign-in details it also asks for:</p>
              <ul className="list-disc pl-5">
                {scopes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <ConsentForm authorizationId={data.authorization_id} canApprove={recognised} />
        </CardContent>
      </Card>
    </main>
  );
}
