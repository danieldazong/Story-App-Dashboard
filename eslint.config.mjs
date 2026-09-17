import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-app tooling and reference material, not part of the Next.js app.
    ".agents/**",
    ".claude/**",
    ".commandcode/**",
    "Prompts/**",
    "material/**",
  ]),
]);

export default eslintConfig;
