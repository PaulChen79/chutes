import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { read, runCli, tempRepo, write } from "./helpers/cli.js";
import { file, JUDGMENT, MECHANICAL, readPlan, withRecording, withRules } from "./helpers/repo.js";

const replayJudge = "judge:\n  backend: replay\n";

async function repoWith(names: string[], extra = ""): Promise<string> {
  const repo = await tempRepo();
  for (const name of names) await file(repo, `src/${name}.js`, "export default 1\n");
  await withRules(repo, [{ id: "r", pattern: "export default" }], `${replayJudge}${extra}`);
  await withRecording(repo, Object.fromEntries(names.map((n) => [`src/${n}.js`, MECHANICAL])));
  return repo;
}

describe("incremental rescan", () => {
  it("issues no Judge requests on a second scan and leaves the Plan byte-identical", async () => {
    const repo = await repoWith(["a", "b", "c"]);

    const first = await runCli(repo, "scan");
    const planAfterFirst = await read(repo, ".chutes/default/plan.jsonl");
    const second = await runCli(repo, "scan");
    const planAfterSecond = await read(repo, ".chutes/default/plan.jsonl");

    expect(first.stdout).toMatch(/judged\s+3/);
    // The whole point: a rescan of an unchanged repository is free.
    expect(second.stdout).toMatch(/judged\s+0/);
    expect(second.stdout).toMatch(/reused\s+3/);
    expect(planAfterSecond).toBe(planAfterFirst);
  });

  it("never reclassifies a file marked done, even when its content changed", async () => {
    const repo = await repoWith(["a"]);
    await runCli(repo, "scan");

    // The Migration itself rewrites files. A naive hash comparison would
    // re-flag every file that was just finished as new work.
    const planFile = join(repo, ".chutes", "default", "plan.jsonl");
    await write(
      repo,
      ".chutes/default/plan.jsonl",
      (await read(repo, ".chutes/default/plan.jsonl")).replace('"pending"', '"done"'),
    );
    await file(repo, "src/a.js", "export default 999 // migrated\n");
    await withRecording(repo, { "src/a.js": JUDGMENT });

    const result = await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.status).toBe("done");
    expect(record?.lane).toBe("mechanical");
    expect(result.stdout).toMatch(/judged\s+0/);
    expect(planFile).toBeTruthy();
  });

  it("reclassifies a pending file whose content changed", async () => {
    const repo = await repoWith(["a"]);
    await runCli(repo, "scan");

    await file(repo, "src/a.js", "export default 2 // edited\n");
    await withRecording(repo, { "src/a.js": JUDGMENT });

    const result = await runCli(repo, "scan");
    const [record] = await readPlan(repo);

    expect(record?.lane).toBe("judgment");
    expect(result.stdout).toMatch(/judged\s+1/);
  });

  it("adds a file that newly matches a Detect Rule", async () => {
    const repo = await repoWith(["a"]);
    await runCli(repo, "scan");

    await file(repo, "src/b.js", "export default 2\n");
    await withRecording(repo, { "src/a.js": MECHANICAL, "src/b.js": JUDGMENT });

    await runCli(repo, "scan");
    const plan = await readPlan(repo);

    expect(plan.map((r) => r.path)).toEqual(["src/a.js", "src/b.js"]);
  });

  it("keeps a deleted file as removed, and can be configured not to", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");
    await rm(join(repo, "src/b.js"));

    await runCli(repo, "scan");
    const kept = await readPlan(repo);
    expect(kept.find((r) => r.path === "src/b.js")?.status).toBe("removed");

    const dropping = await repoWith(["a", "b"], "rescan:\n  keep_removed: false\n");
    await runCli(dropping, "scan");
    await rm(join(dropping, "src/b.js"));
    await runCli(dropping, "scan");

    expect((await readPlan(dropping)).map((r) => r.path)).toEqual(["src/a.js"]);
  });

  it("reclassifies everything when forced", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");

    const result = await runCli(repo, "scan", "--force");

    expect(result.stdout).toMatch(/judged\s+2/);
  });

  it("reports which files changed Lane", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");

    await file(repo, "src/a.js", "export default 2 // edited\n");
    await withRecording(repo, { "src/a.js": JUDGMENT, "src/b.js": MECHANICAL });

    const result = await runCli(repo, "scan");

    expect(result.stdout).toContain("src/a.js");
    expect(result.stdout).toMatch(/mechanical\s*->\s*judgment/);
    // Unchanged files must not appear in the diff.
    expect(result.stdout).not.toContain("src/b.js");
  });

  it("stays idempotent even when a file errored, rather than churning forever", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "export default 1\n");
    await file(repo, "src/orphan.js", "export default 2\n");
    await withRules(repo, [{ id: "r", pattern: "export default" }], replayJudge);
    // No recorded answer for src/orphan.js, so its judgment fails every time.
    await withRecording(repo, { "src/a.js": MECHANICAL });

    await runCli(repo, "scan");
    const first = await read(repo, ".chutes/default/plan.jsonl");
    const second = await runCli(repo, "scan");
    const after = await read(repo, ".chutes/default/plan.jsonl");

    // A permanently unreadable file must not make the Plan churn on every
    // scan. Retrying is what --force is for.
    expect(second.stdout).toMatch(/judged\s+0/);
    expect(after).toBe(first);
  });

  it("re-judges a file that was deleted and then restored", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");
    await rm(join(repo, "src/b.js"));
    await runCli(repo, "scan");
    expect((await readPlan(repo)).find((r) => r.path === "src/b.js")?.status).toBe("removed");

    await file(repo, "src/b.js", "export default 1\n");
    await runCli(repo, "scan");
    const restored = (await readPlan(repo)).find((r) => r.path === "src/b.js");

    // Left as "removed" the file silently drops out of everything that
    // schedules work, while sitting right there in the repository.
    expect(restored?.status).toBe("pending");
    expect(restored?.lane).toBe("mechanical");
  });

  it("honours rescan.recheck_done even when the content has not changed", async () => {
    const repo = await repoWith(["a"], "rescan:\n  recheck_done: true\n");
    await runCli(repo, "scan");
    await write(
      repo,
      ".chutes/default/plan.jsonl",
      (await read(repo, ".chutes/default/plan.jsonl")).replace('"pending"', '"done"'),
    );

    const result = await runCli(repo, "scan");

    // The documented exception has to win outright: falling through to the
    // hash gate would reuse the record and make the setting do nothing.
    expect(result.stdout).toMatch(/judged\s+1/);
  });

  it("keeps history and removed rows across a forced rescan, and still reports the diff", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");
    await rm(join(repo, "src/b.js"));
    await runCli(repo, "scan");

    // Stand in for execution history accumulated against the Plan.
    await write(
      repo,
      ".chutes/default/plan.jsonl",
      (await read(repo, ".chutes/default/plan.jsonl"))
        .replace('"attempts":0', '"attempts":2')
        .replace('"lane_overridden":false', '"lane_overridden":true'),
    );
    await withRecording(repo, { "src/a.js": JUDGMENT });

    const forced = await runCli(repo, "scan", "--force");
    const plan = await readPlan(repo);
    const a = plan.find((r) => r.path === "src/a.js");

    // Forcing changes what gets re-judged, not what is known.
    expect(a?.attempts).toBe(2);
    expect(a?.lane_overridden).toBe(true);
    expect(plan.find((r) => r.path === "src/b.js")?.status).toBe("removed");
    expect(forced.stdout).toMatch(/mechanical\s*->\s*judgment/);
  });

  it("does not count removed files as outstanding Lane work", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");
    await rm(join(repo, "src/b.js"));
    await runCli(repo, "scan");

    const status = await runCli(repo, "status");

    expect(status.stdout).toMatch(/mechanical\s+1/);
    expect(status.stdout).toMatch(/removed\s+1/);
  });

  it("keeps the record of a file that was migrated and no longer Matches", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");
    await write(
      repo,
      ".chutes/default/plan.jsonl",
      (await read(repo, ".chutes/default/plan.jsonl")).replace(
        '"path":"src/a.js","group_id":null,"lane":"mechanical","wave":null,"confidence":0.95,"limited_by":"q3_public_api","status":"pending"',
        '"path":"src/a.js","group_id":null,"lane":"mechanical","wave":null,"confidence":0.95,"limited_by":"q3_public_api","status":"done"',
      ),
    );
    // Somebody migrated it. The file no longer Matches -- that is what
    // finishing it means.
    await file(repo, "src/a.js", "const a = 1\nexport { a }\n");

    await runCli(repo, "scan");
    const record = (await readPlan(repo)).find((r) => r.path === "src/a.js");

    // Marking it removed would erase the work at the moment it was done.
    expect(record?.status).toBe("done");
    expect(record?.lane).toBe("mechanical");
  });

  it("marks a file removed only when it has actually gone", async () => {
    const repo = await repoWith(["a", "b"]);
    await runCli(repo, "scan");

    // One migrated (still present, no longer Matching), one deleted.
    await file(repo, "src/a.js", "const a = 1\nexport { a }\n");
    await rm(join(repo, "src/b.js"));
    await runCli(repo, "scan");

    const plan = await readPlan(repo);
    expect(plan.find((r) => r.path === "src/a.js")?.status).not.toBe("removed");
    expect(plan.find((r) => r.path === "src/b.js")?.status).toBe("removed");
  });

  it("stops rather than silently overwriting a Plan that will not parse", async () => {
    const repo = await repoWith(["a"]);
    await runCli(repo, "scan");
    const original = await read(repo, ".chutes/default/plan.jsonl");
    await write(repo, ".chutes/default/plan.jsonl", `${original}<<<<<<< HEAD\n`);

    const result = await runCli(repo, "scan");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/conflict marker|not valid JSON/i);
    // A hand-merged Plan is somebody's work. It must survive a failed scan.
    expect(await read(repo, ".chutes/default/plan.jsonl")).toContain("<<<<<<< HEAD");
  });

  it("preserves a human decision across a reclassification", async () => {
    const repo = await repoWith(["a"]);
    await runCli(repo, "scan");
    await write(
      repo,
      ".chutes/default/plan.jsonl",
      (await read(repo, ".chutes/default/plan.jsonl")).replace('"pending"', '"skipped"'),
    );
    await file(repo, "src/a.js", "export default 2 // edited\n");
    await withRecording(repo, { "src/a.js": JUDGMENT });

    await runCli(repo, "scan");
    const record = (await readPlan(repo))[0];

    // The Lane is the tool's to change; the decision not to do this file
    // is not.
    expect(record?.lane).toBe("judgment");
    expect(record?.status).toBe("skipped");
  });

  it("writes a Plan document whose ordering does not depend on what was re-judged", async () => {
    const repo = await repoWith(["a", "b", "c"], "report:\n  list_files_for: [mechanical]\n");
    await runCli(repo, "scan");
    const first = await read(repo, ".chutes/default/PLAN.md");

    // Re-judge only the middle file, so judged and reused interleave.
    await file(repo, "src/b.js", "export default 2 // edited\n");
    await runCli(repo, "scan");
    const second = await read(repo, ".chutes/default/PLAN.md");

    const order = (doc: string) => ["src/a.js", "src/b.js", "src/c.js"].map((p) => doc.indexOf(p));
    expect(order(second)).toEqual(order(first));
  });
});
