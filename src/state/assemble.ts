import type { ChutesConfig } from "../config/schema.js";
import { type FileMatches, splitLines } from "../detect/match.js";
import type { FileFacts } from "../graph/facts.js";
import { extensionOf } from "../observe/languages.js";
import { outlineOf } from "./outline.js";

/**
 * Everything the Judge is shown about one file.
 *
 * Addressed by path and nested by kind rather than flattened into prose,
 * because a flat wall of context degrades the answers -- the model has to
 * work out what is relevant before it can answer, and it is not reliably
 * good at that.
 */
export interface State {
  file: { path: string; language: string; loc: number };
  matches: Array<{ rule: string; line: number; snippet: string }>;
  /** The total number of Matches, even when `matches` was truncated. */
  match_count: number;
  imports: string[];
  exports: string[];
  outline: string[];
  graph: { imported_by: number; imports_local: number };
  /** Computed from `detect.test_globs`, never asked of the Judge. */
  is_test_file: boolean;
  /** Computed from the import graph or a coverage report, never asked. */
  covered_by: string[];
}

export interface Assembled {
  state: State;
  /** True when something had to be dropped to fit the budget. */
  truncated: boolean;
  /**
   * Set when even a single Match will not fit the budget, so there is no
   * State worth sending. The file cannot be judged and must be recorded as
   * an error rather than given a Lane on no evidence.
   */
  impossible: string | undefined;
}

function languageOf(path: string): string {
  const extension = extensionOf(path);
  return extension === "" ? "unknown" : extension.slice(1);
}

/**
 * Build the State for one file, within the configured size budget.
 *
 * Truncation drops Matches, never facts: the graph facts are a handful of
 * numbers and the whole point of computing them is that the Judge cannot
 * work them out for itself, whereas the fortieth instance of the same
 * pattern teaches it nothing the first ten did not.
 *
 * `match_count` always reports the true total, so a truncated State tells the
 * Judge how much it is not seeing rather than quietly looking like a smaller
 * file.
 */
export function assembleState(
  matches: FileMatches,
  facts: FileFacts,
  contents: string,
  config: ChutesConfig,
): Assembled {
  const { outline_limit, max_chars } = config.state;
  // The Match budget is detect.max_matches_per_file: one key, one meaning. A
  // second "how many Matches" setting under state would have silently
  // overridden it, which is how a configured limit becomes inert.
  const max_matches = config.detect.max_matches_per_file;

  const all = matches.matches;
  // splitLines, not a bare split: a file ending in a newline would otherwise
  // report one line more than it has, and `loc` is a code-computed fact the
  // Judge is told rather than asked.
  const lines = splitLines(contents);

  // The context was already extracted when the Match was found, under the
  // same `state.context_lines`. Re-deriving it here would be a second code
  // path for one job, free to drift from what `detect --dry-run` showed.
  const render = (limit: number) =>
    all.slice(0, limit).map((match) => ({
      rule: match.ruleId,
      line: match.line,
      snippet: match.context.join("\n"),
    }));

  const base: Omit<State, "matches"> = {
    file: { path: matches.path, language: languageOf(matches.path), loc: lines.length },
    match_count: all.length,
    imports: facts.imports,
    exports: facts.exports,
    outline: outlineOf(lines, outline_limit),
    graph: { imported_by: facts.importedBy, imports_local: facts.importsLocal },
    is_test_file: facts.isTest,
    covered_by: facts.coveredBy,
  };

  let limit = Math.min(max_matches, all.length);
  let state: State = { ...base, matches: render(limit) };

  // Halve until it fits, with a floor of one. Halving rather than stepping
  // down because a pathological file can hold thousands of Matches and each
  // attempt costs a full serialisation.
  //
  // The floor matters: halving 1 gives 0, and a State with no Matches in it
  // asks the Judge to classify a file on nothing at all. It answered
  // confidently, and the answer was meaningless.
  while (limit > 1 && JSON.stringify(state).length > max_chars) {
    limit = Math.max(1, Math.floor(limit / 2));
    state = { ...base, matches: render(limit) };
  }

  if (JSON.stringify(state).length > max_chars) {
    return {
      state,
      truncated: true,
      impossible:
        `One Match alone exceeds state.max_chars (${max_chars}). ` +
        "Raise state.max_chars, lower state.context_lines, or narrow the Detect Rule.",
    };
  }

  return { state, truncated: limit < all.length, impossible: undefined };
}
