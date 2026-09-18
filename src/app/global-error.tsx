"use client";

import { useEffect } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * The last boundary: a failure in the ROOT layout itself.
 *
 * global-error REPLACES the root layout rather than rendering inside it, so it
 * inherits nothing — no <html>, no <body>, no stylesheet, no font variables, no
 * ClerkProvider, no Toaster. All of that has to be declared here or this page
 * renders as unstyled black-on-white text at a moment when the app is already
 * visibly broken.
 *
 * The fonts are re-declared rather than imported from layout.tsx: next/font
 * requires module-scope initialisation in the file that uses it, and layout.tsx
 * does not export them.
 *
 * Deliberately minimal. Anything that could itself throw — a Supabase read, a
 * Clerk hook, a shared component pulling in a provider — would fail inside the
 * boundary meant to catch failures, and there is nothing below this to catch
 * that. No <Button>, no <Link>: a plain <a> forces a full document load, which
 * is the correct recovery when the root layout is what broke.
 */

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-page text-text">
        <title>Something went wrong — Talebrim Admin</title>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="card flex w-full max-w-[480px] flex-col gap-3 border-destructive p-6">
            <h1 className="card__header-title text-destructive">
              Something went wrong
            </h1>
            <p className="card__sub-line">
              The dashboard failed to start. Reloading usually fixes it.
            </p>
            {error.digest && (
              <p className="font-mono text-mono text-muted">
                Reference: {error.digest}
              </p>
            )}
            <div>
              {/*
                eslint-disable-next-line @next/next/no-html-link-for-pages --
                A plain <a> is correct HERE specifically, and <Link> would be
                wrong. global-error replaces the root layout, so the React tree
                and router context this renders in are the ones that just
                failed. <Link> performs a client-side navigation inside that
                broken tree and would very likely land back in the same error.
                A full document load is the actual recovery, and only a plain
                anchor forces one. The rule is right everywhere else in this
                app, which is why this is suppressed on one line rather than
                switched off.
              */}
              <a
                href="/"
                className="inline-flex h-10 items-center rounded-input bg-primary px-4 text-body font-medium text-white"
              >
                Reload the dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
