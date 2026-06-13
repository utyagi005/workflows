import test from "node:test";
import assert from "node:assert/strict";
import { buildFallbackEvaluation } from "../lib/ai-evaluator.mjs";
import { evaluateApplication as scoreApplication } from "../src/scoring.mjs";

test("fallback escalates salary mismatch plus missing resume to high severity", () => {
  const payload = {
    applicationId: "risk-001",
    applicantName: "Risky Payload",
    company: "Ambiguous Labs",
    role: "Software Engineering Intern",
    deadline: "2026-06-16",
    location: "Remote",
    skills: ["JavaScript", "automation"],
    source: "career-page",
    notes: "",
    salaryExpectation: "Compensation mismatch: below minimum range."
  };
  const scoringResult = scoreApplication(payload, { now: "2026-06-10T12:00:00.000Z" });
  const fallback = buildFallbackEvaluation(payload, scoringResult, { status: "fallback" });

  assert.equal(fallback.aiStatus, "fallback");
  assert.equal(fallback.recommendedAction, "escalate_to_human");
  assert.ok(fallback.riskFlags.some((risk) => risk.flag === "salary_mismatch" && risk.severity === "high"));
  assert.ok(fallback.riskFlags.some((risk) => risk.flag === "missing_resume" && risk.severity === "high"));
});
