import type { ReactNode } from "react";

// Shared frame for the public newsletter pages readers reach from an email (confirm,
// unsubscribe). They sit outside the toolkit's app shell and need no login.
export function SubscriptionPage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <p className="font-serif text-2xl text-foreground">Buildable Labs</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
