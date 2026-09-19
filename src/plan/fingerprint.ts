import { createHash } from "node:crypto";
import type { ChutesConfig } from "../config/schema.js";
import { resolveQuestions } from "../judge/questions.js";
import type { Judge } from "../judge/types.js";

/**
 * A hash over everything that could change a classification.
 *
 * Calibration maps this tool's Confidence numbers onto observed accuracy, and
 * that mapping is only valid for the rules that produced them. Change a
 * Threshold and yesterday's Confidence means something different today, so
 * the Plan records which rules it was built under and `calibrate` can refuse
 * to mix them.
 *
 * What goes in is deliberately narrow: only inputs that can change an answer
 * or how answers become a Lane. Editing `report.max_files_per_lane` or adding
 * a path to `include` must not invalidate a calibration, because neither
 * changes how any classified file was classified.
 */
/**
 * Configuration that provably cannot change any classified file's Lane or
 * Confidence, and so must NOT invalidate a calibration.
 *
 * Expressed as what to leave out rather than what to put in, deliberately.
 * A new setting added later is included by default, which at worst voids a
 * calibration that was still valid; the other way round it would silently
 * keep comparing numbers that are no longer comparable.
 */
const NOT_PART_OF_A_JUDGEMENT = new Set([
  // Presentation of the Plan, after every classification is settled.
  "report",
  // What happens to a file after it has been classified.
  "execution",
  "next",
  "schedule",
  // Which files get re-asked, not how any of them is judged.
  "rescan",
]);

/** Transport settings: how a request is made, not what is asked or decided. */
const JUDGE_TRANSPORT = new Set(["concurrency", "timeout_ms", "max_retries", "replay_path"]);

export function configFingerprint(config: ChutesConfig, judge: Judge): string {
  const judged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (NOT_PART_OF_A_JUDGEMENT.has(key)) continue;
    if (key === "judge") {
      judged.judge = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          ([setting]) => !JUDGE_TRANSPORT.has(setting),
        ),
      );
      continue;
    }
    judged[key] = value;
  }

  const material = {
    // Everything left: the Criteria interpolated into every question, the
    // Thresholds, the combination rule, the Detect Rules that decide what
    // the Judge is shown, and every setting feeding a code-computed fact --
    // test globs, aliases, coverage source, the State budget. All of them
    // can change an answer or what an answer means.
    config: judged,
    // The resolved question texts, so both an override and a release that
    // reworded a built-in question are caught.
    questions: resolveQuestions(config),
    // A different backend, or the same backend on a new model version,
    // answers differently. This is what settles "does my calibration still
    // hold after the vendor ships a new model".
    judgeModel: { backend: judge.backend, model: judge.model ?? null },
  };

  const hash = createHash("sha256").update(stableStringify(material)).digest("hex");
  return `cf_${hash.slice(0, 16)}`;
}

/**
 * JSON with object keys in sorted order.
 *
 * `JSON.stringify` preserves insertion order, so two configurations that
 * differ only in the order their keys were written would otherwise produce
 * different fingerprints and silently invalidate a calibration.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
