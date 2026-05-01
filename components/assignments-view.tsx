"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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

type AssignmentRow = {
  id: string;
  client_id: string;
  worker_id: string;
  client_name?: string;
  worker_name?: string;
  date: string;
  job_type: string;
  time_start: string;
  time_end: string;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  payment_status: "pending" | "paid";
  notes: string;
  client_price: number | null;
  worker_pay: number | null;
  profit: number | null;
};

type ClientOpt = { id: string; business_name: string };
type WorkerOpt = { id: string; full_name: string; status: string };

const jobStatuses: AssignmentRow["status"][] = [
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
];

const paymentStatuses: AssignmentRow["payment_status"][] = ["pending", "paid"];

function jobStatusVariant(s: AssignmentRow["status"]) {
  if (s === "completed") return "secondary" as const;
  if (s === "cancelled") return "outline" as const;
  if (s === "in_progress") return "default" as const;
  return "secondary" as const;
}

export default function AssignmentsView() {
  const [rows, setRows] = React.useState<AssignmentRow[]>([]);
  const [clients, setClients] = React.useState<ClientOpt[]>([]);
  const [workers, setWorkers] = React.useState<WorkerOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterDate, setFilterDate] = React.useState("");
  const [filterClient, setFilterClient] = React.useState("__all__");
  const [filterWorker, setFilterWorker] = React.useState("__all__");

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AssignmentRow | null>(null);

  const [form, setForm] = React.useState({
    client_id: "",
    worker_id: "",
    date: "",
    job_type: "cleaning",
    time_start: "09:00",
    time_end: "17:00",
    status: "assigned" as AssignmentRow["status"],
    payment_status: "pending" as AssignmentRow["payment_status"],
    notes: "",
    client_price: "" as string,
    worker_pay: "" as string,
  });

  const selectableWorkers = React.useMemo(
    () => workers.filter((w) => w.status !== "inactive"),
    [workers],
  );

  async function reloadAssignments() {
    const params = new URLSearchParams();
    if (filterDate) params.set("date", filterDate);
    if (filterClient !== "__all__") params.set("client_id", filterClient);
    if (filterWorker !== "__all__") params.set("worker_id", filterWorker);
    const res = await fetch(`/api/assignments?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load assignments");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [cRes, wRes] = await Promise.all([fetch("/api/clients"), fetch("/api/workers")]);
        const cJson = await cRes.json();
        const wJson = await wRes.json();
        if (!cRes.ok) throw new Error(cJson.error || "Failed to load clients");
        if (!wRes.ok) throw new Error(wJson.error || "Failed to load workers");
        if (!cancelled) {
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
        await reloadAssignments();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load assignments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadAssignments closes over filters
  }, [filterDate, filterClient, filterWorker]);

  function dayInputValue(day: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
    const d = new Date(day);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dom = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dom}`;
  }

  function formatDisplayDay(day: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const [y, m, d] = day.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    const dt = new Date(day);
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function openCreate() {
    setEditing(null);
    setForm({
      client_id: clients[0]?.id ?? "",
      worker_id: selectableWorkers[0]?.id ?? "",
      date: dayInputValue(new Date().toISOString()),
      job_type: "cleaning",
      time_start: "09:00",
      time_end: "17:00",
      status: "assigned",
      payment_status: "pending",
      notes: "",
      client_price: "",
      worker_pay: "",
    });
    setOpen(true);
  }

  function openEdit(row: AssignmentRow) {
    setEditing(row);
    setForm({
      client_id: row.client_id,
      worker_id: row.worker_id,
      date: dayInputValue(row.date),
      job_type: row.job_type,
      time_start: row.time_start,
      time_end: row.time_end,
      status: row.status,
      payment_status: row.payment_status,
      notes: row.notes,
      client_price: row.client_price != null ? String(row.client_price) : "",
      worker_pay: row.worker_pay != null ? String(row.worker_pay) : "",
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload: Record<string, unknown> = {
        client_id: form.client_id,
        worker_id: form.worker_id,
        date: form.date,
        job_type: form.job_type,
        time_start: form.time_start,
        time_end: form.time_end,
        status: form.status,
        payment_status: form.payment_status,
        notes: form.notes,
      };
      if (form.client_price.trim() !== "") payload.client_price = Number(form.client_price);
      if (form.worker_pay.trim() !== "") payload.worker_pay = Number(form.worker_pay);

      const res = editing
        ? await fetch(`/api/assignments/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Assignment updated" : "Assignment created");
      setOpen(false);
      await reloadAssignments();

      const wRes = await fetch("/api/workers");
      const wJson = await wRes.json();
      if (wRes.ok) {
        setWorkers(
          wJson.map((w: { id: string; full_name: string; status: string }) => ({
            id: w.id,
            full_name: w.full_name,
            status: w.status,
          })),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function patchAssignment(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await reloadAssignments();
      const wRes = await fetch("/api/workers");
      const wJson = await wRes.json();
      if (wRes.ok) {
        setWorkers(
          wJson.map((w: { id: string; full_name: string; status: string }) => ({
            id: w.id,
            full_name: w.full_name,
            status: w.status,
          })),
        );
      }
      toast.success("Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(row: AssignmentRow) {
    if (!confirm("Delete this assignment?")) return;
    try {
      const res = await fetch(`/api/assignments/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Assignment deleted");
      await reloadAssignments();
      const wRes = await fetch("/api/workers");
      const wJson = await wRes.json();
      if (wRes.ok) {
        setWorkers(
          wJson.map((w: { id: string; full_name: string; status: string }) => ({
            id: w.id,
            full_name: w.full_name,
            status: w.status,
          })),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const currency = React.useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
    [],
  );

  const workerOptionsForEdit = React.useMemo(() => {
    if (!editing) return selectableWorkers;
    const current = workers.find((w) => w.id === editing.worker_id);
    if (!current) return selectableWorkers;
    if (current.status === "inactive" && !selectableWorkers.some((w) => w.id === current.id)) {
      return [current, ...selectableWorkers];
    }
    return selectableWorkers;
  }, [editing, selectableWorkers, workers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">Who is working where, and when.</p>
        </div>
        <Button onClick={openCreate} disabled={clients.length === 0 || selectableWorkers.length === 0}>
          <Plus />
          New assignment
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid gap-2">
          <Label htmlFor="filter_date">Date</Label>
          <Input
            id="filter_date"
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="lg:w-44"
          />
        </div>
        <div className="grid gap-2">
          <Label>Client</Label>
          <Select
            value={filterClient}
            onValueChange={(v) => setFilterClient(typeof v === "string" ? v : "__all__")}
          >
            <SelectTrigger className="lg:w-56">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All clients</SelectItem>
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
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setFilterDate("");
            setFilterClient("__all__");
            setFilterWorker("__all__");
          }}
        >
          Clear filters
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Profit</TableHead>
              <TableHead className="min-w-[220px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No assignments match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDisplayDay(row.date)}
                  </TableCell>
                  <TableCell>{row.client_name ?? row.client_id}</TableCell>
                  <TableCell>{row.worker_name ?? row.worker_id}</TableCell>
                  <TableCell>{row.job_type}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.time_start}–{row.time_end}
                  </TableCell>
                  <TableCell>
                    <Badge variant={jobStatusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.payment_status === "paid" ? "default" : "outline"}>
                      {row.payment_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.profit != null && Number.isFinite(row.profit)
                      ? currency.format(row.profit)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.payment_status === "pending" && row.status !== "cancelled" && (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => patchAssignment(row.id, { payment_status: "paid" })}
                        >
                          Paid
                        </Button>
                      )}
                      {row.status !== "completed" && row.status !== "cancelled" && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => patchAssignment(row.id, { status: "completed" })}
                        >
                          Complete
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => remove(row)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit assignment" : "New assignment"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, client_id: v }));
                }}
              >
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
              <Select
                value={form.worker_id}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, worker_id: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select worker" />
                </SelectTrigger>
                <SelectContent>
                  {(editing ? workerOptionsForEdit : selectableWorkers).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name}
                      {w.status === "inactive" ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job_date">Date</Label>
              <Input
                id="job_date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job_type">Job type</Label>
              <Input
                id="job_type"
                value={form.job_type}
                onChange={(e) => setForm((f) => ({ ...f, job_type: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="time_start">Start</Label>
                <Input
                  id="time_start"
                  type="time"
                  value={form.time_start}
                  onChange={(e) => setForm((f) => ({ ...f, time_start: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time_end">End</Label>
                <Input
                  id="time_end"
                  type="time"
                  value={form.time_end}
                  onChange={(e) => setForm((f) => ({ ...f, time_end: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Job status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, status: v as AssignmentRow["status"] }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jobStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Payment</Label>
              <Select
                value={form.payment_status}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({
                    ...f,
                    payment_status: v as AssignmentRow["payment_status"],
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="client_price">Client price</Label>
                <Input
                  id="client_price"
                  inputMode="decimal"
                  value={form.client_price}
                  onChange={(e) => setForm((f) => ({ ...f, client_price: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="worker_pay">Worker pay</Label>
                <Input
                  id="worker_pay"
                  inputMode="decimal"
                  value={form.worker_pay}
                  onChange={(e) => setForm((f) => ({ ...f, worker_pay: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a_notes">Notes</Label>
              <Textarea
                id="a_notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
