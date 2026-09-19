import { collect, type ReadFailure } from "../collect.js";
import { loadConfig } from "../config/load.js";
import type { ChutesConfig, CoverageSource } from "../config/schema.js";
import { CONTEXT_LINES, type FileMatches } from "../detect/match.js";
import type { FileFacts } from "../graph/facts.js";

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

const COVERAGE_LABEL = {
  importgraph: "import graph",
  report: "coverage report",
  none: "coverage.source: none",
} as const;

/**
 * The two coverage lines, labelled so they cannot appear to contradict.
 *
 * They can legitimately disagree: a coverage report says whether a file ran,
 * the import graph says which tests reach it, and no mainstream report format
 * records the latter. Printing both as "covered" would read as a bug, so when
 * the report is the source the second line says what it actually is.
 */
function renderCoverage(facts: FileFacts, source: CoverageSource): string[] {
  if (source === "none") {
    return [`    covered: not computed (${COVERAGE_LABEL.none})`];
  }
  const tests = facts.coveredBy.length > 0 ? facts.coveredBy.join(", ") : "nothing";
  return [
    `    covered: ${facts.covered ? "yes" : "no"} (${COVERAGE_LABEL[source]})`,
    source === "report" ? `    tests importing it: ${tests}` : `    covered by: ${tests}`,
  ];
}

/** The facts code established about a file, which the Judge is never asked for. */
function renderFacts(facts: FileFacts | undefined, source: CoverageSource): string[] {
  if (!facts) return [];
  // The count goes in the label, not after the list: trailing it would read as
  // a note about the last specifier rather than about all of them.
  const resolved = `(${facts.importsLocal} of ${facts.imports.length} in this repo)`;
  return [
    facts.imports.length > 0
      ? `    imports ${resolved}: ${facts.imports.join(", ")}`
      : "    imports: none",
    `    exports: ${facts.exports.length > 0 ? facts.exports.join(", ") : "none"}`,
    `    imported by: ${count(facts.importedBy, "file", "files")}`,
    `    test: ${facts.isTest ? "yes" : "no"}`,
    ...renderCoverage(facts, source),
    "",
  ];
}

/** Every Match in one file, with the surrounding source, gutter-numbered. */
function renderFile(
  file: FileMatches,
  facts: FileFacts | undefined,
  source: CoverageSource,
): string {
  const lines: string[] = [`  ${file.path}`, ...renderFacts(facts, source)];
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

function renderFailures(failures: ReadFailure[], indexed: number): string[] {
  return [
    "",
    `Could not read ${count(failures.length, "file", "files")} of the ${indexed} indexed`,
    "(indexed is wider than the counts above: it includes excluded files, which are",
    "graph edges but never classified). An unreadable file contributes no edges.",
    "",
    ...failures.map((f) => `  ${f.path}: ${f.reason}`),
  ];
}

export async function detectCommand(cwd: string, migration: string): Promise<void> {
  const config = await loadConfig(cwd, migration);
  const collected = await collect(cwd, config);
  const { candidates } = collected;

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
        `ignore:  ${JSON.stringify(config.ignore)}`,
        `exclude: ${JSON.stringify(config.exclude)}`,
        "",
        "Check these globs before checking the rules.",
        "",
      ].join("\n"),
    );
    return;
  }

  const files = candidates.flatMap((path) => collected.matches.get(path) ?? []);
  const matched = files.filter((f) => f.matches.length > 0);
  const failures = collected.failures;

  const tallies = tallyByRule(config, files);
  const silent = tallies.filter((t) => t.matches === 0);
  const read = files.length;

  const out: string[] = [
    `Detect Rules for Migration "${migration}"`,
    "",
    renderTally(tallies),
    "",
    `${count(matched.length, "file", "files")} of ${read} matched at least one rule.`,
    `${count(read - matched.length, "file is", "files are")} Untouched.`,
  ];

  if (matched.length > 0) {
    out.push(
      "",
      "Matches",
      "",
      ...matched.map((file) =>
        renderFile(file, collected.graph.facts.get(file.path), collected.graph.coverageSource),
      ),
    );
  }

  if (failures.length > 0) {
    out.push(...renderFailures(failures, collected.indexed.length));
  }

  if (collected.coverageFellBack !== undefined) {
    out.push(
      "",
      `Note: coverage.source is "report" but ${collected.coverageFellBack} could not be read;`,
      "falling back to the import graph. Generate the report, or set coverage.source",
      "explicitly, so that coverage is not quietly approximate.",
    );
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
