import { Command } from "commander";
import { validateConfig } from "./commands/config.js";
import { init } from "./commands/init.js";
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
  .action(async (options: { migration: string }) => {
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

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
