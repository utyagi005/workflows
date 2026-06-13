import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { evaluateApplication as scoreApplication } from "../src/scoring.mjs";

const checks = [
  ["Frozen importable intake workflow", 5, () => workflowHas("workflows/autoapplyops-intake.json", "Webhook Intake")],
  ["Canonical main workflow export", 5, () => workflowHas("workflows/autoapplyops-main.json", "AI Copilot Slot")],
  ["AI Copilot n8n workflow export", 7, () => workflowHasAll("workflows/autoapplyops-ai-copilot.json", ["Webhook", "AI Evaluate", "Human Review", "Duplicate Guard"])],
  ["Dedicated error-handler workflow", 5, () => workflowHas("workflows/autoapplyops-error-handler.json", "Error Trigger")],
  ["Formal intake JSON schema", 5, () => existsSync("schemas/autoapplyops-intake.schema.json")],
  ["AI schema exists and is draft-07 valid", 6, () => validSchema("schemas/autoapplyops-ai-evaluation.schema.json")],
  ["Feedback schema exists and is draft-07 valid", 5, () => validSchema("schemas/autoapplyops-feedback.schema.json")],
  ["AI evaluator exports evaluateApplication", 6, async () => typeof (await import("../lib/ai-evaluator.mjs")).evaluateApplication === "function"],
  ["Fallback returns aiStatus=fallback when Ollama is unreachable", 6, () => fallbackCheck()],
  ["Feedback store exports ML readiness API", 6, async () => {
    const module = await import("../lib/feedback-store.mjs");
    return ["recordFeedback", "getFeedbackStats", "exportForTraining", "getCalibrationReport", "createFeedbackStore"].every(
      (name) => typeof module[name] === "function"
    );
  }],
  ["Human-review routing tests pass", 5, () => runTestFile("tests/human-review-routing.test.mjs")],
  ["At least 4 AI-related test cases exist", 5, () => countAiTests() >= 4],
  ["Hot/review/invalid/duplicate/secret/tuned/AI samples", 5, () => countSampleJson() >= 10],
  ["Generated sample simulation report", 4, () => existsSync("docs/reports/sample-simulation.json")],
  ["Decision matrix and automation hints", 4, () => includesAll("src/scoring.mjs", ["decisionMatrix", "automationHints"])],
  ["Credential-safe repository hygiene", 4, () => includesAll(".gitignore", [".env", "credentials", "execution-data", "data/feedback.db"])],
  ["Dashboard has AI toggle, confidence display, review state, and Learning Signal", 5, () =>
    includesAll("demo/index.html", ["aiToggle", "confidenceMeter", "reviewBadge", "Learning Signal", "Export Training Data"]) &&
    includesAll("demo/app.js", ["AI Fallback", "Pending Review"])],
  ["AI architecture doc exists and is >500 words", 4, () => wordCount("docs/ai-architecture.md") > 500],
  ["ML roadmap doc exists and is >800 words", 4, () => wordCount("docs/ml-roadmap.md") > 800],
  ["Captioned video and GIF preview", 4, () => mediaSize("docs/assets/autoapplyops-demo.mp4") && mediaSize("docs/assets/autoapplyops-demo.gif")]
];

const results = [];
for (const [name, points, pass] of checks) {
  let earned = 0;
  try {
    earned = (await pass()) ? points : 0;
  } catch {
    earned = 0;
  }
  results.push({ name, points, earned });
}

const score = results.reduce((sum, result) => sum + result.earned, 0);

writeFileSync(
  "docs/reports/workflow-scorecard.md",
  [
    "# AutoApplyOps Workflow Scorecard",
    "",
    `**Score: ${score}/100**`,
    "",
    "| Area | Points | Earned |",
    "| --- | ---: | ---: |",
    ...results.map((result) => `| ${result.name} | ${result.points} | ${result.earned} |`),
    ""
  ].join("\n")
);

console.log(`AutoApplyOps workflow score: ${score}/100`);

if (score < 100) {
  process.exitCode = 1;
}

function workflowHas(file, nodeName) {
  if (!existsSync(file)) return false;
  const workflow = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(workflow.nodes) && workflow.nodes.some((node) => node.name === nodeName);
}

function workflowHasAll(file, nodeNames) {
  if (!existsSync(file)) return false;
  const workflow = JSON.parse(readFileSync(file, "utf8"));
  const names = new Set(workflow.nodes.map((node) => node.name));
  return nodeNames.every((nodeName) => names.has(nodeName));
}

function validSchema(file) {
  if (!existsSync(file)) return false;
  const schema = JSON.parse(readFileSync(file, "utf8"));
  if (schema.$schema !== "http://json-schema.org/draft-07/schema#") return false;
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  ajv.compile(schema);
  return true;
}

async function fallbackCheck() {
  const { evaluateApplication } = await import("../lib/ai-evaluator.mjs");
  const restore = withEnv({
    NODE_ENV: "development",
    AUTOAPPLYOPS_AI_ENABLED: "true",
    OLLAMA_BASE_URL: "http://127.0.0.1:9"
  });
  const originalWrite = process.stderr.write;
  process.stderr.write = () => true;
  try {
    const scoringResult = scoreApplication({
      applicationId: "score-fallback",
      applicantName: "Fallback Check",
      company: "Scorecard",
      role: "Software Engineering Intern",
      source: "career-page",
      deadline: "2026-06-16",
      location: "Remote",
      skills: ["JavaScript", "automation"],
      notes: "Scorecard fallback test."
    });
    const result = await evaluateApplication({ applicationId: "score-fallback", role: "Software Engineering Intern" }, scoringResult);
    return result.aiStatus === "fallback";
  } finally {
    process.stderr.write = originalWrite;
    restore();
  }
}

function runTestFile(file) {
  execFileSync("node", ["--test", file], { stdio: "ignore" });
  return true;
}

function countAiTests() {
  return ["tests/ai-evaluator.test.mjs", "tests/human-review-routing.test.mjs", "tests/risky-payload.test.mjs"]
    .filter(existsSync)
    .map((file) => (readFileSync(file, "utf8").match(/\btest\(/g) || []).length)
    .reduce((sum, count) => sum + count, 0);
}

function countSampleJson() {
  return [
    "samples/high-priority-application.json",
    "samples/review-application.json",
    "samples/invalid-application.json",
    "samples/duplicate-application.json",
    "samples/secret-failure-application.json",
    "samples/tuned-weights-application.json",
    "samples/ai-success-application.json",
    "samples/ai-fallback-application.json",
    "samples/human-review-application.json",
    "samples/risky-payload-application.json"
  ].filter(existsSync).length;
}

function includesAll(file, needles) {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  return needles.every((needle) => text.includes(needle));
}

function mediaSize(file) {
  return existsSync(file) && statSync(file).size > 10_000;
}

function wordCount(file) {
  return existsSync(file) ? readFileSync(file, "utf8").trim().split(/\s+/).filter(Boolean).length : 0;
}

function withEnv(values) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
