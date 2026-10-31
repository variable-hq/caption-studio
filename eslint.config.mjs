import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: [
      "src/components/operator/**/*.tsx",
    ],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: ["·", "CS", "Caption Studio", "%", "#"] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='aria-label'] > Literal",
          message: "Use t(...) for aria-label text.",
        },
        {
          selector: "JSXAttribute[name.name='placeholder'] > Literal",
          message: "Use t(...) for placeholder text.",
        },
        {
          selector: "JSXAttribute[name.name='title'] > Literal",
          message: "Use t(...) for title text.",
        },
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
