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

type ClientRow = {
  id: string;
  user_id?: string;
  business_name: string;
  contact_person: string;
  phone: string;
  email?: string | null;
  address: string;
  status: "prospect" | "active" | "inactive";
  notes: string;
  portal_enabled: boolean;
  rated_by_workers_avg: number | null;
  rated_by_workers_count: number;
  created_at: string | null;
};

const statuses: ClientRow["status"][] = ["prospect", "active", "inactive"];

function statusVariant(s: ClientRow["status"]) {
  if (s === "active") return "default" as const;
  if (s === "prospect") return "secondary" as const;
  return "outline" as const;
}

export default function ClientsView() {
  const [rows, setRows] = React.useState<ClientRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ClientRow | null>(null);

  const [form, setForm] = React.useState({
    business_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    status: "prospect" as ClientRow["status"],
    notes: "",
    portal_password: "",
    portal_disable: false,
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
        const res = await fetch(`/api/clients?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load clients");
        if (!cancelled) setRows(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load clients");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm({
      business_name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      status: "prospect",
      notes: "",
      portal_password: "",
      portal_disable: false,
    });
    setOpen(true);
  }

  function openEdit(row: ClientRow) {
    setEditing(row);
    setForm({
      business_name: row.business_name,
      contact_person: row.contact_person,
      phone: row.phone,
      email: row.email ?? "",
      address: row.address,
      status: row.status,
      notes: row.notes,
      portal_password: "",
      portal_disable: false,
    });
    setOpen(true);
  }

  async function save() {
    try {
      const { portal_password, portal_disable, ...rest } = form;
      const payload: Record<string, unknown> = { ...rest };
      if (!editing) {
        if (portal_password.trim()) payload.portal_password = portal_password.trim();
      } else if (portal_disable) {
        payload.portal_password = "";
      } else if (portal_password.trim()) {
        payload.portal_password = portal_password.trim();
      }
      const res = editing
        ? await fetch(`/api/clients/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Client updated" : "Client created");
      setOpen(false);

      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const listRes = await fetch(`/api/clients?${params.toString()}`);
      const list = await listRes.json();
      if (listRes.ok) setRows(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(row: ClientRow) {
    if (!confirm(`Delete ${row.business_name}?`)) return;
    try {
      const res = await fetch(`/api/clients/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Client deleted");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">Business accounts you serve.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Add client
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search name, contact, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(typeof v === "string" ? v : "all")}
        >
          <SelectTrigger className="sm:w-44">
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
              <TableHead>Business</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="whitespace-nowrap">Workers ★</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No clients yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.business_name}</TableCell>
                  <TableCell>{row.contact_person}</TableCell>
                  <TableCell>{row.phone}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {row.rated_by_workers_avg != null ? (
                      <>
                        ★{row.rated_by_workers_avg}{" "}
                        <span className="text-muted-foreground">
                          ({row.rated_by_workers_count})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.portal_enabled ? "default" : "outline"}>
                      {row.portal_enabled ? "On" : "Off"}
                    </Badge>
                  </TableCell>
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
            <DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="business_name">Business name</Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact_person">Contact person</Label>
              <Input
                id="contact_person"
                value={form.contact_person}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, status: v as ClientRow["status"] }));
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
              <Label htmlFor="portal_password">Client portal password</Label>
              <Input
                id="portal_password"
                type="password"
                autoComplete="new-password"
                value={form.portal_password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, portal_password: e.target.value, portal_disable: false }))
                }
                placeholder={editing ? "Leave blank to keep current" : "Optional"}
              />
              <p className="text-xs text-muted-foreground">
                Active clients can sign in at <span className="font-mono">/portal</span> with their
                contact email and this password.
              </p>
              {editing?.portal_enabled ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input accent-primary"
                    checked={form.portal_disable}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        portal_disable: e.target.checked,
                        portal_password: e.target.checked ? "" : f.portal_password,
                      }))
                    }
                  />
                  Disable portal access
                </label>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
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
