import type { ChutesConfig } from "../config/schema.js";
import { DESIGN_EFFORT_CRITERIA, renderQuestion, resolveQuestions } from "./questions.js";
import {
  type Answers,
  DESIGN_EFFORT_LEVELS,
  type Judge,
  type JudgeRequest,
  type JudgeResponse,
  QUESTION_IDS,
  type QuestionId,
} from "./types.js";

/** The environment variable the vendor's own tooling uses. */
export const API_KEY_ENV = "TYPESAFE_API_KEY";

interface JevAnswer {
  noul?: number;
  score?: number;
  probabilities?: Record<string, number>;
}

interface JevResponse {
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Errors that will not become successes however many times they are retried. */
const FATAL_STATUS = new Set([400, 401, 403, 404, 422]);

function describeStatus(status: number): string {
  if (status === 401 || status === 403) return "the API key was rejected";
  if (status === 422) return "the request was rejected as invalid";
  if (status === 429) return "the rate limit was exceeded";
  if (status === 529) return "the service is overloaded";
  return `HTTP ${status}`;
}

/**
 * The real Judge.
 *
 * All five questions travel in one request against one shared State. That is
 * not an optimisation: the questions are about the same code, and sending
 * the State five times would cost five times as much for answers that are
 * less consistent with each other, not more.
 */
export class JevJudge implements Judge {
  readonly backend = "jev";

  private constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly config: ChutesConfig,
    private readonly questions: Record<QuestionId, string>,
  ) {}

  /**
   * Fail before any work begins if there is no usable credential.
   *
   * Before, rather than on the first request: discovering a missing key
   * after scanning a repository and spending on four hundred files is a
   * worse failure than the one it replaces.
   */
  static create(config: ChutesConfig, env: NodeJS.ProcessEnv = process.env): JevJudge {
    const apiKey = env[API_KEY_ENV]?.trim();
    if (apiKey === undefined || apiKey === "") {
      throw new Error(
        `judge.backend is "jev" but ${API_KEY_ENV} is not set. ` +
          `Export it, or set judge.backend to "replay" and supply a recording.`,
      );
    }
    return new JevJudge(config.judge.model, apiKey, config, resolveQuestions(config));
  }

  /** The request body, exposed so `--print-state` can show exactly what is sent. */
  buildBody(request: JudgeRequest): unknown {
    const questions: Record<string, unknown> = {};
    for (const id of QUESTION_IDS) {
      const instructions = renderQuestion(this.questions[id], request.criteria);
      questions[id] =
        id === "q5_design_effort"
          ? { type: "score", instructions, criteria: DESIGN_EFFORT_CRITERIA }
          : { type: "noul", instructions };
    }
    return { state: request.state, model: this.model, questions };
  }

  async ask(request: JudgeRequest): Promise<JudgeResponse> {
    const { max_retries, timeout_ms } = this.config.judge;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= max_retries; attempt += 1) {
      try {
        return await this.askOnce(request, timeout_ms);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.cause === "fatal" || attempt === max_retries) break;
        // Exponential backoff with jitter, so a rate limit does not turn
        // into every worker retrying in lockstep.
        const base = 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, base + Math.random() * base));
      }
    }

    throw new Error(
      `The Judge could not answer for ${request.path} after ` +
        `${max_retries + 1} attempts: ${lastError?.message ?? "unknown error"}`,
    );
  }

  private async askOnce(request: JudgeRequest, timeoutMs: number): Promise<JudgeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.config.judge.base_url.replace(/\/+$/, "")}/v1/systemone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.buildBody(request)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const error = new Error(describeStatus(response.status));
      // A rejected key or a malformed request will be rejected again in
      // exactly the same way, so retrying only wastes the rate limit.
      if (FATAL_STATUS.has(response.status)) error.cause = "fatal";
      throw error;
    }

    const body = (await response.json()) as JevResponse;
    return {
      answers: readAnswers(body),
      backend: this.backend,
      model: body.model ?? this.model,
    };
  }
}

/**
 * Read the vendor's response shape into our own.
 *
 * Validated rather than trusted: a silently missing answer would otherwise
 * become `undefined`, flow into the Lane rule as `NaN`, and produce a
 * confident-looking classification built on nothing.
 */
function readAnswers(body: JevResponse): Answers {
  const answers = body.answers ?? {};

  const noul = (id: QuestionId): number => {
    const value = answers[id]?.noul;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`the response had no usable probability for ${id}`);
    }
    return value;
  };

  const raw = answers.q5_design_effort?.probabilities;
  if (raw === undefined) throw new Error("the response had no distribution for q5_design_effort");

  // Keys are the level indices as strings, "0" upward, so the distribution
  // has to be rebuilt in index order rather than object order.
  const distribution: number[] = [];
  for (let level = 0; level < DESIGN_EFFORT_LEVELS; level += 1) {
    const value = raw[String(level)];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`the q5_design_effort distribution is missing level ${level}`);
    }
    distribution.push(value);
  }

  return {
    q1_direct_rewrite: noul("q1_direct_rewrite"),
    q2_custom_hack: noul("q2_custom_hack"),
    q3_public_api: noul("q3_public_api"),
    q4_lifecycle: noul("q4_lifecycle"),
    q5_design_effort: distribution,
  };
}
