import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import { file, readPlan, withRules } from "./helpers/repo.js";

/**
 * The only test that talks to the real Judge and spends real money.
 *
 * Excluded from the default suite by vitest.config.ts, which keeps
 * `pnpm test` free of both network access and credentials. Run it with:
 *
 *   TYPESAFE_API_KEY=... pnpm test:live
 *
 * It is deliberately tiny: three files, a few hundredths of a cent. Throughput
 * and cost at scale are measured separately, by scripts/measure-cost.ts.
 */
const hasKey = (process.env.TYPESAFE_API_KEY ?? "").trim() !== "";

describe.skipIf(!hasKey)("Jev Judge backend (live)", () => {
  it("classifies real files against the real Judge", async () => {
    const repo = await tempRepo();
    await file(
      repo,
      "src/Badge.vue",
      "<template><span>{{ label }}</span></template>\n" +
        "<script>\nexport default { props: { label: String }, data() { return {} } }\n</script>\n",
    );
    await file(
      repo,
      "src/EventBus.js",
      "import Vue from 'vue'\n// A Vue 2 instance used as a global event bus.\nexport default new Vue()\n",
    );
    await withRules(
      repo,
      [
        { id: "options-api", pattern: "export default" },
        { id: "vue-instance", pattern: "new Vue" },
      ],
      "judge:\n  backend: jev\n  confirm_spend: false\n",
      '["src/**"]',
      { criteria: "Migrating Vue 2 Options API components to the Vue 3 Composition API." },
    );

    const result = await runCli(repo, "scan", "--yes");
    expect(result.exitCode).toBe(0);

    const plan = await readPlan(repo);
    expect(plan).toHaveLength(2);

    for (const record of plan) {
      expect(record.status).not.toBe("error");
      expect(record.lane).not.toBeNull();
      expect(record.judge.backend).toBe("jev");
      // The model that actually answered, recorded for the Fingerprint.
      expect(record.judge.model).toBeTruthy();
      expect(record.confidence).toBeGreaterThan(0);
      expect(record.confidence).toBeLessThanOrEqual(1);
      // Every question came back with a usable number.
      expect(record.answers?.q5_design_effort).toHaveLength(5);
    }
  }, 120_000);
});
