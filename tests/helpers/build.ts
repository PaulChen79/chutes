import { execFileSync } from "node:child_process";

/**
 * Tests drive the CLI the way a user does: they spawn the built binary.
 * Build once before the suite so every test observes the real artifact.
 *
 * `inherit` matters: a build failure here takes down every test at once, and
 * without the compiler's own output the only clue is "exit code 1".
 */
export default function setup() {
  execFileSync("pnpm", ["build"], { stdio: "inherit" });
}
