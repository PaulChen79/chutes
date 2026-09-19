/**
 * The directories nobody migrates by hand, in one place.
 *
 * These were previously three separate lists — one in discovery, one as a
 * config default, one in the pre-config observation pass — which drifted: the
 * observation pass counted every language the census knows about but pruned
 * only the JavaScript ecosystem's vendored trees, so a Python repository's
 * `venv/` was reported as the user's own code.
 *
 * Every pattern is `**`-prefixed. Without it a pattern prunes only at the
 * repository root, which in a monorepo means every package's build output is
 * counted.
 */

/** Never indexed, whatever `include` says. Not negotiable. */
export const ALWAYS_IGNORED = ["**/node_modules/**", "**/.git/**", ".chutes/**"];

/** Build output and generated files, across the ecosystems the census knows. */
export const BUILD_OUTPUT = [
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/coverage/**",
  "**/target/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**",
  "**/.output/**",
  "**/bin/**",
  "**/obj/**",
  "**/__pycache__/**",
  "**/*.min.js",
  "**/*.d.ts",
];

/** Third-party code vendored into the tree, across ecosystems. */
export const VENDORED = [
  "**/vendor/**",
  "**/venv/**",
  "**/.venv/**",
  "**/virtualenv/**",
  "**/site-packages/**",
  "**/.tox/**",
  "**/eggs/**",
  "**/.eggs/**",
  "**/bower_components/**",
  "**/jspm_packages/**",
  "**/third_party/**",
  "**/Pods/**",
  "**/Carthage/**",
  "**/.gradle/**",
  "**/.bundle/**",
];

/**
 * What `init --report` refuses to look at.
 *
 * Wider than the Migration default, because it runs before any configuration
 * exists and so has no user intent to defer to: over-pruning loses a file
 * from a census, under-pruning reports somebody else's dependencies as the
 * size of your job.
 */
export const NEVER_OBSERVED = [...ALWAYS_IGNORED, ...BUILD_OUTPUT, ...VENDORED];

/** The default `ignore` a fresh Migration config ships with. */
export const DEFAULT_IGNORE = [...BUILD_OUTPUT, ...VENDORED];
