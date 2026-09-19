import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";
import { file, withRules } from "./helpers/repo.js";

describe("code-computed facts in the dry-run", () => {
  it("reports each matched file's imports, exports and how many files import it", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "options-api", pattern: "export default" }]);
    await file(
      repo,
      "src/cart.js",
      "import { total } from './math.js'\nexport default {}\nexport const label = 'cart'\n",
    );
    await file(repo, "src/page.js", "import Cart from './cart.js'\nexport default {}\n");
    await file(repo, "src/admin.js", "import Cart from './cart.js'\nexport default {}\n");
    await file(repo, "src/math.js", "export function total() {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const cart = result.stdout.slice(result.stdout.indexOf("src/cart.js"));
    expect(cart).toContain("imports (1 of 1 in this repo): ./math.js");
    expect(cart).toMatch(/exports: default, label/);
    expect(cart).toMatch(/imported by: 2 files/);
  });

  it("decides whether a file is a test from the configured test globs", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      '  test_globs: ["**/*_spec.js"]\n',
    );
    await file(repo, "src/cart.js", "export default {}\n");
    await file(repo, "src/cart_spec.js", "export default {}\n");
    await file(repo, "src/cart.spec.js", "export default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    const section = (path: string) => result.stdout.slice(result.stdout.indexOf(`  ${path}\n`));
    expect(section("src/cart_spec.js")).toMatch(/^ {4}test: yes$/m);
    expect(section("src/cart.js")).toMatch(/^ {4}test: no$/m);
    // The default globs would call this one a test; the configured globs do not.
    expect(section("src/cart.spec.js")).toMatch(/^ {4}test: no$/m);
  });

  it("reports the tests covering a file, transitively, including excluded tests", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      '  test_globs: ["**/*.spec.js"]\nexclude: ["**/*.spec.js"]\n',
    );
    await file(repo, "src/cart.js", "import './math.js'\nexport default {}\n");
    await file(repo, "src/math.js", "export default {}\n");
    await file(repo, "src/lonely.js", "export default {}\n");
    await file(repo, "src/cart.spec.js", "import './cart.js'\nexport default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    const section = (path: string) => result.stdout.slice(result.stdout.indexOf(`  ${path}\n`));
    // Directly imported by the test.
    expect(section("src/cart.js")).toMatch(/^ {4}covered by: src\/cart\.spec\.js$/m);
    // Reached only through src/cart.js, and only because the excluded test is
    // still indexed into the graph.
    expect(section("src/math.js")).toMatch(/^ {4}covered by: src\/cart\.spec\.js$/m);
    expect(section("src/lonely.js")).toMatch(/^ {4}covered by: nothing$/m);
    // Excluded, so it is not classified and never appears as a matched file.
    expect(result.stdout).not.toContain("  src/cart.spec.js\n");
  });

  it("terminates on an import cycle instead of hanging", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      '  test_globs: ["**/*.spec.js"]\n',
    );
    await file(repo, "src/a.js", "import './b.js'\nexport default {}\n");
    await file(repo, "src/b.js", "import './a.js'\nexport default {}\n");
    await file(repo, "src/app.spec.js", "import './a.js'\nexport default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const section = (path: string) => result.stdout.slice(result.stdout.indexOf(`  ${path}\n`));
    expect(section("src/a.js")).toMatch(/^ {4}covered by: src\/app\.spec\.js$/m);
    expect(section("src/b.js")).toMatch(/^ {4}covered by: src\/app\.spec\.js$/m);
  });

  it("skips imports it cannot resolve without failing the run", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "options-api", pattern: "export default" }]);
    await file(
      repo,
      "src/cart.js",
      "import Vue from 'vue'\nimport x from '@/nowhere'\nimport './math.js'\nexport default {}\n",
    );
    await file(repo, "src/math.js", "export default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const cart = result.stdout.slice(result.stdout.indexOf("  src/cart.js\n"));
    expect(cart).toMatch(/^ {4}imports \(1 of 3 in this repo\): vue, @\/nowhere, \.\/math\.js$/m);
  });

  it("prefers a coverage report over the import graph when one is present", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      "coverage:\n  source: report\n  report_path: coverage/coverage-final.json\n",
    );
    await file(repo, "src/cart.js", "export default {}\n");
    await file(repo, "src/math.js", "export default {}\n");
    await file(
      repo,
      "coverage/coverage-final.json",
      JSON.stringify({
        "src/cart.js": { path: "src/cart.js", s: { "0": 4, "1": 0 } },
        "src/math.js": { path: "src/math.js", s: { "0": 0 } },
      }),
    );

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const section = (path: string) => result.stdout.slice(result.stdout.indexOf(`  ${path}\n`));
    // No test imports either file, so the graph would call both uncovered.
    expect(section("src/cart.js")).toMatch(/^ {4}covered: yes \(coverage report\)$/m);
    expect(section("src/math.js")).toMatch(/^ {4}covered: no \(coverage report\)$/m);
  });

  it("falls back to the import graph when the configured report is missing", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      '  test_globs: ["**/*.spec.js"]\ncoverage:\n  source: report\n',
    );
    await file(repo, "src/cart.js", "export default {}\n");
    await file(repo, "src/cart.spec.js", "import './cart.js'\nexport default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("coverage/coverage-final.json");
    expect(result.stdout).toMatch(/falling back to the import graph/i);
    const cart = result.stdout.slice(result.stdout.indexOf("  src/cart.js\n"));
    expect(cart).toMatch(/^ {4}covered: yes \(import graph\)$/m);
  });
});

describe("what is indexed and what is classified", () => {
  it("prunes a directory that exclude matches, not just the literal path", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      'exclude: ["src/*"]\n',
    );
    await file(repo, "src/keep.js", "export default {}\n");
    await file(repo, "src/legacy/old.js", "export default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    // `src/*` matches the directory `src/legacy`, so everything beneath it is
    // excluded too -- the same pruning every glob tool does.
    expect(result.stdout).not.toContain("src/legacy/old.js");
    expect(result.stdout).not.toContain("src/keep.js");
  });

  it("does not let generated output inflate how many files import a source file", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      "",
      '["src/**", "dist/**"]',
    );
    await file(repo, "src/cart.js", "export default {}\n");
    await file(repo, "src/page.js", "import Cart from './cart.js'\nexport default {}\n");
    // A build of the same two files. `dist` is in the default `ignore`, so the
    // copy must not be indexed -- otherwise cart.js reports two importers.
    await file(repo, "dist/page.js", "import Cart from './cart.js'\nexport default {}\n");
    await file(repo, "dist/cart.js", "export default {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("dist/");
    const cart = result.stdout.slice(result.stdout.indexOf("  src/cart.js\n"));
    expect(cart).toMatch(/imported by: 1 file\b/);
  });

  it("indexes an excluded test so the file it imports still reports coverage", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      'exclude: ["**/*.spec.js"]\n',
    );
    await file(repo, "src/cart.js", "export default {}\n");
    await file(repo, "src/cart.spec.js", "import Cart from './cart.js'\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const cart = result.stdout.slice(result.stdout.indexOf("  src/cart.js\n"));
    expect(cart).toContain("covered by: src/cart.spec.js");
  });
});

describe("import parsing", () => {
  it("does not invent an edge from a path mentioned in a comment", async () => {
    const repo = await tempRepo();
    await withRules(repo, [{ id: "options-api", pattern: "export default" }]);
    await file(
      repo,
      "src/cart.js",
      "export default {}\n// TODO: migrate away from './legacy.js'\n",
    );
    await file(repo, "src/legacy.js", "export const old = 1\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const cart = result.stdout.slice(result.stdout.indexOf("  src/cart.js\n"));
    // A phantom edge is worse than a missed one: it moves the file's Wave and
    // shows up as another file's importer.
    expect(cart).toContain("imports: none");
  });

  it("resolves an import through a configured build alias", async () => {
    const repo = await tempRepo();
    await withRules(
      repo,
      [{ id: "options-api", pattern: "export default" }],
      'graph:\n  aliases:\n    "@": "src"\n',
    );
    await file(repo, "src/page.js", "import { total } from '@/math.js'\nexport default {}\n");
    await file(repo, "src/math.js", "export function total() {}\n");

    const result = await runCli(repo, "detect", "--dry-run");

    expect(result.exitCode).toBe(0);
    const page = result.stdout.slice(result.stdout.indexOf("  src/page.js\n"));
    expect(page).toContain("imports (1 of 1 in this repo): @/math.js");
  });
});
