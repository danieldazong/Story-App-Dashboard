import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js on-screen dev indicator (the floating "N" badge). It is
  // a development-only overlay and never ships in a production build; it was
  // covering the sidebar's operator footer. Compile and runtime errors are
  // still surfaced. See node_modules/next/dist/docs/01-app/03-api-reference/
  // 05-config/01-next-config-js/devIndicators.md
  devIndicators: false,
};

export default nextConfig;
