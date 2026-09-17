// Application constants, not configuration.
//
// The *values* on this screen (bucket name, CDN domain, max audio size, the
// accepted-format lists, publishing defaults) now live in the `app_settings`
// table and are read via `getAppSettings` — see lib/queries.ts.
//
// What remains here, and why:
//   - STORAGE_PROVIDER_OPTIONS / SELECTABLE_*_FORMATS: the option lists a
//     select or chip control can offer. These are choices the application
//     supports, not values an operator has configured.
//   - TEAM_ROLE_OPTIONS / TeamRole: role labels. Roles come from Clerk
//     publicMetadata; this maps them to display strings.
//   - SETTINGS_TEAM: placeholder roster. The Team card reads from Clerk once a
//     real member list exists; there is no `team_members` table by design.
//   - SETTINGS_DEFAULTS: the fallback used by getAppSettings when the
//     app_settings table is empty — a fresh database has no settings row, and
//     prompt 12 forbids seeding one in a migration. Read by getAppSettings and
//     settingsFallback() only; no component reads it directly any more. The
//     audio cards took their formats and size limit from here until prompt 16
//     threaded the real app_settings values down as required props.

import type { ChapterAccess, Maturity } from "@/types/catalog";

export type StorageProviderOption = {
  value: string;
  label: string;
};

export const STORAGE_PROVIDER_OPTIONS = [
  { value: "supabase_storage", label: "Supabase Storage" },
  { value: "cloudflare_r2", label: "Cloudflare R2" },
  { value: "aws_s3", label: "AWS S3" },
] as const satisfies StorageProviderOption[];

export type TeamRole = "admin" | "editor" | "audio_master";

export type TeamRoleOption = {
  value: TeamRole;
  label: string;
};

export const TEAM_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "audio_master", label: "Audio Master" },
] as const satisfies TeamRoleOption[];

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
};

/**
 * Placeholder team roster. Replaced by a real `team_members` read once the
 * Supabase prompts land.
 */
export const SETTINGS_TEAM = [
  {
    id: "member-1",
    name: "Lead Operator",
    email: "operator@novelnow.internal",
    role: "admin",
  },
  {
    id: "member-2",
    name: "Elena Vance",
    email: "elena.vance@novelnow.internal",
    role: "editor",
  },
  {
    id: "member-3",
    name: "Marcus Ray",
    email: "marcus.ray@novelnow.internal",
    role: "audio_master",
  },
] as const satisfies TeamMember[];

export const SETTINGS_DEFAULTS = {
  storageProvider: "supabase_storage",
  bucketName: "novelnow-media",
  publicCdnDomain: "https://cdn.novelnow.app",
  // 50, not 100 — Supabase's Free plan has a FIXED 50 MB per-file upload
  // ceiling that no bucket setting can raise (Storage → Settings states it
  // outright). The audio bucket says 100 MB and the card used to advertise
  // that, so an operator could pick a 60 MB narration, watch a transfer start,
  // and get `413 Maximum size exceeded` from storage mid-flight.
  //
  // The app must not promise what the platform refuses. On Pro this becomes
  // configurable (up to 500 GB) — raise it here, or set app_settings
  // .max_audio_size_mb, once the plan changes.
  maxAudioSizeMb: 50,
  acceptedAudioFormats: [".m4a", ".mp3", ".wav"],
  acceptedScriptFormats: [".txt", ".docx", ".md"],
  detectDurationAutomatically: true,
  defaultChapterAccess: "locked" as ChapterAccess,
  freeChaptersAtStart: 3,
  defaultMaturity: "mature_17" as Maturity,
};

/**
 * Formats offered by the `+ Add format` affordances once a chip is removed.
 * A superset of the defaults above so a removed format can be added back.
 */
export const SELECTABLE_AUDIO_FORMATS = [
  ".m4a",
  ".mp3",
  ".wav",
  ".aac",
  ".ogg",
] as const;

export const SELECTABLE_SCRIPT_FORMATS = [".txt", ".docx", ".md"] as const;
