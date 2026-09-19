import { Command } from "commander";
import { validateConfig } from "./commands/config.js";
import { detectCommand } from "./commands/detect.js";
import { init } from "./commands/init.js";
import { reportCommand } from "./commands/report.js";
import { scanCommand } from "./commands/scan.js";
import { statusCommand } from "./commands/status.js";
import { DEFAULT_MIGRATION } from "./paths.js";
import { version } from "./version.js";

const program = new Command();

program
  .name("chutes")
  .description("Per-file triage for large refactors.")
  .version(version, "-v, --version");

program
  .command("init")
  .description("Write a configuration skeleton for a Migration")
  .option("-m, --migration <name>", "name of the Migration", DEFAULT_MIGRATION)
  .option("--report", "Observe the repository and print what it can see; writes nothing")
  .option("--json", "With --report, emit JSON instead of prose")
  .action(async (options: { migration: string; report?: boolean; json?: boolean }) => {
    if (options.report) {
      await reportCommand(process.cwd(), { json: options.json });
      return;
    }
    if (options.json) {
      throw new Error("--json only applies to init --report.");
    }
    await init(process.cwd(), { migration: options.migration });
  });

const config = program.command("config").description("Inspect this Migration's configuration");

config
  .command("validate")
  .description("Check the configuration loads and every setting is well-formed")
  .option("-m, --migration <name>", "name of the Migration", DEFAULT_MIGRATION)
  .action(async (options: { migration: string }) => {
    await validateConfig(process.cwd(), options.migration);
  });

program
  .command("detect")
  .description("Show what the Detect Rules match, without contacting the Judge")
  // detect is read-only in this release, so there is nothing to opt out of.
  // The flag is accepted so documented invocations work, and so a future
  // writing mode can be introduced by adding one rather than by flipping this
  // default and changing what an existing command does.
  .option("--dry-run", "Accepted for forward compatibility; detect never writes")
  .option("-m, --migration <name>", "Migration name", DEFAULT_MIGRATION)
  .action(async (options: { migration: string }) => {
    await detectCommand(process.cwd(), options.migration);
  });

program
  .command("scan")
  .description("Classify every matched file into a Lane and write the Plan")
  .option("-m, --migration <name>", "Migration name", DEFAULT_MIGRATION)
  .option("-f, --force", "Reclassify every file, ignoring status and content hash")
  .option("--print-state [path]", "Print what would be sent to the Judge for one file, and stop")
  .option("-y, --yes", "Skip the spend confirmation, for unattended runs")
  .action(
    async (options: {
      migration: string;
      force?: boolean;
      yes?: boolean;
      printState?: string | boolean;
    }) => {
      await scanCommand(process.cwd(), {
        migration: options.migration,
        force: options.force,
        yes: options.yes,
        printState: options.printState,
      });
    },
  );

program
  .command("status")
  .description("Report where this Migration has got to")
  .option("-m, --migration <name>", "Migration name", DEFAULT_MIGRATION)
  .action(async (options: { migration: string }) => {
    await statusCommand(process.cwd(), { migration: options.migration });
  });

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
