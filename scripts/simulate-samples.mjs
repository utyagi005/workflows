import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { evaluateApplication } from "../src/scoring.mjs";
import { buildFallbackEvaluation, shouldTriggerHumanReview } from "../lib/ai-evaluator.mjs";
import { recordFeedback } from "../lib/feedback-store.mjs";

const SAMPLE_EXPECTATIONS = [
  ["samples/high-priority-application.json", "valid", "hot", "High Priority Follow-up"],
  ["samples/review-application.json", "valid", "review", "Review Queue"],
  ["samples/invalid-application.json", "invalid", "invalid", "Needs Manual Repair"],
  ["samples/duplicate-application.json", "valid", "duplicate", "Duplicate Review"],
  ["samples/secret-failure-application.json", "invalid", "invalid", "Needs Manual Repair"],
  ["samples/tuned-weights-application.json", "valid", "review", "Review Queue"],
  ["samples/ai-success-application.json", "valid", "hot", "High Priority Follow-up"],
  ["samples/ai-fallback-application.json", "valid", "review", "Review Queue"],
  ["samples/human-review-application.json", "valid", "review", "Review Queue"],
  ["samples/risky-payload-application.json", "valid", "hot", "High Priority Follow-up"]
];

const now = "2026-06-10T12:00:00.000Z";
const results = SAMPLE_EXPECTATIONS.map(([file, expectedStatus, expectedPriority, expectedRoute]) => {
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const config = payload.config || {};
  const result = evaluateApplication(payload, {
    now,
    targetSkills: config.targetSkills,
    weights: config.weights,
    knownApplicationIds: config.knownApplicationIds,
    requireSharedSecret: config.requireSharedSecret,
    expectedSharedSecret: config.expectedSharedSecret
  });

  const passed =
    result.validationStatus === expectedStatus && result.priority === expectedPriority && result.route === expectedRoute;

  if (!passed) {
    throw new Error(
      `${file} expected ${expectedStatus}/${expectedPriority}/${expectedRoute}, got ${result.validationStatus}/${result.priority}/${result.route}`
    );
  }

  const aiEvaluation = buildFallbackEvaluation(payload, result, {
    status: file.includes("ai-fallback") ? "fallback" : file.includes("human-review") ? "fallback" : "disabled"
  });
  const feedback = maybeRecordFeedback({ payload, result, aiEvaluation, file });

  return {
    file,
    applicationId: result.applicationId,
    validationStatus: result.validationStatus,
    priority: result.priority,
    route: result.route,
    score: result.score,
    nextStep: result.automationHints.nextStep,
    sanitizedPayload: result.sanitizedPayload,
    reasonCodes: result.reasonCodes,
    decisionMatrix: result.decisionMatrix,
    aiEvaluation,
    humanReviewRequired: shouldTriggerHumanReview(aiEvaluation),
    feedback
  };
});

mkdirSync("docs/reports", { recursive: true });
writeFileSync("docs/reports/sample-simulation.json", `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(
  "docs/reports/sample-simulation.md",
  [
    "# AutoApplyOps Sample Simulation",
    "",
    "| Sample | Status | Priority | Route | Score | Next step |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...results.map(
      (result) =>
        `| \`${basename(result.file)}\` | ${result.validationStatus} | ${result.priority} | ${result.route} | ${result.score} | ${result.nextStep} |`
    ),
    ""
  ].join("\n")
);

console.log(`Simulated ${results.length} samples into docs/reports/sample-simulation.json`);

function maybeRecordFeedback({ payload, result, aiEvaluation, file }) {
  if (result.validationStatus === "invalid") {
    return null;
  }

  const source =
    result.priority === "duplicate"
      ? "duplicate_guard"
      : result.priority === "hot"
        ? "auto_advance"
        : result.priority === "low"
          ? "auto_archive"
          : "human_review";
  const decision =
    source === "duplicate_guard"
      ? "duplicate"
      : source === "auto_advance"
        ? "still_in_process"
        : source === "auto_archive"
          ? "rejected"
          : file.includes("human-review")
            ? "rejected"
            : "still_in_process";
  const aiWasCorrect = aiEvaluation.aiStatus === "fallback" || source === "duplicate_guard" ? null : decisionMatches(aiEvaluation.recommendedAction, decision);
  const record = {
    feedbackId: crypto.randomUUID(),
    applicationId: result.applicationId || payload.applicationId,
    evaluatedAt: aiEvaluation.evaluatedAt,
    feedbackRecordedAt: new Date().toISOString(),
    source,
    decision,
    decisionMadeBy: source === "human_review" ? "human_reviewer" : "system",
    aiWasCorrect,
    confidenceAtDecision: aiEvaluation.aiStatus === "fallback" ? null : aiEvaluation.confidence,
    riskFlagsAtDecision: aiEvaluation.riskFlags.map((risk) => risk.flag),
    resumeSignalScoreAtDecision: aiEvaluation.resumeSignalScore,
    overrideReason: source === "human_review" ? "Reviewer resolved queued application." : null,
    modelUsed: aiEvaluation.modelUsed,
    feedbackVersion: "1.0"
  };

  const stored = recordFeedback(record);
  return stored
    ? { feedbackId: stored.feedbackId, source: stored.source, decision: stored.decision, aiWasCorrect: stored.aiWasCorrect }
    : { source, decision, stored: false };
}

function decisionMatches(recommendedAction, decision) {
  if (recommendedAction === "advance") return decision === "still_in_process" || decision === "hired";
  if (recommendedAction === "archive") return decision === "rejected";
  if (recommendedAction === "hold") return decision === "still_in_process";
  if (recommendedAction === "escalate_to_human") return decision !== "duplicate";
  return false;
}
