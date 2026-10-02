import Image from "next/image";
import Link from "next/link";
import { images } from "@/constants/images";
import { OPERATOR_LINE, PUBLIC_PAGES, SUPPORT_EMAIL } from "@/data/public-pages";

/**
 * talebrim.com's public pages: Terms, Privacy, Help and account deletion, for
 * the mobile app's readers and its Google Play listing. Outside `(dashboard)`,
 * so `requireAdmin()` never runs here, and `proxy.ts` guards nothing by design:
 * these need no sign-in. A single readable column on the dashboard's own
 * tokens, sized for a phone first, since readers open them from the app.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-2 px-5 py-4">
          {/* Decorative, as in the sidebar: the wordmark beside it says the name. */}
          <Image src={images.logo} alt="" width={24} height={24} className="rounded-[5px]" priority />
          <span className="text-[16px] font-semibold leading-none text-text">Talebrim</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-10">{children}</main>

      <footer className="border-t border-border">
        <nav
          aria-label="Talebrim pages"
          className="mx-auto flex w-full max-w-[720px] flex-wrap gap-x-6 px-5 py-4 text-[13px] text-muted"
        >
          {PUBLIC_PAGES.map((page) => (
            <Link key={page.path} href={page.path} className="py-2 underline-offset-2 hover:text-text hover:underline">
              {page.navLabel}
            </Link>
          ))}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="py-2 underline-offset-2 hover:text-text hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </nav>
        <p className="mx-auto w-full max-w-[720px] px-5 pb-6 text-[13px] text-muted">{OPERATOR_LINE}</p>
      </footer>
    </div>
  );
}
