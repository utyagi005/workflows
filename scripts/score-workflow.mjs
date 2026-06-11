import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const checks = [
  ["Importable main n8n workflow", 10, () => workflowHas("workflows/autoapplyops-intake.json", "Webhook Intake")],
  ["Dedicated error-handler workflow", 8, () => workflowHas("workflows/autoapplyops-error-handler.json", "Error Trigger")],
  ["Formal webhook schema", 8, () => existsSync("schemas/autoapplyops-intake.schema.json")],
  ["Hot/review/invalid/duplicate/secret/tuned samples", 10, () => countSampleJson() >= 6],
  ["Automated scoring tests", 10, () => readFileSync("tests/scoring.test.mjs", "utf8").includes("duplicate application IDs")],
  ["Generated sample simulation report", 8, () => existsSync("docs/reports/sample-simulation.json")],
  ["Decision matrix and automation hints", 10, () => includesAll("src/scoring.mjs", ["decisionMatrix", "automationHints"])],
  ["Credential-safe repository hygiene", 8, () => includesAll(".gitignore", [".env", "credentials", "execution-data"])],
  ["Interactive demo dashboard", 8, () => includesAll("demo/index.html", ["Interactive Workflow Builder", "Decision Matrix"])],
  ["Captioned video and GIF preview", 8, () => mediaSize("docs/assets/autoapplyops-demo.mp4") && mediaSize("docs/assets/autoapplyops-demo.gif")],
  ["Import, security, and operations docs", 8, () => ["docs/import-and-test.md", "docs/security-notes.md", "docs/operations.md"].every(existsSync)],
  ["CI verification workflow", 4, () => existsSync(".github/workflows/verify.yml")]
];

const results = checks.map(([name, points, pass]) => ({ name, points, earned: pass() ? points : 0 }));
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

function countSampleJson() {
  return [
    "samples/high-priority-application.json",
    "samples/review-application.json",
    "samples/invalid-application.json",
    "samples/duplicate-application.json",
    "samples/secret-failure-application.json",
    "samples/tuned-weights-application.json"
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
