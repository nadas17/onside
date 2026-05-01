import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "moment", message: "moment.js yasaklı — date-fns kullan." },
            { name: "lodash", message: "lodash yasaklı — micro-utils yaz." },
            { name: "axios", message: "axios yasaklı — native fetch kullan." },
          ],
          patterns: [
            {
              group: ["lodash/*"],
              message: "lodash yasaklı — micro-utils yaz.",
            },
          ],
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "supabase/migrations/**",
      "scripts/**",
    ],
  },
];

export default eslintConfig;
