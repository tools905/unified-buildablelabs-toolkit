"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRecognisedRedirect } from "@/lib/mcp/consent";

export type ConsentState = { error: string | null };

const EXPIRED = "This sign-in request has expired or was already used. Go back to the app and connect again.";

// Approve or deny a connector's request. The request is looked up again here rather than trusted from
// the form, so a changed form can't approve an app the page would have refused.
export async function decideConsentAction(_previous: ConsentState, formData: FormData): Promise<ConsentState> {
  const authorizationId = String(formData.get("authorization_id") ?? "").trim();
  const approving = formData.get("decision") === "approve";
  if (!authorizationId) return { error: EXPIRED };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are signed out. Sign in to the toolkit again, then connect again." };

  const { data: details, error: lookupError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (lookupError || !details) return { error: EXPIRED };
  // Already decided (for example by an earlier click): send the person on to the app.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  if (approving && !isRecognisedRedirect(details.redirect_uri)) {
    return { error: "This app is not one the toolkit recognises, so it can't be approved." };
  }

  const result = approving
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId);
  if (result.error || !result.data) return { error: "Something went wrong. Please try again." };

  redirect(result.data.redirect_url);
}
