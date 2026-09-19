import { loadConfig } from "../config/load.js";
import type { ChutesConfig } from "../config/schema.js";
import { discoverCandidates } from "../detect/discover.js";
import { CONTEXT_LINES, type FileMatches, matchFiles, type ReadFailure } from "../detect/match.js";

/** English pluralisation for the small set of nouns this report uses. */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

interface RuleTally {
  id: string;
  files: number;
  matches: number;
}

/**
 * Per-rule totals, in the order the rules appear in the configuration.
 *
 * Taken from every Match found, never from the truncated render list, so a
 * prolific rule cannot exhaust the per-file budget and make a later rule look
 * as though it never fired.
 */
function tallyByRule(config: ChutesConfig, files: FileMatches[]): RuleTally[] {
  return config.detect.rules.map((rule) => {
    const hitting = files.filter((f) => f.matches.some((m) => m.ruleId === rule.id));
    const matches = hitting.reduce(
      (sum, f) => sum + f.matches.filter((m) => m.ruleId === rule.id).length,
      0,
    );
    return { id: rule.id, files: hitting.length, matches };
  });
}

function renderTally(tallies: RuleTally[]): string {
  const width = Math.max(...tallies.map((t) => t.id.length));
  return tallies
    .map((t) => {
      const label = t.id.padEnd(width);
      if (t.matches === 0) {
        return `  ${label}  matched nothing`;
      }
      return `  ${label}  ${count(t.matches, "match", "matches")} in ${count(t.files, "file", "files")}`;
    })
    .join("\n");
}

/** Every Match in one file, with the surrounding source, gutter-numbered. */
function renderFile(file: FileMatches): string {
  const lines: string[] = [`  ${file.path}`];
  const shown = file.matches.slice(0, file.shown);

  for (const match of shown) {
    const first = Math.max(1, match.line - CONTEXT_LINES);
    const width = String(first + match.context.length - 1).length;
    lines.push(`    ${match.ruleId} at line ${match.line}`);
    for (const [offset, text] of match.context.entries()) {
      const number = first + offset;
      const isMatch = number === match.line;
      lines.push(
        `    ${isMatch ? ">" : " "} ${String(number).padStart(width)} | ${isMatch ? match.text : text}`,
      );
    }
    lines.push("");
  }

  if (file.matches.length > file.shown) {
    lines.push(
      `    ... ${file.matches.length - file.shown} further matches not shown ` +
        "(detect.max_matches_per_file)",
      "",
    );
  }

  return lines.join("\n");
}

function renderFailures(failures: ReadFailure[]): string[] {
  return [
    "",
    `Could not read ${count(failures.length, "file", "files")}:`,
    "",
    ...failures.map((f) => `  ${f.path}: ${f.reason}`),
  ];
}

export async function detectCommand(cwd: string, migration: string): Promise<void> {
  const config = await loadConfig(cwd, migration);
  const candidates = await discoverCandidates(cwd, config);

  // No candidates means the globs are wrong, not the rules. Warning about the
  // rules here would point the user at the one thing that is not broken.
  if (candidates.length === 0) {
    process.stdout.write(
      [
        `Detect Rules for Migration "${migration}"`,
        "",
        "No candidate files. The Detect Rules were not run.",
        "",
        `include: ${JSON.stringify(config.include)}`,
        `exclude: ${JSON.stringify(config.exclude)}`,
        "",
        "Check these globs before checking the rules.",
        "",
      ].join("\n"),
    );
    return;
  }

  const { files, failures } = await matchFiles(cwd, candidates, config);
  const matched = files.filter((f) => f.matches.length > 0);

  const tallies = tallyByRule(config, files);
  const silent = tallies.filter((t) => t.matches === 0);
  const read = candidates.length - failures.length;

  const out: string[] = [
    `Detect Rules for Migration "${migration}"`,
    "",
    renderTally(tallies),
    "",
    `${count(matched.length, "file", "files")} of ${read} matched at least one rule.`,
    `${count(read - matched.length, "file is", "files are")} Untouched.`,
  ];

  if (matched.length > 0) {
    out.push("", "Matches", "", ...matched.map(renderFile));
  }

  if (failures.length > 0) {
    out.push(...renderFailures(failures));
  }

  if (silent.length > 0) {
    out.push(
      "",
      `Warning: ${count(silent.length, "rule", "rules")} matched nothing. A rule that matches`,
      "nothing removes files from the Plan silently. Check the pattern before scanning.",
    );
  }

  process.stdout.write(`${out.join("\n")}\n`);
}
