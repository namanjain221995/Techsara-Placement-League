import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(dir, "src"), "@server": path.resolve(dir, "server") },
  },
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/env.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
