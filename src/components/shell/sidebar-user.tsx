"use client";

import { UserButton, useUser } from "@clerk/nextjs";

/**
 * Signed-in operator block, flush at the bottom of the sidebar. The three nav
 * items above it are untouched.
 */
export function SidebarUser() {
  const { user, isLoaded } = useUser();

  return (
    <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-4 pt-4">
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox: "h-8 w-8",
          },
        }}
      />
      <span className="min-w-0 flex-1 truncate text-helper text-white/60">
        {isLoaded
          ? (user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "")
          : ""}
      </span>
    </div>
  );
}
