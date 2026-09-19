import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PlanRecord } from "../../src/plan/record.js";

/** Write a raw Migration config into a repo. */
export async function withConfig(repo: string, yaml: string, migration = "default"): Promise<void> {
  await mkdir(join(repo, ".chutes", migration), { recursive: true });
  await writeFile(join(repo, ".chutes", migration, "migration.yml"), yaml);
}

/** Write a Migration config with the given Detect Rules into a repo. */
export async function withRules(
  repo: string,
  rules: Array<{ id: string; pattern: string }>,
  extra = "",
  include = '["src/**"]',
  options: { migration?: string; criteria?: string; detectExtra?: string } = {},
): Promise<void> {
  const body = rules.map((r) => `    - id: ${r.id}\n      pattern: '${r.pattern}'`).join("\n");
  const criteria = options.criteria ?? "Vue 2 to Vue 3";
  // detectExtra goes INSIDE the detect block: appending a second `detect:`
  // key would be a YAML duplicate, not a merge.
  const detect = `detect:\n  rules:\n${body}\n${options.detectExtra ?? ""}`;
  await withConfig(
    repo,
    `include: ${include}\ncriteria: "${criteria}"\n${detect}${extra}`,
    options.migration ?? "default",
  );
}

/** Create a source file inside the repo. */
export async function file(repo: string, path: string, contents: string): Promise<void> {
  const full = join(repo, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}

/** A full set of recorded Judge answers for one file. */
export interface RecordedAnswers {
  q1_direct_rewrite: number;
  q2_custom_hack: number;
  q3_public_api: number;
  q4_lifecycle: number;
  q5_design_effort: number[];
}

/** Recorded answers that classify a file as Mechanical under the defaults. */
export const MECHANICAL: RecordedAnswers = {
  q1_direct_rewrite: 0.97,
  q2_custom_hack: 0.02,
  q3_public_api: 0.05,
  q4_lifecycle: 0.03,
  q5_design_effort: [0.8, 0.15, 0.03, 0.01, 0.01],
};

/** Recorded answers that classify a file as Judgment under the defaults. */
export const JUDGMENT: RecordedAnswers = {
  q1_direct_rewrite: 0.6,
  q2_custom_hack: 0.3,
  q3_public_api: 0.2,
  q4_lifecycle: 0.1,
  q5_design_effort: [0.2, 0.4, 0.25, 0.1, 0.05],
};

/** Recorded answers that classify a file as Redesign under the defaults. */
export const REDESIGN: RecordedAnswers = {
  q1_direct_rewrite: 0.4,
  q2_custom_hack: 0.5,
  q3_public_api: 0.91,
  q4_lifecycle: 0.2,
  q5_design_effort: [0.05, 0.05, 0.1, 0.3, 0.5],
};

/** Write a replay recording into the Migration directory. */
export async function withRecording(
  repo: string,
  answers: Record<string, RecordedAnswers>,
  model = "recorded",
  migration = "default",
): Promise<void> {
  await mkdir(join(repo, ".chutes", migration), { recursive: true });
  await writeFile(
    join(repo, ".chutes", migration, "replay.json"),
    JSON.stringify({ model, answers }, null, 2),
  );
}

/** Read the Plan back as parsed records. */
export async function readPlan(repo: string, migration = "default"): Promise<PlanRecord[]> {
  const raw = await readFile(join(repo, ".chutes", migration, "plan.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as PlanRecord);
}
