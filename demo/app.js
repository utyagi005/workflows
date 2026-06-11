import { evaluateApplication } from "../src/scoring.mjs";

const DEFAULT_TARGET_SKILLS = "javascript, api, automation, postgresql, node, n8n";
const DEFAULT_WEIGHTS = {
  deadline: 25,
  skills: 30,
  role: 20,
  location: 10,
  completeness: 10,
  source: 5
};

const payloadSelect = document.querySelector("#payloadSelect");
const payloadView = document.querySelector("#payloadView");
const followUpView = document.querySelector("#followUpView");
const scoreValue = document.querySelector("#scoreValue");
const statusValue = document.querySelector("#statusValue");
const routeValue = document.querySelector("#routeValue");
const nextStepValue = document.querySelector("#nextStepValue");
const reasonValue = document.querySelector("#reasonValue");
const priorityPill = document.querySelector("#priorityPill");
const scoreMetric = document.querySelector("#scoreMetric");
const routeMetric = document.querySelector("#routeMetric");
const slaMetric = document.querySelector("#slaMetric");
const lastRun = document.querySelector("#lastRun");
const executionRows = document.querySelector("#executionRows");
const runDemo = document.querySelector("#runDemo");
const resetDemo = document.querySelector("#resetDemo");
const decisionMatrix = document.querySelector("#decisionMatrix");
const weightTotal = document.querySelector("#weightTotal");
const targetSkillsInput = document.querySelector("#targetSkillsInput");
const duplicateToggle = document.querySelector("#duplicateToggle");
const secretToggle = document.querySelector("#secretToggle");
const weightInputs = [...document.querySelectorAll(".weight-input")];

const form = {
  applicationId: document.querySelector("#applicationIdInput"),
  company: document.querySelector("#companyInput"),
  role: document.querySelector("#roleInput"),
  deadline: document.querySelector("#deadlineInput"),
  location: document.querySelector("#locationInput"),
  source: document.querySelector("#sourceInput"),
  skills: document.querySelector("#skillsInput"),
  notes: document.querySelector("#notesInput")
};

const samplePath = (name) => `../samples/${name}`;
const runHistory = [];
let currentPayload = {};

async function loadPayload() {
  const response = await fetch(samplePath(payloadSelect.value));
  currentPayload = await response.json();
  hydrateForm(currentPayload);
  renderResult();
}

function hydrateForm(payload) {
  form.applicationId.value = payload.applicationId || "";
  form.company.value = payload.company || "";
  form.role.value = payload.role || "";
  form.deadline.value = payload.deadline || "";
  form.location.value = payload.location || "Remote";
  form.source.value = payload.source || "manual-entry";
  form.skills.value = Array.isArray(payload.skills) ? payload.skills.join(", ") : payload.skills || "";
  form.notes.value = payload.notes || "";
  targetSkillsInput.value = DEFAULT_TARGET_SKILLS;
  duplicateToggle.checked = false;
  secretToggle.checked = false;
  for (const input of weightInputs) {
    input.value = String(DEFAULT_WEIGHTS[input.dataset.weight]);
  }
}

function payloadFromForm() {
  return {
    applicationId: form.applicationId.value.trim(),
    applicantName: currentPayload.applicantName || "Demo Applicant",
    email: currentPayload.email || "demo.applicant@example.com",
    company: form.company.value.trim(),
    role: form.role.value.trim(),
    deadline: form.deadline.value,
    location: form.location.value,
    skills: form.skills.value
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean),
    source: form.source.value,
    notes: form.notes.value.trim(),
    sharedSecret: secretToggle.checked ? "wrong-secret" : "expected-secret"
  };
}

function optionsFromControls() {
  const weights = { ...DEFAULT_WEIGHTS };
  for (const input of weightInputs) {
    weights[input.dataset.weight] = Number(input.value);
  }

  return {
    now: "2026-06-10T12:00:00.000Z",
    targetSkills: targetSkillsInput.value.split(",").map((skill) => skill.trim()),
    weights,
    knownApplicationIds: duplicateToggle.checked ? [form.applicationId.value.trim()] : [],
    requireSharedSecret: secretToggle.checked,
    expectedSharedSecret: "expected-secret"
  };
}

function renderResult() {
  const payload = payloadFromForm();
  const result = evaluateApplication(payload, optionsFromControls());
  const priorityLabel = labelForPriority(result.priority);

  payloadView.textContent = JSON.stringify(payload, null, 2);
  scoreValue.textContent = `${result.score}/100`;
  statusValue.textContent = result.validationStatus;
  routeValue.textContent = result.route;
  nextStepValue.textContent = result.automationHints.nextStep.replaceAll("_", " ");
  reasonValue.textContent = result.reasonCodes.slice(0, 4).join(", ");
  followUpView.textContent = result.followUpDraft;
  priorityPill.textContent = priorityLabel;
  priorityPill.className = `pill ${result.priority}`;
  scoreMetric.textContent = String(result.score);
  routeMetric.textContent =
    result.priority === "hot" ? "Hot" : result.priority === "review" ? "Review" : result.priority === "duplicate" ? "Merge" : "Fix";
  slaMetric.textContent = result.automationHints.sla;
  lastRun.textContent = `Last run: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  renderMatrix(result);
  addHistory(result);
}

function renderMatrix(result) {
  const total = Object.values(result.scoringProfile.weights).reduce((sum, value) => sum + Number(value || 0), 0);
  weightTotal.textContent = `${total} pts`;
  decisionMatrix.innerHTML = result.decisionMatrix
    .filter((signal) => signal.name !== "duplicate" || signal.points < 0)
    .map((signal) => {
      const width = signal.maxPoints > 0 ? Math.max(4, Math.round((signal.points / signal.maxPoints) * 100)) : signal.points < 0 ? 100 : 0;
      return `<article class="matrix-item ${signal.points < 0 ? "negative" : ""}">
        <div>
          <strong>${escapeHtml(titleCase(signal.name))}</strong>
          <small>${escapeHtml(signal.reason)}</small>
        </div>
        <span>${signal.points}${signal.maxPoints ? `/${signal.maxPoints}` : ""}</span>
        <div class="bar" aria-hidden="true"><i style="width:${width}%"></i></div>
      </article>`;
    })
    .join("");
}

function addHistory(result) {
  const last = runHistory[0];
  if (last?.applicationId === result.applicationId && last?.route === result.route && last?.score === result.score) {
    renderRows();
    return;
  }

  runHistory.unshift({
    applicationId: result.applicationId,
    company: result.sanitizedPayload.company || "Unknown",
    priority: labelForPriority(result.priority),
    route: result.route,
    score: result.score
  });
  runHistory.splice(5);
  renderRows();
}

function renderRows() {
  executionRows.innerHTML = runHistory
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.applicationId)}</td>
        <td>${escapeHtml(row.company)}</td>
        <td><span class="pill ${classForPriority(row.priority)}">${escapeHtml(row.priority)}</span></td>
        <td>${escapeHtml(row.route)}</td>
      </tr>`
    )
    .join("");
}

function labelForPriority(priority) {
  if (priority === "hot") return "Hot lead";
  if (priority === "review") return "Review";
  if (priority === "duplicate") return "Duplicate";
  return priority;
}

function classForPriority(priorityLabel) {
  const label = priorityLabel.toLowerCase();
  if (label.includes("hot")) return "";
  if (label.includes("duplicate")) return "duplicate";
  return label;
}

function titleCase(value) {
  return value.replace(/(^|_|\s)([a-z])/g, (_match, space, char) => `${space === "_" ? " " : space}${char.toUpperCase()}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

payloadSelect.addEventListener("change", loadPayload);
runDemo.addEventListener("click", renderResult);
resetDemo.addEventListener("click", loadPayload);

for (const input of [...Object.values(form), targetSkillsInput, duplicateToggle, secretToggle, ...weightInputs]) {
  input.addEventListener("input", renderResult);
  input.addEventListener("change", renderResult);
}

await loadPayload();
