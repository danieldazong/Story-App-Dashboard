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
  maxAudioSizeMb: 100,
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
