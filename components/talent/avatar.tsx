import { initials } from "@/lib/utils/talent";
import { cn } from "@/lib/utils/cn";

// A candidate's initials on a blue-violet tile, its angle set by the name so each person looks different.
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center font-mono font-medium text-white", large ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm")}
      style={{ background: `linear-gradient(${hash % 360}deg, #0b3fde, #7c8cff)` }}
    >
      {initials(name)}
    </span>
  );
}
