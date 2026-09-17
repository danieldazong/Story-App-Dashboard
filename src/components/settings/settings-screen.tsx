"use client";

import { FormProvider } from "react-hook-form";
import { PageHeader } from "@/components/shell/page-header";
import {
  SettingsForm,
  SettingsSaveButton,
  useSettingsForm,
} from "@/components/settings/settings-form";

export function SettingsScreen() {
  const form = useSettingsForm();

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Settings" }]}
          title="Settings"
          action={<SettingsSaveButton />}
        />
        <SettingsForm />
      </div>
    </FormProvider>
  );
}
