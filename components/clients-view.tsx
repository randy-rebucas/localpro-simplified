"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
} from "lucide-react";
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

function formatStatusLabel(s: ClientRow["status"]) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function summarizeClients(rows: ClientRow[]) {
  let active = 0;
  let prospect = 0;
  let inactive = 0;
  let portalOn = 0;
  for (const r of rows) {
    if (r.status === "active") active += 1;
    else if (r.status === "prospect") prospect += 1;
    else inactive += 1;
    if (r.portal_enabled) portalOn += 1;
  }
  return { active, prospect, inactive, portalOn, total: rows.length };
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

  const summary = React.useMemo(() => summarizeClients(rows), [rows]);

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
    <div className="space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">Clients</h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Business accounts, contacts, and portal access. Search and filter refine the list below;
            summary counts reflect what you see.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/jobs"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Jobs
          </Link>
          <Link
            href="/invoices"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Invoices
          </Link>
          <Button onClick={openCreate} size="sm">
            <Plus />
            Add client
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-none lg:col-span-1">
          <CardContent className="flex items-start gap-3 pt-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/80 [&_svg]:size-4">
              <Building2 />
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
            <p className="text-xs font-medium text-muted-foreground">Active</p>
            <p className="font-heading text-2xl font-semibold tabular-nums text-primary">
              {loading ? "—" : summary.active}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-muted-foreground">Prospect</p>
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {loading ? "—" : summary.prospect}
            </p>
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
              <Unlock />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Portal enabled</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {loading ? "—" : summary.portalOn}
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
              placeholder="Search business, contact, email, phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8"
              aria-label="Search clients"
            />
          </div>
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
                Business
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contact
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phone
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </TableHead>
              <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Workers ★
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Portal
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
                    Loading clients…
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40">
                  <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Building2 className="size-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No clients match</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        {debouncedQ.trim() || statusFilter !== "all"
                          ? "Try clearing search or setting status to all."
                          : "Add your first client to start booking jobs and sending invoices."}
                      </p>
                    </div>
                    {!debouncedQ.trim() && statusFilter === "all" ? (
                      <Button size="sm" onClick={openCreate}>
                        <Plus />
                        Add client
                      </Button>
                    ) : null}
                  </div>
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
                    <Badge variant={row.portal_enabled ? "default" : "outline"} className="gap-1">
                      {row.portal_enabled ? (
                        <Unlock className="size-3 opacity-80" />
                      ) : (
                        <Lock className="size-3 opacity-80" />
                      )}
                      {row.portal_enabled ? "On" : "Off"}
                    </Badge>
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
            <DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editing
                ? "Update business details, status, or portal access."
                : "Create a client record and optionally enable the self-service portal."}
            </p>
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
                      {formatStatusLabel(s)}
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
