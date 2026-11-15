import { ApplyBackdrop } from "@/components/talent/apply-backdrop";

// The application link when it's switched off or replaced.
export function ApplyClosed() {
  return (
    <main className="relative grid min-h-dvh place-items-center px-6 text-[#f5f6f8]">
      <ApplyBackdrop />
      <div className="relative max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#275bff]">BuildableLabs · Talent intake</p>
        <h1 className="mt-6 font-serif text-4xl italic leading-tight sm:text-5xl">The intake is resting.</h1>
        <p className="mt-4 text-[#9aa1b2]">We aren&apos;t taking applications through this link right now. If someone at BuildableLabs sent it to you, ask them for a fresh one.</p>
      </div>
    </main>
  );
}
