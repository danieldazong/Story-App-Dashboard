import { Sidebar } from "@/components/shell/sidebar";
import { requireAdmin } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authorisation boundary for the whole dashboard route group. This is
  // deliberately independent of middleware — removing middleware must still
  // leave non-admins blocked here. See Prompts/11-clerk-auth.md, Verification.
  await requireAdmin();

  return (
    <div className="min-h-screen bg-page">
      <Sidebar />
      <main className="ml-sidebar-width min-h-screen bg-page">
        <div className="w-full px-page-padding py-page-padding">
          {children}
        </div>
      </main>
    </div>
  );
}
