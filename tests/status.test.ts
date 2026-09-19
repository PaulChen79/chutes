import { describe, expect, it } from "vitest";
import { read, runCli, tempRepo } from "./helpers/cli.js";
import { file, JUDGMENT, MECHANICAL, REDESIGN, withRecording, withRules } from "./helpers/repo.js";

const replayJudge = "judge:\n  backend: replay\n";

/** A repo with one file per Lane, plus one whose judgment fails. */
async function scannedRepo(extra = ""): Promise<string> {
  const repo = await tempRepo();
  for (const name of ["mech", "judge", "redo", "broken"]) {
    await file(repo, `src/${name}.js`, "export default 1\n");
  }
  await withRules(repo, [{ id: "r", pattern: "export default" }], `${replayJudge}${extra}`);
  await withRecording(repo, {
    "src/mech.js": MECHANICAL,
    "src/judge.js": JUDGMENT,
    "src/redo.js": REDESIGN,
    // src/broken.js is deliberately absent, so its judgment fails.
  });
  await runCli(repo, "scan");
  return repo;
}

describe("chutes status", () => {
  it("prints per-Lane counts with the error count kept separate", async () => {
    const repo = await scannedRepo();

    const result = await runCli(repo, "status");

    expect(result.stdout).toMatch(/mechanical\s+1/);
    expect(result.stdout).toMatch(/judgment\s+1/);
    expect(result.stdout).toMatch(/redesign\s+1/);
    expect(result.stdout).toMatch(/error\s+1/);
  });

  it("refuses to report success while any file errored, and exits non-zero", async () => {
    const repo = await scannedRepo();

    const result = await runCli(repo, "status");

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toMatch(/complete|success/i);
  });
});

describe("PLAN.md", () => {
  it("lists Judgment and Redesign files with their reason, and only counts Mechanical", async () => {
    const repo = await scannedRepo();

    const plan = await read(repo, ".chutes/default/PLAN.md");

    // Listing four hundred mechanical files produces a document nobody
    // reads, which defeats the point of having a reviewable artifact.
    expect(plan).toMatch(/Mechanical[\s\S]*?1 file/);
    expect(plan).not.toContain("src/mech.js");

    expect(plan).toContain("src/judge.js");
    expect(plan).toContain("src/redo.js");
    // The reason each landed where it did, not just the Lane.
    expect(plan).toContain("q3_public_api");
  });

  it("orders the Judgment listing by expected design effort, lowest first", async () => {
    const repo = await tempRepo();
    for (const name of ["hard", "easy", "middling"]) {
      await file(repo, `src/${name}.js`, "export default 1\n");
    }
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    await withRecording(repo, {
      // All three land in Judgment; they differ only in expected effort.
      "src/easy.js": { ...JUDGMENT, q5_design_effort: [0.7, 0.2, 0.05, 0.03, 0.02] },
      "src/middling.js": { ...JUDGMENT, q5_design_effort: [0.2, 0.3, 0.3, 0.15, 0.05] },
      "src/hard.js": { ...JUDGMENT, q5_design_effort: [0.05, 0.1, 0.15, 0.3, 0.4] },
    });
    await runCli(repo, "scan");

    const plan = await read(repo, ".chutes/default/PLAN.md");
    const order = ["src/easy.js", "src/middling.js", "src/hard.js"].map((p) => plan.indexOf(p));

    // Lowest effort first, so the files an agent could most plausibly draft
    // come first. This is what replaces subdividing the Lane.
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1] ?? -1);
    expect(order[1]).toBeLessThan(order[2] ?? -1);
  });

  it("re-renders an unchanged Plan byte-identically", async () => {
    const repo = await scannedRepo();

    const first = await read(repo, ".chutes/default/PLAN.md");
    await runCli(repo, "scan", "--force");
    const second = await read(repo, ".chutes/default/PLAN.md");

    expect(second).toBe(first);
  });

  it("takes which Lanes get a file listing from the configuration", async () => {
    const repo = await scannedRepo("report:\n  list_files_for: [redesign]\n");

    const plan = await read(repo, ".chutes/default/PLAN.md");

    expect(plan).toContain("src/redo.js");
    expect(plan).not.toContain("src/judge.js");
  });

  it("says plainly that it is generated and must not be edited", async () => {
    const repo = await scannedRepo();

    const plan = await read(repo, ".chutes/default/PLAN.md");

    expect(plan).toMatch(/generated|do not edit/i);
    expect(plan).toContain("plan.jsonl");
  });
});
