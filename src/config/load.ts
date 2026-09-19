import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";
import { configPath } from "../paths.js";
import { type ChutesConfig, configSchema } from "./schema.js";

/** A configuration problem worth showing a user, with the offending setting named. */
export class ConfigError extends Error {}

function describe(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const setting = issue.path.join(".");
      return setting ? `  ${setting}: ${issue.message}` : `  ${issue.message}`;
    })
    .join("\n");
}

export async function loadConfig(cwd: string, migration: string): Promise<ChutesConfig> {
  const path = configPath(cwd, migration);
  const shown = relative(cwd, path);

  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ConfigError(
        `No configuration at ${shown}. Run: chutes init --migration ${migration}`,
      );
    }
    throw new ConfigError(
      `Cannot read ${shown}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    throw new ConfigError(
      `${shown} is not valid YAML.\n  ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`${shown} is not a valid configuration.\n${describe(result.error)}`);
  }

  return result.data;
}
