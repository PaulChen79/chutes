import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Package name to the name a human would use for it.
 *
 * Only packages whose presence says something about *how the code is written*
 * earn a place here. A logging library does not change how a file is migrated;
 * a framework or a test runner does.
 */
const FRAMEWORKS: Record<string, string> = {
  react: "React",
  vue: "Vue",
  svelte: "Svelte",
  "@angular/core": "Angular",
  next: "Next.js",
  nuxt: "Nuxt",
  "@remix-run/react": "Remix",
  astro: "Astro",
  express: "Express",
  fastify: "Fastify",
  "@nestjs/core": "NestJS",
  typescript: "TypeScript",
  vitest: "Vitest",
  jest: "Jest",
  mocha: "Mocha",
  "@playwright/test": "Playwright",
  cypress: "Cypress",
  "@testing-library/react": "Testing Library (React)",
  webpack: "webpack",
  vite: "Vite",
  rollup: "Rollup",
  esbuild: "esbuild",
  eslint: "ESLint",
  "@biomejs/biome": "Biome",
  prettier: "Prettier",
  redux: "Redux",
  "@reduxjs/toolkit": "Redux Toolkit",
  zustand: "Zustand",
  "@tanstack/react-query": "TanStack Query",
  graphql: "GraphQL",
  prisma: "Prisma",
  "drizzle-orm": "Drizzle",
  typeorm: "TypeORM",
  sequelize: "Sequelize",
  tailwindcss: "Tailwind CSS",
  "styled-components": "styled-components",
};

export interface Framework {
  name: string;
  /** The range the manifest pins, verbatim. Not a resolved version. */
  version: string;
}

/**
 * Read the frameworks a manifest declares.
 *
 * The version is reported exactly as written, never resolved against a
 * lockfile: the report is an observation of the repository, and `^17.0.2` is
 * what the repository actually says.
 */
export async function readFrameworks(cwd: string): Promise<Framework[]> {
  let raw: string;
  try {
    raw = await readFile(join(cwd, "package.json"), "utf8");
  } catch {
    return [];
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    // A manifest we cannot parse is a fact about the repository, but not one
    // this section can report; the census above still stands.
    return [];
  }

  if (typeof manifest !== "object" || manifest === null) return [];
  const record = manifest as Record<string, unknown>;

  const found = new Map<string, string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = record[field];
    if (typeof deps !== "object" || deps === null) continue;
    for (const [pkg, range] of Object.entries(deps as Record<string, unknown>)) {
      const name = FRAMEWORKS[pkg];
      if (name === undefined || typeof range !== "string") continue;
      // First field wins: a runtime dependency describes the shipped code
      // better than the same package repeated under devDependencies.
      if (!found.has(name)) found.set(name, range);
    }
  }

  return [...found]
    .map(([name, version]) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
