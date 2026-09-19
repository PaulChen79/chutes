import { loadConfig } from "../config/load.js";

export async function validateConfig(cwd: string, migration: string): Promise<void> {
  const config = await loadConfig(cwd, migration);
  process.stdout.write(
    `Configuration for Migration "${migration}" is valid ` +
      `(${config.detect.rules.length} detect rule(s), ${config.include.length} include pattern(s)).\n`,
  );
}
