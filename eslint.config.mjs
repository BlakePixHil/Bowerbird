import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/** Tables only src/lib/access (and the sync code that writes them) may touch. */
const ACCESS_ONLY = ["accounts", "balances", "transactions", "splits", "transactionTags"];
const USE_ACCESS =
  "Read accounts, balances and transactions through @/lib/access, so nobody sees money they aren't allowed to. Add a helper there if you need a new kind of read.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/access/**",
      "src/lib/db/**",
      "src/lib/banks/**",
      "src/lib/sorting/**",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ regex: "(^|/)db/schema$", importNames: ACCESS_ONLY, message: USE_ACCESS }],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `MemberExpression[object.property.name='query'][property.name=/^(${ACCESS_ONLY.join("|")})$/]`,
          message: USE_ACCESS,
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
