/**
 * The commented skeleton written by `chutes init`.
 *
 * Every tunable setting appears here with its default, so the file can be filled
 * in without reading external documentation. Settings that govern *how a judgement
 * is reached* are deliberately absent -- see the note on tuning at the bottom.
 */
export function configTemplate(migration: string): string {
  return `# chutes -- Migration "${migration}"
#
# One Migration = one config = one Plan. Everything for this Migration lives in
# this directory. To run a second Migration alongside this one:
#
#     chutes init --migration <other-name>
#
# Fill in \`include\`, \`detect.rules\` and \`criteria\` first -- nothing works
# without them. Everything else has a working default.

# ---------------------------------------------------------------------------
# What to look at
# ---------------------------------------------------------------------------

# Files considered for triage. Anything outside this never enters the Plan.
include:
  - "src/**/*.{ts,tsx,js,jsx,vue}"

# Not part of this codebase at all: never indexed, never classified, and never
# an edge in the dependency graph. Generated output belongs here rather than in
# "exclude", because a build directory is a COPY of your source -- index it and
# every file's "imported by" count is silently doubled.
ignore:
  - "dist/**"
  - "build/**"
  - "out/**"
  - "coverage/**"
  - "**/*.d.ts"
  - "**/*.min.js"

# Real code that IS indexed into the dependency graph but is never classified.
# This is the one for your tests: it keeps them out of the Plan while still
# letting chutes work out which tests cover which file. Exclude them via
# "ignore" instead and every file's coverage is permanently empty.
# The default is empty: chutes classifies your tests along with everything
# else until you say otherwise. Uncomment to keep them out of the Plan.
exclude: []
#   - "**/*.{spec,test}.*"

# ---------------------------------------------------------------------------
# What counts as a Match
# ---------------------------------------------------------------------------

detect:
  # A file with no Match is Untouched: absent from the Plan, and never sent to
  # the Judge. Prefer patterns that over-match -- a false positive costs a
  # fraction of a cent, a missed file is a migration that breaks in production.
  # Check what these actually hit with: chutes detect --dry-run
  rules:
    - id: example-rule
      pattern: 'TODO: a regular expression matching the old API'

  # Matches beyond this are dropped from the State sent to the Judge. The file
  # is flagged truncated and its Confidence reduced (see confidence below).
  max_matches_per_file: 40

  # Which files are tests. Conventions differ by ecosystem, so set this to match
  # yours: "**/*_test.py", "**/__tests__/**", "**/*.spec.ts".
  test_globs:
    - "**/*.{spec,test}.*"
    - "**/__tests__/**"

# How an import specifier becomes an edge in the dependency graph. chutes reads
# no bundler or tsconfig settings: state your aliases here, because guessing
# them wrong is worse than not guessing.
graph:
  aliases: {}
  #   "@": src
  #   "~/components": src/components
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".json"]

coverage:
  # Where "is this file covered" comes from.
  #   importgraph -- covered if some test transitively imports it (free, approximate)
  #   report      -- covered if a coverage report says it was executed (accurate)
  #   none        -- do not compute coverage
  # No coverage format records WHICH test covered a file, so the list of
  # covering tests always comes from the import graph. \`report\` only decides
  # the yes/no. A configured report that is missing falls back to the graph and
  # says so.
  source: importgraph
  report_path: coverage/coverage-final.json

# ---------------------------------------------------------------------------
# What this Migration is
# ---------------------------------------------------------------------------

# Written in English: the Judge's accuracy on other languages is not guaranteed
# by its vendor. Describe the transformation, and say plainly what would make a
# file mechanical. This text feeds every question asked about every file.
criteria: |
  TODO: describe the migration.

  Example:
  Migrating Vue 2 Options API components to the Vue 3 Composition API.
  "Mechanical" means every Match can be rewritten with a direct one-to-one
  syntax equivalent, with no behavioural decision to make.

# ---------------------------------------------------------------------------
# How much risk you are willing to take
# ---------------------------------------------------------------------------

# Where the Lane boundaries fall. These are your risk appetite, not facts about
# your code. Change them and re-run \`chutes calibrate\` -- numbers from a
# previous run no longer describe this configuration.
thresholds:
  # Any one of these is enough to make a file Redesign.
  redesign:
    public_api: 0.5
    lifecycle: 0.5
    design_effort: 0.5
  # All of these must hold for a file to be Mechanical. Anything that is neither
  # Redesign nor Mechanical falls to Judgment, which is the safe default.
  mechanical:
    direct_rewrite: 0.85
    custom_hack: 0.2

confidence:
  # How the per-question probabilities combine into one Confidence.
  # "min" is the weakest link and is what the thresholds above assume.
  # WARNING: changing this changes the Config Fingerprint and invalidates
  # every existing Calibration. Expert setting.
  combine: min
  # Confidence deducted from a file whose State had to be truncated.
  truncated_penalty: 0.15

# ---------------------------------------------------------------------------
# The Judge
# ---------------------------------------------------------------------------

judge:
  backend: jev        # jev | replay
  concurrency: 16
  max_retries: 2
  timeout_ms: 20000
  samples: 1          # >1 asks repeatedly and agrees the answers; costs n times as much

# ---------------------------------------------------------------------------
# Re-running over a Plan that already exists
# ---------------------------------------------------------------------------

rescan:
  # Re-classify files already marked done. Off by default: a migrated file no
  # longer matches, so re-checking it only wastes money.
  recheck_done: false
  # Keep a record of files that have since been deleted, as an audit trail.
  keep_removed: true

# ---------------------------------------------------------------------------
# Ordering and batching
# ---------------------------------------------------------------------------

schedule:
  wave_size: 40
  order: topological      # topological (leaves first) | flat
  cycle_strategy: scc     # scc (collapse import cycles into one Wave) | error
  gate: dependency        # dependency | wave | none

next:
  # Order files are handed out within the Judgment Lane.
  order: design_effort    # design_effort (easiest first) | path

execution:
  # Consecutive failures before a file is demoted out of its Lane. A file whose
  # tests keep failing was not as mechanical as the Judge thought.
  max_attempts: 2
  demote_to: judgment
  # Feed those demotions back into Calibration. Turning this off leaves only
  # successes in the evaluation set, which makes Calibration look better than
  # it is.
  feed_failures_to_calibrate: true

# ---------------------------------------------------------------------------
# PLAN.md
# ---------------------------------------------------------------------------

report:
  # Lanes listed file by file. Mechanical is counted only -- a list of 400
  # mechanical files is not something anyone reviews.
  list_files_for:
    - judgment
    - redesign
  max_files_per_lane: 200
`;
}
