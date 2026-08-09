import {defineConfig,globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules:{
      "@typescript-eslint/no-explicit-any":"off",
      "react-hooks/set-state-in-effect":"off",
      "react-hooks/purity":"off",
      "react-hooks/immutability":"off",
      "react-hooks/exhaustive-deps":"warn",
      "@next/next/no-html-link-for-pages":"warn",
    },
  },
  {
    files:["tests/**/*.cjs"],
    rules:{
      "@typescript-eslint/no-require-imports":"off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".test-dist/**",
    "next-env.d.ts",
  ]),
]);
