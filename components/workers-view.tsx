"use client";

import * as React from "react";
import Link from "next/link";
import { Briefcase, Loader2, Mail, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type WorkerRow = {
  id: string;
  user_id?: string;
  full_name: string;
  phone: string;
  email?: string | null;
  location: string;
  skill: "cleaner" | "helper" | "technician";
  status: "available" | "assigned" | "inactive";
  rating: number;
  rated_by_clients_avg: number | null;
  rated_by_clients_count: number;
  notes: string;
  created_at: string | null;
};

const skills: WorkerRow["skill"][] = ["cleaner", "helper", "technician"];
const statuses: WorkerRow["status"][] = ["available", "assigned", "inactive"];

function statusVariant(s: WorkerRow["status"]) {
  if (s === "available") return "secondary" as const;
  if (s === "assigned") return "default" as const;
  return "outline" as const;
}

function formatStatusLabel(s: WorkerRow["status"]) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatSkillLabel(s: WorkerRow["skill"]) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function summarizeWorkers(rows: WorkerRow[]) {
  let available = 0;
  let assigned = 0;
  let inactive = 0;
  let withEmail = 0;
  for (const r of rows) {
    if (r.status === "available") available += 1;
    else if (r.status === "assigned") assigned += 1;
    else inactive += 1;
    if (r.email && String(r.email).trim()) withEmail += 1;
  }
  return { available, assigned, inactive, withEmail, total: rows.length };
}

export default function WorkersView() {
  const [rows, setRows] = React.useState<WorkerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkerRow | null>(null);

  const [form, setForm] = React.useState({
    full_name: "",
    phone: "",
    email: "",
    location: "",
    skill: "cleaner" as WorkerRow["skill"],
    status: "available" as WorkerRow["status"],
    rating: 3,
    notes: "",
  });

  const debouncedQ = useDebounced(q, 300);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        const res = await fetch(`/api/workers?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load workers");
        if (!cancelled) setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load workers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, statusFilter]);

  const summary = React.useMemo(() => summarizeWorkers(rows), [rows]);

  function openCreate() {
    setEditing(null);
    setForm({
      full_name: "",
      phone: "",
      email: "",
      location: "",
      skill: "cleaner",
      status: "available",
      rating: 3,
      notes: "",
    });
    setOpen(true);
  }

  function openEdit(row: WorkerRow) {
    setEditing(row);
    setForm({
      full_name: row.full_name,
      phone: row.phone,
      email: row.email ?? "",
      location: row.location,
      skill: row.skill,
      status: row.status,
      rating: row.rating,
      notes: row.notes,
    });
    setOpen(true);
  }

  function listQueryParams() {
    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params;
  }

  async function save() {
    try {
      const payload = {
        ...form,
        rating: Number(form.rating),
      };
      const res = editing
        ? await fetch(`/api/workers/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Worker updated" : "Worker created");
      setOpen(false);

      const listRes = await fetch(`/api/workers?${listQueryParams().toString()}`);
      const list = await listRes.json();
      if (listRes.ok) setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(row: WorkerRow) {
    if (!confirm(`Delete ${row.full_name}?`)) return;
    try {
      const res = await fetch(`/api/workers/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Worker deleted");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Workers</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Field staff profiles, skills, and ops ratings. Summary counts match the list below
            (search and status filter).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Jobs
          </Link>
          <Link
            href="/worker-schedule"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Availability
          </Link>
          <Button onClick={openCreate} size="sm">
            <Plus />
            Add worker
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-none">
          <CardContent className="flex items-start gap-3 pt-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/80 [&_svg]:size-4">
              <UsersRound />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Showing</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {loading ? <span className="text-muted-foreground">—</span> : summary.total}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-primary/15 bg-primary/[0.02]">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">Available</p>
            <p className="font-heading text-2xl font-semibold tabular-nums text-primary">
              {loading ? "—" : summary.available}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="flex items-start gap-3 pt-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/80 text-muted-foreground [&_svg]:size-4">
              <Briefcase />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Assigned</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {loading ? "—" : summary.assigned}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">Inactive</p>
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {loading ? "—" : summary.inactive}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="flex items-start gap-3 pt-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/80 text-muted-foreground [&_svg]:size-4">
              <Mail />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Email on file</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {loading ? "—" : summary.withEmail}
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Used for assignment & shift emails
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, location…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
              aria-label="Search workers"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(typeof v === "string" ? v : "all")}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Skill
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Location
              </TableHead>
              <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ops ★
              </TableHead>
              <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Clients ★
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-[120px] text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-28">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading workers…
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40">
                  <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UsersRound className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No workers match</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        {debouncedQ.trim() || statusFilter !== "all"
                          ? "Try clearing search or setting status to all."
                          : "Add your first worker to start scheduling visits and smart assignment."}
                      </p>
                    </div>
                    {!debouncedQ.trim() && statusFilter === "all" ? (
                      <Button size="sm" onClick={openCreate}>
                        <Plus />
                        Add worker
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.full_name}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-muted-foreground">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal capitalize">
                      {formatSkillLabel(row.skill)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate">{row.location}</TableCell>
                  <TableCell className="tabular-nums">{row.rating}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {row.rated_by_clients_avg != null ? (
                      <>
                        ★{row.rated_by_clients_avg}{" "}
                        <span className="text-muted-foreground">({row.rated_by_clients_count})</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>
                      {formatStatusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit worker" : "New worker"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editing
                ? "Update contact info, skill, location, or booking status."
                : "Create a worker profile. Email is used for assignment and reminder notifications."}
            </p>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="w_phone">Phone</Label>
              <Input
                id="w_phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="w_email">Email</Label>
              <Input
                id="w_email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Skill</Label>
              <Select
                value={form.skill}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, skill: v as WorkerRow["skill"] }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {skills.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatSkillLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, status: v as WorkerRow["status"] }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rating">Ops rating (1–5)</Label>
              <Input
                id="rating"
                type="number"
                min={1}
                max={5}
                value={form.rating}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rating: Number(e.target.value) }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="w_notes">Notes</Label>
              <Textarea
                id="w_notes"
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

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
