import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChutesConfig } from "./config/schema.js";
import { discover } from "./detect/discover.js";
import { compileRules, type FileMatches, matchLines, splitLines } from "./detect/match.js";
import { readCoverageReport } from "./graph/coverage.js";
import { buildGraph, type DependencyGraph } from "./graph/facts.js";
import { type ParsedModule, parseModule } from "./graph/parse.js";

/** An indexed file that could not be read. */
export interface ReadFailure {
  path: string;
  reason: string;
}

export interface Collection {
  /** Every file in the graph, in stable path order. */
  indexed: string[];
  /** The subset eligible for classification, in stable path order. */
  candidates: string[];
  /** Matches per candidate, keyed by path. */
  matches: Map<string, FileMatches>;
  graph: DependencyGraph;
  failures: ReadFailure[];
  /**
   * Set when `coverage.source: report` was configured but no report could be
   * read, so coverage silently came from the graph instead. Silently is the
   * problem: a report that has not been generated looks exactly like a
   * codebase with no tests.
   */
  coverageFellBack: string | undefined;
}

/** How many files to read at once. */
const READ_CONCURRENCY = 32;

/**
 * Read every indexed file once, and derive everything that needs its contents
 * in that single pass: its Matches if it is a candidate, and its imports and
 * exports either way.
 *
 * One pass rather than two because the two file sets overlap almost entirely,
 * and reading a repository twice to answer one question is the kind of cost
 * that only shows up on somebody else's monorepo.
 */
export async function collect(cwd: string, config: ChutesConfig): Promise<Collection> {
  const { indexed, candidates } = await discover(cwd, config);
  const report =
    config.coverage.source === "report" ? await readCoverageReport(cwd, config) : undefined;
  const candidateSet = new Set(candidates);
  const rules = compileRules(config);
  const max = config.detect.max_matches_per_file;

  const matches = new Map<string, FileMatches>();
  const modules = new Map<string, ParsedModule>();
  const failures: ReadFailure[] = [];

  for (let start = 0; start < indexed.length; start += READ_CONCURRENCY) {
    const chunk = indexed.slice(start, start + READ_CONCURRENCY);
    type ReadResult = { path: string; contents: string } | { path: string; reason: string };

    const read = await Promise.all(
      chunk.map(async (path): Promise<ReadResult> => {
        try {
          return { path, contents: await readFile(join(cwd, path), "utf8") };
        } catch (error) {
          return { path, reason: error instanceof Error ? error.message : String(error) };
        }
      }),
    );

    for (const result of read) {
      if (!("contents" in result)) {
        failures.push({ path: result.path, reason: result.reason });
        continue;
      }
      modules.set(result.path, parseModule(result.contents));
      if (candidateSet.has(result.path)) {
        matches.set(result.path, {
          path: result.path,
          ...matchLines(splitLines(result.contents), rules, max),
        });
      }
    }
  }

  return {
    indexed,
    candidates,
    matches,
    graph: buildGraph({ modules, report }, config),
    failures,
    coverageFellBack:
      config.coverage.source === "report" && report === undefined
        ? config.coverage.report_path
        : undefined,
  };
}
