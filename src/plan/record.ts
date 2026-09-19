import type { Answers } from "../judge/types.js";
import type { Lane } from "./lane.js";

export type PlanStatus = "pending" | "in_progress" | "done" | "skipped" | "error" | "removed";

/**
 * One file's row in the Plan.
 *
 * Snake_case because this is a persisted artifact people read, diff and
 * commit, not an internal type -- and it matches the configuration file it
 * was produced from.
 */
export interface PlanRecord {
  path: string;
  /**
   * Reserved for cross-file Migrations, where a component, its test and its
   * story must move together. Always null today. In the schema from the
   * first release because adding a field later invalidates every Plan
   * already committed to a repository.
   */
  group_id: string | null;
  /**
   * Null only when `status` is "error". A file whose judgment failed is NOT
   * filed under Judgment: that would pollute the denominator and make the
   * Judgment Lane look large when half of it is API timeouts.
   */
  lane: Lane | null;
  /**
   * Dependency depth from a topological sort of the import graph. Always
   * null until scheduling ships.
   *
   * Reserved from the first release for the same reason as `group_id`:
   * adding a field later invalidates every Plan already committed to a
   * repository, and the field set is deliberately frozen. Wave is *depth*;
   * Lane is *difficulty*; the two are never mixed.
   */
  wave: number | null;
  confidence: number | null;
  /** The question that held Confidence down, for `chutes explain`. */
  limited_by: string | null;
  status: PlanStatus;
  answers: Answers | null;
  truncated: boolean;
  /** The true number of Matches, even when the State was truncated. */
  match_count: number;
  attempts: number;
  last_error: string | null;
  lane_overridden: boolean;
  /**
   * Null only when the file could not be read, so a later rescan cannot
   * mistake an empty string for a real hash and read it as "changed".
   */
  content_hash: string | null;
  config_fingerprint: string;
  judge: { backend: string; model: string | null; scanned_at: string };
}

/** Serialise a Plan as JSONL, one record per line, in stable path order. */
export function renderPlan(records: PlanRecord[]): string {
  const sorted = [...records].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return `${sorted.map((record) => JSON.stringify(orderKeys(record))).join("\n")}\n`;
}

/**
 * Emit keys in a fixed order.
 *
 * A Plan is committed to version control, so two runs that classified
 * identically must produce byte-identical lines. Object key order in the
 * record type is stable in practice, but making it explicit means a
 * refactor that reorders the interface cannot produce a spurious diff across
 * every file in somebody's repository.
 */
function orderKeys(record: PlanRecord): Record<string, unknown> {
  return {
    path: record.path,
    group_id: record.group_id,
    lane: record.lane,
    wave: record.wave,
    confidence: record.confidence,
    limited_by: record.limited_by,
    status: record.status,
    answers: record.answers,
    truncated: record.truncated,
    match_count: record.match_count,
    attempts: record.attempts,
    last_error: record.last_error,
    lane_overridden: record.lane_overridden,
    content_hash: record.content_hash,
    config_fingerprint: record.config_fingerprint,
    judge: record.judge,
  };
}
