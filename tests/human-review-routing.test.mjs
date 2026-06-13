import test from "node:test";
import assert from "node:assert/strict";
import { shouldTriggerHumanReview } from "../lib/ai-evaluator.mjs";

const baseEvaluation = {
  aiFitSummary: "Usable application with enough signal to route.",
  resumeSignalScore: 70,
  riskFlags: [],
  followUpTone: "neutral",
  recommendedAction: "hold",
  confidence: 0.55,
  aiStatus: "available",
  modelUsed: "mock",
  evaluatedAt: "2026-06-10T12:00:00.000Z"
};

test("triggers human review when confidence is 0.54", () => {
  assert.equal(shouldTriggerHumanReview({ ...baseEvaluation, confidence: 0.54 }), true);
});

test("does not trigger human review when confidence is exactly 0.55", () => {
  assert.equal(shouldTriggerHumanReview({ ...baseEvaluation, confidence: 0.55 }), false);
});

test("triggers human review on high-severity risk flag", () => {
  assert.equal(
    shouldTriggerHumanReview({
      ...baseEvaluation,
      confidence: 0.9,
      riskFlags: [{ flag: "credential_gap", severity: "high" }]
    }),
    true
  );
});

test("triggers human review on escalate_to_human action", () => {
  assert.equal(
    shouldTriggerHumanReview({
      ...baseEvaluation,
      confidence: 0.9,
      recommendedAction: "escalate_to_human"
    }),
    true
  );
});
