import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { migrationDir } from "../paths.js";
import type { PlanRecord } from "./record.js";

export function planPath(cwd: string, migration: string): string {
  return join(migrationDir(cwd, migration), "plan.jsonl");
}

/**
 * Read the Plan back.
 *
 * `plan.jsonl` is committed to version control and merged by hand when two
 * people scan at once, so a line can be malformed in ways no writer of ours
 * produced. A bad line names itself rather than failing the whole file with
 * a parser's idea of where the problem is.
 */
export async function readPlan(cwd: string, migration: string): Promise<PlanRecord[]> {
  const path = planPath(cwd, migration);

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`No Plan at ${relative(cwd, path)}. Run chutes scan first.`);
  }

  const records: PlanRecord[] = [];
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    try {
      records.push(JSON.parse(line) as PlanRecord);
    } catch {
      throw new Error(
        `${relative(cwd, path)} line ${index + 1} is not valid JSON. ` +
          "If this file was merged by hand, check for a conflict marker.",
      );
    }
  }
  return records;
}

export interface LaneTally {
  mechanical: number;
  judgment: number;
  redesign: number;
  /** Files with no Lane because their judgment failed. Never a Lane count. */
  error: number;
  /** Files that have gone from the repository since the last scan. */
  removed: number;
}

export function tallyLanes(records: PlanRecord[]): LaneTally {
  const tally: LaneTally = { mechanical: 0, judgment: 0, redesign: 0, error: 0, removed: 0 };
  for (const record of records) {
    // A file that no longer exists is not outstanding work, and counting it
    // in a Lane overstates what is left to do.
    if (record.status === "removed") {
      tally.removed += 1;
      continue;
    }
    // One definition of "error", shared with `scan`: the status, not the
    // absence of a Lane.
    if (record.status === "error") {
      tally.error += 1;
      continue;
    }
    if (record.lane !== null) tally[record.lane] += 1;
  }
  return tally;
}
