import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { evaluateApplication } from "../src/scoring.mjs";

const SAMPLE_EXPECTATIONS = [
  ["samples/high-priority-application.json", "valid", "hot", "High Priority Follow-up"],
  ["samples/review-application.json", "valid", "review", "Review Queue"],
  ["samples/invalid-application.json", "invalid", "invalid", "Needs Manual Repair"],
  ["samples/duplicate-application.json", "valid", "duplicate", "Duplicate Review"],
  ["samples/secret-failure-application.json", "invalid", "invalid", "Needs Manual Repair"],
  ["samples/tuned-weights-application.json", "valid", "review", "Review Queue"]
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
    decisionMatrix: result.decisionMatrix
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
