"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";

// The phone menu. It closes itself after a link is tapped (the page changes but this header stays
// on screen) and when anything outside it is tapped.
export function MobileNav({ admin }: { admin: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    function closeOnOutsideTap(event: PointerEvent) {
      const menu = ref.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutsideTap);
    return () => document.removeEventListener("pointerdown", closeOnOutsideTap);
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label="Open navigation"
        className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <Menu className="h-5 w-5" />
      </summary>
      <div className="absolute right-0 top-12 z-40 max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-card p-4 popover-shadow">
        <SidebarNav admin={admin} />
      </div>
    </details>
  );
}
