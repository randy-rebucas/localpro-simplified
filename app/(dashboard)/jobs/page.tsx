import { Suspense } from "react";
import JobsView from "@/components/jobs-view";

export default function JobsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <JobsView />
    </Suspense>
  );
}
