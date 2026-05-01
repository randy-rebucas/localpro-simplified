"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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

const KINDS = [
  "no_show",
  "late_arrival",
  "client_issue",
  "worker_issue",
  "safety",
  "property_damage",
  "other",
] as const;

const STATUSES = ["open", "investigating", "resolved", "dismissed"] as const;

type IncidentKind = (typeof KINDS)[number];
type IncidentStatus = (typeof STATUSES)[number];

const KIND_LABEL: Record<IncidentKind, string> = {
  no_show: "No-show",
  late_arrival: "Late arrival",
  client_issue: "Client issue",
  worker_issue: "Worker conduct",
  safety: "Safety",
  property_damage: "Property / damage",
  other: "Other",
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

type WorkerOpt = { id: string; full_name: string; status: string };
type ClientOpt = { id: string; business_name: string };

type JobOpt = {
  id: string;
  date: string;
  client_name?: string;
  job_type: string;
  time_start: string;
  time_end: string;
};

type IncidentRow = {
  id: string;
  kind: IncidentKind;
  severity: string;
  title: string;
  description: string;
  occurred_at: string;
  status: IncidentStatus;
  resolution_notes: string;
  worker_id: string | null;
  worker_name: string | null;
  client_id: string | null;
  client_name: string | null;
  job_id: string | null;
  job_label: string | null;
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : toDatetimeLocalValue(d);
}

function formatOccurred(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function localDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function severityVariant(s: string): "outline" | "secondary" | "destructive" {
  if (s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

function statusVariant(s: IncidentStatus): "default" | "secondary" | "outline" {
  if (s === "open") return "default";
  if (s === "investigating") return "secondary";
  return "outline";
}

export default function IncidentsView() {
  const [workers, setWorkers] = React.useState<WorkerOpt[]>([]);
  const [clients, setClients] = React.useState<ClientOpt[]>([]);
  const [rows, setRows] = React.useState<IncidentRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [filterDate, setFilterDate] = React.useState(() => localDateInputValue(new Date()));
  const [filterWorker, setFilterWorker] = React.useState("__all__");
  const [filterKind, setFilterKind] = React.useState("__all__");
  const [filterStatus, setFilterStatus] = React.useState("__all__");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [cKind, setCKind] = React.useState<IncidentKind>("no_show");
  const [cSeverity, setCSeverity] = React.useState("medium");
  const [cTitle, setCTitle] = React.useState("");
  const [cDesc, setCDesc] = React.useState("");
  const [cOccurred, setCOccurred] = React.useState(() => toDatetimeLocalValue(new Date()));
  const [cWorker, setCWorker] = React.useState("__none__");
  const [cClient, setCClient] = React.useState("__none__");
  const [cJob, setCJob] = React.useState("__none__");
  const [cBusy, setCBusy] = React.useState(false);
  const [workerDayJobs, setWorkerDayJobs] = React.useState<JobOpt[]>([]);
  const [jobsLoading, setJobsLoading] = React.useState(false);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<IncidentRow | null>(null);
  const [eTitle, setETitle] = React.useState("");
  const [eDesc, setEDesc] = React.useState("");
  const [eKind, setEKind] = React.useState<IncidentKind>("other");
  const [eSeverity, setESeverity] = React.useState("medium");
  const [eStatus, setEStatus] = React.useState<IncidentStatus>("open");
  const [eOccurred, setEOccurred] = React.useState("");
  const [eResolution, setEResolution] = React.useState("");
  const [eBusy, setEBusy] = React.useState(false);

  const occurredDayPrefix = React.useMemo(() => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(cOccurred);
    return m ? m[1] : "";
  }, [cOccurred]);

  const cWorkerValue = cWorker === "__none__" ? "" : cWorker;

  async function reloadIncidents() {
    const params = new URLSearchParams();
    if (filterDate.trim()) params.set("date", filterDate.trim());
    if (filterWorker !== "__all__") params.set("worker_id", filterWorker);
    if (filterKind !== "__all__") params.set("kind", filterKind);
    if (filterStatus !== "__all__") params.set("status", filterStatus);
    const res = await fetch(`/api/incidents?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load incidents");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [wRes, cRes] = await Promise.all([fetch("/api/workers"), fetch("/api/clients")]);
        const wJson = await wRes.json();
        const cJson = await cRes.json();
        if (!wRes.ok) throw new Error(wJson.error || "Failed to load workers");
        if (!cRes.ok) throw new Error(cJson.error || "Failed to load clients");
        if (!cancelled) {
          setWorkers(wJson.map((w: WorkerOpt) => ({ ...w })));
          setClients(cJson.map((c: ClientOpt) => ({ ...c })));
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
        await reloadIncidents();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load incidents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload uses filters
  }, [filterDate, filterWorker, filterKind, filterStatus]);

  React.useEffect(() => {
    if (!createOpen || !cWorkerValue || !occurredDayPrefix || cJob !== "__none__") {
      return;
    }
    let cancelled = false;
    async function loadJobs() {
      setJobsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("worker_id", cWorkerValue);
        params.set("date", occurredDayPrefix);
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
  }, [createOpen, cWorkerValue, occurredDayPrefix, cJob]);

  function openCreate() {
    setCKind("no_show");
    setCSeverity("medium");
    setCTitle("");
    setCDesc("");
    setCOccurred(toDatetimeLocalValue(new Date()));
    setCWorker("__none__");
    setCClient("__none__");
    setCJob("__none__");
    setWorkerDayJobs([]);
    setCreateOpen(true);
  }

  function openEdit(row: IncidentRow) {
    setEditing(row);
    setETitle(row.title);
    setEDesc(row.description);
    setEKind(row.kind);
    setESeverity(row.severity);
    setEStatus(row.status);
    setEOccurred(isoToDatetimeLocal(row.occurred_at));
    setEResolution(row.resolution_notes);
    setEditOpen(true);
  }

  async function submitCreate() {
    const linksJob = cJob !== "__none__";
    const hasWorker = cWorker !== "__none__";
    const hasClient = cClient !== "__none__";

    if (!linksJob && !hasWorker && !hasClient) {
      toast.error("Link a scheduled job, or choose at least one worker or client.");
      return;
    }
    if ((cKind === "no_show" || cKind === "late_arrival") && !linksJob && !hasWorker) {
      toast.error("No-show and late arrival need a worker or a linked job.");
      return;
    }

    setCBusy(true);
    try {
      const payload: Record<string, unknown> = {
        kind: cKind,
        severity: cSeverity,
        title: cTitle.trim(),
        description: cDesc,
        occurred_at: new Date(cOccurred).toISOString(),
      };
      if (linksJob) payload.job_id = cJob;
      else {
        if (hasWorker) payload.worker_id = cWorker;
        if (hasClient) payload.client_id = cClient;
      }

      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      toast.success("Incident logged");
      setCreateOpen(false);
      await reloadIncidents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCBusy(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setEBusy(true);
    try {
      const res = await fetch(`/api/incidents/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eTitle.trim(),
          description: eDesc,
          kind: eKind,
          severity: eSeverity,
          status: eStatus,
          occurred_at: new Date(eOccurred).toISOString(),
          resolution_notes: eResolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success("Incident updated");
      setEditOpen(false);
      setEditing(null);
      await reloadIncidents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEBusy(false);
    }
  }

  async function removeRow(row: IncidentRow) {
    if (!confirm("Delete this incident record?")) return;
    try {
      const res = await fetch(`/api/incidents/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Deleted");
      await reloadIncidents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground">
            Track no-shows and other workforce incidents. Link a scheduled job to capture worker and client
            automatically.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus />
          Log incident
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="inc_f_date">Occurred on</Label>
          <Input
            id="inc_f_date"
            type="date"
            value={filterDate}
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
            <SelectTrigger className="lg:w-52">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All workers</SelectItem>
              {workers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Type</Label>
          <Select value={filterKind} onValueChange={(v) => setFilterKind(typeof v === "string" ? v : "__all__")}>
            <SelectTrigger className="lg:w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(typeof v === "string" ? v : "__all__")}>
            <SelectTrigger className="lg:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setFilterDate(localDateInputValue(new Date()));
            setFilterWorker("__all__");
            setFilterKind("__all__");
            setFilterStatus("__all__");
          }}
        >
          Clear filters
        </Button>
        <Button
          variant="secondary"
          onClick={() => setFilterDate(localDateInputValue(new Date()))}
          type="button"
        >
          Today
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Occurred</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Who / where</TableHead>
              <TableHead>Status</TableHead>
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
                  No incidents match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatOccurred(row.occurred_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {KIND_LABEL[row.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] font-medium truncate">{row.title}</TableCell>
                  <TableCell className="max-w-[240px] text-sm text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      {row.worker_name ? <span>Worker: {row.worker_name}</span> : null}
                      {row.client_name ? <span>Client: {row.client_name}</span> : null}
                      {row.job_label ? <span className="truncate">Job: {row.job_label}</span> : null}
                      {!row.worker_name && !row.client_name && !row.job_label ? <span>—</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => removeRow(row)}>
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

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setWorkerDayJobs([]);
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 opacity-80" />
              Log incident
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={cKind}
                  onValueChange={(v) => typeof v === "string" && setCKind(v as IncidentKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select value={cSeverity} onValueChange={(v) => typeof v === "string" && setCSeverity(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c_title">Title</Label>
              <Input id="c_title" value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="Short summary" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c_desc">Details</Label>
              <Textarea id="c_desc" value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={3} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c_when">When it happened</Label>
              <Input
                id="c_when"
                type="datetime-local"
                value={cOccurred}
                onChange={(e) => setCOccurred(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Scheduled job (optional)</Label>
              <Select
                value={cJob}
                onValueChange={(v) => typeof v === "string" && setCJob(v)}
                disabled={cWorker === "__none__" || !occurredDayPrefix || jobsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      cWorker === "__none__"
                        ? "Pick a worker first"
                        : jobsLoading
                          ? "Loading jobs…"
                          : "None"
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
              <p className="text-xs text-muted-foreground">
                When set, worker and client come from the job. Otherwise pick worker and/or client below.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Worker</Label>
                <Select
                  value={cWorker}
                  onValueChange={(v) => typeof v === "string" && setCWorker(v)}
                  disabled={cJob !== "__none__"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Client</Label>
                <Select
                  value={cClient}
                  onValueChange={(v) => typeof v === "string" && setCClient(v)}
                  disabled={cJob !== "__none__"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={cBusy || !cTitle.trim()}>
              {cBusy ? <Loader2 className="animate-spin size-4" /> : null}
              Save
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update incident</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={eKind}
                  onValueChange={(v) => typeof v === "string" && setEKind(v as IncidentKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select value={eSeverity} onValueChange={(v) => typeof v === "string" && setESeverity(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={eStatus}
                onValueChange={(v) => typeof v === "string" && setEStatus(v as IncidentStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e_title">Title</Label>
              <Input id="e_title" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e_desc">Details</Label>
              <Textarea id="e_desc" value={eDesc} onChange={(e) => setEDesc(e.target.value)} rows={3} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e_when">When it happened</Label>
              <Input id="e_when" type="datetime-local" value={eOccurred} onChange={(e) => setEOccurred(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e_res">Resolution notes</Label>
              <Textarea id="e_res" value={eResolution} onChange={(e) => setEResolution(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={eBusy || !eTitle.trim()}>
              {eBusy ? <Loader2 className="animate-spin size-4" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
