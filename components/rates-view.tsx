"use client";

import * as React from "react";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { phpCurrencyFormatter } from "@/lib/currency-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type JobTypeOpt = { id: string; slug: string; label: string; active: boolean };

type RateRuleRow = {
  id: string;
  job_type_id: string;
  job_type: string;
  job_slug: string;
  client_hourly_rate: number;
  worker_hourly_rate: number;
  notes: string;
  created_at: string | null;
};

type PreviewResponse = {
  job_type_id: string;
  billable_hours: number;
  matched_rule: boolean;
  suggested_client_price: number | null;
  suggested_worker_pay: number | null;
  margin_amount: number | null;
  margin_pct: number | null;
};

export default function RatesView() {
  const [jobTypes, setJobTypes] = React.useState<JobTypeOpt[]>([]);
  const [rows, setRows] = React.useState<RateRuleRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RateRuleRow | null>(null);

  const [form, setForm] = React.useState({
    job_type_id: "",
    client_hourly_rate: "",
    worker_hourly_rate: "",
    notes: "",
  });

  const [previewForm, setPreviewForm] = React.useState({
    job_type_id: "",
    time_start: "09:00",
    time_end: "17:00",
  });
  const [previewResult, setPreviewResult] = React.useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const activeJobTypes = React.useMemo(() => jobTypes.filter((j) => j.active), [jobTypes]);

  const typesWithoutRule = React.useMemo(() => {
    const ruled = new Set(rows.map((r) => r.job_type_id));
    return activeJobTypes.filter((j) => !ruled.has(j.id));
  }, [activeJobTypes, rows]);

  const typesForRuleForm = React.useMemo(() => {
    if (editing) {
      const cur = jobTypes.find((j) => j.id === editing.job_type_id);
      return cur ? [cur] : [];
    }
    return typesWithoutRule;
  }, [editing, jobTypes, typesWithoutRule]);

  const previewJobTypeId = previewForm.job_type_id || activeJobTypes[0]?.id || "";

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        const [jtRes, rulesRes] = await Promise.all([fetch("/api/job-types"), fetch("/api/rate-rules")]);
        const jtJson = await jtRes.json();
        const rulesJson = await rulesRes.json();
        if (!jtRes.ok) throw new Error(jtJson.error || "Failed to load job types");
        if (!rulesRes.ok) throw new Error(rulesJson.error || "Failed to load rate rules");
        if (!cancelled) {
          setJobTypes(
            jtJson.map((j: { id: string; slug: string; label: string; active: boolean }) => ({
              id: j.id,
              slug: j.slug,
              label: j.label,
              active: j.active,
            })),
          );
          setRows(rulesJson);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load data");
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
    setForm({
      job_type_id: typesWithoutRule[0]?.id ?? "",
      client_hourly_rate: "",
      worker_hourly_rate: "",
      notes: "",
    });
    setOpen(true);
  }

  function openEdit(row: RateRuleRow) {
    setEditing(row);
    setForm({
      job_type_id: row.job_type_id,
      client_hourly_rate: String(row.client_hourly_rate),
      worker_hourly_rate: String(row.worker_hourly_rate),
      notes: row.notes,
    });
    setOpen(true);
  }

  async function save() {
    try {
      if (!form.job_type_id) {
        toast.error("Select a job type");
        return;
      }
      const clientHr = Number(form.client_hourly_rate);
      const workerHr = Number(form.worker_hourly_rate);
      if (!Number.isFinite(clientHr) || clientHr < 0) {
        toast.error("Client hourly rate must be a valid non-negative number");
        return;
      }
      if (!Number.isFinite(workerHr) || workerHr < 0) {
        toast.error("Worker hourly rate must be a valid non-negative number");
        return;
      }

      const payload = {
        job_type_id: form.job_type_id,
        client_hourly_rate: clientHr,
        worker_hourly_rate: workerHr,
        notes: form.notes,
      };

      const res = editing
        ? await fetch(`/api/rate-rules/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/rate-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Rate rule updated" : "Rate rule created");
      setOpen(false);

      const [jtRes, rulesRes] = await Promise.all([fetch("/api/job-types"), fetch("/api/rate-rules")]);
      const jtJson = await jtRes.json();
      const rulesJson = await rulesRes.json();
      if (jtRes.ok) {
        setJobTypes(
          jtJson.map((j: { id: string; slug: string; label: string; active: boolean }) => ({
            id: j.id,
            slug: j.slug,
            label: j.label,
            active: j.active,
          })),
        );
      }
      if (rulesRes.ok) setRows(rulesJson);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(row: RateRuleRow) {
    if (!confirm(`Delete rate rule for "${row.job_type}"?`)) return;
    try {
      const res = await fetch(`/api/rate-rules/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Rate rule deleted");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function runPreview() {
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const res = await fetch("/api/rate-engine/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type_id: previewJobTypeId,
          time_start: previewForm.time_start,
          time_end: previewForm.time_end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreviewResult(data as PreviewResponse);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  const previewTypeLabel =
    activeJobTypes.find((j) => j.id === previewJobTypeId)?.label ?? previewJobTypeId;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Rate &amp; margin engine</h1>
          <p className="text-sm text-muted-foreground">
            Hourly bill and pay rates per job type (from Job types). Duration × rates yields suggested client price
            and worker pay; margin is (client − worker) ÷ client.
          </p>
        </div>
        <Button onClick={openCreate} disabled={typesWithoutRule.length === 0}>
          <Plus />
          Add rate rule
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job type</TableHead>
                <TableHead className="tabular-nums">Client ₱/hr</TableHead>
                <TableHead className="tabular-nums">Worker ₱/hr</TableHead>
                <TableHead className="hidden md:table-cell max-w-[200px]">Notes</TableHead>
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
                    No rate rules yet. Create job types first, then add a rule per type you bill.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.job_type}
                      {row.job_slug ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">({row.job_slug})</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{phpCurrencyFormatter.format(row.client_hourly_rate)}</TableCell>
                    <TableCell className="tabular-nums">{phpCurrencyFormatter.format(row.worker_hourly_rate)}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate text-muted-foreground text-sm">
                      {row.notes || "—"}
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

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 opacity-80" />
              Quick preview
            </CardTitle>
            <CardDescription>Pick a job type and shift length to preview suggested prices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Job type</Label>
              <Select
                value={previewJobTypeId}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setPreviewForm((f) => ({ ...f, job_type_id: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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
                <Label htmlFor="pv_start">Start</Label>
                <Input
                  id="pv_start"
                  type="time"
                  value={previewForm.time_start}
                  onChange={(e) => setPreviewForm((f) => ({ ...f, time_start: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pv_end">End</Label>
                <Input
                  id="pv_end"
                  type="time"
                  value={previewForm.time_end}
                  onChange={(e) => setPreviewForm((f) => ({ ...f, time_end: e.target.value }))}
                />
              </div>
            </div>
            <Button
              className="w-full"
              variant="secondary"
              onClick={runPreview}
              disabled={previewLoading || !previewJobTypeId}
            >
              {previewLoading ? "Calculating…" : "Calculate"}
            </Button>
            {previewResult && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
                <p className="text-muted-foreground">
                  Billable hours:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {previewResult.billable_hours}
                  </span>
                </p>
                {previewResult.matched_rule ? (
                  <>
                    <p className="tabular-nums">
                      Suggested client:{" "}
                      <span className="font-medium">
                        {previewResult.suggested_client_price != null
                          ? phpCurrencyFormatter.format(previewResult.suggested_client_price)
                          : "—"}
                      </span>
                    </p>
                    <p className="tabular-nums">
                      Suggested worker pay:{" "}
                      <span className="font-medium">
                        {previewResult.suggested_worker_pay != null
                          ? phpCurrencyFormatter.format(previewResult.suggested_worker_pay)
                          : "—"}
                      </span>
                    </p>
                    <p className="tabular-nums">
                      Margin:{" "}
                      <span className="font-medium">
                        {previewResult.margin_amount != null
                          ? phpCurrencyFormatter.format(previewResult.margin_amount)
                          : "—"}
                      </span>
                      {previewResult.margin_pct != null && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({previewResult.margin_pct}% of revenue)
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-amber-700 dark:text-amber-500">
                    No rate rule for &quot;{previewTypeLabel}&quot;. Add one in the table.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rate rule" : "New rate rule"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Job type</Label>
              <Select
                value={form.job_type_id}
                disabled={Boolean(editing)}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, job_type_id: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {typesForRuleForm.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing ? (
                <p className="text-xs text-muted-foreground">Job type cannot be changed; delete and recreate to switch.</p>
              ) : (
                <p className="text-xs text-muted-foreground">One rate rule per job type.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="rule_client_hr">Client ₱/hr</Label>
                <Input
                  id="rule_client_hr"
                  inputMode="decimal"
                  value={form.client_hourly_rate}
                  onChange={(e) => setForm((f) => ({ ...f, client_hourly_rate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule_worker_hr">Worker ₱/hr</Label>
                <Input
                  id="rule_worker_hr"
                  inputMode="decimal"
                  value={form.worker_hourly_rate}
                  onChange={(e) => setForm((f) => ({ ...f, worker_hourly_rate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule_notes">Notes</Label>
              <Textarea
                id="rule_notes"
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
