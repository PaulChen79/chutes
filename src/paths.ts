import { join } from "node:path";

export const DEFAULT_MIGRATION = "default";

/**
 * A Migration name becomes a directory name, so it must be a single safe path
 * segment. Without this, `--migration ../../x` escapes `.chutes/` entirely and
 * writes outside the repository.
 */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertMigrationName(name: string): void {
  if (name === "" || !SAFE_NAME.test(name) || name === "." || name === "..") {
    throw new Error(
      `Invalid Migration name ${JSON.stringify(name)}. ` +
        "Use letters, digits, dot, dash or underscore, starting with a letter or digit.",
    );
  }
}

/** Everything belonging to one Migration lives in one directory. */
export function migrationDir(cwd: string, migration: string): string {
  assertMigrationName(migration);
  return join(cwd, ".chutes", migration);
}

export function configPath(cwd: string, migration: string): string {
  return join(migrationDir(cwd, migration), "migration.yml");
}
