import type { ChutesConfig } from "../config/schema.js";
import { type Answers, designEffortHigh } from "../judge/types.js";

export type Lane = "mechanical" | "judgment" | "redesign";

export interface Classification {
  lane: Lane;
  confidence: number;
  /**
   * Which single question held Confidence down, so `chutes explain` can say
   * "this file was capped by Q3" rather than only reporting a number.
   */
  limitedBy: string;
}

/**
 * Compose a Lane from the answers and the configured Thresholds.
 *
 * The Judge never decides the Lane. It supplies probabilities; this function
 * turns them into a Lane using numbers that live in a version-controlled
 * configuration, so every classification traces back to a Threshold somebody
 * can read and change.
 *
 * Ambiguity resolves to Judgment, never to Mechanical: the failure mode of
 * being wrong here is either a wasted human review or an unsupervised agent
 * loose in a file that needed a person, and only one of those is recoverable.
 */
export function classify(answers: Answers, config: ChutesConfig): Classification {
  const { redesign, mechanical } = config.thresholds;

  // All three Redesign signals are probabilities on one scale, which is what
  // makes comparing them meaningful. The Score question contributes the
  // probability mass on its top levels, NOT its point estimate normalised
  // into 0-1 -- a normalised level index is not a probability and cannot be
  // compared against one.
  const designHigh = designEffortHigh(answers.q5_design_effort);

  const redesignSignals: Array<{ name: string; value: number; threshold: number }> = [
    { name: "q3_public_api", value: answers.q3_public_api, threshold: redesign.public_api },
    { name: "q4_lifecycle", value: answers.q4_lifecycle, threshold: redesign.lifecycle },
    { name: "q5_design_effort", value: designHigh, threshold: redesign.design_effort },
  ];

  const firing = redesignSignals.filter((signal) => signal.value > signal.threshold);
  if (firing.length > 0) {
    // Any one signal is sufficient, so Confidence is the strongest of the
    // ones that fired -- the best evidence for the conclusion drawn, not the
    // weakest.
    const strongest = firing.reduce((best, s) => (s.value > best.value ? s : best));
    return { lane: "redesign", confidence: strongest.value, limitedBy: strongest.name };
  }

  // Mechanical needs every condition to hold, so Confidence is the weakest
  // of them -- and "no Redesign signal fired" is one of those conditions.
  //
  // Without it, three Redesign signals sitting at 0.49 each are invisible:
  // none crosses its Threshold, so the file is Mechanical at whatever q1
  // says, and a file that is a coin-flip for Redesign on three independent
  // counts goes to an unsupervised agent at 0.95.
  const directRewrite = answers.q1_direct_rewrite;
  const notAHack = 1 - answers.q2_custom_hack;
  const strongestRedesign = redesignSignals.reduce((best, s) => (s.value > best.value ? s : best));
  if (
    directRewrite > mechanical.direct_rewrite &&
    answers.q2_custom_hack < mechanical.custom_hack
  ) {
    return combineForMechanical(directRewrite, notAHack, strongestRedesign, config);
  }

  // Everything else. Confidence is how strongly the evidence failed to
  // support either of the other two Lanes: a file that nearly qualified as
  // Mechanical is a weakly-held Judgment, and should say so.
  const mechanicalStrength = Math.min(directRewrite, notAHack);
  const redesignStrength = strongestRedesign.value;
  const contender = Math.max(mechanicalStrength, redesignStrength);
  return {
    lane: "judgment",
    confidence: 1 - contender,
    limitedBy:
      mechanicalStrength >= redesignStrength ? "mechanical_contention" : "redesign_contention",
  };
}

/**
 * Confidence for Mechanical, under the configured combination rule.
 *
 * `min` is the default and the recommended rule. The questions are highly
 * correlated -- they are about the same lines of the same file -- so treating
 * them as independent and multiplying systematically understates: five
 * answers of 0.9 become 0.59, and every file collapses into the
 * low-confidence band. A minimum is also explainable, which is what lets
 * the tool name the question that capped a file.
 */
function combineForMechanical(
  directRewrite: number,
  notAHack: number,
  strongestRedesign: { name: string; value: number },
  config: ChutesConfig,
): Classification {
  const conditions = [
    { name: "q1_direct_rewrite", value: directRewrite },
    { name: "q2_custom_hack", value: notAHack },
    { name: strongestRedesign.name, value: 1 - strongestRedesign.value },
  ];
  const weakest = conditions.reduce((worst, c) => (c.value < worst.value ? c : worst));

  if (config.confidence.combine === "product") {
    return {
      lane: "mechanical",
      confidence: conditions.reduce((product, c) => product * c.value, 1),
      limitedBy: weakest.name,
    };
  }
  return { lane: "mechanical", confidence: weakest.value, limitedBy: weakest.name };
}
