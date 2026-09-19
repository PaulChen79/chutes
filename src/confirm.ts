import { createInterface } from "node:readline/promises";

/**
 * Ask the user to confirm, on the terminal.
 *
 * Returns false when there is no terminal to ask. A non-interactive run that
 * has not passed `--yes` has nobody to answer, and proceeding would spend
 * money on the strength of nobody having said no.
 */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
