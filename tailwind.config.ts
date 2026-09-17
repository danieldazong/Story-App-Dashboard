import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Raw hex values live here and nowhere else in the codebase.
const tokens = {
  page: "#FBF9F7",
  card: "#FFFFFF",
  border: "#E7E1DC",
  primary: "#E8663F",
  primaryHover: "#D4552F",
  text: "#1A1420",
  muted: "#6E6478",
  sidebar: "#1F1530",
  sidebarActive: "#2C1E42",
  statusOk: "#2F8C7F",
  statusWarn: "#B07C2E",
  destructive: "#C0432F",
  white: "#FFFFFF",
} as const;

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: tokens.page,
        card: tokens.card,
        border: tokens.border,
        text: tokens.text,
        muted: tokens.muted,
        sidebar: {
          DEFAULT: tokens.sidebar,
          active: tokens.sidebarActive,
        },
        status: {
          ok: tokens.statusOk,
          warn: tokens.statusWarn,
        },
        destructive: tokens.destructive,
        primary: {
          DEFAULT: tokens.primary,
          hover: tokens.primaryHover,
          foreground: tokens.white,
        },
        // Aliases consumed by shadcn/ui + Radix primitives so they can be
        // restyled through tokens rather than forked.
        background: tokens.page,
        foreground: tokens.text,
        input: tokens.border,
        ring: tokens.primary,
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      fontSize: {
        "page-title": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "section-label": [
          "13px",
          { lineHeight: "16px", fontWeight: "600", letterSpacing: "0.02em" },
        ],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "table-header": [
          "12px",
          { lineHeight: "16px", fontWeight: "600", letterSpacing: "0.02em" },
        ],
        "table-body": ["13px", { lineHeight: "18px", fontWeight: "400" }],
        helper: ["12px", { lineHeight: "16px", fontWeight: "400" }],
        mono: ["13px", { lineHeight: "18px", fontWeight: "400" }],
      },
      spacing: {
        "sidebar-width": "200px",
        "page-padding": "32px",
      },
      maxWidth: {
        content: "1040px",
      },
      borderRadius: {
        card: "8px",
        input: "8px",
      },
      height: {
        input: "40px",
        "table-row": "48px",
      },
      borderWidth: {
        DEFAULT: "1px",
      },
      borderColor: {
        DEFAULT: tokens.border,
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [animate],
};

export default config;
