import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { ignores: [".next/**", "node_modules/**", ".data/**", "storage/**", "drizzle/**", "tools/**", "test-results/**", "playwright-report/**", "next-env.d.ts"] },
];

export default config;
