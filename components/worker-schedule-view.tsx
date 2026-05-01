"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatJobDay } from "@/lib/job-date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ScheduleJob = {
  id: string;
  client_name: string | null;
  job_type: string;
  time_start: string;
  time_end: string;
  status: string;
};

type ScheduleDay = {
  date: string;
  availability: "available" | "booked";
  jobs: ScheduleJob[];
};

type WorkerOpt = { id: string; full_name: string; status: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkerScheduleView() {
  const [workers, setWorkers] = React.useState<WorkerOpt[]>([]);
  const [workerId, setWorkerId] = React.useState("");
  const [cursor, setCursor] = React.useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1, 12, 0, 0, 0);
  });
  const [days, setDays] = React.useState<ScheduleDay[]>([]);
  const [workerMeta, setWorkerMeta] = React.useState<{ full_name: string; status: string } | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const rangeFrom = formatJobDay(new Date(year, month, 1, 12, 0, 0, 0));
  const rangeTo = formatJobDay(new Date(year, month + 1, 0, 12, 0, 0, 0));

  React.useEffect(() => {
    let cancelled = false;
    async function loadWorkers() {
      try {
        const res = await fetch("/api/workers");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load workers");
        if (cancelled) return;
        const list = data.map((w: { id: string; full_name: string; status: string }) => ({
          id: w.id,
          full_name: w.full_name,
          status: w.status,
        }));
        setWorkers(list);
        setWorkerId((prev) => {
          if (prev && list.some((x: WorkerOpt) => x.id === prev)) return prev;
          const firstActive = list.find((x: WorkerOpt) => x.status !== "inactive");
          return firstActive?.id ?? list[0]?.id ?? "";
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load workers");
      }
    }
    loadWorkers();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    async function loadSchedule() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
        const res = await fetch(`/api/workers/${workerId}/schedule?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load schedule");
        if (cancelled) return;
        setDays(data.days ?? []);
        setWorkerMeta(data.worker ?? null);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load schedule");
          setDays([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSchedule();
    return () => {
      cancelled = true;
    };
  }, [workerId, rangeFrom, rangeTo]);

  const dayMap = React.useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const firstWeekday = new Date(year, month, 1, 12, 0, 0, 0).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
  const todayStr = formatJobDay(new Date());

  const bookedCount = days.filter((d) => d.availability === "booked").length;
  const availableCount = days.filter((d) => d.availability === "available").length;

  function prevMonth() {
    setCursor(new Date(year, month - 1, 1, 12, 0, 0, 0));
  }
  function nextMonth() {
    setCursor(new Date(year, month + 1, 1, 12, 0, 0, 0));
  }

  const gridCells: ({ kind: "pad" } | { kind: "day"; dom: number })[] = [
    ...Array.from({ length: firstWeekday }, () => ({ kind: "pad" as const })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ kind: "day" as const, dom: i + 1 })),
  ];

  const bookedDetail = days.filter((d) => d.availability === "booked");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="size-7 opacity-80" />
            Worker availability
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Month view of scheduled jobs per worker. Days with at least one non-cancelled job show as{" "}
            <strong>booked</strong>; open days are <strong>available</strong>. Click a day to open
            Jobs filtered for that worker and date.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label>Worker</Label>
          <Select
            value={workerId || "__none__"}
            onValueChange={(v) => typeof v === "string" && v !== "__none__" && setWorkerId(v)}
          >
            <SelectTrigger className="w-[min(100vw-2rem,280px)]">
              <SelectValue placeholder="Select worker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" disabled>
                Select worker
              </SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.full_name || w.id}
                  {w.status === "inactive" ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={prevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[10rem] px-2 text-center text-sm font-medium tabular-nums">
            {monthLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={nextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {workerMeta?.status === "inactive" ? (
        <p className="text-sm text-amber-700 dark:text-amber-500">
          This worker is inactive; the calendar still shows their bookings in this range.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs">
        <Badge variant="outline" className="border-emerald-600/40 bg-emerald-500/10 font-normal">
          Available (no active jobs)
        </Badge>
        <Badge variant="outline" className="border-amber-600/45 bg-amber-500/15 font-normal">
          Booked (scheduled work)
        </Badge>
        <span className="text-muted-foreground">
          {loading ? "Loading…" : `${bookedCount} booked · ${availableCount} available · ${days.length} days`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground sm:gap-2 sm:text-sm">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
          {gridCells.map((cell, idx) => {
            if (cell.kind === "pad") {
              return <div key={`pad-${idx}`} className="min-h-[72px] sm:min-h-[88px]" />;
            }
            const dom = cell.dom;
            const dateStr = formatJobDay(new Date(year, month, dom, 12, 0, 0, 0));
            const row = dayMap.get(dateStr);
            const booked = row?.availability === "booked";
            const isToday = dateStr === todayStr;

            const inner = (
              <div
                className={cn(
                  "flex h-full min-h-[72px] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[88px] sm:p-2",
                  booked
                    ? "border-amber-600/45 bg-amber-500/15"
                    : "border-emerald-700/30 bg-emerald-500/10 dark:border-emerald-500/35",
                  isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
              >
                <span className="text-sm font-semibold tabular-nums text-foreground">{dom}</span>
                {booked ? (
                  <>
                    <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-950/80 dark:text-amber-100/90">
                      Booked
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground sm:text-xs">
                      {row!.jobs.length} job{row!.jobs.length === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-emerald-900/80 dark:text-emerald-100/80">
                    Available
                  </span>
                )}
              </div>
            );

            if (!workerId) {
              return (
                <div key={dateStr} className="opacity-60">
                  {inner}
                </div>
              );
            }

            return (
              <Link
                key={dateStr}
                href={`/jobs?worker_id=${encodeURIComponent(workerId)}&date=${encodeURIComponent(dateStr)}`}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4">
        <h2 className="mb-2 text-sm font-medium">This month — booked visits</h2>
        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm text-muted-foreground">
          {bookedDetail.length === 0 ? (
            <li>No booked days in this month.</li>
          ) : (
            bookedDetail.map((d) => (
              <li key={d.date}>
                <span className="font-medium text-foreground">{d.date}</span>
                {" — "}
                {d.jobs.map((j) => (
                  <span key={j.id} className="mr-2 inline-block">
                    {j.time_start}–{j.time_end}
                    {j.client_name ? ` · ${j.client_name}` : ""}
                    {j.job_type ? ` (${j.job_type})` : ""}
                  </span>
                ))}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
