import { SidebarNav } from "@/components/shell/sidebar-nav";
import { SidebarUser } from "@/components/shell/sidebar-user";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-sidebar-width flex-col gap-6 bg-sidebar py-6">
      <div className="px-4">
        <span className="text-[16px] font-semibold leading-none text-white">
          NovelNow
        </span>
      </div>
      <SidebarNav />
      <SidebarUser />
    </aside>
  );
}
