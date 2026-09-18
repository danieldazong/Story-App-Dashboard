"use client";

import { useEffect, useState } from "react";

/**
 * Tells an operator the connection dropped. That is the whole scope.
 *
 * It deliberately does NOT disable saves or uploads, against the original
 * prompt 19 text. Two reasons, both recorded in the rewritten prompt:
 *
 *   - `navigator.onLine` reports whether a network interface is up, not whether
 *     anything is reachable. It returns true on a connected-but-dead network
 *     (captive portals, a downed router upstream) and false on some VPN
 *     configurations. Gating saves on it would both fail to block when it
 *     matters and block saves that would have worked.
 *   - Disabling every primary button app-wide would touch every form — the
 *     largest happy-path surface in a prompt whose own constraints forbid
 *     happy-path changes.
 *
 * The existing error handling already catches a save that fails; this only
 * removes the surprise. If real gating is wanted it needs a reachability check,
 * as its own prompt.
 *
 * Rendered from the dashboard layout so it sits below the breadcrumb row on
 * every screen.
 */
export function OfflineBanner() {
  // Starts false, never `!navigator.onLine`: this renders on the server first,
  // where `navigator` does not exist, and a first client paint that disagreed
  // with the server's HTML would be a hydration mismatch.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-input border border-status-warn/30 bg-status-warn/10 px-4 py-2.5 text-helper text-status-warn"
    >
      You&apos;re offline. Changes won&apos;t save until the connection returns.
    </div>
  );
}
