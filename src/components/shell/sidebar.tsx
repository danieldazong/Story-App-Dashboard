import Image from "next/image";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { SidebarUser } from "@/components/shell/sidebar-user";
import { images } from "@/constants/images";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-sidebar-width flex-col gap-6 bg-sidebar py-6">
      <div className="flex items-center gap-2 px-4">
        {/*
          Decorative: the wordmark beside it already says "Talebrim", so an
          alt text here would make a screen reader announce the name twice.

          `rounded-[5px]` matches the artwork's own corner radius at this size
          — the mark is drawn on its own dark tile, and leaving it square
          against the sidebar shows a visible corner mismatch.
        */}
        <Image
          src={images.logo}
          alt=""
          width={24}
          height={24}
          className="rounded-[5px]"
          priority
        />
        <span className="text-[16px] font-semibold leading-none text-white">
          Talebrim
        </span>
      </div>
      <SidebarNav />
      <SidebarUser />
    </aside>
  );
}
