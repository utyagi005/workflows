import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const AI_SCHEMA_PATH = new URL("../schemas/autoapplyops-ai-evaluation.schema.json", import.meta.url);
const AI_SCHEMA = JSON.parse(readFileSync(AI_SCHEMA_PATH, "utf8"));
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma3:4b";
const FALLBACK_MODEL = "rules-engine/v1";
const OLLAMA_TIMEOUT_MS = 5000;
const VALID_FLAGS = [
  "salary_mismatch",
  "location_conflict",
  "role_scope_unclear",
  "duplicate_suspected",
  "missing_resume",
  "unrealistic_timeline",
  "credential_gap"
];

const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(AI_SCHEMA);
let degradedStatusLogged = false;

export async function evaluateApplication(payload, scoringResult) {
  const aiEnabled = process.env.AUTOAPPLYOPS_AI_ENABLED !== "false";
  const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  const model = process.env.AUTOAPPLYOPS_AI_MODEL || DEFAULT_MODEL;

  if (!aiEnabled) {
    return buildFallbackEvaluation(payload, scoringResult, { status: "disabled" });
  }

  if (process.env.NODE_ENV === "test" && baseUrl === DEFAULT_OLLAMA_BASE_URL) {
    return buildFallbackEvaluation(payload, scoringResult, { status: "disabled" });
  }

  try {
    const response = await callOllama({ payload, scoringResult, baseUrl, model });
    const parsed = parseOllamaResponse(response);
    const validated = normalizeAiEvaluation(parsed, model);
    const validation = validateAiEvaluation(validated);

    if (!validation.valid) {
      throw new AiEvaluationError("schema_validation_failed", { validationErrors: validation.errors });
    }

    return validated;
  } catch (error) {
    logAiDegradedOnce(error);
    logAiFailure(error, { baseUrl, model, applicationId: scoringResult?.applicationId || payload?.applicationId });
    return buildFallbackEvaluation(payload, scoringResult, { status: "fallback" });
  }
}

export function shouldTriggerHumanReview(aiEvaluation) {
  return (
    Number(aiEvaluation?.confidence) < 0.55 ||
    aiEvaluation?.recommendedAction === "escalate_to_human" ||
    (Array.isArray(aiEvaluation?.riskFlags) && aiEvaluation.riskFlags.some((risk) => risk.severity === "high"))
  );
}

export function validateAiEvaluation(evaluation) {
  const valid = validate(evaluation);
  return {
    valid,
    errors: valid ? [] : validate.errors.map((error) => ({ path: error.instancePath, message: error.message }))
  };
}

export function buildFallbackEvaluation(payload = {}, scoringResult = {}, options = {}) {
  const riskFlags = deriveRiskFlags(payload, scoringResult);
  const priority = scoringResult.priority || "review";
  const score = Number.isFinite(scoringResult.score) ? scoringResult.score : 0;
  const highRisk = riskFlags.some((risk) => risk.severity === "high");
  const confidence = deriveFallbackConfidence(scoringResult, riskFlags);
  const recommendedAction =
    highRisk || priority === "invalid"
      ? "escalate_to_human"
      : priority === "hot"
        ? "advance"
        : priority === "duplicate"
          ? "hold"
          : score < 45
            ? "archive"
            : "hold";

  const result = {
    aiFitSummary: deriveFallbackSummary(payload, scoringResult, recommendedAction),
    resumeSignalScore: clamp(Math.round(score), 0, 100),
    riskFlags,
    followUpTone: recommendedAction === "advance" ? "warm" : highRisk ? "cautious" : recommendedAction === "archive" ? "defer" : "neutral",
    recommendedAction,
    confidence,
    aiStatus: options.status || "fallback",
    modelUsed: FALLBACK_MODEL,
    evaluatedAt: new Date().toISOString()
  };

  const validation = validateAiEvaluation(result);
  if (!validation.valid) {
    throw new AiEvaluationError("fallback_schema_validation_failed", { validationErrors: validation.errors });
  }

  return result;
}

function normalizeAiEvaluation(parsed, requestedModel) {
  return {
    ...parsed,
    aiStatus: "available",
    modelUsed: parsed.modelUsed || requestedModel
  };
}

async function callOllama({ payload, scoringResult, baseUrl, model }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const url = new URL("/api/generate", baseUrl);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        system: buildSystemPrompt(),
        prompt: buildUserPrompt(payload, scoringResult)
      })
    });

    if (!response.ok) {
      throw new AiEvaluationError("ollama_http_error", { status: response.status });
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AiEvaluationError("ollama_timeout", { timeoutMs: OLLAMA_TIMEOUT_MS });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseOllamaResponse(response) {
  if (!response || typeof response.response !== "string") {
    throw new AiEvaluationError("missing_ollama_response");
  }

  try {
    return JSON.parse(response.response);
  } catch (error) {
    throw new AiEvaluationError("invalid_json_response", { cause: error.message });
  }
}

function buildSystemPrompt() {
  const example = {
    aiFitSummary: "Clear match for the role with relevant automation evidence. One follow-up question is needed before moving forward.",
    resumeSignalScore: 78,
    riskFlags: [{ flag: "role_scope_unclear", severity: "medium" }],
    followUpTone: "neutral",
    recommendedAction: "hold",
    confidence: 0.68,
    aiStatus: "available",
    modelUsed: DEFAULT_MODEL,
    evaluatedAt: new Date().toISOString()
  };

  return [
    "You are AutoApplyOps AI Copilot. Evaluate a sanitized job application intake and deterministic score.",
    "Return only valid JSON. Do not include markdown.",
    "Use plain language, 1-3 sentences, and avoid jargon.",
    `Allowed risk flags: ${VALID_FLAGS.join(", ")}.`,
    "Required JSON shape:",
    JSON.stringify(example, null, 2)
  ].join("\n\n");
}

function buildUserPrompt(payload = {}, scoringResult = {}) {
  const sanitized = scoringResult.sanitizedPayload || {
    applicationId: payload.applicationId,
    company: payload.company,
    role: payload.role,
    source: payload.source,
    location: payload.location,
    skills: Array.isArray(payload.skills) ? payload.skills : [],
    notesLength: typeof payload.notes === "string" ? payload.notes.length : 0
  };

  return JSON.stringify(
    {
      sanitizedApplication: sanitized,
      deterministicScore: {
        score: scoringResult.score,
        priority: scoringResult.priority,
        route: scoringResult.route,
        reasonCodes: scoringResult.reasonCodes || [],
        decisionMatrix: scoringResult.decisionMatrix || []
      },
      instructions: [
        "Recommend one of advance, hold, archive, or escalate_to_human.",
        "Use high severity only when a human should review before automation continues.",
        "If confidence is below 0.55, recommend escalate_to_human."
      ]
    },
    null,
    2
  );
}

function deriveRiskFlags(payload = {}, scoringResult = {}) {
  const reasonCodes = new Set(scoringResult.reasonCodes || []);
  const normalized = scoringResult.sanitizedPayload || {};
  const notes = String(payload.notes || payload.resume_text || payload.summary || "");
  const flags = [];

  if (scoringResult.priority === "duplicate" || reasonCodes.has("duplicate_detected")) {
    flags.push({ flag: "duplicate_suspected", severity: "medium" });
  }
  if (reasonCodes.has("location_needs_review")) {
    flags.push({ flag: "location_conflict", severity: "medium" });
  }
  if (reasonCodes.has("role_low_fit")) {
    flags.push({ flag: "role_scope_unclear", severity: "medium" });
  }
  if (reasonCodes.has("deadline_expired")) {
    flags.push({ flag: "unrealistic_timeline", severity: "high" });
  }
  if (!notes.trim() || Number(normalized.notesLength || 0) === 0) {
    flags.push({ flag: "missing_resume", severity: "medium" });
  }
  if (mentionsSalaryMismatch(payload)) {
    flags.push({ flag: "salary_mismatch", severity: "medium" });
  }
  if (reasonCodes.has("skill_match_none")) {
    flags.push({ flag: "credential_gap", severity: "medium" });
  }

  const hasMissingResume = flags.some((risk) => risk.flag === "missing_resume");
  const hasSalaryMismatch = flags.some((risk) => risk.flag === "salary_mismatch");
  if (hasMissingResume && hasSalaryMismatch) {
    return flags.map((risk) =>
      risk.flag === "missing_resume" || risk.flag === "salary_mismatch" ? { ...risk, severity: "high" } : risk
    );
  }

  return flags;
}

function mentionsSalaryMismatch(payload = {}) {
  const values = [
    payload.salaryExpectation,
    payload.expectedSalary,
    payload.compensation,
    payload.notes,
    payload.summary,
    payload.resume_text
  ];
  return values.some((value) => /salary|compensation|pay|rate/i.test(String(value || "")) && /mismatch|too low|below|minimum/i.test(String(value || "")));
}

function deriveFallbackConfidence(scoringResult = {}, riskFlags = []) {
  if (scoringResult.priority === "invalid") return 0.2;
  if (riskFlags.some((risk) => risk.severity === "high")) return 0.42;
  if (scoringResult.priority === "hot") return 0.78;
  if (scoringResult.priority === "duplicate") return 0.7;
  if (scoringResult.priority === "review") return 0.58;
  return 0.62;
}

function deriveFallbackSummary(payload = {}, scoringResult = {}, recommendedAction) {
  const role = payload.role || scoringResult.sanitizedPayload?.role || "the role";
  const score = Number.isFinite(scoringResult.score) ? scoringResult.score : 0;
  if (recommendedAction === "advance") {
    return `The application is a strong match for ${role}. The deterministic score is ${score}, so it can move forward with normal review.`;
  }
  if (recommendedAction === "escalate_to_human") {
    return `The application needs human review before automation continues. The rules engine found risk signals that should be checked directly.`;
  }
  if (recommendedAction === "archive") {
    return `The application has a low fit score for ${role}. It can be archived unless a reviewer has newer context.`;
  }
  return `The application is usable but not ready for fast-track routing. Keep it in the hold queue for a reviewer or batch pass.`;
}

function logAiFailure(error, context) {
  const line = {
    level: "warn",
    component: "autoapplyops.ai-evaluator",
    event: "ai_evaluation_fallback",
    reason: error?.code || error?.name || "unknown_error",
    message: error?.message || String(error),
    ...context
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

function logAiDegradedOnce(error) {
  if (degradedStatusLogged) return;
  degradedStatusLogged = true;
  process.stderr.write(
    `${JSON.stringify({
      level: "warn",
      module: "ai-evaluator",
      status: "degraded",
      reason: error?.code || error?.message || "Ollama unavailable or AI output invalid",
      impact: "AI evaluation uses rules-engine/v1 fallback"
    })}\n`
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

class AiEvaluationError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "AiEvaluationError";
    this.code = code;
    this.details = details;
  }
}
