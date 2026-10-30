import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: [
      "src/components/operator/OperatorTopBar.tsx",
      "src/components/operator/LiveControlBar.tsx",
      "src/components/operator/StatusBanner.tsx",
    ],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: ["·", "CS", "Caption Studio"] },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "coverage/**",
    "cloudflare-env.d.ts",
    "next-env.d.ts",
  ]),
]);
