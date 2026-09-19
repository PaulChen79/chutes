import type { ChutesConfig } from "../config/schema.js";
import type { QuestionId } from "./types.js";

/**
 * The built-in text of each question, with `{criteria}` standing in for the
 * user's description of this Migration.
 *
 * These are built in, not user-written, and that is a deliberate constraint
 * rather than an oversight. Change a question's wording and every existing
 * Calibration is void, because the number it calibrated was produced by a
 * different question. Writing a precise English question is also genuinely
 * hard, and getting it wrong degrades every classification silently.
 *
 * What the user writes is the Criteria: what this Migration *is*. That is
 * interpolated into each question below.
 */
export const BUILT_IN_QUESTIONS: Record<QuestionId, string> = {
  q1_direct_rewrite:
    "The Migration being performed is: {criteria}\n\n" +
    "Can every matched location in this file be rewritten using a direct, " +
    "one-to-one equivalent in the target form, without a human deciding " +
    "anything about how the code should be structured?",

  q2_custom_hack:
    "The Migration being performed is: {criteria}\n\n" +
    "Does this file contain a custom workaround that deliberately bypasses " +
    "or overrides the framework's default behaviour?",

  q3_public_api:
    "The Migration being performed is: {criteria}\n\n" +
    "Would performing this Migration on this file change the module's public " +
    "API, or change how any calling code must use it?",

  q4_lifecycle:
    "The Migration being performed is: {criteria}\n\n" +
    "Does this file depend on lifecycle or timing semantics that are specific " +
    "to the framework being migrated away from?",

  q5_design_effort:
    "The Migration being performed is: {criteria}\n\n" +
    "How much human design decision-making does migrating this file require?",
};

/** Ascending levels for the design-effort Score. Index 0 is the lowest. */
export const DESIGN_EFFORT_CRITERIA = [
  "None: the change is fully determined by the pattern being replaced.",
  "Slight: a developer picks between equivalent spellings of the same thing.",
  "Moderate: some local structure has to be reorganised to fit the new form.",
  "Substantial: the file's responsibilities have to be reconsidered.",
  "Fundamental: the file should be redesigned rather than migrated.",
];

/**
 * The question texts this run will use, with any override applied.
 *
 * Overrides are an expert escape hatch. They change the Config Fingerprint,
 * so `calibrate` will refuse to reuse a labelled set gathered under the
 * built-in wording -- which is the point: the answers are no longer
 * comparable.
 */
export function resolveQuestions(config: ChutesConfig): Record<QuestionId, string> {
  const resolved = { ...BUILT_IN_QUESTIONS };
  for (const [id, text] of Object.entries(config.questions.overrides)) {
    resolved[id as QuestionId] = text;
  }
  return resolved;
}

/** Interpolate the Criteria into a question's text. */
export function renderQuestion(text: string, criteria: string): string {
  return text.replaceAll("{criteria}", criteria);
}
