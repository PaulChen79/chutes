import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import { file, withConfig, withRules } from "./helpers/repo.js";

describe("chutes detect --dry-run", () => {
  it("reports the files and Matches each Detect Rule hit", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "options-api", pattern: "export default \\{" }]);
    await file(repo, "src/a.js", "export default {\n  name: 'A',\n}\n");
    await file(repo, "src/b.js", "export default {\n  name: 'B',\n}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("options-api");
    expect(result.stdout).toMatch(/2 files/);
    expect(result.stdout).toMatch(/2 matches/);
  });

  it("calls out a Detect Rule that matched nothing", async () => {
    const repo = await tempRepo();
    await withRules(repo, [
      { id: "options-api", pattern: "export default \\{" },
      { id: "filters", pattern: "Vue\\.filter" },
    ]);
    await file(repo, "src/a.js", "export default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/filters.*matched nothing/is);
  });

  it("shows each matched line with surrounding context", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "filters", pattern: "Vue\\.filter" }]);
    await file(
      repo,
      "src/a.js",
      ["// header", "const x = 1", "Vue.filter('money', fn)", "const y = 2", "// footer"].join(
        "\n",
      ),
    );

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("src/a.js");
    expect(result.stdout).toContain("Vue.filter('money', fn)");
    expect(result.stdout).toContain("const x = 1");
    expect(result.stdout).toContain("const y = 2");
  });

  it("reports how many candidate files are Untouched", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "filters", pattern: "Vue\\.filter" }]);
    await file(repo, "src/hit.js", "Vue.filter('a', fn)\n");
    await file(repo, "src/miss-one.js", "const a = 1\n");
    await file(repo, "src/miss-two.js", "const b = 2\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.stdout).toMatch(/2 files are Untouched/);
  });

  it("honours include and exclude globs when selecting candidates", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "filters", pattern: "Vue\\.filter" }],
      'exclude: ["src/vendor/**"]\n',
    );
    await file(repo, "src/app.js", "Vue.filter('a', fn)\n");
    await file(repo, "src/vendor/lib.js", "Vue.filter('b', fn)\n");
    await file(repo, "docs/notes.js", "Vue.filter('c', fn)\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.stdout).toContain("src/app.js");
    expect(result.stdout).not.toContain("src/vendor/lib.js");
    expect(result.stdout).not.toContain("docs/notes.js");
    expect(result.stdout).toMatch(/1 match in 1 file/);
  });

  it("produces identical output across runs", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "filters", pattern: "Vue\\.filter" }]);
    for (const name of ["d", "a", "c", "b"]) {
      await file(repo, `src/${name}.js`, "Vue.filter('x', fn)\n");
    }

    const first = await runCli(repo, "detect", "--dry-run");
    const second = await runCli(repo, "detect", "--dry-run");

    expect(first.stdout).toBe(second.stdout);
    const order = [...first.stdout.matchAll(/src\/(\w)\.js/g)].map((m) => m[1]);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("fails clearly when no configuration exists", async () => {
    const repo = await tempRepo();

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("No configuration");
    expect(result.stderr).toContain("chutes init");
  });

  it("fails clearly when the configuration is invalid", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "ok", pattern: "x" }], "judge:\n  concurrency: -4\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("judge.concurrency");
  });
});

describe("chutes detect --dry-run, edges found in review", () => {
  it("counts a rule that fired even when truncation hid its Matches", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [
        { id: "prolific", pattern: "export default" },
        { id: "quiet", pattern: "Vue\\.filter" },
      ],
      "  max_matches_per_file: 3\n",
    );
    await file(
      repo,
      "src/a.js",
      "export default 1\nexport default 2\nexport default 3\nexport default 4\nVue.filter('m')\n",
    );

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.stdout).toMatch(/quiet\s+1 match in 1 file/);
    expect(result.stdout).not.toContain("matched nothing");
    expect(result.stdout).toContain("further matches not shown");
  });

  it("fires anchored rules on a CRLF file and renders no carriage returns", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "anchored", pattern: "export default \\{$" }]);
    await file(repo, "src/a.js", "const x = 1\r\nexport default {\r\n}\r\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.stdout).toMatch(/anchored\s+1 match in 1 file/);
    expect(result.stdout).not.toContain("\r");
  });

  it("never treats node_modules as a candidate", async () => {
    const repo = await tempRepo();
    await withConfig(
      repo,
      'include: ["**/*.js"]\ncriteria: "Vue 2 to Vue 3"\n' +
        "detect:\n  rules:\n    - id: any\n      pattern: 'export default'\n",
    );
    await file(repo, "src/mine.js", "export default 1\n");
    await file(repo, "node_modules/pkg/index.js", "export default 2\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.stdout).not.toContain("node_modules");
    expect(result.stdout).toMatch(/any\s+1 match in 1 file/);
  });

  it("blames the globs, not the rules, when nothing is a candidate", async () => {
    const repo = await tempRepo();
    await withConfig(
      repo,
      'include: ["srcc/**/*.ts"]\ncriteria: "Vue 2 to Vue 3"\n' +
        "detect:\n  rules:\n    - id: fine\n      pattern: 'export default'\n",
    );
    await file(repo, "src/a.ts", "export default 1\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No candidate files");
    expect(result.stdout).toContain("include:");
    expect(result.stdout).not.toContain("matched nothing");
  });

  it("reports an unreadable file and still scans the rest", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "any", pattern: "export default" }]);
    await file(repo, "src/ok.js", "export default 1\n");
    await file(repo, "src/nope.js", "export default 2\n");
    await chmod(join(repo, "src/nope.js"), 0o000);

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/any\s+1 match in 1 file/);
    expect(result.stdout).toContain("Could not read 1 file");
    expect(result.stdout).toContain("src/nope.js");
  });

  it("does not report a line past the end of a file", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "blank", pattern: "^$" }]);
    await file(repo, "src/a.js", "const a = 1\nconst b = 2\nconst c = 3\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.stdout).toContain("blank");
    expect(result.stdout).not.toContain("at line 4");
  });
});
