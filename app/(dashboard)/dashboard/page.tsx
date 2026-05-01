import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardList,
  Receipt,
  Timer,
  TrendingUp,
  UsersRound,
  Wallet,
} from "lucide-react";
import { getDashboardStats } from "@/lib/dashboard-stats";
import { phpCurrencyFormatter } from "@/lib/currency-format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type StatTone = "default" | "accent" | "warn";

function DashboardStatCard(props: {
  title: string;
  description?: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
}) {
  const Icon = props.icon;
  const tone = props.tone ?? "default";

  return (
    <Card
      className={cn(
        "overflow-hidden shadow-none transition-colors",
        tone === "accent" && "border-primary/25 bg-primary/[0.03]",
        tone === "warn" && "border-destructive/35 bg-destructive/[0.04]",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
            {props.title}
          </CardTitle>
          {props.description ? (
            <CardDescription className="text-xs leading-snug">{props.description}</CardDescription>
          ) : null}
        </div>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/80 text-foreground [&_svg]:size-4",
            tone === "accent" && "border-primary/20 bg-primary/10 text-primary",
            tone === "warn" && "border-destructive/25 bg-destructive/10 text-destructive",
          )}
        >
          <Icon />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{props.value}</p>
      </CardContent>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
  );
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const jobsTodayHref = `/jobs?date=${encodeURIComponent(formatDateKey(today))}`;

  const incidentTone: StatTone = stats.open_incidents > 0 ? "warn" : "default";

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{dateLabel}</p>
          <p className="text-sm text-muted-foreground">
            Snapshot of today&apos;s operations, your roster, and billing health.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={jobsTodayHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <ClipboardList className="size-3.5 opacity-80" />
            Today&apos;s jobs
          </Link>
          <Link href="/attendance" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <Timer className="size-3.5 opacity-80" />
            Attendance
          </Link>
          <Link href="/incidents" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <AlertTriangle className="size-3.5 opacity-80" />
            Incidents
          </Link>
          <Link href="/invoices" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
            <Receipt className="size-3.5 opacity-80" />
            Invoices
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Today&apos;s operations</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DashboardStatCard
            title="Active jobs today"
            description="Assigned or in progress on today's calendar date."
            value={stats.active_jobs_today}
            icon={ClipboardList}
            tone="accent"
          />
          <DashboardStatCard
            title="Clocked in now"
            description="Attendance entries without a clock-out time."
            value={stats.clocked_in_now}
            icon={Timer}
          />
          <DashboardStatCard
            title="Open incidents"
            description="Status open or investigating — needs follow-up."
            value={stats.open_incidents}
            icon={AlertTriangle}
            tone={incidentTone}
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Team &amp; bookings</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DashboardStatCard
            title="Clients"
            description="Total client businesses on file."
            value={stats.total_clients}
            icon={Building2}
          />
          <DashboardStatCard
            title="Workers"
            description="All worker profiles (any status)."
            value={stats.total_workers}
            icon={UsersRound}
          />
          <DashboardStatCard
            title="Active recurring series"
            description="Recurring schedules still generating visits."
            value={stats.active_recurring_series}
            icon={CalendarClock}
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Billing</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <DashboardStatCard
            title="Outstanding receivable"
            description="Unpaid balance on sent and partial invoices."
            value={phpCurrencyFormatter.format(stats.outstanding_receivable)}
            icon={Wallet}
          />
          <DashboardStatCard
            title="Total revenue (paid)"
            description="Sum of client_price on jobs marked paid."
            value={phpCurrencyFormatter.format(stats.total_revenue)}
            icon={TrendingUp}
          />
        </div>
      </div>
    </div>
  );
}
