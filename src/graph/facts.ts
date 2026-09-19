import picomatch from "picomatch";
import type { ChutesConfig, CoverageSource } from "../config/schema.js";
import type { CoverageReport } from "./coverage.js";
import type { ParsedModule } from "./parse.js";
import { createResolver } from "./resolve.js";

/** What code can establish about one file, so the Judge is never asked to guess it. */
export interface FileFacts {
  path: string;
  /** Import specifiers as written, resolvable or not. */
  imports: string[];
  /** How many of those resolved to a file inside this repository. */
  importsLocal: number;
  exports: string[];
  /** How many indexed files import this one. */
  importedBy: number;
  /** Whether `detect.test_globs` calls this file a test. */
  isTest: boolean;
  /** The tests covering this file, in path order. Empty when nothing covers it. */
  coveredBy: string[];
  /** Whether anything covers this file, per `DependencyGraph.coverageSource`. */
  covered: boolean;
}

export interface GraphInput {
  /** Every indexed file, including those `exclude` keeps out of the Plan. */
  modules: Map<string, ParsedModule>;
  /** The coverage report, when one was configured and could be read. */
  report?: CoverageReport | undefined;
}

/**
 * The dependency graph over every indexed file.
 *
 * Indexed is deliberately wider than classified. An excluded test is not in
 * the Plan, but a file it imports must still be able to report it as covering
 * them — drop excluded files from the graph and coverage silently becomes
 * empty everywhere.
 */
export interface DependencyGraph {
  facts: Map<string, FileFacts>;
  /** Resolved edges: importer -> the indexed files it imports. */
  edges: Map<string, string[]>;
  /**
   * Where coverage actually came from, once the configured source has been
   * resolved. Every file shares it, so it lives here rather than on each
   * `FileFacts`.
   */
  coverageSource: CoverageSource;
}

/**
 * Every file a test reaches, directly or through other files.
 *
 * Depth-first with a visited set, so an import cycle — which every JavaScript
 * repository of any size has — terminates instead of hanging.
 */
function reachableFrom(start: string, edges: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    for (const next of edges.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  seen.delete(start);
  return seen;
}

export function buildGraph(input: GraphInput, config: ChutesConfig): DependencyGraph {
  const resolve = createResolver(input.modules.keys(), config);

  const edges = new Map<string, string[]>();
  const importedBy = new Map<string, number>();

  for (const [path, parsed] of input.modules) {
    const resolved: string[] = [];
    for (const specifier of parsed.imports) {
      const target = resolve(path, specifier);
      // A file importing itself is not an edge, and would make every cycle
      // check trivially true.
      if (target === undefined || target === path || resolved.includes(target)) continue;
      resolved.push(target);
      importedBy.set(target, (importedBy.get(target) ?? 0) + 1);
    }
    edges.set(path, resolved);
  }

  const isTest = picomatch(config.detect.test_globs);

  // A test covers every file it can reach. Excluded tests are in `edges` like
  // any other file, which is the only reason a file imported solely by a test
  // is reported as covered at all.
  const coverageSource: CoverageSource =
    config.coverage.source === "report" && input.report === undefined
      ? "importgraph"
      : config.coverage.source;

  const coveredBy = new Map<string, string[]>();
  if (coverageSource !== "none") {
    for (const path of [...input.modules.keys()].sort()) {
      if (!isTest(path)) continue;
      for (const covered of reachableFrom(path, edges)) {
        const tests = coveredBy.get(covered);
        if (tests) tests.push(path);
        else coveredBy.set(covered, [path]);
      }
    }
  }

  const facts = new Map<string, FileFacts>();
  for (const [path, parsed] of input.modules) {
    facts.set(path, {
      path,
      imports: parsed.imports,
      importsLocal: edges.get(path)?.length ?? 0,
      exports: parsed.exports,
      importedBy: importedBy.get(path) ?? 0,
      isTest: isTest(path),
      coveredBy: coveredBy.get(path) ?? [],
      covered:
        coverageSource === "report"
          ? (input.report?.covered.has(path) ?? false)
          : coverageSource === "importgraph" && (coveredBy.get(path)?.length ?? 0) > 0,
    });
  }

  return { facts, edges, coverageSource };
}
