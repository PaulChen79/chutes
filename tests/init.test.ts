import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { read, runCli, tempRepo, write } from "./helpers/cli.js";

describe("chutes init", () => {
  it("writes a configuration skeleton for a Migration", async () => {
    const repo = await tempRepo();
    const result = await runCli(repo, "init");

    expect(result.exitCode).toBe(0);
    await expect(read(repo, ".chutes/default/migration.yml")).resolves.toContain("criteria");
  });

  it("refuses to overwrite a configuration that already exists", async () => {
    const repo = await tempRepo();
    await runCli(repo, "init");
    const tuned = "# hand-tuned thresholds\n";
    await write(repo, ".chutes/default/migration.yml", tuned);

    const result = await runCli(repo, "init");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/already exists/i);
    await expect(read(repo, ".chutes/default/migration.yml")).resolves.toBe(tuned);
  });

  it("keeps two named Migrations side by side", async () => {
    const repo = await tempRepo();

    const vue = await runCli(repo, "init", "--migration", "vue2-to-vue3");
    const dates = await runCli(repo, "init", "--migration", "moment-to-dayjs");

    expect(vue.exitCode).toBe(0);
    expect(dates.exitCode).toBe(0);
    await expect(read(repo, ".chutes/vue2-to-vue3/migration.yml")).resolves.toContain(
      "vue2-to-vue3",
    );
    await expect(read(repo, ".chutes/moment-to-dayjs/migration.yml")).resolves.toContain(
      "moment-to-dayjs",
    );
  });

  // Sourced from the acceptance criteria of the ticket rather than from the
  // schema, so this guards the template against the spec. The reverse direction
  // -- the template naming a setting the schema has since renamed -- is caught
  // by strict parsing in the "validates" test above.
  const EVERY_TUNABLE = [
    "include",
    "ignore",
    "exclude",
    "detect.rules",
    "detect.max_matches_per_file",
    "detect.test_globs",
    "coverage.source",
    "coverage.report_path",
    "criteria",
    "thresholds.redesign.public_api",
    "thresholds.redesign.lifecycle",
    "thresholds.redesign.design_effort",
    "thresholds.mechanical.direct_rewrite",
    "thresholds.mechanical.custom_hack",
    "confidence.combine",
    "confidence.truncated_penalty",
    "judge.backend",
    "judge.concurrency",
    "judge.max_retries",
    "judge.timeout_ms",
    "judge.samples",
    "rescan.recheck_done",
    "rescan.keep_removed",
    "schedule.wave_size",
    "schedule.order",
    "schedule.cycle_strategy",
    "schedule.gate",
    "next.order",
    "execution.max_attempts",
    "execution.demote_to",
    "execution.feed_failures_to_calibrate",
    "report.list_files_for",
    "report.max_files_per_lane",
  ];

  it("offers every tunable setting, so none has to be discovered elsewhere", async () => {
    const repo = await tempRepo();
    await runCli(repo, "init");

    // Parsing beats substring matching: `schedule.order` and `next.order` are
    // indistinguishable as text, so a substring check silently skips one.
    const skeleton = parseYaml(await read(repo, ".chutes/default/migration.yml"));
    const missing = EVERY_TUNABLE.filter((setting) => {
      let node: unknown = skeleton;
      for (const key of setting.split(".")) {
        if (node === null || typeof node !== "object" || !(key in node)) return true;
        node = (node as Record<string, unknown>)[key];
      }
      return false;
    });

    expect(missing).toEqual([]);
  });

  it("explains each setting in place, so the file can be filled in unaided", async () => {
    const repo = await tempRepo();
    await runCli(repo, "init");

    const skeleton = await read(repo, ".chutes/default/migration.yml");
    const commentLines = skeleton.split("\n").filter((line) => line.trimStart().startsWith("#"));

    expect(commentLines.length).toBeGreaterThan(40);
  });
});
