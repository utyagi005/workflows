import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflowPath = "workflows/autoapplyops-intake.json";
const mainWorkflowPath = "workflows/autoapplyops-main.json";
const aiWorkflowPath = "workflows/autoapplyops-ai-copilot.json";
const errorWorkflowPath = "workflows/autoapplyops-error-handler.json";
const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
const mainWorkflow = JSON.parse(readFileSync(mainWorkflowPath, "utf8"));
const aiWorkflow = JSON.parse(readFileSync(aiWorkflowPath, "utf8"));
const errorWorkflow = JSON.parse(readFileSync(errorWorkflowPath, "utf8"));

assert.equal(workflow.name, "AutoApplyOps - Internship Application Triage");
assert.ok(Array.isArray(workflow.nodes), "workflow.nodes must be an array");
assert.ok(workflow.nodes.length >= 7, "workflow should contain the full triage pipeline");
assert.equal(workflow.active, false, "shared workflows should import inactive by default");

const nodeNames = new Set(workflow.nodes.map((node) => node.name));
for (const required of [
  "Webhook Intake",
  "Validate + Score Application",
  "Route Priority",
  "Hot Lead Action",
  "Review Queue Action",
  "Invalid Payload Action",
  "Duplicate Review Action",
  "Respond with Triage Report"
]) {
  assert.ok(nodeNames.has(required), `missing node: ${required}`);
}

const serialized = JSON.stringify(workflow);
for (const forbidden of ["sk-", "xoxb-", "ghp_", "Bearer ", "password"]) {
  assert.equal(serialized.includes(forbidden), false, `workflow appears to contain secret marker: ${forbidden}`);
}

console.log(`Validated ${workflowPath}: ${workflow.nodes.length} nodes, no obvious secret markers.`);

assert.equal(mainWorkflow.name, "AutoApplyOps - Main Deterministic Triage");
assert.equal(mainWorkflow.active, false, "main workflow should import inactive by default");
assert.ok(
  mainWorkflow.nodes.some((node) => node.name === "AI Copilot Slot"),
  "main workflow must document the optional AI Copilot slot"
);
assertNoSecretMarkers(mainWorkflow, mainWorkflowPath);

console.log(`Validated ${mainWorkflowPath}: ${mainWorkflow.nodes.length} nodes, no obvious secret markers.`);

assert.equal(aiWorkflow.name, "AutoApplyOps - AI Copilot");
assert.equal(aiWorkflow.active, false, "AI Copilot workflow should import inactive by default");
for (const required of [
  "Webhook",
  "Validate Payload",
  "Deterministic Score",
  "AI Evaluate",
  "Route Decision",
  "Hot Lead",
  "Hold",
  "Human Review",
  "Archive",
  "Duplicate Guard"
]) {
  assert.ok(aiWorkflow.nodes.some((node) => node.name === required), `AI Copilot workflow missing node: ${required}`);
}
assert.ok(
  aiWorkflow.nodes.some((node) => node.name === "AI Evaluate" && node.type === "n8n-nodes-base.httpRequest"),
  "AI Evaluate must use an HTTP Request node"
);
assert.ok(
  aiWorkflow.nodes.some((node) => node.name === "Human Review" && node.type === "n8n-nodes-base.wait"),
  "Human Review must use the n8n Wait-node resume pattern"
);
assertNoSecretMarkers(aiWorkflow, aiWorkflowPath);

console.log(`Validated ${aiWorkflowPath}: ${aiWorkflow.nodes.length} nodes, no obvious secret markers.`);

assert.ok(
  errorWorkflow.nodes.some((node) => node.name === "Error Trigger"),
  "error workflow must contain Error Trigger"
);
assert.ok(
  errorWorkflow.nodes.some((node) => node.name === "Sanitize Error Context"),
  "error workflow must sanitize error context"
);
assert.equal(errorWorkflow.active, false, "shared error workflow should import inactive by default");

console.log(`Validated ${errorWorkflowPath}: ${errorWorkflow.nodes.length} nodes.`);

function assertNoSecretMarkers(parsedWorkflow, file) {
  const serialized = JSON.stringify(parsedWorkflow);
  for (const forbidden of ["sk-", "xoxb-", "ghp_", "Bearer ", "password"]) {
    assert.equal(serialized.includes(forbidden), false, `${file} appears to contain secret marker: ${forbidden}`);
  }
}
