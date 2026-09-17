"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConnectionState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "connected" }
  | { status: "failed"; message: string };

/**
 * All four states render. The success path is wired by default — no storage
 * client exists yet (Supabase lands in prompts 11-18), so this simulates the
 * round trip rather than reaching a real bucket.
 */
export function StorageConnectionTest() {
  const [state, setState] = useState<ConnectionState>({ status: "connected" });

  function runTest() {
    setState({ status: "testing" });
    window.setTimeout(() => {
      setState({ status: "connected" });
    }, 900);
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="muted"
        size="sm"
        disabled={state.status === "testing"}
        onClick={runTest}
      >
        Test connection
      </Button>

      {state.status === "testing" && (
        <span className="text-helper text-muted">Testing…</span>
      )}

      {state.status === "connected" && (
        <span className="inline-flex items-center gap-1.5 text-helper text-status-ok">
          <Check className="h-3.5 w-3.5" />
          Connected
        </span>
      )}

      {state.status === "failed" && (
        <span className="text-helper text-destructive">{state.message}</span>
      )}
    </div>
  );
}
