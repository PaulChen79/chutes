import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import {
  file,
  JUDGMENT,
  MECHANICAL,
  REDESIGN,
  readPlan,
  withRecording,
  withRules,
} from "./helpers/repo.js";

const replayJudge = "judge:\n  backend: replay\n";

describe("chutes scan", () => {
  it("classifies every matched file into exactly one Lane and leaves Untouched files out", async () => {
    const repo = await tempRepo();
    await file(repo, "src/cart.js", "export default { data() {} }\n");
    await file(repo, "src/page.js", "export default { data() {} }\n");
    await file(repo, "src/clean.js", "export const x = 1\n");
    await withRules(repo, [{ id: "options-api", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      "src/cart.js": MECHANICAL,
      "src/page.js": JUDGMENT,
    });

    const result = await runCli(repo, "scan");

    expect(result.exitCode).toBe(0);
    const plan = await readPlan(repo);
    expect(plan.map((r) => r.path)).toEqual(["src/cart.js", "src/page.js"]);
    expect(plan.map((r) => r.lane)).toEqual(["mechanical", "judgment"]);
  });

  it("sets Confidence to the minimum of the conditions that produced the Lane", async () => {
    const repo = await tempRepo();
    await file(repo, "src/mech.js", "export default 1\n");
    await file(repo, "src/judge.js", "export default 2\n");
    await file(repo, "src/redo.js", "export default 3\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      "src/judge.js": JUDGMENT,
      "src/mech.js": MECHANICAL,
      "src/redo.js": REDESIGN,
    });

    await runCli(repo, "scan");
    const plan = await readPlan(repo);
    const by = (path: string) => plan.find((r) => r.path === path);

    // Mechanical needs every condition to hold, so the weakest caps it:
    // min(q1 = 0.97, 1 - q2 = 0.98, 1 - strongest redesign signal = 0.95).
    // The Redesign term is why this is 0.95 and not 0.97: q3 sits at 0.05,
    // and a Mechanical claim is only as strong as the evidence against
    // Redesign.
    expect(by("src/mech.js")).toMatchObject({
      lane: "mechanical",
      confidence: 0.95,
      limited_by: "q3_public_api",
    });

    // Redesign fires on ANY signal, so the strongest that fired is the evidence:
    // q3 = 0.91 beats q4 = 0.2 and the top-two Score mass = 0.8.
    expect(by("src/redo.js")).toMatchObject({ lane: "redesign", confidence: 0.91 });

    // Judgment is what is left: 1 - the strongest rival claim,
    // which here is Mechanical's min(0.6, 0.7) = 0.6.
    const judgment = by("src/judge.js");
    expect(judgment?.lane).toBe("judgment");
    expect(judgment?.confidence).toBeCloseTo(0.4, 10);
  });

  it("never multiplies correlated answers into the low-confidence band", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      "src/a.js": {
        q1_direct_rewrite: 0.92,
        q2_custom_hack: 0.08,
        q3_public_api: 0.05,
        q4_lifecycle: 0.05,
        q5_design_effort: [0.9, 0.05, 0.03, 0.01, 0.01],
      },
    });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    // min(0.92, 0.92) = 0.92. A product rule would give 0.8464 here, and the
    // five-question product the spec warns about would collapse to ~0.6.
    expect(record?.confidence).toBeCloseTo(0.92, 10);
  });

  it("truncates an oversized State, keeps the true Match count, and docks Confidence", async () => {
    const repo = await tempRepo();
    const body = Array.from({ length: 200 }, (_, i) => `export default ${i}`).join("\n");
    await file(repo, "src/huge.js", `${body}\n`);
    await withRules(
      repo,
      [{ id: "r", pattern: "export default" }],
      `${replayJudge}state:\n  max_chars: 900\n`,
    );
    await withRecording(repo, { "src/huge.js": MECHANICAL });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.truncated).toBe(true);
    // The count is of what exists, not of what fitted.
    expect(record?.match_count).toBe(200);
    expect(record?.lane).toBe("mechanical");
    // 0.95 (capped by the Redesign term) less the 0.15 truncated_penalty.
    expect(record?.confidence).toBeCloseTo(0.8, 10);
  });

  it("keeps a truncated file out of the highest Confidence band", async () => {
    const repo = await tempRepo();
    const body = Array.from({ length: 200 }, (_, i) => `export default ${i}`).join("\n");
    await file(repo, "src/huge.js", `${body}\n`);
    await file(repo, "src/small.js", "export default 1\n");
    await withRules(
      repo,
      [{ id: "r", pattern: "export default" }],
      `${replayJudge}state:\n  max_chars: 900\n`,
    );
    await withRecording(repo, {
      "src/huge.js": MECHANICAL,
      "src/small.js": MECHANICAL,
    });

    await runCli(repo, "scan");
    const plan = await readPlan(repo);
    const huge = plan.find((r) => r.path === "src/huge.js");
    const small = plan.find((r) => r.path === "src/small.js");

    // Identical answers; the only difference is that one was judged on a
    // partial view, and it must rank strictly below the one that was not.
    expect(small?.truncated).toBe(false);
    expect(huge?.confidence).toBeLessThan(small?.confidence ?? 0);
  });

  it("resolves a file sitting exactly on the Mechanical thresholds to Judgment", async () => {
    const repo = await tempRepo();
    await file(repo, "src/edge.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      "src/edge.js": {
        // Exactly on both Mechanical thresholds (> 0.85 and < 0.2), so
        // neither condition is met. Ambiguity must fall towards more human
        // attention, never towards less.
        q1_direct_rewrite: 0.85,
        q2_custom_hack: 0.2,
        q3_public_api: 0.1,
        q4_lifecycle: 0.1,
        q5_design_effort: [0.5, 0.3, 0.15, 0.03, 0.02],
      },
    });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.lane).toBe("judgment");
  });

  it("compares the Redesign signals on one probability scale", async () => {
    const repo = await tempRepo();
    await file(repo, "src/effort.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      "src/effort.js": {
        q1_direct_rewrite: 0.95,
        q2_custom_hack: 0.02,
        q3_public_api: 0.1,
        q4_lifecycle: 0.1,
        // Top two levels hold 0.55 -- over the 0.5 Threshold -- while the
        // expected level is only 1.95 of 4, which a normalised point estimate
        // would put at 0.49 and wrongly call Mechanical.
        q5_design_effort: [0.2, 0.15, 0.1, 0.25, 0.3],
      },
    });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.lane).toBe("redesign");
    expect(record?.confidence).toBeCloseTo(0.55, 10);
  });

  it("files a failed judgment as an error, never as Judgment", async () => {
    const repo = await tempRepo();
    await file(repo, "src/known.js", "export default 1\n");
    await file(repo, "src/unknown.js", "export default 2\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    // No recorded answers for src/unknown.js.
    await withRecording(repo, { "src/known.js": MECHANICAL });

    const result = await runCli(repo, "scan");
    const plan = await readPlan(repo);
    const failed = plan.find((r) => r.path === "src/unknown.js");

    expect(failed?.lane).toBeNull();
    expect(failed?.status).toBe("error");
    expect(failed?.confidence).toBeNull();
    expect(failed?.last_error).toContain("src/unknown.js");
    // The summary must report it separately, not fold it into a Lane.
    expect(result.stdout).toMatch(/error\s+1/);
    expect(result.stdout).toMatch(/judgment\s+0/);
  });

  it("writes the Plan in stable path order, identically across runs", async () => {
    const repo = await tempRepo();
    const names = ["zebra", "alpha", "middle", "beta"];
    for (const name of names) await file(repo, `src/${name}.js`, "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, Object.fromEntries(names.map((n) => [`src/${n}.js`, MECHANICAL])));

    await runCli(repo, "scan");
    const first = await readPlan(repo);
    await runCli(repo, "scan");
    const second = await readPlan(repo);

    expect(first.map((r) => r.path)).toEqual([
      "src/alpha.js",
      "src/beta.js",
      "src/middle.js",
      "src/zebra.js",
    ]);
    expect(second.map((r) => r.path)).toEqual(first.map((r) => r.path));
  });

  it("gives each Migration its own Plan, classified under its own rules", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await file(repo, "src/b.js", "const x = require('y')\n");

    // Two Migrations over one repository: different Detect Rules, different
    // Criteria, different recorded answers.
    await withRules(repo, [{ id: "esm", pattern: "export default" }], replayJudge);
    await withRecording(repo, { "src/a.js": MECHANICAL });

    await withRules(repo, [{ id: "cjs", pattern: "require\\(" }], replayJudge, '["src/**"]', {
      migration: "commonjs",
      criteria: "CommonJS to ESM",
    });
    await withRecording(repo, { "src/b.js": REDESIGN }, "recorded", "commonjs");

    await runCli(repo, "scan");
    await runCli(repo, "scan", "--migration", "commonjs");

    const first = await readPlan(repo);
    const second = await readPlan(repo, "commonjs");

    // Each Plan holds only the files its own Detect Rules matched, and each
    // was classified under its own Criteria, so the fingerprints differ.
    expect(first.map((r) => r.path)).toEqual(["src/a.js"]);
    expect(second.map((r) => r.path)).toEqual(["src/b.js"]);
    expect(first[0]?.lane).toBe("mechanical");
    expect(second[0]?.lane).toBe("redesign");
    expect(first[0]?.config_fingerprint).not.toBe(second[0]?.config_fingerprint);
  });

  it("changes the Config Fingerprint when a question is overridden", async () => {
    const scanWith = async (extra: string) => {
      const repo = await tempRepo();
      await file(repo, "src/a.js", "export default 1\n");
      await withRules(repo, [{ id: "r", pattern: "export default" }], `${replayJudge}${extra}`);
      await withRecording(repo, { "src/a.js": MECHANICAL });
      await runCli(repo, "scan");
      return (await readPlan(repo))[0]?.config_fingerprint;
    };

    const baseline = await scanWith("");
    const overridden = await scanWith(
      'questions:\n  overrides:\n    q1_direct_rewrite: "Is this trivially rewritable?"\n',
    );

    // An override means the answers were produced by a different question, so
    // a labelled set gathered under the built-in wording no longer applies.
    expect(overridden).not.toBe(baseline);
  });

  it("reserves a wave field on every record", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, { "src/a.js": MECHANICAL });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    // Present and null: scheduling has not shipped, but adding the field
    // later would invalidate every Plan already committed.
    expect(record).toHaveProperty("wave", null);
  });

  it("changes the Config Fingerprint for a Threshold change but not an unrelated edit", async () => {
    const scanWith = async (extra: string) => {
      const repo = await tempRepo();
      await file(repo, "src/a.js", "export default 1\n");
      await withRules(repo, [{ id: "r", pattern: "export default" }], `${replayJudge}${extra}`);
      await withRecording(repo, { "src/a.js": MECHANICAL });
      await runCli(repo, "scan");
      const [record] = await readPlan(repo);
      return record?.config_fingerprint;
    };

    const baseline = await scanWith("");
    const thresholdChanged = await scanWith(
      "thresholds:\n  mechanical:\n    direct_rewrite: 0.7\n",
    );
    const combineChanged = await scanWith("confidence:\n  combine: product\n");
    const unrelatedEdit = await scanWith("report:\n  max_files_per_lane: 25\n");

    expect(baseline).toMatch(/^cf_/);
    // A Threshold and the combination rule both change what a Confidence
    // number means, so a calibration built under the old ones is void.
    expect(thresholdChanged).not.toBe(baseline);
    expect(combineChanged).not.toBe(baseline);
    // How many files get listed in a summary changes no classification.
    expect(unrelatedEdit).toBe(baseline);
  });

  it("records the per-question answers and the backend that supplied them", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, { "src/a.js": MECHANICAL }, "recorded-v1");

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.answers).toMatchObject({
      q1_direct_rewrite: 0.97,
      q2_custom_hack: 0.02,
      q3_public_api: 0.05,
      q4_lifecycle: 0.03,
    });
    expect(record?.answers?.q5_design_effort).toEqual([0.8, 0.15, 0.03, 0.01, 0.01]);
    expect(record?.judge).toMatchObject({ backend: "replay", model: "recorded-v1" });
    expect(record?.group_id).toBeNull();
    expect(record?.attempts).toBe(0);
    expect(record?.lane_overridden).toBe(false);
    expect(record?.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("classifies with no API key present in the environment or the config", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, { "src/a.js": MECHANICAL });

    const result = await runCli(repo, "scan");

    expect(result.exitCode).toBe(0);
    expect((await readPlan(repo))[0]?.lane).toBe("mechanical");
    // The replay backend reads a file and nothing else, so a Plan produced
    // here was produced without credentials of any kind.
    expect(result.stderr).toBe("");
  });

  it("does not call a file Mechanical on strong Redesign evidence that missed its Threshold", async () => {
    const repo = await tempRepo();
    await file(repo, "src/coin.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      "src/coin.js": {
        q1_direct_rewrite: 0.95,
        q2_custom_hack: 0.02,
        // Three Redesign signals, each a coin flip, none over its 0.5
        // Threshold. The file is still Mechanical, but it must not be a
        // confident one -- this is the case that sends an unsupervised
        // agent into a file that is even money for a redesign.
        q3_public_api: 0.49,
        q4_lifecycle: 0.49,
        q5_design_effort: [0.2, 0.16, 0.15, 0.25, 0.24],
      },
    });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.lane).toBe("mechanical");
    expect(record?.confidence).toBeLessThanOrEqual(0.51);
    expect(record?.limited_by).toBe("q3_public_api");
  });

  it("reports the true line count of a file that ends in a newline", async () => {
    const repo = await tempRepo();
    // Two lines and a terminating newline, not three lines.
    await file(repo, "src/two.js", "export default 1\nconst b = 2\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, { "src/two.js": MECHANICAL });

    const result = await runCli(repo, "scan", "--print-state");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).file.loc).toBe(2);
  });

  it("errors rather than judging a file whose State cannot hold a single Match", async () => {
    const repo = await tempRepo();
    await file(repo, "src/wide.js", `export default "${"x".repeat(4000)}"\n`);
    await withRules(
      repo,
      [{ id: "r", pattern: "export default" }],
      `${replayJudge}state:\n  max_chars: 300\n`,
    );
    await withRecording(repo, { "src/wide.js": MECHANICAL });

    await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    // A Lane assigned on a State containing no matched code at all is worse
    // than no Lane: it looks like a judgment and is not one.
    expect(record?.lane).toBeNull();
    expect(record?.status).toBe("error");
    expect(record?.last_error).toMatch(/max_chars/);
  });

  it("keeps an unreadable candidate in the Plan as an error", async () => {
    const repo = await tempRepo();
    await file(repo, "src/good.js", "export default 1\n");
    await file(repo, "src/bad.js", "export default 2\n");
    await chmod(join(repo, "src/bad.js"), 0o000);
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, { "src/good.js": MECHANICAL });

    const result = await runCli(repo, "scan");
    await chmod(join(repo, "src/bad.js"), 0o644);
    const plan = await readPlan(repo);

    // Silently absent is the one unacceptable outcome: the file looks
    // Untouched, and nobody goes looking for it.
    const bad = plan.find((r) => r.path === "src/bad.js");
    expect(bad?.status).toBe("error");
    expect(bad?.lane).toBeNull();
    expect(bad?.content_hash).toBeNull();
    expect(result.stdout).toMatch(/error\s+1/);
  });

  it("includes settings that feed a code-computed fact in the Config Fingerprint", async () => {
    const scanWith = async (extra: string, detectExtra = "") => {
      const repo = await tempRepo();
      await file(repo, "src/a.js", "export default 1\n");
      await withRules(
        repo,
        [{ id: "r", pattern: "export default" }],
        extra === "" ? replayJudge : extra,
        '["src/**"]',
        { detectExtra },
      );
      await withRecording(repo, { "src/a.js": MECHANICAL });
      await runCli(repo, "scan");
      return (await readPlan(repo))[0]?.config_fingerprint;
    };

    const baseline = await scanWith("");

    // Each of these changes a fact the Judge is told, so each changes what
    // the answer was produced from.
    expect(await scanWith("", '  test_globs: ["**/*.t.js"]\n')).not.toBe(baseline);
    expect(await scanWith(`${replayJudge}graph:\n  aliases:\n    "@": "src"\n`)).not.toBe(baseline);
    expect(await scanWith(`${replayJudge}coverage:\n  source: none\n`)).not.toBe(baseline);
    expect(await scanWith(`${replayJudge}state:\n  context_lines: 8\n`)).not.toBe(baseline);

    // The model that answers is part of how the judgement was reached, so a
    // new model version voids a calibration gathered under the old one.
    expect(await scanWith("judge:\n  backend: replay\n  model: systemone-v2\n")).not.toBe(baseline);

    // Transport, pricing and presentation change nothing about the judgement.
    expect(await scanWith("judge:\n  backend: replay\n  concurrency: 4\n")).toBe(baseline);
    expect(await scanWith("judge:\n  backend: replay\n  timeout_ms: 5000\n")).toBe(baseline);
    expect(await scanWith("judge:\n  backend: replay\n  price_per_mtok: 0.09\n")).toBe(baseline);
    expect(await scanWith(`${replayJudge}report:\n  max_files_per_lane: 9\n`)).toBe(baseline);
  });

  it("assembles a State carrying every code-computed fact, addressed by path", async () => {
    const repo = await tempRepo();
    await file(
      repo,
      "src/cart.js",
      `${[
        "import { total } from './math.js'",
        "import helper from './helper.js'",
        "export function addItem(item) {",
        "  return total(item)",
        "}",
        "export default addItem",
      ].join("\n")}\n`,
    );
    await file(repo, "src/math.js", "export const total = 1\n");
    await file(repo, "src/helper.js", "export default 2\n");
    await file(repo, "src/cart.spec.js", "import cart from './cart.js'\nexport default cart\n");
    await withRules(
      repo,
      [{ id: "default-export", pattern: "export default" }],
      replayJudge,
      '["src/**"]',
      { detectExtra: '  test_globs: ["**/*.spec.js"]\n' },
    );

    const result = await runCli(repo, "scan", "--print-state", "src/cart.js");
    const state = JSON.parse(result.stdout);

    expect(state.file).toMatchObject({ path: "src/cart.js", language: "js", loc: 6 });
    // The matched line, with its surrounding lines.
    expect(state.matches[0].snippet).toContain("export default addItem");
    expect(state.matches[0].snippet).toContain("return total(item)");
    expect(state.match_count).toBe(1);
    expect(state.imports).toEqual(["./math.js", "./helper.js"]);
    expect(state.exports).toEqual(expect.arrayContaining(["addItem", "default"]));
    expect(state.outline).toEqual(expect.arrayContaining(["export function addItem(item)"]));
    // Facts code worked out, so the Judge is never asked to guess them.
    expect(state.graph).toEqual({ imported_by: 1, imports_local: 2 });
    expect(state.is_test_file).toBe(false);
    expect(state.covered_by).toEqual(["src/cart.spec.js"]);
  });

  it("prints a State without contacting the Judge or writing a Plan", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    // No recording at all: --print-state must not need one.
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);

    const result = await runCli(repo, "scan", "--print-state");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).file.path).toBe("src/a.js");
    await expect(readPlan(repo)).rejects.toThrow();
  });
});
