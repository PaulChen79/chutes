/** What one source file declares: what it pulls in, and what it offers. */
export interface ParsedModule {
  /** Import specifiers exactly as written, in source order, de-duplicated. */
  imports: string[];
  /** Exported names in source order. A default export is named `default`. */
  exports: string[];
}

interface Found {
  at: number;
  name: string;
}

/**
 * Parsing is regular expressions over the whole file, not a real parser.
 *
 * The same bias as detection: this feeds facts to the Judge and a count to the
 * report, so a missed import loses one graph edge while a full parser would
 * cost a dependency per language and still not cover Vue, Svelte or JSX
 * dialects uniformly. Whole-file rather than line-oriented, because an import
 * list is routinely spread over several lines.
 */
const IMPORT_PATTERNS: RegExp[] = [
  // import x, { y } from "z"  /  export { y } from "z".
  // Anchored to the start of a line because that is where a real import
  // statement begins, and bounded in length so a file with no semicolons
  // cannot make the lazy span quadratic. Newlines are allowed inside it:
  // specifier lists routinely wrap.
  //
  // `/` is barred from the span so the wrap cannot run through a comment.
  // Without that, `export default {}` followed by a line mentioning
  // `from "./legacy.js"` in prose invents an edge -- and an invented edge is
  // far worse than a missed one, because it moves the file's Wave and shows
  // up in another file's `imported by` count as a fact the Judge trusts.
  /^[\t ]*(?:import|export)\s[^;'"/]{0,400}?\bfrom\s*['"]([^'"\n]+)['"]/gm,
  // import "z", at the start of a line or after a statement on the same one.
  /(?:^|;)[\t ]*import\s*['"]([^'"\n]+)['"]/gm,
  // import("z") and require("z"), which appear mid-expression
  /\b(?:import|require)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

const EXPORT_PATTERNS: RegExp[] = [
  /\bexport\s+default\b/g,
  /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\s*\*?|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g,
  /\bexport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s/g,
  /\bmodule\.exports\b/g,
  /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
];

/** `export { a, b as c, type D }` — the name a consumer sees is what follows `as`. */
const NAMED_EXPORT_BLOCK = /\bexport\s*\{([^}]*)\}/g;

function exportedName(clause: string): string | undefined {
  const cleaned = clause.trim().replace(/^type\s+/, "");
  if (cleaned === "") return undefined;
  const parts = cleaned.split(/\s+as\s+/);
  const name = parts[parts.length - 1]?.trim();
  return name && /^[A-Za-z_$][\w$]*$/.test(name) ? name : undefined;
}

/** The distinct names, ordered by where each first appears in the file. */
function distinctInSourceOrder(found: Found[]): string[] {
  const seen = new Set<string>();
  for (const { name } of found.sort((a, b) => a.at - b.at)) seen.add(name);
  return [...seen];
}

export function parseModule(contents: string): ParsedModule {
  const imports: Found[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of contents.matchAll(pattern)) {
      if (match[1]) imports.push({ at: match.index, name: match[1] });
    }
  }

  const exports: Found[] = [];
  for (const pattern of EXPORT_PATTERNS) {
    for (const match of contents.matchAll(pattern)) {
      exports.push({ at: match.index, name: match[1] ?? "default" });
    }
  }
  for (const block of contents.matchAll(NAMED_EXPORT_BLOCK)) {
    for (const clause of (block[1] ?? "").split(",")) {
      const name = exportedName(clause);
      if (name) exports.push({ at: block.index, name });
    }
  }

  return { imports: distinctInSourceOrder(imports), exports: distinctInSourceOrder(exports) };
}
