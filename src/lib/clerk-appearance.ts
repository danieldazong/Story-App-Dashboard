/**
 * Maps Clerk's prebuilt components onto this project's design tokens: flat
 * surfaces, 1px borders, 8px radii, no shadows, ember primary with a white
 * label (admin ember buttons take white labels — see AGENTS.md, Colors).
 *
 * Raw hex normally lives only in tailwind.config.ts, but Clerk's appearance
 * API sits outside Tailwind and takes CSS values directly, so the tokens are
 * restated here rather than being reachable as classes.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#E8663F",
    colorText: "#1A1420",
    colorTextSecondary: "#6E6478",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#1A1420",
    colorDanger: "#C0432F",
    colorSuccess: "#2F8C7F",
    colorWarning: "#B07C2E",
    fontFamily: "var(--font-inter), system-ui, sans-serif",
    borderRadius: "8px",
  },
  elements: {
    card: "bg-card border border-border shadow-none rounded-card",
    cardBox: "shadow-none",
    formButtonPrimary:
      "bg-primary hover:bg-primary-hover text-white shadow-none normal-case text-body font-medium",
    formFieldInput:
      "bg-card border border-border rounded-input text-body text-text",
    headerTitle: "text-page-title text-text",
    headerSubtitle: "text-helper text-muted",
    footer: "hidden",
    footerAction: "hidden",
    socialButtonsBlockButton:
      "bg-card border border-border text-text hover:bg-page shadow-none",
  },
};
