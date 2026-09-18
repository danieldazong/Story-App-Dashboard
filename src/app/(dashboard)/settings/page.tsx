import { SettingsScreen } from "@/components/settings/settings-screen";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { PageHeader } from "@/components/shell/page-header";
import { listTeamMembers } from "@/app/actions/team";
import { serverSupabase } from "@/lib/server-supabase";
import { getAppSettings } from "@/lib/queries";

export default async function SettingsPage() {
  const client = await serverSupabase();

  // Settings come from Postgres, the team from Clerk — two independent
  // services, so they run together rather than in sequence.
  const [result, team] = await Promise.all([
    getAppSettings(client),
    listTeamMembers(),
  ]);

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader breadcrumbs={[{ label: "Settings" }]} title="Settings" />
        <div className="max-w-[720px]">
          <QueryErrorCard
            message={result.error}
            kind={result.kind}
            retryHref="/settings"
          />
        </div>
      </div>
    );
  }

  // A failed team read does not block the whole screen: settings are the
  // reason this page exists, and the Team card reports its own failure with a
  // retry. The same "a failed read is not an empty result" rule as everywhere
  // else — the card must not render an empty roster over a Clerk outage.
  return (
    <SettingsScreen
      settings={result.data}
      teamMembers={team.ok ? team.data : []}
      teamLoadError={team.ok ? null : team.formError}
    />
  );
}
