import type { NextConfig } from "next";

// Supabase Storage hostname, derived from the project URL so it follows the
// environment rather than being hardcoded per deployment.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Hide the Next.js on-screen dev indicator (the floating "N" badge). It is
  // a development-only overlay and never ships in a production build; it was
  // covering the sidebar's operator footer. Compile and runtime errors are
  // still surfaced. See node_modules/next/dist/docs/01-app/03-api-reference/
  // 05-config/01-next-config-js/devIndicators.md
  devIndicators: false,

  // Cover art is served from Supabase Storage. Allowing the hostname here keeps
  // next/image optimization on rather than disabling it per-image.
  images: supabaseHost
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ],
      }
    : undefined,
};

export default nextConfig;
