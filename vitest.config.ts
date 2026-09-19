import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/helpers/build.ts"],
    testTimeout: 20_000,
  },
});
