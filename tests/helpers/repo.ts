import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Write a raw Migration config into a repo. */
export async function withConfig(repo: string, yaml: string): Promise<void> {
  await mkdir(join(repo, ".chutes", "default"), { recursive: true });
  await writeFile(join(repo, ".chutes", "default", "migration.yml"), yaml);
}

/** Write a Migration config with the given Detect Rules into a repo. */
export async function withRules(
  repo: string,
  rules: Array<{ id: string; pattern: string }>,
  extra = "",
  include = '["src/**"]',
): Promise<void> {
  const body = rules.map((r) => `    - id: ${r.id}\n      pattern: '${r.pattern}'`).join("\n");
  await withConfig(
    repo,
    `include: ${include}\ncriteria: "Vue 2 to Vue 3"\ndetect:\n  rules:\n${body}\n${extra}`,
  );
}

/** Create a source file inside the repo. */
export async function file(repo: string, path: string, contents: string): Promise<void> {
  const full = join(repo, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
}
