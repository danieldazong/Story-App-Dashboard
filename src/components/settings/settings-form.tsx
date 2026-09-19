"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm, useFormContext } from "react-hook-form";
import { useAuth, useUser } from "@clerk/nextjs";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FormatChips } from "@/components/settings/format-chips";
import { StorageConnectionTest } from "@/components/settings/storage-connection-test";
import { TeamCard } from "@/components/settings/team-card";
import type { TeamMemberRecord } from "@/app/actions/team";
import { DangerZoneCard } from "@/components/settings/danger-zone-card";
import { MATURITY_LEVELS } from "@/data/maturity-levels";
import {
  SELECTABLE_AUDIO_FORMATS,
  SELECTABLE_SCRIPT_FORMATS,
  STORAGE_PROVIDER_OPTIONS,
  TEAM_ROLE_OPTIONS,
} from "@/data/settings-defaults";
import type { AppSettings } from "@/lib/queries";

export const SETTINGS_FORM_ID = "settings-form";

const settingsSchema = z.object({
  storageProvider: z.string().min(1, "Choose a storage provider"),
  bucketName: z.string().min(1, "Bucket name is required"),
  publicCdnDomain: z
    .string()
    .min(1, "Public CDN domain is required")
    .url("Enter a full URL, including https://"),
  maxAudioSizeMb: z
    .number({ message: "Enter a size in MB" })
    .int("Whole megabytes only")
    .positive("Must be greater than zero"),
  acceptedAudioFormats: z.array(z.string()).min(1, "Keep at least one format"),
  acceptedScriptFormats: z.array(z.string()).min(1, "Keep at least one format"),
  detectDurationAutomatically: z.boolean(),
  defaultChapterAccess: z.enum(["free", "locked"]),
  freeChaptersAtStart: z
    .number({ message: "Enter a number of chapters" })
    .int("Whole chapters only")
    .min(0, "Cannot be negative"),
  defaultMaturity: z.enum(["general", "mature_17"]),
});

export type SettingsValues = z.infer<typeof settingsSchema>;

// Values come from the app_settings row, read server-side and passed in as a
// prop. When that table is empty getAppSettings falls back to the constants in
// data/settings-defaults.ts, so this component never needs to know which.
function defaultValues(settings: AppSettings): SettingsValues {
  return {
    storageProvider: settings.storageProvider,
    bucketName: settings.bucketName,
    publicCdnDomain: settings.publicCdnDomain,
    maxAudioSizeMb: settings.maxAudioSizeMb,
    acceptedAudioFormats: [...settings.acceptedAudioFormats],
    acceptedScriptFormats: [...settings.acceptedScriptFormats],
    detectDurationAutomatically: settings.detectDurationAutomatically,
    defaultChapterAccess: settings.defaultChapterAccess,
    freeChaptersAtStart: settings.freeChaptersAtStart,
    defaultMaturity: settings.defaultMaturity,
  };
}

export function useSettingsForm(settings: AppSettings) {
  return useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultValues(settings),
    mode: "onChange",
  });
}

export function SettingsSaveButton({ pending = false }: { pending?: boolean }) {
  const { formState } = useFormContext<SettingsValues>();
  const disabled = !formState.isDirty || !formState.isValid || pending;

  return (
    <Button type="submit" form={SETTINGS_FORM_ID} disabled={disabled}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function AccountCard() {
  const { user, isLoaded } = useUser();
  const { sessionClaims } = useAuth();

  // Role comes from the session token claim, populated from Clerk
  // publicMetadata — never from a local table. See AGENTS.md, Clerk Rules.
  const role = sessionClaims?.metadata?.role;
  const roleLabel =
    TEAM_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;

  const name = user?.fullName ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Account</h2>
        <p className="card__sub-line">
          Your operator identity and authentication credentials.
        </p>
      </div>

      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <span className="field-group__label">Name</span>
        <span className="text-body text-text">{isLoaded ? name : ""}</span>
      </div>

      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <span className="field-group__label">Email</span>
        <span className="font-mono text-mono text-text">
          {isLoaded ? email : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-border pb-4">
        <span className="field-group__label">Role</span>
        {roleLabel && (
          <span className="status-pill status-pill--ok w-fit">{roleLabel}</span>
        )}
      </div>

      <div>
        {/* Clerk owns credentials — this opens its account management rather
            than a password form of our own. */}
        <Link
          href="/account"
          className="rounded-sm text-helper text-muted underline transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Change password
        </Link>
      </div>
    </div>
  );
}

function StorageCard() {
  const form = useFormContext<SettingsValues>();

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Storage</h2>
        <p className="card__sub-line">
          Direct object store configuration for chapter scripts and audio files.
        </p>
      </div>

      <FormField
        control={form.control}
        name="storageProvider"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Storage provider
            </FormLabel>
            <FormControl>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORAGE_PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <p className="field-group__helper">
              Primary high-throughput, S3-compatible storage tier.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="bucketName"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">Bucket name</FormLabel>
            <FormControl>
              <Input {...field} className="font-mono text-mono" />
            </FormControl>
            <p className="field-group__helper">
              Target object container name.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="publicCdnDomain"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Public CDN domain
            </FormLabel>
            <FormControl>
              <Input {...field} className="font-mono text-mono" />
            </FormControl>
            <p className="field-group__helper">
              Prefix for cover and audio URLs served to the app.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <StorageConnectionTest />
    </div>
  );
}

function UploadDefaultsCard() {
  const form = useFormContext<SettingsValues>();

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Upload defaults</h2>
        <p className="card__sub-line">
          Guard rails applied to browser upload operations.
        </p>
      </div>

      <FormField
        control={form.control}
        name="maxAudioSizeMb"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Max audio file size
            </FormLabel>
            <FormControl>
              <div className="relative w-48">
                <Input
                  type="number"
                  min={1}
                  value={Number.isNaN(field.value) ? "" : field.value}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value === ""
                        ? Number.NaN
                        : event.target.valueAsNumber,
                    )
                  }
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  className="pr-12 font-mono text-mono"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-mono text-muted">
                  MB
                </span>
              </div>
            </FormControl>
            <p className="field-group__helper">
              Maximum allowed size for narration audio uploads.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="acceptedAudioFormats"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Accepted audio formats
            </FormLabel>
            <FormControl>
              <FormatChips
                value={field.value}
                onChange={field.onChange}
                selectable={SELECTABLE_AUDIO_FORMATS}
                label="audio format"
              />
            </FormControl>
            <p className="field-group__helper">
              Audio formats accepted at chapter upload dropzones.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="acceptedScriptFormats"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Accepted script formats
            </FormLabel>
            <FormControl>
              <FormatChips
                value={field.value}
                onChange={field.onChange}
                selectable={SELECTABLE_SCRIPT_FORMATS}
                label="script format"
              />
            </FormControl>
            <p className="field-group__helper">
              Manuscript text formats parsed during ingestion.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="detectDurationAutomatically"
        render={({ field }) => (
          <FormItem className="field-group">
            <div className="flex items-center justify-between gap-6">
              <div className="flex flex-col gap-1">
                <FormLabel className="field-group__label">
                  Detect audio duration automatically
                </FormLabel>
                <p className="field-group__helper">
                  Adds fallback to manual entry if detection fails.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Detect audio duration automatically"
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function PublishingDefaultsCard() {
  const form = useFormContext<SettingsValues>();

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Publishing defaults</h2>
        <p className="card__sub-line">
          Cataloging access control rules and default chapter settings.
        </p>
      </div>

      <FormField
        control={form.control}
        name="defaultChapterAccess"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Default chapter access
            </FormLabel>
            <FormControl>
              <SegmentedControl
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: "free", label: "Free" },
                  { value: "locked", label: "Locked" },
                ]}
                aria-label="Default chapter access"
              />
            </FormControl>
            <p className="field-group__helper">
              Initial paywall state assigned to newly created chapters.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="freeChaptersAtStart"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Free chapters at start of story
            </FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                value={Number.isNaN(field.value) ? "" : field.value}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ""
                      ? Number.NaN
                      : event.target.valueAsNumber,
                  )
                }
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
                className="w-48 font-mono text-mono"
              />
            </FormControl>
            <p className="field-group__helper">
              Chapters below this number are always free.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="defaultMaturity"
        render={({ field }) => (
          <FormItem className="field-group">
            <FormLabel className="field-group__label">
              Default maturity
            </FormLabel>
            <FormControl>
              <SegmentedControl
                value={field.value}
                onChange={field.onChange}
                options={MATURITY_LEVELS.map((level) => ({
                  value: level.value,
                  label: level.label,
                }))}
                aria-label="Default maturity"
              />
            </FormControl>
            <p className="field-group__helper">
              Applies content advisory gate across mobile reader apps.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function SettingsForm({
  onSave,
  formError,
  teamMembers,
  teamLoadError,
}: {
  onSave?: (values: SettingsValues) => void;
  formError?: string | null;
  /**
   * Read server-side by the Settings page and passed straight through to the
   * Team card. This component does nothing with it — the alternative was the
   * card fetching on mount, which the React Compiler correctly rejects as
   * setState-in-effect.
   */
  teamMembers: TeamMemberRecord[];
  teamLoadError?: string | null;
}) {
  const form = useFormContext<SettingsValues>();

  function onSubmit(values: SettingsValues) {
    onSave?.(values);
  }

  return (
    <form
      id={SETTINGS_FORM_ID}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex max-w-[720px] flex-col gap-6"
    >
      {formError && (
        <p className="field-group__helper field-group__helper--error">
          {formError}
        </p>
      )}
      <AccountCard />
      <StorageCard />
      <UploadDefaultsCard />
      <PublishingDefaultsCard />
      <TeamCard initialMembers={teamMembers} loadError={teamLoadError} />
      <DangerZoneCard />
    </form>
  );
}
