import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseBrowserEnv } from "@/lib/utils/env";

export default async function Home() {
  if (hasSupabaseBrowserEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-2xl text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-primary">
          Internal BuildableLabs platform
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Unified BuildableLabs Toolkit
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
          One authenticated workspace for peer reviews, LinkedIn assessments, HR guidance,
          reports, and future internal tools.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-8 text-base font-semibold">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
