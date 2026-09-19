/**
 * A rough symbol outline: the declarations a reader would skim to see the
 * shape of a file.
 *
 * Regex-based and deliberately shallow. A real parser would have to be
 * per-language, and the outline exists to orient the Judge inside the file,
 * not to be correct enough to compile -- a missed helper costs nothing, and a
 * parser for eleven languages costs a great deal.
 */
const DECLARATION =
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:(?:function\*?|class|interface|type|enum|const|let|var|def|func|fn|struct|impl|trait|public|private|protected)\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{)/;

/** Collapse a declaration line to its signature, without a trailing brace. */
function signature(line: string): string {
  return line
    .trim()
    .replace(/\s*\{\s*$/, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function outlineOf(lines: string[], limit: number): string[] {
  const found: string[] = [];
  for (const line of lines) {
    if (found.length >= limit) break;
    if (DECLARATION.test(line)) found.push(signature(line));
  }
  return found;
}
