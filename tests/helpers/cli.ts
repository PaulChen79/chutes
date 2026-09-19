import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BIN = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run the CLI inside `cwd`, exactly as a user would. Never throws on non-zero exit. */
export async function runCli(cwd: string, ...args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number | string };
    // A spawn that never ran the CLI sets `code` to a string such as "ENOENT".
    // Letting that through would satisfy `expect(exitCode).not.toBe(0)` and turn
    // a broken harness into a green suite.
    if (typeof e.code !== "number") {
      throw new Error(`Failed to run the CLI (${String(e.code)}). Is dist/cli.js built?`);
    }
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.code };
  }
}

/**
 * A throwaway directory standing in for a user's repository, nested inside a
 * private root so that a test can assert nothing was written *above* the repo
 * without tripping over unrelated files in the system temp directory.
 */
export async function tempRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "chutes-test-"));
  const repo = join(root, "repo");
  await mkdir(repo);
  return repo;
}

export async function read(cwd: string, relativePath: string): Promise<string> {
  return await readFile(join(cwd, relativePath), "utf8");
}

export async function write(cwd: string, relativePath: string, contents: string): Promise<void> {
  await writeFile(join(cwd, relativePath), contents, "utf8");
}

/** Everything beside the repo in its private root. Empty means nothing escaped. */
export async function siblingsOfRepo(repo: string): Promise<string[]> {
  const entries = await readdir(join(repo, ".."));
  return entries.filter((entry) => entry !== "repo");
}
