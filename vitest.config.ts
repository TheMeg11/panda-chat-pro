import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests need a real DATABASE_URL; unit tests never do.
    env: { ...process.env, NEXT_PHASE: "phase-production-build" },
    testTimeout: 20_000,
  },
});
