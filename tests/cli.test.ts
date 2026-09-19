import { describe, expect, it } from "vitest";
import { runCli, tempRepo } from "./helpers/cli.js";

describe("the chutes command", () => {
  it("reports its version", async () => {
    const repo = await tempRepo();
    const result = await runCli(repo, "--version");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("describes the available commands", async () => {
    const repo = await tempRepo();
    const result = await runCli(repo, "--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("init");
  });

  it("fails rather than guessing at an unknown command", async () => {
    const repo = await tempRepo();
    const result = await runCli(repo, "scna");
    expect(result.exitCode).not.toBe(0);
  });
});
