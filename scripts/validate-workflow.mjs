import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflowPath = "workflows/autoapplyops-intake.json";
const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));

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
  "Respond with Triage Report"
]) {
  assert.ok(nodeNames.has(required), `missing node: ${required}`);
}

const serialized = JSON.stringify(workflow);
for (const forbidden of ["sk-", "xoxb-", "ghp_", "Bearer ", "password"]) {
  assert.equal(serialized.includes(forbidden), false, `workflow appears to contain secret marker: ${forbidden}`);
}

console.log(`Validated ${workflowPath}: ${workflow.nodes.length} nodes, no obvious secret markers.`);
