import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/db/migrations/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": { typescript: true, node: true },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
      "import/no-restricted-paths": ["error", {
        zones: [
          // domain: bottom layer — cannot import from any other module
          { target: "./src/domain/**", from: "./src/!(domain)/**" },

          // shared: only domain
          { target: "./src/shared/**", from: "./src/!(shared|domain)/**" },

          // db: domain + shared
          { target: "./src/db/**", from: "./src/!(db|domain|shared)/**" },

          // config: domain + shared
          { target: "./src/config/**", from: "./src/!(config|domain|shared)/**" },

          // systems: domain + shared + db + config
          { target: "./src/systems/**", from: "./src/!(systems|domain|shared|db|config)/**" },

          // llm: domain + shared + config + db + systems
          { target: "./src/llm/**", from: "./src/!(llm|domain|shared|config|db|systems)/**" },

          // server: top layer — can import any module (no zone restriction)
        ],
      }],
    },
  }
);
