import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import {
  type Answers,
  DESIGN_EFFORT_LEVELS,
  type Judge,
  type JudgeRequest,
  type JudgeResponse,
} from "./types.js";

const probability = z.number().min(0).max(1);

/**
 * A recorded answer set.
 *
 * Strict, because a typo in a recording would otherwise silently become a
 * default and make a deterministic test quietly meaningless.
 */
const recordedAnswers = z.strictObject({
  q1_direct_rewrite: probability,
  q2_custom_hack: probability,
  q3_public_api: probability,
  q4_lifecycle: probability,
  q5_design_effort: z
    .array(probability)
    .length(DESIGN_EFFORT_LEVELS)
    .refine((levels) => Math.abs(levels.reduce((a, b) => a + b, 0) - 1) < 1e-6, {
      message: "q5_design_effort must be a probability distribution summing to 1",
    }),
});

const recordingSchema = z.strictObject({
  /** Optional, so a recording can say which model it was captured from. */
  model: z.string().min(1).optional(),
  answers: z.record(z.string().min(1), recordedAnswers),
});

export type Recording = z.infer<typeof recordingSchema>;

/**
 * A Judge that replays recorded probabilities instead of calling an API.
 *
 * This exists so the whole classification pipeline -- State assembly, the
 * Lane rule, Confidence, truncation, the Plan -- is testable end to end with
 * no network and no API key. Every number it returns was put there by a test
 * or a captured session, so a Lane that changes is a change in the rules, not
 * in the weather.
 */
export class ReplayJudge implements Judge {
  readonly backend = "replay";

  private constructor(
    private readonly answers: Map<string, Answers>,
    private readonly model: string | undefined,
    private readonly source: string,
  ) {}

  static async load(cwd: string, replayPath: string): Promise<ReplayJudge> {
    const full = isAbsolute(replayPath) ? replayPath : resolve(cwd, replayPath);

    let raw: string;
    try {
      raw = await readFile(full, "utf8");
    } catch (error) {
      throw new Error(
        `Cannot read the replay recording at ${replayPath}: ` +
          `${(error as NodeJS.ErrnoException).code ?? "unknown error"}. ` +
          "judge.backend is 'replay', so a recording is required.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `The replay recording at ${replayPath} is not valid JSON: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const result = recordingSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw new Error(`The replay recording at ${replayPath} is malformed:\n${issues}`);
    }

    return new ReplayJudge(
      new Map(Object.entries(result.data.answers)),
      result.data.model,
      replayPath,
    );
  }

  ask(request: JudgeRequest): Promise<JudgeResponse> {
    const answers = this.answers.get(request.path);
    if (answers === undefined) {
      // Deliberately an error rather than a default: a file the recording
      // does not cover has no recorded answer, and inventing one would make
      // the replay backend non-deterministic in the one way that matters.
      return Promise.reject(
        new Error(`No recorded answers for ${request.path} in ${this.source}.`),
      );
    }
    return Promise.resolve({ answers, backend: this.backend, model: this.model });
  }
}
