"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { phpCurrencyFormatter } from "@/lib/currency-format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OverviewResponse = {
  client: { id: string; business_name: string };
  assigned_workers: {
    id: string;
    display_name: string;
    skill: string;
    jobs_count: number;
    last_booking_date: string | null;
    rated_by_clients_avg: number | null;
    status: string;
  }[];
  attendance: {
    id: string;
    worker_name: string;
    job_label: string | null;
    clock_in_at: string;
    clock_out_at: string | null;
    duration_minutes: number | null;
    is_open: boolean;
    notes: string;
  }[];
  billing: {
    invoices: {
      id: string;
      invoice_number: string;
      status: string;
      issue_date: string;
      amount_total: number;
      amount_paid: number;
      balance: number;
    }[];
    summary: {
      invoice_count: number;
      total_invoiced: number;
      total_paid: number;
      total_balance: number;
    };
  };
};

function fmtShort(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function invoiceStatusVariant(s: string) {
  if (s === "paid") return "default" as const;
  if (s === "draft") return "secondary" as const;
  if (s === "void") return "outline" as const;
  return "outline" as const;
}

export default function PortalDashboardView() {
  const router = useRouter();
  const [data, setData] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/portal/overview");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/portal/login");
            return;
          }
          throw new Error(typeof json.error === "string" ? json.error : "Failed to load portal");
        }
        if (!cancelled) setData(json as OverviewResponse);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading your dashboard…</p>;
  }

  if (!data) {
    return <p className="text-sm text-destructive">Could not load dashboard. Try signing in again.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{data.client.business_name}</h1>
        <p className="text-sm text-muted-foreground">Workers assigned to your jobs, recent visits, and invoices.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assigned workers</CardTitle>
          <CardDescription>
            People who have worked your bookings (excluding cancelled jobs).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right tabular-nums">Bookings</TableHead>
                <TableHead>Last date</TableHead>
                <TableHead className="whitespace-nowrap">Rating</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assigned_workers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No workers on record yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.assigned_workers.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.display_name}</TableCell>
                    <TableCell>{w.skill}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.jobs_count}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {w.last_booking_date ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {w.rated_by_clients_avg != null ? (
                        <>
                          ★{w.rated_by_clients_avg}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{w.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attendance logs</CardTitle>
          <CardDescription>
            Clock-in/out tied to scheduled jobs at your locations (most recent first).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.attendance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No attendance entries linked to your jobs yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.attendance.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.worker_name || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">
                      {a.job_label ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtShort(a.clock_in_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {a.clock_out_at ? fmtShort(a.clock_out_at) : (
                        <Badge variant="secondary">Open</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {a.duration_minutes != null ? `${a.duration_minutes} min` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Billing summary</CardTitle>
          <CardDescription>Totals across non-void invoices issued to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Invoiced
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold">
                {phpCurrencyFormatter.format(data.billing.summary.total_invoiced)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Paid
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold">
                {phpCurrencyFormatter.format(data.billing.summary.total_paid)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Outstanding
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold">
                {phpCurrencyFormatter.format(data.billing.summary.total_balance)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.billing.invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No invoices yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.billing.invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>
                        <Badge variant={invoiceStatusVariant(inv.status)}>{inv.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {inv.issue_date.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {phpCurrencyFormatter.format(inv.amount_total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {phpCurrencyFormatter.format(inv.amount_paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {phpCurrencyFormatter.format(inv.balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
