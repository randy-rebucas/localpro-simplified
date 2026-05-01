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

export default function WorkersView() {
  const [rows, setRows] = React.useState<WorkerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
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

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
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
  }, [statusFilter]);

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

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const listRes = await fetch(`/api/workers?${params.toString()}`);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Workers</h1>
          <p className="text-sm text-muted-foreground">People available for jobs.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add worker
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Skill</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
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
                  No workers yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.full_name}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-muted-foreground">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell>{row.skill}</TableCell>
                  <TableCell>{row.location}</TableCell>
                  <TableCell>{row.rating}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
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
                      {s}
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
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rating">Rating (1–5)</Label>
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
