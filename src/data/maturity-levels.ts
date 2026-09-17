import type { Maturity } from "@/types/catalog";

export type MaturityLevel = {
  value: Maturity;
  label: string;
  helperText?: string;
};

export const MATURITY_LEVELS = [
  { value: "general", label: "General" },
  {
    value: "mature_17",
    label: "Mature 18+",
    helperText:
      "Requires age verification and content advisory in the mobile app.",
  },
] as const satisfies MaturityLevel[];
