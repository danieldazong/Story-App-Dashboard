"use client";

import { useState } from "react";
import { FormProvider } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import {
  SettingsForm,
  SettingsSaveButton,
  useSettingsForm,
  type SettingsValues,
} from "@/components/settings/settings-form";
import { updateAppSettings } from "@/app/actions/settings";
import type { AppSettings } from "@/lib/queries";

export function SettingsScreen({ settings }: { settings: AppSettings }) {
  const form = useSettingsForm(settings);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setSaving] = useState(false);

  async function handleSave(values: SettingsValues) {
    setFormError(null);
    setSaving(true);

    const result = await updateAppSettings(values);
    setSaving(false);

    if (!result.ok) {
      setFormError(result.formError);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as keyof SettingsValues, { message });
      }
      return;
    }

    toast.success("Settings saved");

    // resetDefaultValues(), not reset() — same reasoning as the Book editor's
    // save (see book-editor.tsx). reset() re-registers every field and re-runs
    // the schema, cascading into sibling Controllers' setState mid-render;
    // resetDefaultValues() moves the dirty baseline without touching values, so
    // that cascade never starts.
    form.resetDefaultValues(values);
  }

  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: "Settings" }]}
          title="Settings"
          action={<SettingsSaveButton pending={pending} />}
        />
        <SettingsForm onSave={handleSave} formError={formError} />
      </div>
    </FormProvider>
  );
}
