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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background glowing blob */}
      <div className="glow-glow" />

      <section className="relative z-10 max-w-2xl text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Peer-Review Platform for BuildableLabs
        </p>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Recurring peer feedback for small project teams.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
          Create projects, assign full peer reviews, collect responses, send
          reminders, and read anonymous role-weighted reports.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-8 text-base font-semibold bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/25 transition-all duration-300">
            <Link href="/login">Get Started</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
