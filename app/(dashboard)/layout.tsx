import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
