import { mkdir, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { configTemplate } from "../config/template.js";
import { configPath, migrationDir } from "../paths.js";

export interface InitOptions {
  migration: string;
}

export async function init(cwd: string, options: InitOptions): Promise<void> {
  const target = configPath(cwd, options.migration);

  const dir = migrationDir(cwd, options.migration);
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Cannot create ${relative(cwd, dir)}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}. ` +
        "Something already occupies that path, or it is not writable.",
    );
  }

  try {
    // `wx` fails rather than truncating: a tuned config is not ours to destroy.
    await writeFile(target, configTemplate(options.migration), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `${relative(cwd, target)} already exists. ` +
          `Edit it, or run init with a different --migration name.`,
      );
    }
    throw new Error(
      `Cannot write ${relative(cwd, target)}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}.`,
    );
  }

  process.stdout.write(
    `Created ${relative(cwd, target)} for Migration "${options.migration}".\n` +
      "Fill in include, detect.rules and criteria, then run: chutes detect --dry-run\n",
  );
}
