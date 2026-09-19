/**
 * The five questions, and the shape every Judge backend answers them in.
 *
 * The question *texts* are built in rather than user-written: changing the
 * wording invalidates every existing Calibration, and writing a precise
 * English question is itself hard. What the user supplies is the Criteria --
 * a description of what this Migration is -- which is interpolated into each
 * built-in question.
 */
export const QUESTION_IDS = [
  "q1_direct_rewrite",
  "q2_custom_hack",
  "q3_public_api",
  "q4_lifecycle",
  "q5_design_effort",
] as const;

export type QuestionId = (typeof QUESTION_IDS)[number];

/** The four Noul questions: each answered with one calibrated probability. */
export type NoulQuestionId = Exclude<QuestionId, "q5_design_effort">;

/**
 * How many levels the design-effort Score uses.
 *
 * Jev's Score levels are 0-indexed, so a 5-level question returns a `score`
 * in 0..4 and a `probabilities` array of length 5.
 */
export const DESIGN_EFFORT_LEVELS = 5;

/** How many of the top levels count as "needs a human designer". */
export const DESIGN_EFFORT_TOP_LEVELS = 2;

/**
 * One file's answers.
 *
 * The four Noul answers are bare probabilities because that is exactly what
 * Noul returns -- a calibrated 0-1 value with no separate confidence field.
 * The Score answer keeps its whole distribution, because the Lane rule needs
 * probability mass on the top levels and the ordering needs an expected
 * value, and a point estimate can supply neither.
 */
export interface Answers {
  q1_direct_rewrite: number;
  q2_custom_hack: number;
  q3_public_api: number;
  q4_lifecycle: number;
  /** Probability per level, index 0 = lowest effort. Sums to 1. */
  q5_design_effort: number[];
}

export interface JudgeRequest {
  path: string;
  /** The assembled State, serialised exactly as the Judge will receive it. */
  state: unknown;
  /** The user's Criteria, interpolated into each built-in question. */
  criteria: string;
}

export interface JudgeResponse {
  answers: Answers;
  /** Which backend answered, for the Plan record. */
  backend: string;
  /** The model identifier, where the backend has one. */
  model: string | undefined;
}

export interface Judge {
  readonly backend: string;
  ask(request: JudgeRequest): Promise<JudgeResponse>;
}

/** Probability mass on the top `DESIGN_EFFORT_TOP_LEVELS` levels of the Score. */
export function designEffortHigh(probabilities: number[]): number {
  const from = Math.max(0, probabilities.length - DESIGN_EFFORT_TOP_LEVELS);
  let mass = 0;
  for (let i = from; i < probabilities.length; i += 1) mass += probabilities[i] ?? 0;
  return mass;
}

/**
 * Expected level, used for ordering rather than for a Threshold.
 *
 * A point estimate is the right tool for a sort and the wrong tool for a
 * comparison against a probability Threshold, which is why the Lane rule uses
 * the mass above and `next.order` uses this.
 */
export function designEffortExpected(probabilities: number[]): number {
  let sum = 0;
  for (let i = 0; i < probabilities.length; i += 1) sum += i * (probabilities[i] ?? 0);
  return sum;
}
