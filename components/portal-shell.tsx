"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const onLogin = pathname === "/portal/login";

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/portal/logout", { method: "POST" });
      router.push("/portal/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <Link href={onLogin ? "/portal/login" : "/portal"} className="font-heading text-lg font-semibold">
              LocalPro
            </Link>
            <p className="text-xs text-muted-foreground">
              {onLogin ? "Client portal sign-in" : "Client portal"}
            </p>
          </div>
          {!onLogin ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void logout()}>
              Sign out
            </Button>
          ) : null}
        </div>
        <Separator />
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
