/**
 * Extension to language name, for the file census.
 *
 * A fixed table rather than a detection library: the census exists to tell a
 * reader what kind of repository this is, and being wrong about `.ts` matters
 * far more than being silent about `.erl`.
 *
 * This table is the single source of truth for "what counts as a source
 * file". Keeping a second list of extensions in step with it by hand is
 * exactly how a census ends up counting a language it does not prune vendored
 * directories for.
 */
const LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript (JSX)",
  ".js": "JavaScript",
  ".jsx": "JavaScript (JSX)",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".scss": "SCSS",
  ".css": "CSS",
  ".html": "HTML",
};

/** The extensions the census counts, derived from the table above. */
export const COUNTED_EXTENSIONS: ReadonlySet<string> = new Set(Object.keys(LANGUAGES));

export interface LanguageCount {
  language: string;
  files: number;
}

/** The lowercased extension including the dot, or "" when there is none. */
export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return dot > slash + 1 ? path.slice(dot).toLowerCase() : "";
}

export function isCountedSource(path: string): boolean {
  return COUNTED_EXTENSIONS.has(extensionOf(path));
}

/** The language census, commonest first, ties broken by name for determinism. */
export function countLanguages(paths: string[]): LanguageCount[] {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const language = LANGUAGES[extensionOf(path)];
    if (language === undefined) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts]
    .map(([language, files]) => ({ language, files }))
    .sort((a, b) => b.files - a.files || a.language.localeCompare(b.language));
}
