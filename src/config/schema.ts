import { z } from "zod";
import { DEFAULT_IGNORE } from "../ignores.js";

const probability = z.number().min(0).max(1);
const positiveInt = z.number().int().positive();
const nonEmpty = z.string().min(1);

const lane = z.enum(["mechanical", "judgment", "redesign"]);

const questionId = z.enum([
  "q1_direct_rewrite",
  "q2_custom_hack",
  "q3_public_api",
  "q4_lifecycle",
  "q5_design_effort",
]);

/**
 * Where the `covered` fact comes from. `report` falls back to `importgraph`
 * when no report can be read, so this is the configured source, not
 * necessarily the one used -- `DependencyGraph.coverageSource` is the latter.
 */
export const coverageSourceSchema = z.enum(["importgraph", "report", "none"]);
export type CoverageSource = z.infer<typeof coverageSourceSchema>;

/**
 * A config section, tolerant of both an absent key and a `key:` with nothing
 * under it.
 *
 * The template ships each section as a header above commented-out values, so
 * the natural way to accept a default is to comment a value out. That leaves
 * the section present but null, which YAML does not treat as absent -- yet
 * both must mean "take every default".
 *
 * `strictObject` makes a typo'd setting an error rather than a silent no-op:
 * `judge.concurrancy: 64` must not quietly run at the default of 16.
 */
function section<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess((v) => (v == null ? {} : v), z.strictObject(shape));
}

const detectRule = z
  .strictObject({
    id: nonEmpty,
    pattern: nonEmpty,
  })
  .refine(
    (rule) => {
      try {
        new RegExp(rule.pattern);
        return true;
      } catch {
        return false;
      }
    },
    { error: "is not a valid regular expression", path: ["pattern"] },
  );

export const configSchema = z.strictObject({
  include: z.array(nonEmpty).min(1),

  /**
   * Not part of this codebase at all: never indexed, never classified, never
   * an edge in the dependency graph.
   *
   * Distinct from `exclude`, and the distinction is load-bearing. Generated
   * output is a *copy* of the source, so indexing it would double every
   * `imported by` count and hand the Judge a fact that is simply wrong.
   */
  ignore: z.array(nonEmpty).default(DEFAULT_IGNORE),

  /**
   * Real code that is indexed into the dependency graph but never classified.
   *
   * Test files are the reason this is separate from `ignore`: excluding them
   * is the ordinary thing to do, and if that also dropped them from the graph
   * then every file's coverage would be permanently empty and nothing would
   * look broken.
   */
  exclude: z.array(nonEmpty).default([]),

  detect: section({
    rules: z.array(detectRule).min(1),
    max_matches_per_file: positiveInt.default(40),
    test_globs: z.array(nonEmpty).default(["**/*.{spec,test}.*", "**/__tests__/**"]),
  }).superRefine((detect, ctx) => {
    const seen = new Set<string>();
    detect.rules.forEach((rule, index) => {
      if (seen.has(rule.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicates an earlier Detect Rule id ("${rule.id}")`,
          path: ["rules", index, "id"],
        });
      }
      seen.add(rule.id);
    });
  }),

  graph: section({
    // Build-tool aliases, so `@/store/cart` becomes a real edge rather than an
    // unresolved specifier. chutes reads no bundler or tsconfig settings: an
    // alias is one line here, and guessing wrong is worse than not guessing.
    aliases: z.record(nonEmpty, nonEmpty).default({}),
    extensions: z
      .array(nonEmpty)
      .default([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".json"]),
  }),

  coverage: section({
    source: coverageSourceSchema.default("importgraph"),
    report_path: nonEmpty.default("coverage/coverage-final.json"),
  }),

  criteria: nonEmpty,

  thresholds: section({
    redesign: section({
      public_api: probability.default(0.5),
      lifecycle: probability.default(0.5),
      design_effort: probability.default(0.5),
    }),
    mechanical: section({
      direct_rewrite: probability.default(0.85),
      custom_hack: probability.default(0.2),
    }),
  }),

  confidence: section({
    combine: z.enum(["min", "product"]).default("min"),
    truncated_penalty: probability.default(0.15),
  }),

  /**
   * How much of a file the Judge is shown.
   *
   * These are limits on the State, not on what is counted: a Match dropped
   * to fit still contributes to `matchCount`, so the Judge is told how much
   * it is not seeing rather than being quietly shown a smaller file.
   */
  state: section({
    context_lines: z.number().int().min(0).default(3),
    outline_limit: positiveInt.default(40),
    /**
     * The per-request State budget, in characters rather than tokens.
     *
     * Characters because they are the thing that can be measured exactly and
     * locally; the Jev limit is ~32k tokens for State plus the longest single
     * question, and four characters per token is the conservative ratio.
     */
    max_chars: positiveInt.default(96_000),
  }),

  /**
   * An expert escape hatch: replace a built-in question's wording.
   *
   * Overriding a question changes the Config Fingerprint, and `calibrate`
   * will refuse to reuse a labelled set gathered under the built-in wording.
   * That is the point rather than a side effect -- the answers are no longer
   * measuring the same thing.
   */
  questions: section({
    overrides: z.partialRecord(questionId, nonEmpty).default({}),
  }),

  judge: section({
    backend: z.enum(["jev", "replay"]).default("jev"),
    /** The Judge model. Part of the Config Fingerprint: a new version answers differently. */
    model: nonEmpty.default("systemone"),
    /** The API root. Configurable for a proxy or a self-hosted deployment. */
    base_url: nonEmpty.default("https://api.typesafe.ai"),
    /**
     * Ask before spending anything.
     *
     * On by default, and the default is the point: a Detect Rule looser
     * than intended, or a Migration pointed at the wrong directory, should
     * cost nothing to discover.
     */
    confirm_spend: z.boolean().default(true),
    /** USD per million input tokens, for the estimate shown before spending. */
    price_per_mtok: z.number().nonnegative().default(0.042),
    /** Requests per minute the account is allowed, for the duration estimate. */
    rate_limit_rpm: positiveInt.default(1200),
    /** Where the replay backend reads its recorded answers from. */
    replay_path: nonEmpty.default("replay.json"),
    concurrency: positiveInt.default(16),
    max_retries: z.number().int().min(0).default(2),
    timeout_ms: positiveInt.default(20_000),
    samples: positiveInt.default(1),
  }),

  rescan: section({
    recheck_done: z.boolean().default(false),
    keep_removed: z.boolean().default(true),
  }),

  schedule: section({
    wave_size: positiveInt.default(40),
    order: z.enum(["topological", "flat"]).default("topological"),
    cycle_strategy: z.enum(["scc", "error"]).default("scc"),
    gate: z.enum(["dependency", "wave", "none"]).default("dependency"),
  }),

  next: section({
    order: z.enum(["design_effort", "path"]).default("design_effort"),
  }),

  execution: section({
    max_attempts: positiveInt.default(2),
    demote_to: z.enum(["judgment", "redesign"]).default("judgment"),
    feed_failures_to_calibrate: z.boolean().default(true),
  }),

  report: section({
    list_files_for: z.array(lane).default(["judgment", "redesign"]),
    max_files_per_lane: positiveInt.default(200),
  }),
});

export type ChutesConfig = z.infer<typeof configSchema>;
