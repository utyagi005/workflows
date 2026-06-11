import { evaluateApplication } from "../src/scoring.mjs";

const payloadSelect = document.querySelector("#payloadSelect");
const payloadView = document.querySelector("#payloadView");
const followUpView = document.querySelector("#followUpView");
const scoreValue = document.querySelector("#scoreValue");
const statusValue = document.querySelector("#statusValue");
const routeValue = document.querySelector("#routeValue");
const reasonValue = document.querySelector("#reasonValue");
const priorityPill = document.querySelector("#priorityPill");
const scoreMetric = document.querySelector("#scoreMetric");
const routeMetric = document.querySelector("#routeMetric");
const lastRun = document.querySelector("#lastRun");
const executionRows = document.querySelector("#executionRows");
const runDemo = document.querySelector("#runDemo");

const samplePath = (name) => `../samples/${name}`;
const runHistory = [];

async function loadPayload() {
  const response = await fetch(samplePath(payloadSelect.value));
  const payload = await response.json();
  payloadView.textContent = JSON.stringify(payload, null, 2);
  renderResult(payload);
}

function renderResult(payload) {
  const result = evaluateApplication(payload, { now: "2026-06-10T12:00:00.000Z" });
  const priorityLabel = result.priority === "hot" ? "Hot lead" : result.priority === "review" ? "Review" : result.priority;

  scoreValue.textContent = `${result.score}/100`;
  statusValue.textContent = result.validationStatus;
  routeValue.textContent = result.route;
  reasonValue.textContent = result.reasonCodes.slice(0, 3).join(", ");
  followUpView.textContent = result.followUpDraft;
  priorityPill.textContent = priorityLabel;
  priorityPill.className = `pill ${result.priority}`;
  scoreMetric.textContent = String(result.score);
  routeMetric.textContent = result.priority === "hot" ? "Hot" : result.priority === "review" ? "Review" : "Fix";
  lastRun.textContent = `Last run: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  runHistory.unshift({
    applicationId: result.applicationId,
    company: result.sanitizedPayload.company || "Unknown",
    priority: priorityLabel,
    route: result.route
  });
  runHistory.splice(4);
  renderRows();
}

function renderRows() {
  executionRows.innerHTML = runHistory
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.applicationId)}</td>
        <td>${escapeHtml(row.company)}</td>
        <td><span class="pill ${row.priority.toLowerCase().includes("hot") ? "" : row.priority.toLowerCase()}">${escapeHtml(row.priority)}</span></td>
        <td>${escapeHtml(row.route)}</td>
      </tr>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

payloadSelect.addEventListener("change", loadPayload);
runDemo.addEventListener("click", loadPayload);

await loadPayload();
