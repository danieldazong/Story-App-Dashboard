"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BookOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/books", label: "Stories", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-2 px-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-10 items-center gap-3 rounded-md px-3 text-body transition-colors",
              active
                ? "bg-sidebar-active text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white/80",
            )}
          >
            {active && (
              <span className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-primary" />
            )}
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
