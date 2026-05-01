"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Loader2, Pencil, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { phpCurrencyFormatter } from "@/lib/currency-format";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

type JobRow = {
  id: string;
  client_id: string;
  worker_id: string;
  client_name?: string;
  worker_name?: string;
  job_type_id: string;
  job_type: string;
  job_slug?: string;
  date: string;
  time_start: string;
  time_end: string;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  payment_status: "pending" | "paid";
  notes: string;
  client_price: number | null;
  worker_pay: number | null;
  profit: number | null;
  margin_pct: number | null;
  invoice_id: string | null;
  worker_rating_by_client: number | null;
  worker_rating_by_client_comment: string;
  worker_rating_by_client_at: string | null;
  client_rating_by_worker: number | null;
  client_rating_by_worker_comment: string;
  client_rating_by_worker_at: string | null;
};

type ClientOpt = { id: string; business_name: string };
type WorkerOpt = { id: string; full_name: string; status: string };
type JobTypeOpt = { id: string; slug: string; label: string; active: boolean };

type ReplacementCandidate = {
  id: string;
  full_name: string;
  skill: string;
  status: string;
  rating: number;
  rated_by_clients_avg: number | null;
  location: string;
  score: number;
};

type SmartSuggestionRow = {
  id: string;
  full_name: string;
  skill: string;
  status: string;
  rating: number;
  rated_by_clients_avg: number | null;
  effective_rating: number;
  preferred_skill: string | null;
  skill_matches_job_type: boolean;
  breakdown: {
    location: number;
    skill: number;
    availability: number;
    rating: number;
  };
  score: number;
};

type ReplacementHistoryRow = {
  id: string;
  created_at: string | null;
  from_worker_name: string;
  to_worker_name: string;
  reason: string;
};

const jobStatuses: JobRow["status"][] = [
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
];

const paymentStatuses: JobRow["payment_status"][] = ["pending", "paid"];

function jobStatusVariant(s: JobRow["status"]) {
  if (s === "completed") return "secondary" as const;
  if (s === "cancelled") return "outline" as const;
  if (s === "in_progress") return "default" as const;
  return "secondary" as const;
}

export default function JobsView() {
  const [rows, setRows] = React.useState<JobRow[]>([]);
  const [clients, setClients] = React.useState<ClientOpt[]>([]);
  const [workers, setWorkers] = React.useState<WorkerOpt[]>([]);
  const [jobTypes, setJobTypes] = React.useState<JobTypeOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filterDate, setFilterDate] = React.useState("");
  const [filterClient, setFilterClient] = React.useState("__all__");
  const [filterWorker, setFilterWorker] = React.useState("__all__");
  const [filterJobType, setFilterJobType] = React.useState("__all__");
  const [filterBilling, setFilterBilling] = React.useState<"__all__" | "uninvoiced">("__all__");
  const filterRecurringSeries = searchParams.get("recurring_series_id") ?? "";

  React.useEffect(() => {
    const wid = searchParams.get("worker_id");
    const d = searchParams.get("date");
    React.startTransition(() => {
      if (wid && /^[a-f\d]{24}$/i.test(wid)) setFilterWorker(wid);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setFilterDate(d);
    });
  }, [searchParams]);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<JobRow | null>(null);
  const [suggestLoading, setSuggestLoading] = React.useState(false);

  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [replaceJob, setReplaceJob] = React.useState<JobRow | null>(null);
  const [replaceCandidates, setReplaceCandidates] = React.useState<ReplacementCandidate[]>([]);
  const [replaceHistory, setReplaceHistory] = React.useState<ReplacementHistoryRow[]>([]);
  const [replaceLoading, setReplaceLoading] = React.useState(false);
  const [replaceBusy, setReplaceBusy] = React.useState(false);
  const [replacePick, setReplacePick] = React.useState("");
  const [replaceReason, setReplaceReason] = React.useState("");

  const [ratingOpen, setRatingOpen] = React.useState(false);
  const [ratingJob, setRatingJob] = React.useState<JobRow | null>(null);
  const [ratingRw, setRatingRw] = React.useState("__none__");
  const [ratingWc, setRatingWc] = React.useState("__none__");
  const [ratingRwComment, setRatingRwComment] = React.useState("");
  const [ratingWcComment, setRatingWcComment] = React.useState("");
  const [ratingBusy, setRatingBusy] = React.useState(false);

  const [smartAssignOpen, setSmartAssignOpen] = React.useState(false);
  const [smartAssignLoading, setSmartAssignLoading] = React.useState(false);
  const [smartAssignRows, setSmartAssignRows] = React.useState<SmartSuggestionRow[]>([]);

  const [form, setForm] = React.useState({
    client_id: "",
    worker_id: "",
    date: "",
    job_type_id: "",
    time_start: "09:00",
    time_end: "17:00",
    status: "assigned" as JobRow["status"],
    payment_status: "pending" as JobRow["payment_status"],
    notes: "",
    client_price: "" as string,
    worker_pay: "" as string,
  });

  const selectableWorkers = React.useMemo(
    () => workers.filter((w) => w.status !== "inactive"),
    [workers],
  );

  const activeJobTypes = React.useMemo(() => jobTypes.filter((j) => j.active), [jobTypes]);

  const jobTypesForForm = React.useMemo(() => {
    if (!editing) return activeJobTypes;
    const cur = jobTypes.find((j) => j.id === editing.job_type_id);
    if (cur && !cur.active && !activeJobTypes.some((j) => j.id === cur.id)) {
      return [cur, ...activeJobTypes];
    }
    return activeJobTypes;
  }, [editing, jobTypes, activeJobTypes]);

  async function reloadJobs() {
    const params = new URLSearchParams();
    if (filterDate) params.set("date", filterDate);
    if (filterClient !== "__all__") params.set("client_id", filterClient);
    if (filterWorker !== "__all__") params.set("worker_id", filterWorker);
    if (filterJobType !== "__all__") params.set("job_type_id", filterJobType);
    if (filterBilling === "uninvoiced") params.set("uninvoiced", "1");
    if (filterRecurringSeries) params.set("recurring_series_id", filterRecurringSeries);
    const res = await fetch(`/api/jobs?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load jobs");
    setRows(data);
  }

  React.useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [cRes, wRes, jRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/workers"),
          fetch("/api/job-types"),
        ]);
        const cJson = await cRes.json();
        const wJson = await wRes.json();
        const jJson = await jRes.json();
        if (!cRes.ok) throw new Error(cJson.error || "Failed to load clients");
        if (!wRes.ok) throw new Error(wJson.error || "Failed to load workers");
        if (!jRes.ok) throw new Error(jJson.error || "Failed to load job types");
        if (!cancelled) {
          setJobTypes(
            jJson.map((j: { id: string; slug: string; label: string; active: boolean }) => ({
              id: j.id,
              slug: j.slug,
              label: j.label,
              active: j.active,
            })),
          );
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
        await reloadJobs();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadJobs closes over filters
  }, [filterDate, filterClient, filterWorker, filterJobType, filterBilling, filterRecurringSeries]);

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
    const firstJt = jobTypes.find((j) => j.active)?.id ?? "";
    setForm({
      client_id: clients[0]?.id ?? "",
      worker_id: selectableWorkers[0]?.id ?? "",
      date: dayInputValue(new Date().toISOString()),
      job_type_id: firstJt,
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

  function openEdit(row: JobRow) {
    setEditing(row);
    setForm({
      client_id: row.client_id,
      worker_id: row.worker_id,
      date: dayInputValue(row.date),
      job_type_id: row.job_type_id,
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
      if (!form.job_type_id) {
        toast.error("Select a job type");
        return;
      }
      const payload: Record<string, unknown> = {
        client_id: form.client_id,
        worker_id: form.worker_id,
        date: form.date,
        job_type_id: form.job_type_id,
        time_start: form.time_start,
        time_end: form.time_end,
        status: form.status,
        payment_status: form.payment_status,
        notes: form.notes,
      };
      if (form.client_price.trim() !== "") payload.client_price = Number(form.client_price);
      if (form.worker_pay.trim() !== "") payload.worker_pay = Number(form.worker_pay);

      const res = editing
        ? await fetch(`/api/jobs/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Job updated" : "Job created");
      setOpen(false);
      await reloadJobs();

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

  async function suggestFromRateCard() {
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/rate-engine/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type_id: form.job_type_id,
          time_start: form.time_start,
          time_end: form.time_end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggestion failed");
      if (!data.matched_rule) {
        toast.warning("No matching rate rule", {
          description: "Add a rate rule for this job type under Rate & margin.",
        });
        return;
      }
      if (data.suggested_client_price != null) {
        setForm((f) => ({ ...f, client_price: String(data.suggested_client_price) }));
      }
      if (data.suggested_worker_pay != null) {
        setForm((f) => ({ ...f, worker_pay: String(data.suggested_worker_pay) }));
      }
      toast.success("Prices filled from rate card");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setSuggestLoading(false);
    }
  }

  async function patchJob(id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await reloadJobs();
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

  async function remove(row: JobRow) {
    if (!confirm("Delete this job?")) return;
    try {
      const res = await fetch(`/api/jobs/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Job deleted");
      await reloadJobs();
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

  async function openReplace(row: JobRow) {
    setReplaceJob(row);
    setReplaceOpen(true);
    setReplaceCandidates([]);
    setReplaceHistory([]);
    setReplacePick("");
    setReplaceReason("");
    setReplaceLoading(true);
    try {
      const [cRes, hRes] = await Promise.all([
        fetch(`/api/jobs/${row.id}/replacement-candidates`),
        fetch(`/api/jobs/${row.id}/replacements`),
      ]);
      const cJson = await cRes.json();
      if (!cRes.ok) throw new Error(cJson.error || "Could not load candidates");
      setReplaceCandidates((cJson.candidates ?? []) as ReplacementCandidate[]);
      const hJson = await hRes.json().catch(() => ({}));
      const hist = hRes.ok && Array.isArray(hJson.history) ? hJson.history : [];
      setReplaceHistory(hist as ReplacementHistoryRow[]);
      if (!hRes.ok) {
        toast.warning("Replacement history could not be loaded.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open replacement");
      setReplaceOpen(false);
      setReplaceJob(null);
    } finally {
      setReplaceLoading(false);
    }
  }

  async function submitReplace(auto: boolean) {
    if (!replaceJob) return;
    if (!auto && !replacePick) {
      toast.error("Select a replacement worker");
      return;
    }
    setReplaceBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (replaceReason.trim()) body.reason = replaceReason.trim();
      if (auto) body.auto = true;
      else body.worker_id = replacePick;

      const res = await fetch(`/api/jobs/${replaceJob.id}/replace-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Replacement failed");
      toast.success(auto ? "Assigned best available worker" : "Worker replaced");
      setReplaceOpen(false);
      setReplaceJob(null);
      await reloadJobs();
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
      toast.error(e instanceof Error ? e.message : "Replacement failed");
    } finally {
      setReplaceBusy(false);
    }
  }

  async function loadSmartSuggestions() {
    if (
      !form.client_id ||
      !form.date ||
      !form.job_type_id ||
      !form.time_start ||
      !form.time_end
    ) {
      toast.error("Select client, job type, date, and start/end times first.");
      return;
    }
    setSmartAssignOpen(true);
    setSmartAssignLoading(true);
    setSmartAssignRows([]);
    try {
      const body: Record<string, unknown> = {
        client_id: form.client_id,
        date: form.date,
        time_start: form.time_start,
        time_end: form.time_end,
        job_type_id: form.job_type_id,
      };
      if (editing?.id) body.exclude_job_id = editing.id;
      const res = await fetch("/api/jobs/suggest-workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Suggestions failed");
      const rows = (data.suggestions ?? []) as SmartSuggestionRow[];
      setSmartAssignRows(rows);
      if (rows.length === 0) {
        toast.message("No eligible workers for this slot.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suggestions failed");
      setSmartAssignOpen(false);
    } finally {
      setSmartAssignLoading(false);
    }
  }

  function pickSmartWorker(row: SmartSuggestionRow) {
    setForm((f) => ({ ...f, worker_id: row.id }));
    setSmartAssignOpen(false);
    const bits = [
      row.status === "available" ? "available" : "assigned",
      `★${row.effective_rating}`,
      row.skill_matches_job_type ? "skill match" : null,
    ].filter(Boolean);
    toast.success(`Worker set to ${row.full_name} (score ${row.score}/100 — ${bits.join(", ")})`);
  }

  function openRatings(row: JobRow) {
    setRatingJob(row);
    setRatingRw(row.worker_rating_by_client != null ? String(row.worker_rating_by_client) : "__none__");
    setRatingWc(row.client_rating_by_worker != null ? String(row.client_rating_by_worker) : "__none__");
    setRatingRwComment(row.worker_rating_by_client_comment ?? "");
    setRatingWcComment(row.client_rating_by_worker_comment ?? "");
    setRatingOpen(true);
  }

  async function submitRatings() {
    if (!ratingJob) return;
    const effRw =
      ratingRw !== "__none__" ? Number(ratingRw) : ratingJob.worker_rating_by_client;
    const effWc =
      ratingWc !== "__none__" ? Number(ratingWc) : ratingJob.client_rating_by_worker;
    if (ratingRwComment.trim() && (effRw == null || effRw < 1)) {
      toast.error("Client → worker: add stars before saving a comment.");
      return;
    }
    if (ratingWcComment.trim() && (effWc == null || effWc < 1)) {
      toast.error("Worker → client: add stars before saving a comment.");
      return;
    }
    setRatingBusy(true);
    try {
      const payload: Record<string, unknown> = {
        worker_rating_by_client_comment: ratingRwComment,
        client_rating_by_worker_comment: ratingWcComment,
      };
      if (ratingRw !== "__none__") payload.worker_rating_by_client = Number(ratingRw);
      if (ratingWc !== "__none__") payload.client_rating_by_worker = Number(ratingWc);

      const res = await fetch(`/api/jobs/${ratingJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save ratings");
      toast.success("Ratings saved");
      setRatingOpen(false);
      setRatingJob(null);
      await reloadJobs();
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
      toast.error(e instanceof Error ? e.message : "Could not save ratings");
    } finally {
      setRatingBusy(false);
    }
  }

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
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">Who is working where, and when.</p>
        </div>
        <Button
          onClick={openCreate}
          disabled={
            clients.length === 0 ||
            selectableWorkers.length === 0 ||
            activeJobTypes.length === 0
          }
        >
          <Plus />
          New job
        </Button>
      </div>

      {filterRecurringSeries ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Showing jobs from one recurring series.</span>
          <Button
            variant="outline"
            size="xs"
            type="button"
            onClick={() => {
              router.replace("/jobs");
            }}
          >
            Clear series filter
          </Button>
          <Link
            href="/recurring"
            className={cn(buttonVariants({ variant: "secondary", size: "xs" }))}
          >
            Recurring bookings
          </Link>
        </div>
      ) : null}

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
        <div className="grid gap-2">
          <Label>Job type</Label>
          <Select
            value={filterJobType}
            onValueChange={(v) => setFilterJobType(typeof v === "string" ? v : "__all__")}
          >
            <SelectTrigger className="lg:w-56">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All job types</SelectItem>
              {jobTypes.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.label}
                  {!j.active ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Billing</Label>
          <Select
            value={filterBilling}
            onValueChange={(v) =>
              setFilterBilling(v === "uninvoiced" ? "uninvoiced" : "__all__")
            }
          >
            <SelectTrigger className="lg:w-52">
              <SelectValue placeholder="All jobs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All jobs</SelectItem>
              <SelectItem value="uninvoiced">Not on invoice yet</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setFilterDate("");
            setFilterClient("__all__");
            setFilterWorker("__all__");
            setFilterJobType("__all__");
            setFilterBilling("__all__");
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
              <TableHead>Invoice</TableHead>
              <TableHead>Profit</TableHead>
              <TableHead className="tabular-nums">Margin</TableHead>
              <TableHead className="whitespace-nowrap text-center text-muted-foreground">
                C★ / W★
              </TableHead>
              <TableHead className="min-w-[220px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground">
                  No jobs match these filters.
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
                  <TableCell>
                    {row.invoice_id ? (
                      <Badge variant="outline" className="font-normal">
                        Invoiced
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.profit != null && Number.isFinite(row.profit)
                      ? phpCurrencyFormatter.format(row.profit)
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.margin_pct != null && Number.isFinite(row.margin_pct)
                      ? `${row.margin_pct}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                    <span title="Client rated worker">
                      {row.worker_rating_by_client != null ? `★${row.worker_rating_by_client}` : "—"}
                    </span>
                    <span className="mx-0.5 opacity-50">/</span>
                    <span title="Worker rated client">
                      {row.client_rating_by_worker != null ? `★${row.client_rating_by_worker}` : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.payment_status === "pending" &&
                        row.status !== "cancelled" &&
                        !row.invoice_id && (
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => patchJob(row.id, { payment_status: "paid" })}
                        >
                          Paid
                        </Button>
                      )}
                      {row.status !== "completed" && row.status !== "cancelled" && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => patchJob(row.id, { status: "completed" })}
                        >
                          Complete
                        </Button>
                      )}
                      {row.status !== "completed" && row.status !== "cancelled" && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => openReplace(row)}
                          title="Auto-replacement"
                        >
                          <ArrowLeftRight className="size-3" />
                          Replace
                        </Button>
                      )}
                      {row.status === "completed" && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => openRatings(row)}
                          title="Mutual ratings"
                        >
                          <Star className="size-3" />
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
            <DialogTitle>{editing ? "Edit job" : "New job"}</DialogTitle>
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
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
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
              <Button
                type="button"
                variant="secondary"
                className="gap-1.5 sm:mb-0.5"
                disabled={
                  smartAssignLoading ||
                  !form.client_id ||
                  !form.date ||
                  !form.job_type_id ||
                  !form.time_start ||
                  !form.time_end
                }
                title="Rank workers: location vs client address, skill, availability, rating (100 pts)."
                onClick={() => void loadSmartSuggestions()}
              >
                {smartAssignLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Smart picks
              </Button>
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
              <Label>Job type</Label>
              <Select
                value={form.job_type_id}
                onValueChange={(v) => {
                  if (typeof v !== "string") return;
                  setForm((f) => ({ ...f, job_type_id: v }));
                }}
              >
                <SelectTrigger id="job_type_id">
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {jobTypesForForm.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.label}
                      {!j.active ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  setForm((f) => ({ ...f, status: v as JobRow["status"] }));
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
                    payment_status: v as JobRow["payment_status"],
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="client_price">Pricing</Label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  disabled={suggestLoading || !form.job_type_id}
                  onClick={() => void suggestFromRateCard()}
                >
                  <Sparkles className="size-3.5" />
                  {suggestLoading ? "…" : "From rate card"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="client_price" className="sr-only">
                    Client price
                  </Label>
                  <Input
                    id="client_price"
                    inputMode="decimal"
                    placeholder="Client price"
                    value={form.client_price}
                    onChange={(e) => setForm((f) => ({ ...f, client_price: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="worker_pay" className="sr-only">
                    Worker pay
                  </Label>
                  <Input
                    id="worker_pay"
                    inputMode="decimal"
                    placeholder="Worker pay"
                    value={form.worker_pay}
                    onChange={(e) => setForm((f) => ({ ...f, worker_pay: e.target.value }))}
                  />
                </div>
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

      <Dialog
        open={replaceOpen}
        onOpenChange={(o) => {
          setReplaceOpen(o);
          if (!o) setReplaceJob(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="size-4 opacity-80" />
              Auto-replacement
            </DialogTitle>
          </DialogHeader>
          {replaceJob ? (
            <div className="grid gap-4 py-2">
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">
                  {replaceJob.client_name ?? "Client"} · {formatDisplayDay(replaceJob.date)}
                </p>
                <p className="text-muted-foreground">
                  Current: {replaceJob.worker_name ?? replaceJob.worker_id} · {replaceJob.time_start}–
                  {replaceJob.time_end}
                </p>
              </div>

              {replaceLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Finding eligible workers…
                </p>
              ) : replaceCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No workers are free for this slot (excluding inactive and overlapping bookings).
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Ranked by location vs client address, skill vs job type, availability, and rating
                    (100-point score). Auto-assign picks the top row.
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Worker</TableHead>
                          <TableHead>Skill</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Job ★</TableHead>
                          <TableHead className="text-right">Ops</TableHead>
                          <TableHead className="text-right tabular-nums">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {replaceCandidates.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.full_name || c.id}</TableCell>
                            <TableCell className="text-muted-foreground">{c.skill}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {c.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.rated_by_clients_avg != null ? `★${c.rated_by_clients_avg}` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{c.rating}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {c.score}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="grid gap-2">
                    <Label>Assign manually</Label>
                    <Select
                      value={replacePick || "__pick__"}
                      onValueChange={(v) =>
                        setReplacePick(typeof v === "string" && v !== "__pick__" ? v : "")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose worker" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__pick__">Select…</SelectItem>
                        {replaceCandidates.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name || c.id} (score {c.score}, job ★
                            {c.rated_by_clients_avg ?? "—"}, ops {c.rating})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="rep_reason">Note (optional)</Label>
                <Textarea
                  id="rep_reason"
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder="e.g. No-show, requested swap…"
                  rows={2}
                />
              </div>

              {replaceHistory.length > 0 ? (
                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Past swaps on this job</Label>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {replaceHistory.map((h) => (
                      <li key={h.id}>
                        {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}:{" "}
                        {h.from_worker_name || "?"} → {h.to_worker_name || "?"}
                        {h.reason ? ` — ${h.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReplaceOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              disabled={
                replaceBusy || replaceLoading || replaceCandidates.length === 0 || !replaceJob
              }
              onClick={() => void submitReplace(true)}
            >
              {replaceBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Assign best
            </Button>
            <Button
              disabled={replaceBusy || replaceLoading || !replacePick || !replaceJob}
              onClick={() => void submitReplace(false)}
            >
              {replaceBusy ? <Loader2 className="animate-spin size-4" /> : null}
              Assign selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ratingOpen}
        onOpenChange={(o) => {
          setRatingOpen(o);
          if (!o) setRatingJob(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="size-4 opacity-80" />
              Visit ratings
            </DialogTitle>
          </DialogHeader>
          {ratingJob ? (
            <div className="grid gap-5 py-2">
              <p className="text-sm text-muted-foreground">
                Record the client&apos;s rating of the worker and the worker&apos;s rating of the
                client for this completed visit. Rolling averages appear on worker and client
                profiles.
              </p>
              <div className="grid gap-2">
                <Label>Client rates worker</Label>
                <Select
                  value={ratingRw}
                  onValueChange={(v) => typeof v === "string" && setRatingRw(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Stars" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} star{n === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={ratingRwComment}
                  onChange={(e) => setRatingRwComment(e.target.value)}
                  placeholder="Optional comment"
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label>Worker rates client</Label>
                <Select
                  value={ratingWc}
                  onValueChange={(v) => typeof v === "string" && setRatingWc(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Stars" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} star{n === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={ratingWcComment}
                  onChange={(e) => setRatingWcComment(e.target.value)}
                  placeholder="Optional comment"
                  rows={2}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingOpen(false)}>
              Cancel
            </Button>
            <Button disabled={ratingBusy || !ratingJob} onClick={() => void submitRatings()}>
              {ratingBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save ratings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={smartAssignOpen} onOpenChange={setSmartAssignOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 opacity-80" />
              Smart assignment
            </DialogTitle>
          </DialogHeader>
          {smartAssignLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Ranking workers…
            </p>
          ) : smartAssignRows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No workers are free for this slot (inactive and overlapping bookings excluded).
            </p>
          ) : (
            <div className="grid gap-3 py-2">
              <p className="text-sm text-muted-foreground">
                Each factor is scored out of 25 (100 total): <strong>location</strong> (worker vs
                client address), <strong>skill</strong> (match to job type when inferable),{" "}
                <strong>availability</strong>, and <strong>rating</strong> (job ★ or ops).
              </p>
              <div className="max-h-[min(60vh,420px)] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Loc</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Skill</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Avail</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Rate</TableHead>
                      <TableHead className="text-right tabular-nums whitespace-nowrap">Σ</TableHead>
                      <TableHead className="w-[72px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smartAssignRows.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <span className="text-muted-foreground tabular-nums">#{i + 1}</span>{" "}
                          {r.full_name}
                          <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                            {r.skill}
                            {r.preferred_skill ? (
                              <> · job prefers {r.preferred_skill}</>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="font-normal capitalize">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.breakdown.location}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.breakdown.skill}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.breakdown.availability}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.breakdown.rating}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{r.score}</TableCell>
                        <TableCell className="pr-2">
                          <Button size="xs" variant="secondary" onClick={() => pickSmartWorker(r)}>
                            Use
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmartAssignOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
