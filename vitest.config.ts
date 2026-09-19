import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/helpers/build.ts"],
    testTimeout: 20_000,
    // The default suite needs no network and no API key, so the one test
    // that spends money is excluded from it rather than merely skipped.
    // `pnpm test:live` opts in.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.live.test.ts"],
  },
});
