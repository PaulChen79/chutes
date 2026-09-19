import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { collect } from "../collect.js";
import { loadConfig } from "../config/load.js";
import type { ChutesConfig } from "../config/schema.js";
import { confirm } from "../confirm.js";
import { describeEstimate, estimate } from "../judge/cost.js";
import { JevJudge } from "../judge/jev.js";
import { ReplayJudge } from "../judge/replay.js";
import type { Judge } from "../judge/types.js";
import { migrationDir } from "../paths.js";
import { configFingerprint } from "../plan/fingerprint.js";
import { classify } from "../plan/lane.js";
import { renderMarkdown } from "../plan/markdown.js";
import { readPlan, tallyLanes } from "../plan/read.js";
import { type PlanRecord, renderPlan } from "../plan/record.js";
import { type Decision, laneChanges, planRescan } from "../plan/rescan.js";
import { assembleState } from "../state/assemble.js";
import { count } from "../text.js";

export interface ScanOptions {
  migration: string;
  /** Skip the spend confirmation, so an unattended run is not blocked on it. */
  yes?: boolean;
  /** Reclassify every file, ignoring status and content hash. */
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
    return await ReplayJudge.load(cwd, path, configured);
  }
  // Credentials are checked here, before the repository is even read: a
  // missing key discovered after four hundred files have been judged is a
  // worse failure than the one it replaces.
  return JevJudge.create(config);
}

/** Whether using this Judge costs money. The replay backend reads a file. */
function spends(judge: Judge): boolean {
  return judge.backend !== "replay";
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

async function planExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Keep a human-set status across a re-judge; anything else becomes pending. */
function carriedStatus(previous: PlanRecord | undefined): PlanRecord["status"] {
  const status = previous?.status;
  return status === "in_progress" || status === "skipped" ? status : "pending";
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

  // What the Plan already says, if there is one. A missing Plan is a first
  // scan, not an error.
  // Loaded even under --force. Force changes what gets re-judged, not what
  // is known: the Lane-change diff, the attempt counts and the removed rows
  // all come from here, and a forced rescan is exactly when the diff matters
  // most.
  // A malformed Plan stops the run. Swallowing the parse error here would
  // silently overwrite a hand-merged file -- conflict markers and weeks of
  // recorded progress alike -- with a fresh set of pending rows.
  const existing = new Map<string, PlanRecord>();
  if (await planExists(planPath)) {
    for (const record of await readPlan(cwd, options.migration)) existing.set(record.path, record);
  }

  const hashes = new Map<string, string | null>(
    toClassify.map((path) => {
      const contents = collection.contents.get(path);
      return [path, contents === undefined ? null : sha256(contents)];
    }),
  );

  const decisions = planRescan({
    current: toClassify,
    present: new Set(collection.candidates),
    hashes,
    existing,
    config,
    force: options.force ?? false,
    fingerprint,
  });

  const isKind =
    <K extends Decision["kind"]>(kind: K) =>
    (decision: Decision): decision is Extract<Decision, { kind: K }> =>
      decision.kind === kind;

  const toJudge = decisions.filter(isKind("judge")).map((d) => d.path);
  const reused = decisions.filter(isKind("reuse")).map((d) => d.record);
  const removed = decisions.filter(isKind("removed")).map((d) => d.record);

  if (spends(judge) && toJudge.length > 0) {
    const sizes = toJudge.map((path) => {
      const matches = collection.matches.get(path);
      const facts = collection.graph.facts.get(path);
      const contents = collection.contents.get(path);
      if (matches === undefined || facts === undefined || contents === undefined) return 0;
      return JSON.stringify(assembleState(matches, facts, contents, config).state).length;
    });
    const forecast = estimate(sizes, config);
    process.stdout.write(`${describeEstimate(forecast)}\n\n`);

    if (config.judge.confirm_spend && options.yes !== true) {
      if (!(await confirm("Proceed?"))) {
        throw new Error("Cancelled. Nothing was sent and nothing was spent.");
      }
    }
  }

  const judged = await mapWithConcurrency(
    toJudge,
    config.judge.concurrency,
    async (path): Promise<PlanRecord> => {
      const matches = collection.matches.get(path);
      const facts = collection.graph.facts.get(path);
      const contents = collection.contents.get(path);

      const base = {
        path,
        group_id: null,
        // Carried across a reclassification: a file that was demoted after
        // repeated execution failures must not be silently promoted back
        // because its content changed.
        wave: existing.get(path)?.wave ?? null,
        match_count: matches?.matches.length ?? 0,
        attempts: existing.get(path)?.attempts ?? 0,
        lane_overridden: existing.get(path)?.lane_overridden ?? false,
        // Null, not "": an empty string would be compared as a real hash by
        // a later rescan and read as "the content changed".
        content_hash: hashes.get(path) ?? null,
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
          // A human decision outlives a reclassification: `skipped` means
          // somebody chose not to do this file, and `in_progress` means
          // somebody is editing it right now -- which is exactly why its
          // content changed.
          status: carriedStatus(existing.get(path)),
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

  // Sorted once, here, so `plan.jsonl` and `PLAN.md` are built from the
  // same order. Three concatenated runs are each sorted and the whole is
  // not, which is how a committed document starts producing spurious diffs.
  const records = [...judged, ...reused, ...removed].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const changes = laneChanges(existing, judged);

  const dir = migrationDir(cwd, options.migration);
  await mkdir(dir, { recursive: true });
  await writeFile(planPath, renderPlan(records), "utf8");
  // Rendered from the same records that were just written, so the document
  // and the Plan can never describe different work.
  await writeFile(join(dir, "PLAN.md"), renderMarkdown(records, config, options.migration), "utf8");

  const lanes = tallyLanes(records);

  const lines = [
    `Wrote ${relative(cwd, planPath)} and PLAN.md: ${count(records.length, "file")}.`,
    "",
    // The two numbers that say what this run cost. A rescan of an unchanged
    // repository should read "judged 0", and that is the claim worth being
    // able to check at a glance.
    `  judged      ${judged.length}`,
    `  reused      ${reused.length}`,
    ...(removed.length > 0 ? [`  removed     ${removed.length}`] : []),
    "",
    `  mechanical  ${lanes.mechanical}`,
    `  judgment    ${lanes.judgment}`,
    `  redesign    ${lanes.redesign}`,
  ];
  if (lanes.removed > 0) lines.push(`  removed     ${lanes.removed}  (gone from the repository)`);
  if (lanes.error > 0) {
    // Never folded into a Lane count, and never silent: an error is a file
    // nobody has classified, not a file that turned out to be Judgment.
    lines.push(`  error       ${lanes.error}  (not classified; rerun with --force to retry)`);
  }
  if (changes.length > 0) {
    // The diff of a committed Plan is the audit record of what the tool
    // changed its mind about, so it is worth printing as well as storing.
    lines.push("", `${count(changes.length, "file")} changed Lane:`);
    for (const change of changes) lines.push(`  ${change.path}  ${change.from} -> ${change.to}`);
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
