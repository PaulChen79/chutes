import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import { file, readPlan, withRules } from "./helpers/repo.js";

/**
 * Everything here stops before a single HTTP request is made, so the default
 * suite still needs no network and no API key. The request path itself is
 * covered by tests/jev.live.test.ts, which is opt-in.
 */
/** `judgeSettings` are extra lines INSIDE the single judge block. */
async function repoWithJev(judgeSettings = ""): Promise<string> {
  const repo = await tempRepo();
  await file(repo, "src/a.js", "export default 1\n");
  await file(repo, "src/b.js", "export default 2\n");
  await withRules(
    repo,
    [{ id: "r", pattern: "export default" }],
    `judge:\n  backend: jev\n${judgeSettings}`,
  );
  return repo;
}

/** Run with the credential deliberately absent from the environment. */
async function runWithoutKey(repo: string, ...args: string[]) {
  const saved = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "";
  try {
    return await runCli(repo, ...args);
  } finally {
    if (saved === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = saved;
  }
}

describe("Jev Judge backend", () => {
  it("fails with a clear message before any work when the credential is missing", async () => {
    const repo = await repoWithJev();

    const result = await runWithoutKey(repo, "scan");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("TYPESAFE_API_KEY");
    // Before any work: no Plan, not even a partial one.
    expect(result.stdout).not.toMatch(/judged/);
  });

  it("prints the estimated cost and duration before spending anything", async () => {
    const repo = await repoWithJev();
    process.env.TYPESAFE_API_KEY = "test-key-not-used";

    // Not a TTY, so the confirmation cannot be answered and the run stops.
    const result = await runCli(repo, "scan");
    delete process.env.TYPESAFE_API_KEY;

    expect(result.stdout).toMatch(/2 files/);
    expect(result.stdout).toMatch(/input tokens\s+~\d/);
    expect(result.stdout).toMatch(/cost\s+~\$\d/);
    expect(result.stdout).toMatch(/duration\s+~/);
    expect(result.stdout).toMatch(/estimates/i);
  });

  it("refuses to spend when it cannot ask, rather than assuming yes", async () => {
    const repo = await repoWithJev();
    process.env.TYPESAFE_API_KEY = "test-key-not-used";

    const result = await runCli(repo, "scan");
    delete process.env.TYPESAFE_API_KEY;

    // An unattended run that has not passed --yes has nobody to answer.
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/cancelled/i);
    expect(result.stderr).toMatch(/nothing was spent/i);
  });

  it("does not prompt at all for a backend that spends nothing", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], "judge:\n  backend: replay\n");
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(join(repo, ".chutes", "default"), { recursive: true });
    await writeFile(
      join(repo, ".chutes", "default", "replay.json"),
      JSON.stringify({
        answers: {
          "src/a.js": {
            q1_direct_rewrite: 0.9,
            q2_custom_hack: 0.05,
            q3_public_api: 0.05,
            q4_lifecycle: 0.05,
            q5_design_effort: [0.9, 0.05, 0.03, 0.01, 0.01],
          },
        },
      }),
    );

    const result = await runCli(repo, "scan");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/cost/i);
  });

  it("can be told to proceed without asking, for unattended runs", async () => {
    // Pointed at a closed local port, so no request leaves the machine and
    // no key is used: --yes is shown to get past the prompt by the run
    // reaching the request and failing there instead.
    const repo = await repoWithJev("  base_url: http://127.0.0.1:1\n  max_retries: 0\n");
    process.env.TYPESAFE_API_KEY = "test-key-not-used";

    const result = await runCli(repo, "scan", "--yes");
    delete process.env.TYPESAFE_API_KEY;

    expect(result.stderr).not.toMatch(/cancelled/i);
    expect(result.exitCode).toBe(0);
    // Got past the prompt, tried, and failed at the request.
    expect(result.stdout).toMatch(/judged\s+2/);
    expect(result.stdout).toMatch(/error\s+2/);
  });

  it("can be told not to ask at all, in configuration", async () => {
    const repo = await repoWithJev(
      "  confirm_spend: false\n  base_url: http://127.0.0.1:1\n  max_retries: 0\n",
    );
    process.env.TYPESAFE_API_KEY = "test-key-not-used";

    const result = await runCli(repo, "scan");
    delete process.env.TYPESAFE_API_KEY;

    expect(result.stderr).not.toMatch(/cancelled/i);
    expect(result.stdout).toMatch(/judged\s+2/);
  });

  it("records a failed request as an error with no Lane, and still writes the Plan", async () => {
    const repo = await repoWithJev("  base_url: http://127.0.0.1:1\n  max_retries: 1\n");
    process.env.TYPESAFE_API_KEY = "test-key-not-used";

    const result = await runCli(repo, "scan", "--yes");
    delete process.env.TYPESAFE_API_KEY;

    const plan = await readPlan(repo);
    expect(plan).toHaveLength(2);
    for (const record of plan) {
      // Folding these into Judgment would inflate the Lane counts with
      // timeouts and corrupt the denominator Calibration depends on.
      expect(record.lane).toBeNull();
      expect(record.status).toBe("error");
      expect(record.last_error).toMatch(/2 attempts/);
    }
    expect(result.stdout).toMatch(/error\s+2/);
  });
});
