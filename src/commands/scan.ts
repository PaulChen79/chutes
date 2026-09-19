import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { collect } from "../collect.js";
import { loadConfig } from "../config/load.js";
import type { ChutesConfig } from "../config/schema.js";
import { ReplayJudge } from "../judge/replay.js";
import type { Judge } from "../judge/types.js";
import { migrationDir } from "../paths.js";
import { configFingerprint } from "../plan/fingerprint.js";
import { classify } from "../plan/lane.js";
import { type PlanRecord, renderPlan } from "../plan/record.js";
import { assembleState } from "../state/assemble.js";
import { count } from "../text.js";

export interface ScanOptions {
  migration: string;
  /** Discard an existing Plan rather than refusing to overwrite it. */
  force?: boolean;
  /**
   * Print the assembled State for one file as JSON and stop, without
   * contacting the Judge or writing anything.
   *
   * Code sends this payload to a third party, so there has to be a way to
   * see exactly what leaves the machine.
   */
  printState?: string | boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Choose a Judge from configuration.
 *
 * The backend is a configuration choice rather than a flag so that a Plan is
 * reproducible from the repository alone: the same configuration always
 * reaches the same Judge.
 */
async function openJudge(cwd: string, config: ChutesConfig, migration: string): Promise<Judge> {
  if (config.judge.backend === "replay") {
    // Relative paths are relative to the Migration directory, where the
    // recording naturally lives beside the configuration that names it. An
    // absolute path is used as given.
    const configured = config.judge.replay_path;
    const path = isAbsolute(configured)
      ? configured
      : join(migrationDir(cwd, migration), configured);
    return await ReplayJudge.load(cwd, path);
  }
  throw new Error(
    `judge.backend "${config.judge.backend}" is not available in this release. ` +
      'Set judge.backend to "replay" and supply a recording.',
  );
}

/**
 * The top Confidence band a Calibration reliability curve reports on.
 *
 * A truncated file was judged on part of its content, so it must not appear
 * in that band however strong the answers looked. The penalty alone cannot
 * guarantee this, because the penalty is tunable and can be set to zero.
 */
const TRUNCATED_CEILING = 0.89;

function truncatedConfidence(confidence: number, penalty: number): number {
  return Math.min(TRUNCATED_CEILING, Math.max(0, confidence - penalty));
}

function sha256(contents: string): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

/**
 * Run `limit` promises at a time over `items`, preserving input order.
 *
 * Ordered results, because the Plan must be identical across runs and
 * completion order is not.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Print one file's State and stop. Never contacts the Judge, never writes.
 */
async function printState(
  cwd: string,
  config: ChutesConfig,
  which: string | boolean,
): Promise<void> {
  const collection = await collect(cwd, config);
  const wanted =
    typeof which === "string"
      ? which
      : collection.candidates.find(
          (path) => (collection.matches.get(path)?.matches.length ?? 0) > 0,
        );

  if (wanted === undefined) {
    throw new Error("No file has any Match, so there is no State to print.");
  }

  const matches = collection.matches.get(wanted);
  const facts = collection.graph.facts.get(wanted);
  const contents = collection.contents.get(wanted);
  if (matches === undefined || facts === undefined || contents === undefined) {
    throw new Error(`${wanted} is not a candidate with Matches in this Migration.`);
  }

  const { state } = assembleState(matches, facts, contents, config);
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

export async function scanCommand(cwd: string, options: ScanOptions): Promise<void> {
  const config = await loadConfig(cwd, options.migration);
  const planPath = join(migrationDir(cwd, options.migration), "plan.jsonl");

  if (options.printState !== undefined && options.printState !== false) {
    await printState(cwd, config, options.printState);
    return;
  }

  // Incremental rescan has not shipped. Until it does, a second scan would
  // overwrite a Plan that may carry weeks of progress -- statuses, attempt
  // counts, Lane overrides -- with a fresh set of pending rows, and nothing
  // would say so.
  if (!options.force && (await exists(planPath))) {
    throw new Error(
      `${relative(cwd, planPath)} already exists, and scan would overwrite its progress. ` +
        "Incremental rescan is not built yet; pass --force to discard the existing Plan.",
    );
  }
  const judge = await openJudge(cwd, config, options.migration);
  const collection = await collect(cwd, config);
  const fingerprint = configFingerprint(config, judge);
  const scannedAt = new Date().toISOString();

  // Only files with at least one Match are classified. A candidate the
  // Detect Rules never fired on is Untouched: absent from the Plan, but
  // still indexed into the graph, because other files' coverage and
  // "imported by" counts depend on it being there.
  const unreadable = new Map(collection.failures.map((f) => [f.path, f.reason]));

  // A candidate is classified when it has at least one Match. A candidate
  // that could not be read has no Matches for the same reason it has no
  // anything -- so it is kept and recorded as an error, rather than
  // vanishing into the Untouched count where nobody will look for it.
  const toClassify = collection.candidates
    .filter(
      (path) => (collection.matches.get(path)?.matches.length ?? 0) > 0 || unreadable.has(path),
    )
    .sort();

  const records = await mapWithConcurrency(
    toClassify,
    config.judge.concurrency,
    async (path): Promise<PlanRecord> => {
      const matches = collection.matches.get(path);
      const facts = collection.graph.facts.get(path);
      const contents = collection.contents.get(path);

      const base = {
        path,
        group_id: null,
        wave: null,
        match_count: matches?.matches.length ?? 0,
        attempts: 0,
        lane_overridden: false,
        // Null, not "": an empty string would be compared as a real hash by
        // a later rescan and read as "the content changed".
        content_hash: contents === undefined ? null : sha256(contents),
        config_fingerprint: fingerprint,
      };
      const failed = (reason: string): PlanRecord => ({
        ...base,
        lane: null,
        confidence: null,
        limited_by: null,
        status: "error",
        answers: null,
        truncated: false,
        last_error: reason,
        judge: { backend: judge.backend, model: judge.model ?? null, scanned_at: scannedAt },
      });

      if (matches === undefined || facts === undefined || contents === undefined) {
        return failed(
          `The file could not be read during this scan: ${unreadable.get(path) ?? "unknown error"}`,
        );
      }

      const { state, truncated, impossible } = assembleState(matches, facts, contents, config);
      if (impossible !== undefined) return failed(impossible);

      try {
        const response = await judge.ask({ path, state, criteria: config.criteria });
        const { lane, confidence, limitedBy } = classify(response.answers, config);
        return {
          ...base,
          lane,
          confidence: truncated
            ? truncatedConfidence(confidence, config.confidence.truncated_penalty)
            : confidence,
          limited_by: limitedBy,
          status: "pending",
          answers: response.answers,
          truncated,
          last_error: null,
          judge: {
            backend: response.backend,
            model: response.model ?? null,
            scanned_at: scannedAt,
          },
        };
      } catch (error) {
        return {
          ...failed(error instanceof Error ? error.message : String(error)),
          truncated,
        };
      }
    },
  );

  await mkdir(migrationDir(cwd, options.migration), { recursive: true });
  await writeFile(planPath, renderPlan(records), "utf8");

  const errors = records.filter((record) => record.status === "error").length;
  const lanes = { mechanical: 0, judgment: 0, redesign: 0 };
  for (const record of records) if (record.lane !== null) lanes[record.lane] += 1;

  const lines = [
    `Wrote ${relative(cwd, planPath)}: ${count(records.length, "file")}.`,
    `  mechanical  ${lanes.mechanical}`,
    `  judgment    ${lanes.judgment}`,
    `  redesign    ${lanes.redesign}`,
  ];
  if (errors > 0) {
    // Never folded into a Lane count, and never silent: an error is a file
    // nobody has classified, not a file that turned out to be Judgment.
    lines.push(`  error       ${errors}  (not classified; rerun to retry)`);
  }
  if (collection.coverageFellBack !== undefined) {
    // A report that was never generated looks exactly like a codebase with
    // no tests, and every file's covered_by went to the Judge as empty.
    lines.push(
      "",
      `Warning: coverage.source is "report" but ${collection.coverageFellBack} could not be read.`,
      "Coverage came from the import graph instead.",
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
