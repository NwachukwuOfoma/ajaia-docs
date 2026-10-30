import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each test file gets a fresh in-memory database.
    env: { DATABASE_URL: ":memory:", SESSION_SECRET: "test-secret" },
  },
});
