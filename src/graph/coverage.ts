import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { ChutesConfig } from "../config/schema.js";

/**
 * Which files a coverage report says were executed.
 *
 * A coverage report answers "was this file covered", not "by which test" —
 * no mainstream format records per-test attribution. So the report supplies
 * the fact, and the import graph still supplies the test names.
 */
export interface CoverageReport {
  covered: Set<string>;
}

/** Istanbul's `coverage-final.json`: one entry per file, `s` counting statements. */
interface IstanbulEntry {
  path?: unknown;
  s?: Record<string, unknown>;
}

function toRepoRelative(cwd: string, key: string): string {
  const normalised = isAbsolute(key) ? relative(cwd, key) : key;
  return normalised.split(sep).join("/");
}

function wasExecuted(entry: IstanbulEntry): boolean {
  return Object.values(entry.s ?? {}).some((count) => typeof count === "number" && count > 0);
}

/**
 * Read the configured coverage report, or report that it is not there.
 *
 * A missing report is not an error. It is the normal state of a repository
 * whose tests have not been run recently, and refusing to run a free,
 * read-only diagnostic over it would be a poor trade.
 */
export async function readCoverageReport(
  cwd: string,
  config: ChutesConfig,
): Promise<CoverageReport | undefined> {
  const path = config.coverage.report_path;

  let source: string;
  try {
    source = await readFile(join(cwd, path), "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;

  const covered = new Set<string>();
  for (const [key, value] of Object.entries(parsed as Record<string, IstanbulEntry>)) {
    if (typeof value !== "object" || value === null) continue;
    const named = typeof value.path === "string" ? value.path : key;
    if (wasExecuted(value)) covered.add(toRepoRelative(cwd, named));
  }

  return { covered };
}
