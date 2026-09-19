import type { ChutesConfig } from "../config/schema.js";

/**
 * Characters per token, for turning an assembled State into a bill.
 *
 * Four is the conventional English-prose ratio and code runs denser, so this
 * is an under-estimate of tokens and therefore of cost. The estimate exists
 * to stop a misconfigured run, not to reconcile an invoice, and the figure
 * it reports is explicitly labelled an estimate.
 */
const CHARS_PER_TOKEN = 4;

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
  const inputTokens = stateChars.reduce(
    (total, chars) => total + Math.ceil(chars / CHARS_PER_TOKEN),
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
    "These are estimates. Token counts are approximated from State size.",
  ].join("\n");
}
