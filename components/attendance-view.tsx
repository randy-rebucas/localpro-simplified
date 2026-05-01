"use client";

import * as React from "react";
import { Loader2, LogIn, LogOut, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type WorkerOpt = { id: string; full_name: string; status: string };

type JobOpt = {
  id: string;
  date: string;
  client_name?: string;
  job_type: string;
  time_start: string;
  time_end: string;
};

type AttendanceRow = {
  id: string;
  worker_id: string;
  worker_name: string;
  job_id: string | null;
  job_label: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  duration_minutes: number | null;
  is_open: boolean;
  notes: string;
};

function localDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationMinutes(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min.toString().padStart(2, "0")}m`;
}

export default function AttendanceView() {
  const [workers, setWorkers] = React.useState<WorkerOpt[]>([]);
  const [rows, setRows] = React.useState<AttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterDate, setFilterDate] = React.useState(() => localDateInputValue(new Date()));
  const [filterWorker, setFilterWorker] = React.useState("__all__");
  const [showOpenOnly, setShowOpenOnly] = React.useState(false);

  const [clockOpen, setClockOpen] = React.useState(false);
  const [cinWorkerId, setCinWorkerId] = React.useState("");
  const [cinJobId, setCinJobId] = React.useState("__none__");
  const [cinNotes, setCinNotes] = React.useState("");
  const [cinBusy, setCinBusy] = React.useState(false);
  const [workerDayJobs, setWorkerDayJobs] = React.useState<JobOpt[]>([]);
  const [jobsLoading, setJobsLoading] = React.useState(false);

  const rosterWorkers = React.useMemo(() => workers.filter((w) => w.status !== "inactive"), [workers]);

  const cinWorkerValue = cinWorkerId || rosterWorkers[0]?.id || "";

  async function reloadEntries() {
    const params = new URLSearchParams();
    if (showOpenOnly) {
      params.set("open_only", "1");
    } else {
      params.set("date", filterDate);
    }
    if (filterWorker !== "__all__") params.set("worker_id", filterWorker);
    const res = await fetch(`/api/attendance?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load attendance");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const wRes = await fetch("/api/workers");
        const wJson = await wRes.json();
        if (!wRes.ok) throw new Error(wJson.error || "Failed to load workers");
        if (!cancelled) {
          const list = wJson.map((w: { id: string; full_name: string; status: string }) => ({
            id: w.id,
            full_name: w.full_name,
            status: w.status,
          }));
          setWorkers(list);
          setCinWorkerId((prev) => prev || list.find((x: WorkerOpt) => x.status !== "inactive")?.id || "");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load workers");
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
        await reloadEntries();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load attendance");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadEntries uses filters
  }, [filterDate, filterWorker, showOpenOnly]);

  React.useEffect(() => {
    if (!clockOpen || !cinWorkerValue || showOpenOnly) {
      return;
    }
    let cancelled = false;
    async function loadJobs() {
      setJobsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("worker_id", cinWorkerValue);
        params.set("date", filterDate);
        const res = await fetch(`/api/jobs?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load jobs");
        if (!cancelled) {
          setWorkerDayJobs(
            data.map(
              (j: {
                id: string;
                date: string;
                client_name?: string;
                job_type: string;
                time_start: string;
                time_end: string;
              }) => ({
                id: j.id,
                date: j.date,
                client_name: j.client_name,
                job_type: j.job_type,
                time_start: j.time_start,
                time_end: j.time_end,
              }),
            ),
          );
          setCinJobId("__none__");
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    }
    loadJobs();
    return () => {
      cancelled = true;
    };
  }, [clockOpen, cinWorkerValue, filterDate, showOpenOnly]);

  async function submitClockIn() {
    if (!cinWorkerValue) {
      toast.error("Select a worker");
      return;
    }
    setCinBusy(true);
    try {
      const payload: Record<string, unknown> = {
        worker_id: cinWorkerValue,
        notes: cinNotes,
      };
      if (cinJobId !== "__none__") payload.job_id = cinJobId;
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clock-in failed");
      toast.success(`${data.worker_name || "Worker"} clocked in`);
      setClockOpen(false);
      setCinNotes("");
      setCinJobId("__none__");
      await reloadEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clock-in failed");
    } finally {
      setCinBusy(false);
    }
  }

  async function clockOut(row: AttendanceRow) {
    try {
      const res = await fetch(`/api/attendance/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clock_out: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clock-out failed");
      toast.success("Clocked out");
      await reloadEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clock-out failed");
    }
  }

  async function removeEntry(row: AttendanceRow) {
    if (!confirm("Delete this attendance row?")) return;
    try {
      const res = await fetch(`/api/attendance/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Deleted");
      await reloadEntries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Clock workers in and out. Optionally tie a punch to a scheduled job for the same day.
          </p>
        </div>
        <Button
          onClick={() => {
            setWorkerDayJobs([]);
            setCinJobId("__none__");
            setClockOpen(true);
          }}
          disabled={rosterWorkers.length === 0}
          className="shrink-0"
        >
          <Plus />
          Clock in
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="att_date" className={showOpenOnly ? "text-muted-foreground" : undefined}>
            Date
          </Label>
          <Input
            id="att_date"
            type="date"
            value={filterDate}
            disabled={showOpenOnly}
            onChange={(e) => setFilterDate(e.target.value)}
            className="lg:w-44"
          />
        </div>
        <div className="grid gap-2">
          <Label>Worker</Label>
          <Select
            value={filterWorker}
            onValueChange={(v) => setFilterWorker(typeof v === "string" ? v : "__all__")}
          >
            <SelectTrigger className="lg:w-56">
              <SelectValue placeholder="All workers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All workers</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.full_name}
                  {w.status === "inactive" ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            id="att_open"
            className="size-4 rounded border-input accent-primary"
            checked={showOpenOnly}
            onChange={(e) => {
              const v = e.target.checked;
              setShowOpenOnly(v);
              if (v) setWorkerDayJobs([]);
            }}
          />
          <Label htmlFor="att_open" className="font-normal cursor-pointer">
            Open punches only (any day)
          </Label>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setFilterDate(localDateInputValue(new Date()));
            setFilterWorker("__all__");
            setShowOpenOnly(false);
          }}
        >
          Reset filters
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead>Linked job</TableHead>
              <TableHead>Clock in</TableHead>
              <TableHead>Clock out</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="min-w-[140px] text-right">Actions</TableHead>
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
                  No attendance rows for this view.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.worker_name || row.worker_id}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                    {row.job_label ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {formatDateTime(row.clock_in_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {row.clock_out_at ? formatDateTime(row.clock_out_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatDurationMinutes(row.duration_minutes)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_open ? "default" : "secondary"}>
                      {row.is_open ? "Open" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.is_open ? (
                        <Button size="xs" variant="secondary" onClick={() => clockOut(row)}>
                          <LogOut className="size-3" />
                          Out
                        </Button>
                      ) : null}
                      <Button size="xs" variant="ghost" onClick={() => removeEntry(row)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={clockOpen}
        onOpenChange={(o) => {
          setClockOpen(o);
          if (!o) setWorkerDayJobs([]);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="size-4 opacity-80" />
              Clock in
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Worker</Label>
              <Select
                value={cinWorkerValue}
                onValueChange={(v) => typeof v === "string" && setCinWorkerId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select worker" />
                </SelectTrigger>
                <SelectContent>
                  {rosterWorkers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!showOpenOnly ? (
              <div className="grid gap-2">
                <Label>Job (optional)</Label>
                <Select
                  value={cinJobId}
                  onValueChange={(v) => typeof v === "string" && setCinJobId(v)}
                  disabled={jobsLoading || workerDayJobs.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        jobsLoading ? "Loading jobs…" : workerDayJobs.length === 0 ? "No jobs this day" : "None"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {workerDayJobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.job_type}
                        {j.client_name ? ` · ${j.client_name}` : ""} ({j.time_start}–{j.time_end})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {jobsLoading ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Loading jobs for {filterDate}…
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Turn off &quot;Open punches only&quot; to pick a calendar date and optionally link today&apos;s job.
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="cin_notes">Notes</Label>
              <Textarea id="cin_notes" value={cinNotes} onChange={(e) => setCinNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClockOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitClockIn} disabled={cinBusy || !cinWorkerValue}>
              {cinBusy ? <Loader2 className="animate-spin size-4" /> : null}
              Confirm clock-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
