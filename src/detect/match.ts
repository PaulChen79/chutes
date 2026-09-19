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

/**
 * Lines of surrounding source shown either side of a matched line.
 *
 * The default for `state.context_lines`, and the value `detect --dry-run`
 * renders with. One constant and one extraction, so the context a reader
 * checks in `detect` is the context the Judge is later shown.
 */
export const CONTEXT_LINES = 3;

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

export interface CompiledRule {
  id: string;
  regex: RegExp;
}

/**
 * Compile each Detect Rule once per run rather than once per file. The
 * configuration is already validated, so these patterns are known to compile.
 */
export function compileRules(config: ChutesConfig): CompiledRule[] {
  return config.detect.rules.map((rule) => ({ id: rule.id, regex: new RegExp(rule.pattern) }));
}

export function matchLines(
  lines: string[],
  rules: CompiledRule[],
  max: number,
  contextLines: number = CONTEXT_LINES,
): Omit<FileMatches, "path"> {
  const found: Match[] = [];

  for (const rule of rules) {
    for (const [index, text] of lines.entries()) {
      if (!rule.regex.test(text)) continue;
      found.push({
        ruleId: rule.id,
        line: index + 1,
        text,
        context: lines.slice(Math.max(0, index - contextLines), index + contextLines + 1),
      });
    }
  }

  return { matches: found, shown: Math.min(found.length, max) };
}
