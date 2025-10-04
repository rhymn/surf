import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "no-console": ["warn", { allow: ["error"] }]
    }
  },
  {
    name: "prettier",
    rules: prettier.rules
  }
);
