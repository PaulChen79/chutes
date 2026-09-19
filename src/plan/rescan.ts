import type { ChutesConfig } from "../config/schema.js";
import type { Lane } from "./lane.js";
import type { PlanRecord } from "./record.js";

/** What a rescan decided to do with one file. */
export type Decision =
  | { kind: "judge"; path: string }
  | { kind: "reuse"; record: PlanRecord }
  | { kind: "removed"; record: PlanRecord }
  | { kind: "drop"; path: string };

export interface RescanInput {
  /** Files with at least one Match in this run, in path order. */
  current: string[];
  /**
   * Every file still present in the repository and eligible for this
   * Migration, whether or not it still Matches.
   *
   * Distinct from `current`, and the distinction is the difference between
   * "this file is finished" and "this file is gone". A migrated file stops
   * matching its Detect Rule -- that is what finishing it means -- so
   * treating "no longer Matches" as "deleted" would mark every completed
   * file `removed` and erase the work as it was done.
   */
  present: Set<string>;
  /** Content hash per current file. */
  hashes: Map<string, string | null>;
  /** The Plan as it stands, keyed by path. */
  existing: Map<string, PlanRecord>;
  config: ChutesConfig;
  /** Reclassify everything regardless of status or hash. */
  force: boolean;
  /** The fingerprint this run would write. */
  fingerprint: string;
}

/**
 * Decide, per file, whether to ask the Judge again.
 *
 * **Status takes precedence over content hash** for `done`, `error` and
 * `removed`, and that ordering is the whole design. The Migration rewrites
 * files, so comparing hashes alone would re-flag every file that was just
 * finished as new work -- the tool would fight the work it exists to
 * schedule. `pending`, `in_progress` and `skipped` fall through to the hash,
 * because for those the content genuinely is the question.
 */
export function planRescan(input: RescanInput): Decision[] {
  const { current, present, hashes, existing, config, force, fingerprint } = input;
  const decisions: Decision[] = [];
  const currentSet = new Set(current);

  for (const path of current) {
    const record = existing.get(path);

    // Never seen before, or forced: classify it.
    if (record === undefined || force) {
      decisions.push({ kind: "judge", path });
      continue;
    }

    // Deleted, then restored. The row still says "removed", and reusing it
    // as-is would leave the file marked gone forever -- silently absent
    // from everything that schedules work.
    if (record.status === "removed") {
      decisions.push({ kind: "judge", path });
      continue;
    }

    // Judged under different rules, so its Confidence means something else
    // now. Reusing it would mix two incompatible sets in one Plan.
    if (record.config_fingerprint !== fingerprint) {
      decisions.push({ kind: "judge", path });
      continue;
    }

    // Finished work is never revisited. The file has changed precisely
    // because somebody migrated it.
    if (record.status === "done") {
      // `recheck_done` is the documented exception, and it has to win
      // outright: falling through to the hash gate would reuse the record
      // anyway and make the setting do nothing.
      decisions.push(
        config.rescan.recheck_done ? { kind: "judge", path } : { kind: "reuse", record },
      );
      continue;
    }

    const hash = hashes.get(path) ?? null;
    if (hash !== null && hash === record.content_hash) {
      // Unchanged content, including a file that errored last time. An
      // error row is NOT retried automatically: re-judging it on every
      // scan would mean a permanently unreadable file makes the Plan churn
      // forever, and idempotence is a promise this tool makes. `status`
      // says to rerun with --force to retry.
      decisions.push({ kind: "reuse", record });
      continue;
    }

    decisions.push({ kind: "judge", path });
  }

  for (const [path, record] of existing) {
    if (currentSet.has(path)) continue;

    // Still in the repository, just no longer Matching. Almost always this
    // is a file somebody has finished migrating, so its record is kept
    // exactly as it stands -- including its status and its history.
    if (present.has(path)) {
      decisions.push({ kind: "reuse", record });
      continue;
    }

    // Genuinely gone from the repository.
    decisions.push(
      config.rescan.keep_removed
        ? { kind: "removed", record: { ...record, status: "removed" } }
        : { kind: "drop", path },
    );
  }

  return decisions;
}

export interface LaneChange {
  path: string;
  from: Lane | "error";
  to: Lane | "error";
}

/**
 * Which files changed Lane between two Plans.
 *
 * This is the audit record a rescan produces for free: the diff of a
 * committed Plan is exactly "what did the tool change its mind about".
 */
export function laneChanges(before: Map<string, PlanRecord>, after: PlanRecord[]): LaneChange[] {
  const changes: LaneChange[] = [];
  for (const record of after) {
    const previous = before.get(record.path);
    if (previous === undefined) continue;
    if (previous.lane === record.lane) continue;
    changes.push({
      path: record.path,
      from: previous.lane ?? "error",
      to: record.lane ?? "error",
    });
  }
  return changes.sort((a, b) => (a.path < b.path ? -1 : 1));
}
