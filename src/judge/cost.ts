import type { ChutesConfig } from "../config/schema.js";
import { DESIGN_EFFORT_CRITERIA, renderQuestion, resolveQuestions } from "./questions.js";

/**
 * Characters per token, for turning a request into a bill.
 *
 * Calibrated against real requests rather than assumed: the conventional
 * prose ratio of four under-reported an observed 785-token request by more
 * than half, because code tokenises densely and the JSON envelope is not
 * free. This ratio deliberately errs high.
 *
 * The direction matters more than the accuracy. This number exists to stop
 * a misconfigured run before it spends, so an estimate that comes in under
 * the real bill is the one failure mode that defeats the purpose.
 */
const CHARS_PER_TOKEN = 2.2;

export interface Estimate {
  files: number;
  inputTokens: number;
  usd: number;
  minutes: number;
}

/**
 * What a run is about to cost, and how long it is about to take.
 *
 * Only input tokens are counted: the vendor does not bill for output.
 */
export function estimate(stateChars: number[], config: ChutesConfig): Estimate {
  // The five question texts travel with every request, not once per run.
  // Leaving them out under-estimated a real request eightfold on a small
  // file -- and for a gate whose job is to stop an expensive mistake,
  // under-estimating is the direction that fails quietly.
  const questions = resolveQuestions(config);
  const overheadChars =
    Object.values(questions).reduce(
      (total, text) => total + renderQuestion(text, config.criteria).length,
      0,
    ) + DESIGN_EFFORT_CRITERIA.join("").length;

  const inputTokens = stateChars.reduce(
    (total, chars) => total + Math.ceil((chars + overheadChars) / CHARS_PER_TOKEN),
    0,
  );
  const files = stateChars.length;

  // Five questions share one State, so a file is one request, not five.
  const requests = files;
  const perMinute = Math.min(config.judge.rate_limit_rpm, config.judge.concurrency * 60);

  return {
    files,
    inputTokens,
    usd: (inputTokens / 1_000_000) * config.judge.price_per_mtok,
    minutes: perMinute === 0 ? 0 : requests / perMinute,
  };
}

export function describeEstimate(e: Estimate): string {
  const duration =
    e.minutes < 1 ? `${Math.ceil(e.minutes * 60)}s` : `${e.minutes.toFixed(1)} minutes`;
  return [
    `About to ask the Judge about ${e.files} file${e.files === 1 ? "" : "s"}.`,
    "",
    `  input tokens  ~${e.inputTokens.toLocaleString("en-US")}`,
    `  cost          ~$${e.usd.toFixed(4)}`,
    `  duration      ~${duration}`,
    "",
    "These are estimates. Token counts are approximated from State and question size.",
  ].join("\n");
}
