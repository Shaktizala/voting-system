import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // single worker: tests share the test database
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./test/setup-env.ts"],
  },
});
