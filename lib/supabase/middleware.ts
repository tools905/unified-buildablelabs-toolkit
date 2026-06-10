import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseBrowserEnv } from "@/lib/utils/env";

const protectedPrefixes = [
  "/dashboard",
  "/team",
  "/projects",
  "/my-reviews",
  "/onboarding",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSupabaseBrowserEnv()) {
    return response;
  }

  const requiresAuth = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!requiresAuth) {
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
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(redirectUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  if (user.email) {
    requestHeaders.set("x-user-email", user.email);
  }
  if (user.user_metadata?.full_name) {
    requestHeaders.set(
      "x-user-full-name",
      encodeURIComponent(user.user_metadata.full_name),
    );
  }

  const newResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.forEach((value, key) => {
    newResponse.headers.append(key, value);
  });

  return newResponse;
}
