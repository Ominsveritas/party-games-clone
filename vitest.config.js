import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only look for test files under the tests/ directory so Vitest never
    // tries to parse Next.js / React source files.
    include: ["tests/**/*.test.{js,ts}"],
    environment: "node",
  },
});
