import picomatch from "picomatch";
import { glob } from "tinyglobby";
import type { ChutesConfig } from "../config/schema.js";
import { ALWAYS_IGNORED } from "../ignores.js";

export interface Discovery {
  /**
   * Every file in the dependency graph, in stable path order. Wider than
   * `candidates`: `exclude` keeps a file out of the Plan, not out of the
   * graph.
   */
  indexed: string[];
  /** The files eligible for classification: `indexed` minus `exclude`. */
  candidates: string[];
}

/**
 * True if `path` matches, or lives under a directory that matches.
 *
 * Glob libraries prune an ignored *directory* along with everything beneath
 * it, so `src/*` drops `src/legacy/old.ts`. `exclude` cannot be handed to the
 * globber — excluded files still have to be indexed — so the pruning has to be
 * reproduced here, or `exclude` would quietly mean something narrower than it
 * does everywhere else a glob appears.
 */
function matchesOrIsUnder(path: string, isMatch: (value: string) => boolean): boolean {
  if (isMatch(path)) return true;
  let parent = path;
  while (true) {
    const cut = parent.lastIndexOf("/");
    if (cut < 0) return false;
    parent = parent.slice(0, cut);
    if (isMatch(parent)) return true;
  }
}

/**
 * The two file sets, from one pass over the include globs.
 *
 * Keeping them separate is the whole point. Excluding test files is the
 * ordinary thing to do, and if that also dropped them from the graph then
 * every file's coverage would be permanently empty and nothing would look
 * broken.
 */
export async function discover(cwd: string, config: ChutesConfig): Promise<Discovery> {
  const indexed = (
    await glob(config.include, {
      cwd,
      ignore: [...ALWAYS_IGNORED, ...config.ignore],
      dot: false,
      onlyFiles: true,
    })
  ).sort();

  if (config.exclude.length === 0) return { indexed, candidates: indexed };

  const isExcluded = picomatch(config.exclude, { dot: false });
  return {
    indexed,
    candidates: indexed.filter((path) => !matchesOrIsUnder(path, isExcluded)),
  };
}
