import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChutesConfig } from "../config/schema.js";

/** One place a Detect Rule fired, with the surrounding source for context. */
export interface Match {
  ruleId: string;
  line: number;
  text: string;
  context: string[];
}

/** Every Match found in one file, in rule order then line order. */
export interface FileMatches {
  path: string;
  /** Every Match found, untruncated. Tallies must be taken from this. */
  matches: Match[];
  /**
   * How many Matches survive `max_matches_per_file`. Truncation is a limit on
   * what is rendered and later sent to the Judge as State, never on what is
   * counted: a rule whose Matches were all truncated away still fired, and
   * reporting it as "matched nothing" would send the user to fix a rule that
   * works.
   */
  shown: number;
}

/** A candidate file that could not be read. */
export interface ReadFailure {
  path: string;
  reason: string;
}

/** Lines of surrounding source shown either side of a matched line. */
export const CONTEXT_LINES = 3;

/** How many files to read at once. */
const READ_CONCURRENCY = 32;

/**
 * Split source into lines for matching.
 *
 * Handles CRLF, because a rule anchored with `$` would otherwise never fire on
 * a repository checked out on Windows, and a stray carriage return rendered
 * into a context line returns the terminal cursor to column 0 and lets the
 * next line overwrite it.
 *
 * A trailing newline terminates the last line rather than starting an empty
 * one, so patterns that can match empty do not report a line past the end.
 */
export function splitLines(contents: string): string[] {
  const lines = contents.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Run every Detect Rule over one file's contents. */
export function matchContents(contents: string, config: ChutesConfig): Omit<FileMatches, "path"> {
  return matchLines(splitLines(contents), compileRules(config), config.detect.max_matches_per_file);
}

interface CompiledRule {
  id: string;
  regex: RegExp;
}

/**
 * Compile each Detect Rule once per run rather than once per file. The
 * configuration is already validated, so these patterns are known to compile.
 */
function compileRules(config: ChutesConfig): CompiledRule[] {
  return config.detect.rules.map((rule) => ({ id: rule.id, regex: new RegExp(rule.pattern) }));
}

function matchLines(
  lines: string[],
  rules: CompiledRule[],
  max: number,
): Omit<FileMatches, "path"> {
  const found: Match[] = [];

  for (const rule of rules) {
    for (const [index, text] of lines.entries()) {
      if (!rule.regex.test(text)) continue;
      found.push({
        ruleId: rule.id,
        line: index + 1,
        text,
        context: lines.slice(Math.max(0, index - CONTEXT_LINES), index + CONTEXT_LINES + 1),
      });
    }
  }

  return { matches: found, shown: Math.min(found.length, max) };
}

/**
 * Run every Detect Rule over every candidate file.
 *
 * A file that cannot be read is collected rather than thrown, so one
 * restricted file does not deny the user a read-only diagnostic they are meant
 * to re-run while iterating on patterns.
 */
export async function matchFiles(
  cwd: string,
  paths: string[],
  config: ChutesConfig,
): Promise<{ files: FileMatches[]; failures: ReadFailure[] }> {
  const rules = compileRules(config);
  const max = config.detect.max_matches_per_file;
  const files: FileMatches[] = [];
  const failures: ReadFailure[] = [];

  for (let start = 0; start < paths.length; start += READ_CONCURRENCY) {
    const batch = paths.slice(start, start + READ_CONCURRENCY);
    type ReadResult = { path: string; contents: string } | { path: string; reason: string };

    const read = await Promise.all(
      batch.map(async (path): Promise<ReadResult> => {
        try {
          return { path, contents: await readFile(join(cwd, path), "utf8") };
        } catch (error) {
          return { path, reason: error instanceof Error ? error.message : String(error) };
        }
      }),
    );

    for (const result of read) {
      if ("contents" in result) {
        files.push({ path: result.path, ...matchLines(splitLines(result.contents), rules, max) });
      } else {
        failures.push({ path: result.path, reason: result.reason });
      }
    }
  }

  return { files, failures };
}
