import { Suspense } from "react";
import PortalLoginForm from "./portal-login-form";

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      }
    >
      <PortalLoginForm />
    </Suspense>
  );
}
