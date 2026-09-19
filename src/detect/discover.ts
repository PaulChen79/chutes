import { glob } from "tinyglobby";
import type { ChutesConfig } from "../config/schema.js";

/**
 * Never candidates, whatever `include` says. Dependencies and repository
 * metadata are not the user's code to migrate, and a broad `include` — a
 * recursive TypeScript glob, or a monorepo package glob — would otherwise
 * pull in thousands of vendored files and put them in the Plan.
 */
const ALWAYS_IGNORED = ["**/node_modules/**", "**/.git/**", ".chutes/**"];

/**
 * Candidate files for classification, in stable path order.
 *
 * Excluded files are not candidates. They are still read later when the
 * dependency graph is built, because a file imported only by an excluded test
 * must still report that test as covering it.
 */
export async function discoverCandidates(cwd: string, config: ChutesConfig): Promise<string[]> {
  const files = await glob(config.include, {
    cwd,
    ignore: [...ALWAYS_IGNORED, ...config.exclude],
    dot: false,
    onlyFiles: true,
  });
  return files.sort();
}
