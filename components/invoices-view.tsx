"use client";

import * as React from "react";
import { Ban, Loader2, Plus, Receipt, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { phpCurrencyFormatter } from "@/lib/currency-format";
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

type ClientOpt = { id: string; business_name: string };

type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "void";

type InvoiceRow = {
  id: string;
  client_id: string;
  client_name?: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  amount_total: number;
  amount_paid: number;
  balance: number;
  line_count: number;
  created_at: string | null;
};

type InvoiceLine = { job_id: string; description: string; amount: number };

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  reference_note: string;
  paid_at: string;
  created_at: string | null;
};

type InvoiceDetail = InvoiceRow & {
  notes: string;
  line_items: InvoiceLine[];
  payments: PaymentRow[];
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
};

function statusVariant(s: InvoiceStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "paid") return "secondary";
  if (s === "void") return "outline";
  if (s === "partial") return "destructive";
  if (s === "sent") return "default";
  return "outline";
}

const PAY_METHODS = ["cash", "bank_transfer", "gcash", "card", "other"] as const;

function methodLabel(m: string): string {
  switch (m) {
    case "cash":
      return "Cash";
    case "bank_transfer":
      return "Bank transfer";
    case "gcash":
      return "GCash";
    case "card":
      return "Card";
    default:
      return "Other";
  }
}

export default function InvoicesView() {
  const [clients, setClients] = React.useState<ClientOpt[]>([]);
  const [rows, setRows] = React.useState<InvoiceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterClient, setFilterClient] = React.useState("__all__");
  const [filterStatus, setFilterStatus] = React.useState("__all__");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createClientId, setCreateClientId] = React.useState("");
  const [periodStart, setPeriodStart] = React.useState("");
  const [periodEnd, setPeriodEnd] = React.useState("");
  const [createNotes, setCreateNotes] = React.useState("");
  const [createBusy, setCreateBusy] = React.useState(false);

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState<string>("bank_transfer");
  const [payRef, setPayRef] = React.useState("");
  const [payBusy, setPayBusy] = React.useState(false);

  async function reloadList() {
    const params = new URLSearchParams();
    if (filterClient !== "__all__") params.set("client_id", filterClient);
    if (filterStatus !== "__all__") params.set("status", filterStatus);
    const res = await fetch(`/api/invoices?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load invoices");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const cRes = await fetch("/api/clients");
        const cJson = await cRes.json();
        if (!cRes.ok) throw new Error(cJson.error || "Failed to load clients");
        if (!cancelled) {
          setClients(cJson.map((c: { id: string; business_name: string }) => ({ id: c.id, business_name: c.business_name })));
          const first = cJson[0]?.id ?? "";
          setCreateClientId((prev) => prev || first);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load clients");
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
        await reloadList();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load invoices");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadList uses filters
  }, [filterClient, filterStatus]);

  const loadDetail = React.useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoice");
      setDetail(data);
      setPayAmount(data.balance > 0 ? String(data.balance) : "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load invoice");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function openDetail(id: string) {
    setDetailId(id);
    void loadDetail(id);
  }

  async function submitCreate() {
    if (!createClientId) {
      toast.error("Select a client");
      return;
    }
    if (!periodStart || !periodEnd) {
      toast.error("Pick billing period start and end");
      return;
    }
    setCreateBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: createClientId,
          period_start: periodStart,
          period_end: periodEnd,
          notes: createNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      toast.success(`Invoice ${data.invoice_number} created`);
      setCreateOpen(false);
      setCreateNotes("");
      await reloadList();
      openDetail(data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
    }
  }

  async function markSent(id: string) {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sent" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success("Marked as sent");
      setDetail(data);
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function voidInvoice(id: string) {
    if (!confirm("Void this invoice? Jobs will be released for re-invoicing (only when no payments exist).")) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "void" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Void failed");
      toast.success("Invoice voided");
      setDetail(data);
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Void failed");
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Delete this draft invoice?")) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Draft deleted");
      setDetailId(null);
      setDetail(null);
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function submitPayment() {
    if (!detailId || !detail) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPayBusy(true);
    try {
      const res = await fetch(`/api/invoices/${detailId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          method: payMethod,
          reference_note: payRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      toast.success("Payment recorded");
      setDetail(data);
      setPayRef("");
      setPayAmount(data.balance > 0 ? String(data.balance) : "");
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPayBusy(false);
    }
  }

  const createClientSelectValue = createClientId || clients[0]?.id || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Generate invoices from completed jobs and record client payments. Paid invoices sync job payment
            status.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={clients.length === 0}>
          <Plus />
          New invoice
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
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
          <Label>Status</Label>
          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(typeof v === "string" ? v : "__all__")}
          >
            <SelectTrigger className="lg:w-44">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map((s) => (
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
            setFilterClient("__all__");
            setFilterStatus("__all__");
          }}
        >
          Clear filters
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="hidden md:table-cell">Issued</TableHead>
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
                  No invoices yet. Create one from a client&apos;s completed billable jobs.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDetail(row.id)}
                >
                  <TableCell className="font-medium tabular-nums">{row.invoice_number}</TableCell>
                  <TableCell>{row.client_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {phpCurrencyFormatter.format(row.amount_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {phpCurrencyFormatter.format(row.amount_paid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {phpCurrencyFormatter.format(row.balance)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {new Date(row.issue_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-4 opacity-80" />
              New invoice from jobs
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pulls <strong>completed</strong> jobs for the client with a <strong>client price</strong>, not yet on
              another invoice.
            </p>
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                value={createClientSelectValue}
                onValueChange={(v) => {
                  if (typeof v === "string") setCreateClientId(v);
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="inv_ps">Period start</Label>
                <Input id="inv_ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv_pe">Period end</Label>
                <Input id="inv_pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv_notes">Notes (optional)</Label>
              <Textarea id="inv_notes" value={createNotes} onChange={(e) => setCreateNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createBusy}>
              {createBusy ? <Loader2 className="animate-spin" /> : null}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {detail?.invoice_number ?? "Invoice"}
              {detail ? (
                <Badge variant={statusVariant(detail.status)}>{STATUS_LABEL[detail.status]}</Badge>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground py-8 flex items-center gap-2">
              <Loader2 className="animate-spin size-4" /> Loading…
            </p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Client</p>
                  <p className="font-medium">{detail.client_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Issued</p>
                  <p>{new Date(detail.issue_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="tabular-nums font-medium">{phpCurrencyFormatter.format(detail.amount_total)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Balance</p>
                  <p className="tabular-nums font-medium">{phpCurrencyFormatter.format(detail.balance)}</p>
                </div>
              </div>
              {detail.notes ? (
                <div className="text-sm">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{detail.notes}</p>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium mb-2">Line items</p>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.line_items.map((line, i) => (
                        <TableRow key={`${line.job_id}-${i}`}>
                          <TableCell className="text-sm max-w-[280px]">{line.description}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {phpCurrencyFormatter.format(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {detail.payments.length > 0 ? (
                <div>
                  <p className="text-sm font-medium mb-2">Payments</p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm tabular-nums">
                              {new Date(p.paid_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </TableCell>
                            <TableCell className="text-sm">{methodLabel(p.method)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {phpCurrencyFormatter.format(p.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {detail.status === "draft" ? (
                  <>
                    <Button size="sm" onClick={() => markSent(detail.id)}>
                      <Send className="size-3.5" />
                      Mark sent
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteDraft(detail.id)}>
                      <Trash2 className="size-3.5" />
                      Delete draft
                    </Button>
                  </>
                ) : null}
                {detail.status === "sent" && detail.payments.length === 0 ? (
                  <Button size="sm" variant="outline" onClick={() => voidInvoice(detail.id)}>
                    <Ban className="size-3.5" />
                    Void
                  </Button>
                ) : null}
              </div>

              {(detail.status === "sent" || detail.status === "partial") && detail.balance > 0.005 ? (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <p className="text-sm font-medium">Record payment</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2">
                      <Label htmlFor="pay_amt">Amount</Label>
                      <Input
                        id="pay_amt"
                        inputMode="decimal"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Method</Label>
                      <Select value={payMethod} onValueChange={(v) => typeof v === "string" && setPayMethod(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAY_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {methodLabel(m)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pay_ref">Reference / note</Label>
                    <Input id="pay_ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={submitPayment} disabled={payBusy}>
                    {payBusy ? <Loader2 className="animate-spin" /> : null}
                    Apply payment
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not load invoice.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
