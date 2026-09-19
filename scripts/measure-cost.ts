/**
 * Measure what chutes actually costs and how fast it actually runs.
 *
 * Replicates the Fixture Repo up to roughly a thousand files, scans it once
 * against the real Judge, and records dollars per file and files per minute.
 *
 * Fifty fixture files cannot reveal a rate limit, which is the whole reason
 * this exists: the figures the design leans on come from the vendor's own
 * documentation, and documentation is not a measurement.
 *
 *   TYPESAFE_API_KEY=... pnpm measure:cost
 *   TYPESAFE_API_KEY=... pnpm measure:cost -- --files 200   # a cheaper trial
 *
 * This is NOT part of the test suite. It spends real money and requires an
 * explicit invocation and a credential.
 */

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIXTURES = join(ROOT, "fixtures");
const CLI = join(ROOT, "dist", "cli.js");

/** The figures the design assumed, so the run can say whether they held. */
const ASSUMED = {
  usdPerFile: 0.0001,
  filesPerMinute: 1000,
  rateLimitRpm: 1200,
};

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main(): Promise<void> {
  if ((process.env.TYPESAFE_API_KEY ?? "").trim() === "") {
    throw new Error(
      "TYPESAFE_API_KEY is not set. This script spends real money against the " +
        "real Judge and cannot run without a credential.",
    );
  }

  const target = arg("files", 1000);
  const repo = await mkdtemp(join(tmpdir(), "chutes-measure-"));

  // Replicate the fixture until the target file count is reached. Copies
  // rather than generated noise, so the States are the shape and size the
  // tool will actually meet.
  const source = join(FIXTURES, "repo", "src");
  let written = 0;
  for (let copy = 0; written < target; copy += 1) {
    await cp(source, join(repo, "src", `copy${copy}`), { recursive: true });
    written += 36;
  }

  const config = (await readFile(join(FIXTURES, "migration.yml"), "utf8"))
    .replace('include:\n  - "src/**/*.{js,vue}"', 'include:\n  - "src/**/*.{js,vue}"')
    .replace(
      "  backend: replay\n  replay_path: ../replay.json\n",
      "  backend: jev\n  confirm_spend: false\n",
    )
    .replace('  - "src/mixins/**"', '  - "src/**/mixins/**"');
  await mkdir(join(repo, ".chutes", "measure"), { recursive: true });
  await writeFile(join(repo, ".chutes", "measure", "migration.yml"), config);

  process.stdout.write(`Scanning ~${written} files in ${repo}\n`);

  const startedAt = Date.now();
  const { stdout } = await execFileAsync(
    process.execPath,
    [CLI, "scan", "--migration", "measure", "--yes"],
    { cwd: repo, maxBuffer: 64 * 1024 * 1024 },
  );
  const seconds = (Date.now() - startedAt) / 1000;
  process.stdout.write(stdout);

  const plan = (await readFile(join(repo, ".chutes", "measure", "plan.jsonl"), "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(
      (line) =>
        JSON.parse(line) as {
          status: string;
          lane: string | null;
          config_fingerprint: string;
          judge: { model: string | null };
        },
    );

  const billed = /billed\s+([\d,]+) input tokens \(\$([\d.]+)\)/.exec(stdout);
  const inputTokens = billed?.[1] === undefined ? 0 : Number(billed[1].replaceAll(",", ""));
  const usd = billed?.[2] === undefined ? 0 : Number(billed[2]);
  const errors = plan.filter((record) => record.status === "error").length;
  const judged = plan.length - errors;

  const lanes = { mechanical: 0, judgment: 0, redesign: 0 };
  for (const record of plan) {
    if (record.lane !== null && record.lane in lanes) lanes[record.lane as keyof typeof lanes] += 1;
  }

  const result = {
    measuredAt: new Date().toISOString().slice(0, 10),
    model: plan[0]?.judge.model ?? "unknown",
    configFingerprint: plan[0]?.config_fingerprint ?? "unknown",
    files: plan.length,
    judged,
    errors,
    seconds: Number(seconds.toFixed(1)),
    inputTokens,
    usd: Number(usd.toFixed(4)),
    usdPerFile: judged === 0 ? 0 : Number((usd / judged).toFixed(8)),
    filesPerMinute: seconds === 0 ? 0 : Number(((judged / seconds) * 60).toFixed(1)),
    requestsPerMinute: seconds === 0 ? 0 : Number(((plan.length / seconds) * 60).toFixed(1)),
    lanes,
    assumed: ASSUMED,
  };

  const findings: string[] = [];
  const ratio = (observed: number, assumed: number) =>
    observed === 0 || assumed === 0 ? 0 : observed / assumed;

  const costRatio = ratio(result.usdPerFile, ASSUMED.usdPerFile);
  if (costRatio >= 10 || (costRatio > 0 && costRatio <= 0.1)) {
    findings.push(
      `Cost per file is ${costRatio.toFixed(1)}x the assumed $${ASSUMED.usdPerFile}. ` +
        "An order of magnitude either way is a finding against the design, not a number to " +
        "absorb: if it is much higher, asking every question of every file may need rethinking.",
    );
  }

  const speedRatio = ratio(result.filesPerMinute, ASSUMED.filesPerMinute);
  if (speedRatio > 0 && speedRatio <= 0.1) {
    findings.push(
      `Throughput is ${result.filesPerMinute} files/minute against an assumed ` +
        `${ASSUMED.filesPerMinute}. At that rate incremental rescan stops being a ` +
        "convenience and becomes the only workable mode.",
    );
  }
  if (errors > 0) {
    findings.push(`${errors} of ${plan.length} files failed, which may indicate a rate limit.`);
  }

  // An empty Lane on a thousand files is a finding whatever the cost was.
  // Separating the mechanical bulk from the rest is what the tool is for,
  // so a run that finds none of it has either met an unusual codebase or a
  // miscalibrated Threshold, and both need a person to look.
  for (const [lane, n] of Object.entries(lanes)) {
    if (n === 0) {
      findings.push(
        `Not one of ${plan.length} files was classified ${lane}. Either the codebase ` +
          `genuinely has none, or thresholds.${lane} is miscalibrated against this model. ` +
          "Calibration is what settles which; do not retune the Threshold to taste.",
      );
    }
  }

  if (result.requestsPerMinute > ASSUMED.rateLimitRpm) {
    findings.push(
      `Sustained ${result.requestsPerMinute} requests/minute against a documented limit of ` +
        `${ASSUMED.rateLimitRpm}, with no rejections. The documented limit was not enforced ` +
        "here, so the throughput model should not treat it as a hard ceiling -- nor assume " +
        "exceeding it is safe.",
    );
  }

  const out = join(ROOT, "measurements", `${result.measuredAt}.json`);
  await writeFile(out, `${JSON.stringify({ ...result, findings }, null, 2)}\n`);

  process.stdout.write(`\nWrote ${out}\n\n`);
  process.stdout.write(`  $/file          ${result.usdPerFile}\n`);
  process.stdout.write(`  files/minute    ${result.filesPerMinute}\n`);
  for (const finding of findings) process.stdout.write(`\n  FINDING: ${finding}\n`);
  if (findings.length === 0) {
    process.stdout.write("\n  Both figures are within an order of magnitude of the design.\n");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
