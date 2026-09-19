import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import { file } from "./helpers/repo.js";

describe("chutes init --report", () => {
  it("reports the languages present and how many files each has", async () => {
    const repo = await tempRepo();
    await file(repo, "src/cart.ts", "export const a = 1\n");
    await file(repo, "src/page.ts", "export const b = 2\n");
    await file(repo, "src/legacy.js", "module.exports = {}\n");
    await file(repo, "src/App.vue", "<template><div /></template>\n");

    const result = await runCli(repo, "init", "--report");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/TypeScript\s+2 files/);
    expect(result.stdout).toMatch(/JavaScript\s+1 file\b/);
    expect(result.stdout).toMatch(/Vue\s+1 file\b/);
  });

  it("reports the frameworks it recognises, with the version the manifest pins", async () => {
    const repo = await tempRepo();
    await file(repo, "src/page.tsx", "export const a = 1\n");
    await file(
      repo,
      "package.json",
      JSON.stringify({
        dependencies: { react: "^17.0.2", "react-dom": "^17.0.2" },
        devDependencies: { vitest: "1.6.0", typescript: "~5.4.0" },
      }),
    );

    const result = await runCli(repo, "init", "--report");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/React\s+\^17\.0\.2/);
    expect(result.stdout).toMatch(/TypeScript\s+~5\.4\.0/);
    expect(result.stdout).toMatch(/Vitest\s+1\.6\.0/);
  });

  it("suggests candidate Detect Rules, with how many files each would match", async () => {
    const repo = await tempRepo();
    await file(repo, "src/legacy-a.js", "const fs = require('fs')\nmodule.exports = { fs }\n");
    await file(
      repo,
      "src/legacy-b.js",
      "const path = require('path')\nmodule.exports = { path }\n",
    );
    await file(repo, "src/modern.js", "import fs from 'node:fs'\nexport default fs\n");

    const result = await runCli(repo, "init", "--report");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Candidate Detect Rules");
    // Two of the three files use CommonJS; the rule is offered with that count.
    expect(result.stdout).toMatch(/commonjs-require\s+\(2 files, 2 occurrences\)/);
    expect(result.stdout).toMatch(/pattern:\s*\S/);
  });

  it("runs before any configuration exists, writes none, and says so", async () => {
    const repo = await tempRepo();
    await file(repo, "src/cart.ts", "export const a = 1\n");

    const before = await readdir(repo);
    const result = await runCli(repo, "init", "--report");
    const after = await readdir(repo);

    expect(result.exitCode).toBe(0);
    expect(after.sort()).toEqual(before.sort());
    expect(result.stdout).toMatch(/writes no configuration/i);
  });

  it("emits machine-readable JSON for an agent when asked", async () => {
    const repo = await tempRepo();
    await file(repo, "src/legacy.js", "const fs = require('fs')\nmodule.exports = fs\n");
    await file(repo, "package.json", JSON.stringify({ dependencies: { react: "^18.0.0" } }));

    const result = await runCli(repo, "init", "--report", "--json");

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.languages).toContainEqual({ language: "JavaScript", files: 1 });
    expect(report.frameworks).toContainEqual({ name: "React", version: "^18.0.0" });
    expect(report.candidateRules).toContainEqual(
      expect.objectContaining({ id: "commonjs-require", files: 1, occurrences: 1 }),
    );
    expect(report.writesConfiguration).toBe(false);
  });

  it("does not count a nested package's build output as the user's code", async () => {
    const repo = await tempRepo();
    await file(repo, "src/a.js", "const fs = require('fs')\n");
    await file(repo, "packages/web/src/b.js", "var x = 1\n");
    for (const n of [1, 2, 3]) {
      await file(repo, `packages/web/dist/bundle-${n}.js`, "var m = require('x')\n");
    }

    const result = await runCli(repo, "init", "--report", "--json");
    const report = JSON.parse(result.stdout);

    expect(report.filesObserved).toBe(2);
    expect(report.languages).toContainEqual({ language: "JavaScript", files: 2 });
    const requires = report.candidateRules.find((r: { id: string }) => r.id === "commonjs-require");
    expect(requires.files).toBe(1);
  });

  it("does not count a Python virtualenv as the user's code", async () => {
    const repo = await tempRepo();
    await file(repo, "src/app.py", "x = 1\n");
    for (const n of [1, 2, 3, 4]) {
      await file(repo, `venv/lib/python3.11/site-packages/requests/m${n}.py`, "import os\n");
    }

    const result = await runCli(repo, "init", "--report", "--json");
    const report = JSON.parse(result.stdout);

    expect(report.languages).toContainEqual({ language: "Python", files: 1 });
    expect(report.filesObserved).toBe(1);
  });

  it("counts occurrences as well as files, so a dense file is distinguishable", async () => {
    const repo = await tempRepo();
    await file(repo, "src/dense.js", "require('a')\nrequire('b')\nrequire('c')\n");
    await file(repo, "src/sparse.js", "require('d')\n");

    const result = await runCli(repo, "init", "--report", "--json");
    const report = JSON.parse(result.stdout);

    const requires = report.candidateRules.find((r: { id: string }) => r.id === "commonjs-require");
    expect(requires).toMatchObject({ files: 2, occurrences: 4 });
  });
});
