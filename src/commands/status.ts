import { loadConfig } from "../config/load.js";
import { readPlan, tallyLanes } from "../plan/read.js";
import { count, widestOf } from "../text.js";

export interface StatusOptions {
  migration: string;
}

/**
 * Report where a Migration has got to.
 *
 * Exits non-zero while any file errored. A Plan with thirty timeouts in it
 * looks exactly like a finished Plan if the errors are folded into the Lane
 * counts, and the thing most likely to read this is a CI job that only
 * checks the exit code.
 */
export async function statusCommand(cwd: string, options: StatusOptions): Promise<void> {
  // Loaded for its validation only: a Plan read against a broken
  // configuration would report counts nobody can act on.
  await loadConfig(cwd, options.migration);
  const records = await readPlan(cwd, options.migration);
  const tally = tallyLanes(records);

  const lanes: Array<[string, number]> = [
    ["mechanical", tally.mechanical],
    ["judgment", tally.judgment],
    ["redesign", tally.redesign],
  ];
  const width = widestOf(lanes.map(([name]) => name));

  const out = [`Migration "${options.migration}": ${count(records.length, "file")}.`, ""];
  for (const [name, n] of lanes) out.push(`  ${name.padEnd(width)}  ${n}`);

  if (tally.removed > 0) {
    out.push("", `  ${"removed".padEnd(width)}  ${tally.removed}  (no longer in the repository)`);
  }

  if (tally.error > 0) {
    out.push("");
    // Separate from the Lanes above, and never added into them: an error is
    // a file nobody has classified, not a file that turned out to be hard.
    out.push(`  ${"error".padEnd(width)}  ${tally.error}  (not classified)`);
    out.push("");
    out.push(
      `${count(tally.error, "file")} could not be judged. Rerun chutes scan --force to retry.`,
    );
    process.stdout.write(`${out.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${out.join("\n")}\n`);
}
