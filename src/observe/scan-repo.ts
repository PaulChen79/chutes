import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "tinyglobby";
import { NEVER_OBSERVED } from "../ignores.js";
import { countLanguages, isCountedSource, type LanguageCount } from "./languages.js";

export interface Observation {
  /** Every counted source file that could be read, in stable path order. */
  paths: string[];
  languages: LanguageCount[];
  /** File contents, keyed by path, for Probe counting. */
  contents: Map<string, string>;
  /** Files that matched the census but could not be read. */
  unreadable: number;
}

const READ_CONCURRENCY = 32;

/**
 * Look at a repository before any configuration exists.
 *
 * This cannot use the Migration's `include`: the whole point is to be read
 * *before* anyone has written one. So it casts a wide net over source-looking
 * files and prunes what nobody migrates by hand.
 */
export async function observeRepo(cwd: string): Promise<Observation> {
  const all = await glob("**/*", {
    cwd,
    ignore: NEVER_OBSERVED,
    dot: false,
    onlyFiles: true,
  });

  const found = all.filter(isCountedSource).sort();

  const contents = new Map<string, string>();
  let unreadable = 0;

  for (let start = 0; start < found.length; start += READ_CONCURRENCY) {
    const chunk = found.slice(start, start + READ_CONCURRENCY);
    const read = await Promise.all(
      chunk.map(async (path) => {
        try {
          return { path, text: await readFile(join(cwd, path), "utf8") };
        } catch {
          return { path, text: undefined };
        }
      }),
    );
    for (const { path, text } of read) {
      if (text === undefined) unreadable += 1;
      else contents.set(path, text);
    }
  }

  // The census counts what was actually read, so the file count and the Probe
  // counts are drawn from the same set and cannot disagree.
  const paths = [...contents.keys()].sort();

  return { paths, languages: countLanguages(paths), contents, unreadable };
}
