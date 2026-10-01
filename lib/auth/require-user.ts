import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The parts of the signed-in user the app uses, taken from the verified login token.
export type SessionUser = {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

// Who is signed in, once per request. The login token is checked here on the server with the
// project's public signing key, so there is no round trip to Supabase Auth on every page and
// action (this project signs tokens with ES256; on a project using the legacy shared secret,
// getClaims quietly falls back to asking Supabase). A token that was revoked, say by signing out
// somewhere else, stays valid here until it expires (about an hour), exactly as it does for
// the database's own row-level security.
export const getUserSession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const user: SessionUser | null = claims?.sub
    ? {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        user_metadata: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
        app_metadata: (claims.app_metadata as Record<string, unknown> | undefined) ?? {},
      }
    : null;

  return { supabase, user, error };
});

export async function requireUser(redirectTo?: string) {
  const { supabase, user, error } = await getUserSession();

  if (error || !user) {
    const nextParam = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : "";
    redirect(`/login${nextParam}`);
  }

  return { supabase, user };
}
