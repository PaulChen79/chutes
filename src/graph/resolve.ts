import { dirname, join, normalize } from "node:path/posix";
import type { ChutesConfig } from "../config/schema.js";

/**
 * Turns an import specifier into a path in this repository, or nothing.
 *
 * "Or nothing" is the common case and is not an error: `vue` and `lodash` are
 * packages, not files, and a specifier behind an unconfigured build alias is
 * simply an edge this graph does not have. An unresolved import is still
 * reported as an import — it tells the Judge which framework a file is written
 * against — it just adds no edge.
 */
export type Resolver = (fromFile: string, specifier: string) => string | undefined;

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function createResolver(indexed: Iterable<string>, config: ChutesConfig): Resolver {
  const known = new Set(indexed);
  // Longest prefix first, so "@/components" beats "@" when both are configured.
  const aliases = Object.entries(config.graph.aliases)
    .map(([from, to]) => [withoutTrailingSlash(from), withoutTrailingSlash(to)] as const)
    .sort((a, b) => b[0].length - a[0].length);

  const resolveToIndexed = (base: string): string | undefined => {
    if (known.has(base)) return base;
    for (const extension of config.graph.extensions) {
      if (known.has(base + extension)) return base + extension;
    }
    for (const extension of config.graph.extensions) {
      const candidate = join(base, `index${extension}`);
      if (known.has(candidate)) return candidate;
    }
    return undefined;
  };

  return (fromFile, specifier) => {
    if (specifier.startsWith(".")) {
      const base = normalize(join(dirname(fromFile), specifier));
      // A relative import that climbs out of the repository resolves to nothing.
      return base.startsWith("..") ? undefined : resolveToIndexed(withoutTrailingSlash(base));
    }

    for (const [from, to] of aliases) {
      if (specifier !== from && !specifier.startsWith(`${from}/`)) continue;
      const rest = specifier.slice(from.length).replace(/^\//, "");
      const base = withoutTrailingSlash(normalize(rest === "" ? to : join(to, rest)));
      return base.startsWith("..") ? undefined : resolveToIndexed(base);
    }

    return undefined;
  };
}
