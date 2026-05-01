"use client";

import Link from "next/link";
import * as React from "react";
import {
  CalendarClock,
  Loader2,
  Pencil,
  Pause,
  Play,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

type SeriesRow = {
  id: string;
  client_id: string;
  worker_id: string;
  client_name?: string;
  worker_name?: string;
  job_type_id: string;
  job_type: string;
  time_start: string;
  time_end: string;
  notes: string;
  frequency: string;
  weekdays: number[];
  day_of_month: number | null;
  starts_on: string;
  ends_on: string | null;
  status: string;
  materialized_until: string | null;
  client_price: number | null;
  worker_pay: number | null;
};

type ClientOpt = { id: string; business_name: string };
type WorkerOpt = { id: string; full_name: string; status: string };
type JobTypeOpt = { id: string; slug: string; label: string; active: boolean };

function localDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "active") return "default";
  if (s === "paused") return "secondary";
  return "outline";
}

export default function RecurringBookingsView() {
  const [rows, setRows] = React.useState<SeriesRow[]>([]);
  const [clients, setClients] = React.useState<ClientOpt[]>([]);
  const [workers, setWorkers] = React.useState<WorkerOpt[]>([]);
  const [jobTypes, setJobTypes] = React.useState<JobTypeOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterStatus, setFilterStatus] = React.useState("__all__");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SeriesRow | null>(null);
  const [matOpen, setMatOpen] = React.useState(false);
  const [matSeriesId, setMatSeriesId] = React.useState<string | null>(null);
  const [matUntil, setMatUntil] = React.useState("");
  const [matBusy, setMatBusy] = React.useState(false);

  const [cBusy, setCBusy] = React.useState(false);
  const [eBusy, setEBusy] = React.useState(false);

  const [cClient, setCClient] = React.useState("");
  const [cWorker, setCWorker] = React.useState("");
  const [cJobType, setCJobType] = React.useState("");
  const [cTimeStart, setCTimeStart] = React.useState("09:00");
  const [cTimeEnd, setCTimeEnd] = React.useState("17:00");
  const [cFreq, setCFreq] = React.useState("weekly");
  const [cWeekdays, setCWeekdays] = React.useState<number[]>([1, 3, 5]);
  const [cDom, setCDom] = React.useState("1");
  const [cStarts, setCStarts] = React.useState(() => localDateInputValue(new Date()));
  const [cEnds, setCEnds] = React.useState("");
  const [cNotes, setCNotes] = React.useState("");
  const [cPrice, setCPrice] = React.useState("");
  const [cPay, setCPay] = React.useState("");
  const [cWeeks, setCWeeks] = React.useState("8");

  const [eClient, setEClient] = React.useState("");
  const [eWorker, setEWorker] = React.useState("");
  const [eJobType, setEJobType] = React.useState("");
  const [eTimeStart, setETimeStart] = React.useState("09:00");
  const [eTimeEnd, setETimeEnd] = React.useState("17:00");
  const [eFreq, setEFreq] = React.useState("weekly");
  const [eWeekdays, setEWeekdays] = React.useState<number[]>([]);
  const [eDom, setEDom] = React.useState("1");
  const [eStarts, setEStarts] = React.useState("");
  const [eEnds, setEEnds] = React.useState("");
  const [eNotes, setENotes] = React.useState("");
  const [ePrice, setEPrice] = React.useState("");
  const [ePay, setEPay] = React.useState("");
  const [eStatus, setEStatus] = React.useState("active");

  const selectableWorkers = React.useMemo(
    () => workers.filter((w) => w.status !== "inactive"),
    [workers],
  );

  const activeJobTypes = React.useMemo(() => jobTypes.filter((j) => j.active), [jobTypes]);

  async function reloadSeries() {
    const params = new URLSearchParams();
    if (filterStatus !== "__all__") params.set("status", filterStatus);
    const res = await fetch(`/api/recurring-series?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load series");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [cRes, wRes, jRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/workers"),
          fetch("/api/job-types"),
        ]);
        const cJson = await cRes.json();
        const wJson = await wRes.json();
        const jJson = await jRes.json();
        if (!cRes.ok) throw new Error(cJson.error || "Failed to load clients");
        if (!wRes.ok) throw new Error(wJson.error || "Failed to load workers");
        if (!jRes.ok) throw new Error(jJson.error || "Failed to load job types");
        if (!cancelled) {
          setJobTypes(
            jJson.map((j: { id: string; slug: string; label: string; active: boolean }) => ({
              id: j.id,
              slug: j.slug,
              label: j.label,
              active: j.active,
            })),
          );
          setClients(
            cJson.map((c: { id: string; business_name: string }) => ({
              id: c.id,
              business_name: c.business_name,
            })),
          );
          setWorkers(
            wJson.map((w: { id: string; full_name: string; status: string }) => ({
              id: w.id,
              full_name: w.full_name,
              status: w.status,
            })),
          );
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load lookups");
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        await reloadSeries();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load recurring series");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadSeries closes over filterStatus
  }, [filterStatus]);

  function toggleWeekday(list: number[], d: number): number[] {
    const set = new Set(list);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    return [...set].sort((a, b) => a - b);
  }

  function summarizeWeekdays(ws: number[]): string {
    if (!ws.length) return "—";
    return ws.map((i) => WEEKDAYS[i]).join(", ");
  }

  function openCreate() {
    setCClient(clients[0]?.id ?? "");
    setCWorker(selectableWorkers[0]?.id ?? "");
    setCJobType(activeJobTypes[0]?.id ?? "");
    setCTimeStart("09:00");
    setCTimeEnd("17:00");
    setCFreq("weekly");
    setCWeekdays([1, 3, 5]);
    setCDom("1");
    setCStarts(localDateInputValue(new Date()));
    setCEnds("");
    setCNotes("");
    setCPrice("");
    setCPay("");
    setCWeeks("8");
    setCreateOpen(true);
  }

  function openEdit(row: SeriesRow) {
    setEditing(row);
    setEClient(row.client_id);
    setEWorker(row.worker_id);
    setEJobType(row.job_type_id);
    setETimeStart(row.time_start);
    setETimeEnd(row.time_end);
    setEFreq(row.frequency);
    setEWeekdays([...row.weekdays]);
    setEDom(String(row.day_of_month ?? 1));
    setEStarts(row.starts_on);
    setEEnds(row.ends_on ?? "");
    setENotes(row.notes);
    setEPrice(row.client_price != null ? String(row.client_price) : "");
    setEPay(row.worker_pay != null ? String(row.worker_pay) : "");
    setEStatus(row.status);
    setEditOpen(true);
  }

  function openMat(id: string) {
    setMatSeriesId(id);
    const d = new Date();
    d.setDate(d.getDate() + 56);
    setMatUntil(localDateInputValue(d));
    setMatOpen(true);
  }

  async function submitCreate() {
    if (!cClient || !cWorker || !cJobType) {
      toast.error("Choose client, worker, and job type.");
      return;
    }
    if ((cFreq === "weekly" || cFreq === "biweekly") && cWeekdays.length === 0) {
      toast.error("Pick at least one weekday.");
      return;
    }

    setCBusy(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: cClient,
        worker_id: cWorker,
        job_type_id: cJobType,
        time_start: cTimeStart,
        time_end: cTimeEnd,
        frequency: cFreq,
        weekdays: cFreq === "monthly" ? [] : cWeekdays,
        starts_on: cStarts,
        notes: cNotes,
        status: "active",
      };
      if (cFreq === "monthly") payload.day_of_month = Number(cDom);
      if (cEnds.trim()) payload.ends_on = cEnds.trim();
      if (cPrice.trim()) payload.client_price = Number(cPrice);
      if (cPay.trim()) payload.worker_pay = Number(cPay);

      const weeks = Math.min(52, Math.max(1, Number(cWeeks) || 8));
      const res = await fetch(`/api/recurring-series?weeks=${weeks}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      const mat = data.materialize as { created: number; skipped: unknown[] } | null;
      toast.success(
        mat ? `Series saved — ${mat.created} job(s) generated.` : "Series saved.",
      );
      setCreateOpen(false);
      await reloadSeries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCBusy(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    if ((eFreq === "weekly" || eFreq === "biweekly") && eWeekdays.length === 0) {
      toast.error("Pick at least one weekday.");
      return;
    }

    setEBusy(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: eClient,
        worker_id: eWorker,
        job_type_id: eJobType,
        time_start: eTimeStart,
        time_end: eTimeEnd,
        frequency: eFreq,
        weekdays: eFreq === "monthly" ? [] : eWeekdays,
        starts_on: eStarts,
        notes: eNotes,
        status: eStatus,
      };
      if (eFreq === "monthly") payload.day_of_month = Number(eDom);
      else payload.day_of_month = null;
      payload.ends_on = eEnds.trim() ? eEnds.trim() : null;
      if (ePrice.trim()) payload.client_price = Number(ePrice);
      else payload.client_price = null;
      if (ePay.trim()) payload.worker_pay = Number(ePay);
      else payload.worker_pay = null;

      const res = await fetch(`/api/recurring-series/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success("Series updated");
      setEditOpen(false);
      setEditing(null);
      await reloadSeries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEBusy(false);
    }
  }

  async function submitMat() {
    if (!matSeriesId || !matUntil) return;
    setMatBusy(true);
    try {
      const res = await fetch(`/api/recurring-series/${matSeriesId}/materialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: matUntil }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate jobs");
      toast.success(`Created ${data.created as number} job(s).`);
      setMatOpen(false);
      setMatSeriesId(null);
      await reloadSeries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate jobs");
    } finally {
      setMatBusy(false);
    }
  }

  async function togglePause(row: SeriesRow) {
    const next = row.status === "paused" ? "active" : "paused";
    try {
      const res = await fetch(`/api/recurring-series/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success(next === "paused" ? "Paused" : "Resumed");
      await reloadSeries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function endSeries(row: SeriesRow) {
    if (!window.confirm("End this recurring series? Existing jobs stay on the calendar.")) return;
    try {
      const res = await fetch(`/api/recurring-series/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not end series");
      toast.success("Series ended");
      await reloadSeries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not end series");
    }
  }

  const jobTypesForEdit = React.useMemo(() => {
    if (!editing) return activeJobTypes;
    const cur = jobTypes.find((j) => j.id === editing.job_type_id);
    if (cur && !cur.active && !activeJobTypes.some((j) => j.id === cur.id)) {
      return [cur, ...activeJobTypes];
    }
    return activeJobTypes;
  }, [editing, jobTypes, activeJobTypes]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarClock className="size-6 opacity-80" />
            Recurring bookings
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Define repeating schedules and materialize real jobs on the calendar. Paused or ended
            series stop generating new visits.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New series
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(typeof v === "string" ? v : "__all__")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Who / what</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Jobs through</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No recurring series match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[220px]">
                    <div className="flex flex-col gap-0.5 text-sm">
                      <span className="font-medium truncate">{row.job_type}</span>
                      <span className="text-muted-foreground truncate">
                        {row.client_name ?? row.client_id}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {row.worker_name ?? row.worker_id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit font-normal">
                        {FREQ_LABEL[row.frequency] ?? row.frequency}
                      </Badge>
                      <span className="text-muted-foreground">
                        {row.frequency === "monthly"
                          ? `Day ${row.day_of_month ?? "—"}`
                          : summarizeWeekdays(row.weekdays)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {row.time_start}–{row.time_end}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {row.starts_on}
                    {row.ends_on ? ` → ${row.ends_on}` : " → …"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {row.materialized_until ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end flex-wrap gap-1">
                      <Link
                        href={`/jobs?recurring_series_id=${row.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                      >
                        Jobs
                      </Link>
                      {row.status === "active" ? (
                        <Button size="xs" variant="secondary" onClick={() => openMat(row.id)}>
                          <Wand2 className="size-3" />
                        </Button>
                      ) : null}
                      <Button size="xs" variant="ghost" onClick={() => togglePause(row)}>
                        {row.status === "paused" ? (
                          <Play className="size-3" />
                        ) : (
                          <Pause className="size-3" />
                        )}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => endSeries(row)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New recurring series</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select value={cClient} onValueChange={(v) => typeof v === "string" && setCClient(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Worker</Label>
              <Select value={cWorker} onValueChange={(v) => typeof v === "string" && setCWorker(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select worker" />
                </SelectTrigger>
                <SelectContent>
                  {selectableWorkers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Job type</Label>
              <Select value={cJobType} onValueChange={(v) => typeof v === "string" && setCJobType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Job type" />
                </SelectTrigger>
                <SelectContent>
                  {activeJobTypes.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="c_ts">Start time</Label>
                <Input id="c_ts" type="time" value={cTimeStart} onChange={(e) => setCTimeStart(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c_te">End time</Label>
                <Input id="c_te" type="time" value={cTimeEnd} onChange={(e) => setCTimeEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Repeat</Label>
              <Select value={cFreq} onValueChange={(v) => typeof v === "string" && setCFreq(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cFreq === "monthly" ? (
              <div className="grid gap-2">
                <Label htmlFor="c_dom">Day of month</Label>
                <Input
                  id="c_dom"
                  type="number"
                  min={1}
                  max={31}
                  value={cDom}
                  onChange={(e) => setCDom(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Weekdays</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((label, i) => (
                    <Button
                      key={label}
                      type="button"
                      size="xs"
                      variant={cWeekdays.includes(i) ? "default" : "outline"}
                      onClick={() => setCWeekdays((prev) => toggleWeekday(prev, i))}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="c_start">Starts on</Label>
                <Input id="c_start" type="date" value={cStarts} onChange={(e) => setCStarts(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c_end">Ends on (optional)</Label>
                <Input id="c_end" type="date" value={cEnds} onChange={(e) => setCEnds(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c_weeks">Generate jobs for next N weeks</Label>
              <Input id="c_weeks" type="number" min={1} max={52} value={cWeeks} onChange={(e) => setCWeeks(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="c_price">Client price (optional)</Label>
                <Input id="c_price" inputMode="decimal" value={cPrice} onChange={(e) => setCPrice(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c_pay">Worker pay (optional)</Label>
                <Input id="c_pay" inputMode="decimal" value={cPay} onChange={(e) => setCPay(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c_notes">Notes</Label>
              <Textarea id="c_notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={cBusy}>
              {cBusy ? <Loader2 className="animate-spin size-4" /> : null}
              Save & generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit recurring series</DialogTitle>
          </DialogHeader>
          {editing ? (
            <>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Client</Label>
                  <Select value={eClient} onValueChange={(v) => typeof v === "string" && setEClient(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.business_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Worker</Label>
                  <Select value={eWorker} onValueChange={(v) => typeof v === "string" && setEWorker(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.full_name}
                          {w.status === "inactive" ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Job type</Label>
                  <Select value={eJobType} onValueChange={(v) => typeof v === "string" && setEJobType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypesForEdit.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.label}
                          {!j.active ? " (inactive)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="e_ts">Start time</Label>
                    <Input id="e_ts" type="time" value={eTimeStart} onChange={(e) => setETimeStart(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="e_te">End time</Label>
                    <Input id="e_te" type="time" value={eTimeEnd} onChange={(e) => setETimeEnd(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Repeat</Label>
                  <Select value={eFreq} onValueChange={(v) => typeof v === "string" && setEFreq(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {eFreq === "monthly" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="e_dom">Day of month</Label>
                    <Input
                      id="e_dom"
                      type="number"
                      min={1}
                      max={31}
                      value={eDom}
                      onChange={(e) => setEDom(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label>Weekdays</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((label, i) => (
                        <Button
                          key={label}
                          type="button"
                          size="xs"
                          variant={eWeekdays.includes(i) ? "default" : "outline"}
                          onClick={() => setEWeekdays((prev) => toggleWeekday(prev, i))}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="e_start">Starts on</Label>
                    <Input id="e_start" type="date" value={eStarts} onChange={(e) => setEStarts(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="e_end">Ends on</Label>
                    <Input id="e_end" type="date" value={eEnds} onChange={(e) => setEEnds(e.target.value)} placeholder="Open-ended" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Series status</Label>
                  <Select value={eStatus} onValueChange={(v) => typeof v === "string" && setEStatus(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="ended">Ended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="e_price">Client price</Label>
                    <Input id="e_price" inputMode="decimal" value={ePrice} onChange={(e) => setEPrice(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="e_pay">Worker pay</Label>
                    <Input id="e_pay" inputMode="decimal" value={ePay} onChange={(e) => setEPay(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="e_notes">Notes</Label>
                  <Textarea id="e_notes" value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitEdit} disabled={eBusy}>
                  {eBusy ? <Loader2 className="animate-spin size-4" /> : null}
                  Save changes
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={matOpen}
        onOpenChange={(o) => {
          setMatOpen(o);
          if (!o) setMatSeriesId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate jobs through</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Creates scheduled jobs for this series from today up to the date you pick (skipping dates that
              already have a job).
            </p>
            <div className="grid gap-2">
              <Label htmlFor="mat_until">Until</Label>
              <Input id="mat_until" type="date" value={matUntil} onChange={(e) => setMatUntil(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitMat} disabled={matBusy || !matUntil}>
              {matBusy ? <Loader2 className="animate-spin size-4" /> : null}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
