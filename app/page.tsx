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
        <p className="mb-3 text-sm font-medium uppercase text-primary">
          Peer Reviews
        </p>
        <h1 className="text-5xl font-semibold tracking-tight">
          Recurring peer feedback for small project teams.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Create projects, assign full peer reviews, collect responses, send
          reminders, and read anonymous role-weighted reports.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
