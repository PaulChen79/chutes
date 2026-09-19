import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import { readPlan } from "./helpers/repo.js";

const FIXTURES = fileURLToPath(new URL("../fixtures", import.meta.url));

interface Labels {
  labels: Record<string, string>;
}

/**
 * Copy the Fixture Repo into a throwaway directory and scan it.
 *
 * Copied rather than scanned in place so the run cannot leave a Plan behind
 * in the repository, and so two test runs never see each other's output.
 */
async function scanFixture(): Promise<string> {
  const repo = await tempRepo();
  await cp(join(FIXTURES, "repo"), repo, { recursive: true });
  await mkdir(join(repo, ".chutes", "fixture"), { recursive: true });
  await cp(join(FIXTURES, "migration.yml"), join(repo, ".chutes", "fixture", "migration.yml"));
  await cp(join(FIXTURES, "replay.json"), join(repo, ".chutes", "replay.json"));

  const result = await runCli(repo, "scan", "--migration", "fixture");
  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
  return repo;
}

describe("Fixture Repo regression suite", () => {
  it("classifies every labelled file into the Lane recorded for it", async () => {
    const repo = await scanFixture();
    const { labels } = JSON.parse(await readFile(join(FIXTURES, "labels.json"), "utf8")) as Labels;

    const plan = await readPlan(repo, "fixture");
    const actual = new Map(plan.map((record) => [record.path, record.lane]));

    // Name the files, not the count. "34 of 36" sends someone hunting; a
    // list of the two that moved, and which way, is the whole finding.
    const moved: string[] = [];
    for (const [path, expected] of Object.entries(labels)) {
      if (expected === "untouched" || expected === "excluded") continue;
      const got = actual.get(path) ?? "absent from the Plan";
      if (got !== expected) moved.push(`${path}: expected ${expected}, got ${got}`);
    }

    expect(moved).toEqual([]);
  });

  it("keeps Untouched and excluded files out of the Plan", async () => {
    const repo = await scanFixture();
    const { labels } = JSON.parse(await readFile(join(FIXTURES, "labels.json"), "utf8")) as Labels;

    const inPlan = new Set((await readPlan(repo, "fixture")).map((r) => r.path));
    // Untouched: no Detect Rule fired. Excluded: a rule fired, but the file
    // is indexed into the graph rather than classified. Neither belongs in
    // the Plan, and for different reasons.
    const wronglyIncluded = Object.entries(labels)
      .filter(([path, lane]) => (lane === "untouched" || lane === "excluded") && inPlan.has(path))
      .map(([path]) => path);

    expect(wronglyIncluded).toEqual([]);
  });

  it("covers all three Lanes with at least ten files each", async () => {
    const { labels } = JSON.parse(await readFile(join(FIXTURES, "labels.json"), "utf8")) as Labels;

    const counts = { mechanical: 0, judgment: 0, redesign: 0 };
    for (const lane of Object.values(labels)) {
      if (lane in counts) counts[lane as keyof typeof counts] += 1;
    }

    expect(counts.mechanical).toBeGreaterThanOrEqual(10);
    expect(counts.judgment).toBeGreaterThanOrEqual(10);
    expect(counts.redesign).toBeGreaterThanOrEqual(10);
  });

  it("runs with no network and no API key", async () => {
    const repo = await scanFixture();
    const plan = await readPlan(repo, "fixture");

    expect(plan.every((record) => record.judge.backend === "replay")).toBe(true);
    expect(plan.every((record) => record.status !== "error")).toBe(true);
  });

  it("states in the Plan document that this is a regression check", async () => {
    // The caveat has to travel with the results, because a good fixture
    // score is the easiest thing in this project to mistake for evidence.
    const readme = await readFile(join(FIXTURES, "README.md"), "utf8");
    expect(readme).toMatch(/not evidence that the\s+classifier is right/);
    expect(readme).toMatch(/do not quote a pass rate/i);
    expect(readme).toMatch(/regression/i);
  });
});
