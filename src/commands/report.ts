import { readFrameworks } from "../observe/frameworks.js";
import { probeAll } from "../observe/probes.js";
import type { RepoReport } from "../observe/report.js";
import { observeRepo } from "../observe/scan-repo.js";
import { count, widestOf } from "../text.js";

export interface ReportOptions {
  /** Emit JSON instead of prose, for an agent rather than a person. */
  json?: boolean;
}

async function buildReport(cwd: string): Promise<RepoReport> {
  const observation = await observeRepo(cwd);
  return {
    languages: observation.languages,
    frameworks: await readFrameworks(cwd),
    candidateRules: probeAll(observation.contents),
    filesObserved: observation.paths.length,
    filesUnreadable: observation.unreadable,
  };
}

function renderProse(report: RepoReport): string {
  const out: string[] = ["Observations", ""];

  out.push("Languages", "");
  if (report.languages.length === 0) {
    out.push("  No source files found.");
  } else {
    const width = widestOf(report.languages.map((l) => l.language));
    for (const { language, files } of report.languages) {
      out.push(`  ${language.padEnd(width)}  ${count(files, "file")}`);
    }
  }
  out.push("");

  out.push("Frameworks", "");
  if (report.frameworks.length === 0) {
    out.push("  None recognised. chutes reads package.json; a repository without one,");
    out.push("  or using another ecosystem, reports nothing here.");
  } else {
    const width = widestOf(report.frameworks.map((f) => f.name));
    for (const { name, version } of report.frameworks) {
      out.push(`  ${name.padEnd(width)}  ${version}`);
    }
  }
  out.push("");

  out.push("Candidate Detect Rules", "");
  if (report.candidateRules.length === 0) {
    out.push("  Nothing recognised. That is a fact about the repository, not a failure:");
    out.push("  write your own rules under detect.rules in the config.");
    out.push("");
  } else {
    out.push("  Paste the ones that describe your Migration into detect.rules.");
    out.push("");
    for (const { probe, files, occurrences } of report.candidateRules) {
      out.push(`  ${probe.id}  (${count(files, "file")}, ${count(occurrences, "occurrence")})`);
      out.push(`    ${probe.means}`);
      out.push(`    pattern: ${probe.pattern}`);
      out.push("");
    }
  }

  if (report.filesUnreadable > 0) {
    out.push(`  ${count(report.filesUnreadable, "file")} could not be read and were left out.`, "");
  }

  // The last word, because it is the one a reader must not have to infer:
  // this command observes and nothing else.
  out.push("This report writes no configuration and makes no network requests.");
  out.push("Run chutes init to create one, then edit it using the above.");
  out.push("Add --json for the same observation in machine-readable form.");

  return `${out.join("\n")}\n`;
}

function renderJson(report: RepoReport): string {
  return `${JSON.stringify(
    {
      languages: report.languages,
      frameworks: report.frameworks,
      candidateRules: report.candidateRules.map(({ probe, files, occurrences }) => ({
        id: probe.id,
        pattern: probe.pattern,
        means: probe.means,
        files,
        occurrences,
      })),
      filesObserved: report.filesObserved,
      filesUnreadable: report.filesUnreadable,
      // Stated in the payload as well as the prose, so an agent reading only
      // JSON learns the same thing a person reading only prose does.
      writesConfiguration: false,
      makesNetworkRequests: false,
    },
    null,
    2,
  )}\n`;
}

export async function reportCommand(cwd: string, options: ReportOptions = {}): Promise<void> {
  const report = await buildReport(cwd);
  process.stdout.write(options.json ? renderJson(report) : renderProse(report));
}
