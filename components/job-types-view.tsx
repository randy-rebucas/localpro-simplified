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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type JobTypeRow = {
  id: string;
  slug: string;
  label: string;
  description: string;
  active: boolean;
  created_at: string | null;
};

export default function JobTypesView() {
  const [rows, setRows] = React.useState<JobTypeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<JobTypeRow | null>(null);

  const [form, setForm] = React.useState({
    slug: "",
    label: "",
    description: "",
    active: true,
  });

  async function reload() {
    const res = await fetch("/api/job-types");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load job types");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load job types");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ slug: "", label: "", description: "", active: true });
    setOpen(true);
  }

  function openEdit(row: JobTypeRow) {
    setEditing(row);
    setForm({
      slug: row.slug,
      label: row.label,
      description: row.description,
      active: row.active,
    });
    setOpen(true);
  }

  async function save() {
    try {
      const slug = form.slug.trim();
      const label = form.label.trim();
      if (!slug || !label) {
        toast.error("Slug and label are required");
        return;
      }
      const payload = {
        slug,
        label,
        description: form.description,
        active: form.active,
      };

      const res = editing
        ? await fetch(`/api/job-types/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/job-types", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Job type updated" : "Job type created");
      setOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(row: JobTypeRow) {
    if (!confirm(`Delete job type "${row.label}"?`)) return;
    try {
      const res = await fetch(`/api/job-types/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Job type deleted");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Job types</h1>
          <p className="text-sm text-muted-foreground">
            Catalog of work categories (slug + label). Jobs and rate rules reference these records.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add job type
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell max-w-[240px]">Description</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No job types yet. Create one (e.g. slug &quot;cleaning&quot;, label &quot;Cleaning&quot;) before
                  scheduling jobs or rate rules.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.slug}</TableCell>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>
                    <Badge variant={row.active ? "default" : "outline"}>
                      {row.active ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-[240px] truncate text-muted-foreground text-sm">
                    {row.description || "—"}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit job type" : "New job type"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="jt_slug">Slug</Label>
              <Input
                id="jt_slug"
                placeholder="e.g. cleaning"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Lowercase identifier (spaces become hyphens on save).</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jt_label">Label</Label>
              <Input
                id="jt_label"
                placeholder="Display name"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="jt_desc">Description</Label>
              <Textarea
                id="jt_desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="jt_active"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="size-4 rounded border-input accent-primary"
              />
              <Label htmlFor="jt_active" className="cursor-pointer font-normal">
                Active (available for new jobs)
              </Label>
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
