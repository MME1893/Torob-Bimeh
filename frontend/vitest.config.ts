import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // Each file gets its own worker so the shared module-level database handle
    // in inquiryHistory.ts cannot leak between suites.
    pool: "forks",
  },
});
