"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, LayoutDashboard, Percent, Tags, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { LogoutButton } from "@/components/logout-button";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/job-types", label: "Job types", icon: Tags },
  { href: "/workers", label: "Workers", icon: UsersRound },
  { href: "/jobs", label: "Jobs", icon: ClipboardList },
  { href: "/rates", label: "Rate & margin", icon: Percent },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Workforce
          </p>
          <p className="font-heading text-lg font-semibold">LocalPro</p>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/70",
                )}
              >
                <Icon className="size-4 opacity-80" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2">
          <LogoutButton />
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
