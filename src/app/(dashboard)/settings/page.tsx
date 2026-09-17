import { SettingsScreen } from "@/components/settings/settings-screen";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { PageHeader } from "@/components/shell/page-header";
import { serverSupabase } from "@/lib/server-supabase";
import { getAppSettings } from "@/lib/queries";

export default async function SettingsPage() {
  const client = await serverSupabase();
  const result = await getAppSettings(client);

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader breadcrumbs={[{ label: "Settings" }]} title="Settings" />
        <div className="max-w-[720px]">
          <QueryErrorCard message={result.error} retryHref="/settings" />
        </div>
      </div>
    );
  }

  return <SettingsScreen settings={result.data} />;
}
