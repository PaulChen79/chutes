import { z } from "zod";

const probability = z.number().min(0).max(1);
const positiveInt = z.number().int().positive();
const nonEmpty = z.string().min(1);

const lane = z.enum(["mechanical", "judgment", "redesign"]);

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
  exclude: z.array(nonEmpty).default(["dist/**", "**/*.d.ts"]),

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

  coverage: section({
    source: z.enum(["importgraph", "report", "none"]).default("importgraph"),
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
      direct_rewrite: probability.default(0.9),
      custom_hack: probability.default(0.1),
    }),
  }),

  confidence: section({
    combine: z.enum(["min", "product"]).default("min"),
    truncated_penalty: probability.default(0.15),
  }),

  judge: section({
    backend: z.enum(["jev", "replay"]).default("jev"),
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
