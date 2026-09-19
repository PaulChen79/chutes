import { describe, expect, it } from "vitest";
import { read, runCli, siblingsOfRepo, tempRepo, write } from "./helpers/cli.js";

describe("chutes config validate", () => {
  it("accepts the skeleton written by init", async () => {
    const repo = await tempRepo();
    await runCli(repo, "init");

    const result = await runCli(repo, "config", "validate");

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("names the offending setting when a value is wrong", async () => {
    const repo = await tempRepo();
    await runCli(repo, "init");
    await write(
      repo,
      ".chutes/default/migration.yml",
      [
        "include: ['src/**/*.ts']",
        "detect:",
        "  rules:",
        "    - id: options-api",
        "      pattern: 'Vue.extend'",
        "criteria: 'Migrate Vue 2 to Vue 3.'",
        "thresholds:",
        "  redesign: { public_api: 0.5, lifecycle: 0.5, design_effort: 0.5 }",
        "  mechanical: { direct_rewrite: 1.4, custom_hack: 0.2 }",
      ].join("\n"),
    );

    const result = await runCli(repo, "config", "validate");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("thresholds.mechanical.direct_rewrite");
  });

  it("says what to do when no configuration exists", async () => {
    const repo = await tempRepo();

    const result = await runCli(repo, "config", "validate");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/chutes init/);
  });
});

describe("chutes config validate: settings the review found silently accepted", () => {
  async function skeleton(): Promise<string> {
    const repo = await tempRepo();
    await runCli(repo, "init");
    return repo;
  }

  it("takes defaults when a section is left with nothing under it", async () => {
    const repo = await skeleton();
    const config = await read(repo, ".chutes/default/migration.yml");
    // Commenting a value out is how a user accepts a default; it leaves the
    // section header present but null.
    await write(
      repo,
      ".chutes/default/migration.yml",
      config.replace(/^coverage:$[\s\S]*?^(?=criteria:)/m, "coverage:\n\n"),
    );

    const result = await runCli(repo, "config", "validate");

    expect(result.stdout).toContain("is valid");
    expect(result.exitCode).toBe(0);
  });

  it("rejects a misspelled setting instead of silently running on the default", async () => {
    const repo = await skeleton();
    const config = await read(repo, ".chutes/default/migration.yml");
    await write(
      repo,
      ".chutes/default/migration.yml",
      config.replace("  concurrency:", "  concurrancy:"),
    );

    const result = await runCli(repo, "config", "validate");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("concurrancy");
  });

  it("rejects a Detect Rule pattern that is not a valid regular expression", async () => {
    const repo = await skeleton();
    const config = await read(repo, ".chutes/default/migration.yml");
    await write(
      repo,
      ".chutes/default/migration.yml",
      config.replace(/pattern: .*/, 'pattern: "("'),
    );

    const result = await runCli(repo, "config", "validate");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("pattern");
    expect(result.stderr).toContain("regular expression");
  });

  it("rejects two Detect Rules sharing an id, which would conflate their Matches", async () => {
    const repo = await skeleton();
    const config = await read(repo, ".chutes/default/migration.yml");
    await write(
      repo,
      ".chutes/default/migration.yml",
      config.replace(
        /^ {2}rules:$/m,
        '  rules:\n    - id: duplicated\n      pattern: "a"\n    - id: duplicated\n      pattern: "b"',
      ),
    );

    const result = await runCli(repo, "config", "validate");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("duplicated");
  });
});

describe("chutes init: Migration names become directory names", () => {
  it("refuses a name that would escape the .chutes directory", async () => {
    const repo = await tempRepo();

    const result = await runCli(repo, "init", "--migration", "../../escaped");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Invalid Migration name");
    expect(await siblingsOfRepo(repo)).toEqual([]);
  });

  it("refuses an empty name, which would collide with the Migration namespace", async () => {
    const repo = await tempRepo();

    const result = await runCli(repo, "init", "--migration", "");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Invalid Migration name");
  });
});
