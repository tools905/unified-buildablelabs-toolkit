import { AppShell } from "@/components/dashboard/app-shell";

// The sidebar and header live here, so they stay on screen while the page inside changes.
export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
