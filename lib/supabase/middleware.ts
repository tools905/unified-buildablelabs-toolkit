import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseBrowserEnv } from "@/lib/utils/env";

const protectedPrefixes = [
  "/dashboard",
  "/team",
  "/tools",
  "/admin",
  "/projects",
  "/my-reviews",
  "/onboarding",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSupabaseBrowserEnv()) {
    return response;
  }

  const supabase = createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const requiresAuth = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (requiresAuth && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(redirectUrl);
  }

  // Handles the exact root ("/", i.e. just the basePath). Without this,
  // app/page.tsx's own `redirect("/dashboard")` is the only thing that
  // sends a logged-in visitor onward, and it fires after an await —
  // Next.js then replays it client-side via an RSC flight-redirect digest
  // that omits the basePath, sending users to the parent domain's own
  // root instead of /teams/dashboard. Redirecting here first, with a
  // clone()'d NextURL, is basePath-correct and preempts that entirely.
  if (request.nextUrl.pathname === "/" && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
