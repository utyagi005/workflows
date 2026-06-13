const candidates = [
  {
    id: "CND-1048",
    name: "Maya Chen",
    role: "ML Platform Intern",
    score: 96,
    route: "Hot Lead",
    risk: "Low",
    sla: "12m",
    source: "Referral + portfolio",
    signals: "7 strong, 1 watch",
    action: "Recruiter outreach",
    summary: "Candidate exceeds fit threshold with verified automation, Node, and ML evaluation signals. Recommend immediate recruiter touch with portfolio-specific context.",
    confidence: 94,
    flags: [{ label: "verified portfolio", tone: "teal" }, { label: "low drift", tone: "teal" }]
  },
  {
    id: "CND-1039",
    name: "Ari Patel",
    role: "Data Automation Intern",
    score: 82,
    route: "Hold",
    risk: "Medium",
    sla: "4h",
    source: "Job board",
    signals: "5 strong, 2 watch",
    action: "Waitlist with trigger",
    summary: "Strong automation evidence, but recruiter fit depends on team capacity. Hold for batch comparison and re-score after references land.",
    confidence: 86,
    flags: [{ label: "source trust", tone: "amber" }, { label: "skill gap", tone: "amber" }]
  },
  {
    id: "CND-1026",
    name: "Noah Smith",
    role: "Backend Intern",
    score: 41,
    route: "Invalid",
    risk: "High",
    sla: "blocked",
    source: "Unknown webhook",
    signals: "schema failed",
    action: "Reject payload",
    summary: "Required fields are incomplete and payload provenance is weak. Do not advance until intake is repaired and source is verified.",
    confidence: 78,
    flags: [{ label: "schema mismatch", tone: "red" }, { label: "unknown source", tone: "red" }]
  }
];

const feedbackRecords = [
  { event: "Recruiter accepted hot lead", label: "true positive", note: "Portfolio evidence matched interview screen." },
  { event: "Hold changed to review", label: "calibration", note: "Source trust underweighted for job-board imports." },
  { event: "Payload rejected", label: "true negative", note: "Injection pattern and missing deadline co-occurred." }
];

const state = {
  activeIndex: 0,
  aiEnabled: true,
  reviewMode: false,
  currentAction: "hot",
  feedback: [...feedbackRecords],
  riskFlags: ["source_trust", "schema_mismatch", "injection_pattern", "deadline_pressure"],
  exports: 0
};

const els = {
  liveClock: document.querySelector("#liveClock"),
  modelStatus: document.querySelector("#modelStatus"),
  aiToggle: document.querySelector("#aiToggle"),
  aiPanel: document.querySelector("#aiPanel"),
  copilotState: document.querySelector("#copilotState"),
  copilotSubtitle: document.querySelector("#copilotSubtitle"),
  aiSummary: document.querySelector("#aiSummary"),
  confidenceValue: document.querySelector("#confidenceValue"),
  confidenceMeter: document.querySelector("#confidenceMeter"),
  riskFlags: document.querySelector("#riskFlags"),
  aiAction: document.querySelector("#aiAction"),
  aiTone: document.querySelector("#aiTone"),
  candidateRows: document.querySelector("#candidateRows"),
  candidateId: document.querySelector("#candidateId"),
  candidateName: document.querySelector("#candidateName"),
  candidateRole: document.querySelector("#candidateRole"),
  candidateScore: document.querySelector("#candidateScore"),
  candidateSignals: document.querySelector("#candidateSignals"),
  candidateSource: document.querySelector("#candidateSource"),
  candidateAction: document.querySelector("#candidateAction"),
  routeBadge: document.querySelector("#routeBadge"),
  routingState: document.querySelector("#routingState"),
  reviewBadge: document.querySelector("#reviewBadge"),
  queuePanel: document.querySelector(".queue-panel"),
  activeCandidate: document.querySelector("#activeCandidate"),
  feedbackList: document.querySelector("#feedbackList"),
  coRiskFlags: document.querySelector("#coRiskFlags"),
  accuracyBadge: document.querySelector("#accuracyBadge"),
  calibrationLine: document.querySelector("#calibrationLine"),
  exportTraining: document.querySelector("#exportTraining"),
  openReport: document.querySelector("#openReport"),
  reportModal: document.querySelector("#reportModal"),
  modalSummary: document.querySelector("#modalSummary"),
  brierScore: document.querySelector("#brierScore"),
  falseAdvance: document.querySelector("#falseAdvance"),
  reviewUplift: document.querySelector("#reviewUplift"),
  kpiQualified: document.querySelector("#kpiQualified"),
  kpiPrecision: document.querySelector("#kpiPrecision"),
  kpiSla: document.querySelector("#kpiSla"),
  kpiRisks: document.querySelector("#kpiRisks"),
  kpiReviews: document.querySelector("#kpiReviews")
};

const controls = [...document.querySelectorAll("[data-action]")];

function tickClock() {
  const now = new Date();
  els.liveClock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  els.liveClock.dateTime = now.toISOString();
}

function render() {
  const candidate = candidates[state.activeIndex];
  const route = state.reviewMode ? "Pending Review" : routeForAction(state.currentAction, candidate);
  const confidence = state.aiEnabled ? confidenceForAction(candidate.confidence) : 0;

  els.candidateId.textContent = candidate.id;
  els.candidateName.textContent = candidate.name;
  els.candidateRole.textContent = candidate.role;
  els.candidateScore.textContent = String(scoreForAction(candidate.score));
  els.candidateSignals.textContent = candidate.signals;
  els.candidateSource.textContent = candidate.source;
  els.candidateAction.textContent = state.reviewMode ? "Await human decision" : actionForRoute(route);
  els.routeBadge.textContent = route;
  els.routeBadge.className = `state-badge ${toneForRoute(route)}`;
  els.routingState.textContent = state.reviewMode
    ? "Recruiter judgment required before automated advancement."
    : `Live candidate routed to ${route.toLowerCase()}.`;

  renderCopilot(candidate, route, confidence);
  renderRows(route);
  renderLearning(route);
  renderReviewMode();
  renderKpis(route);
}

function renderCopilot(candidate, route, confidence) {
  els.modelStatus.textContent = state.aiEnabled ? "AI model: active" : "AI model: disabled";
  els.modelStatus.classList.toggle("offline", !state.aiEnabled);
  els.aiPanel.classList.toggle("disabled", !state.aiEnabled);
  els.copilotState.textContent = state.aiEnabled ? "Online" : "Fallback";
  els.copilotState.className = `state-badge ${state.aiEnabled ? "teal" : "red"}`;

  if (!state.aiEnabled) {
    els.copilotSubtitle.textContent = "Rules-only fallback is active.";
    els.aiSummary.textContent = "AI sidebar disabled. Routing uses deterministic thresholds, schema checks, and recruiter-owned review queues until model assistance is restored.";
    els.confidenceValue.textContent = "0%";
    els.confidenceMeter.value = 0;
    els.riskFlags.innerHTML = riskPills([{ label: "ai_disabled", tone: "amber" }, { label: "fallback_rules", tone: "teal" }]);
    els.aiAction.textContent = "Use manual rubric";
    els.aiTone.textContent = "Neutral, policy-bound";
    return;
  }

  els.copilotSubtitle.textContent = "Generated triage narrative and routing confidence.";
  els.aiSummary.textContent = summaryForAction(candidate.summary);
  els.confidenceValue.textContent = `${confidence}%`;
  els.confidenceMeter.value = confidence;
  els.riskFlags.innerHTML = riskPills(flagsForAction(candidate.flags));
  els.aiAction.textContent = state.reviewMode ? "Escalate to human reviewer" : actionForRoute(route);
  els.aiTone.textContent = toneCopyForRoute(route);
}

function renderRows(activeRoute) {
  els.candidateRows.innerHTML = candidates
    .map((candidate, index) => {
      const route = index === state.activeIndex ? activeRoute : candidate.route;
      const isActive = index === state.activeIndex ? " class=\"active-row\"" : "";
      return `<tr${isActive} tabindex="0" data-index="${index}" aria-label="Select ${escapeHtml(candidate.name)}">
        <td><strong>${escapeHtml(candidate.name)}</strong><br><span class="mono">${escapeHtml(candidate.id)}</span></td>
        <td>${escapeHtml(candidate.role)}</td>
        <td>${scoreForAction(candidate.score)}</td>
        <td>${escapeHtml(route)}</td>
        <td>${escapeHtml(riskForAction(candidate.risk))}</td>
        <td>${escapeHtml(candidate.sla)}</td>
      </tr>`;
    })
    .join("");

  for (const row of els.candidateRows.querySelectorAll("tr")) {
    row.addEventListener("click", () => selectCandidate(Number(row.dataset.index)));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCandidate(Number(row.dataset.index));
      }
    });
  }
}

function renderLearning(route) {
  const actionRecord = {
    event: `${route} simulation`,
    label: state.aiEnabled ? "model feedback" : "fallback feedback",
    note: state.reviewMode ? "Advance controls disabled pending human review." : "Local state captured for training export."
  };
  const records = [actionRecord, ...state.feedback].slice(0, 4);
  els.feedbackList.innerHTML = records
    .map((record) => `<article class="feedback-record">
      <strong>${escapeHtml(record.event)}</strong>
      <span>${escapeHtml(record.label)}</span>
      <small>${escapeHtml(record.note)}</small>
    </article>`)
    .join("");

  els.coRiskFlags.innerHTML = state.riskFlags
    .map((flag, index) => `<span class="risk-pill ${index > 1 ? "amber" : "teal"}">${escapeHtml(flag)}</span>`)
    .join("");

  const accuracy = state.aiEnabled ? (state.reviewMode ? "91.8%" : "94.2%") : "rules";
  els.accuracyBadge.textContent = `AI accuracy ${accuracy}`;
  els.calibrationLine.setAttribute("points", state.reviewMode ? "44,146 92,132 142,112 196,82 252,64 320,62" : "44,140 92,120 142,96 196,76 252,54 320,40");
}

function renderReviewMode() {
  els.reviewBadge.classList.toggle("hidden", !state.reviewMode);
  els.queuePanel.classList.toggle("review-mode", state.reviewMode);
  els.activeCandidate.classList.toggle("review-mode", state.reviewMode);
  for (const control of controls) {
    const shouldDisable = state.reviewMode && control.dataset.action !== "review";
    control.disabled = shouldDisable;
    control.setAttribute("aria-disabled", String(shouldDisable));
  }
}

function renderKpis(route) {
  els.kpiQualified.textContent = route === "Invalid" ? "183" : "184";
  els.kpiPrecision.textContent = route === "Hot Lead" ? "32" : "31";
  els.kpiSla.textContent = state.reviewMode ? "10" : "9";
  els.kpiRisks.textContent = state.currentAction === "risky" ? "28" : "27";
  els.kpiReviews.textContent = state.aiEnabled ? (state.reviewMode ? "91.8%" : "94.2%") : "rules";
}

function routeForAction(action, candidate) {
  if (action === "hot") return "Hot Lead";
  if (action === "hold") return "Hold";
  if (action === "duplicate") return "Duplicate";
  if (action === "invalid") return "Invalid";
  if (action === "fallback") return "AI Fallback";
  if (action === "risky") return "Risky Payload";
  return candidate.route;
}

function actionForRoute(route) {
  const actions = {
    "Hot Lead": "Advance to recruiter",
    Hold: "Keep warm and re-score",
    Duplicate: "Merge candidate record",
    Invalid: "Reject and request repair",
    "AI Fallback": "Use manual rubric",
    "Risky Payload": "Quarantine payload",
    "Pending Review": "Await human decision"
  };
  return actions[route] || "Review candidate";
}

function toneForRoute(route) {
  if (route === "Invalid" || route === "Risky Payload") return "red";
  if (route === "Hold" || route === "Duplicate" || route === "Pending Review" || route === "AI Fallback") return "amber";
  return "teal";
}

function toneCopyForRoute(route) {
  if (route === "Invalid" || route === "Risky Payload") return "Firm, audit-ready";
  if (route === "Hold" || route === "Pending Review") return "Cautious, evidence-led";
  return "Direct, specific, warm";
}

function scoreForAction(baseScore) {
  if (state.currentAction === "invalid") return Math.min(baseScore, 39);
  if (state.currentAction === "risky") return Math.min(baseScore, 52);
  if (state.currentAction === "duplicate") return Math.min(baseScore, 64);
  return baseScore;
}

function confidenceForAction(baseConfidence) {
  if (state.reviewMode) return 71;
  if (state.currentAction === "risky") return 68;
  if (state.currentAction === "fallback") return 57;
  return baseConfidence;
}

function riskForAction(baseRisk) {
  if (state.currentAction === "risky") return "Critical";
  if (state.currentAction === "invalid") return "High";
  if (state.currentAction === "duplicate") return "Medium";
  return baseRisk;
}

function summaryForAction(defaultSummary) {
  if (state.reviewMode) return "Model recommends pausing automation because evidence is mixed. Recruiter review is required before any outbound action or status change.";
  if (state.currentAction === "risky") return "Prompt-injection markers and source anomalies co-occur. Quarantine the payload, preserve audit context, and block downstream personalization.";
  if (state.currentAction === "fallback") return "Primary model confidence dropped below operating threshold. Fallback routing uses deterministic scoring and conservative recruiter escalation.";
  if (state.currentAction === "duplicate") return "Candidate appears to match an existing application. Merge records before outreach to avoid duplicate recruiter contact.";
  return defaultSummary;
}

function flagsForAction(defaultFlags) {
  if (state.currentAction === "risky") return [{ label: "prompt injection", tone: "red" }, { label: "source anomaly", tone: "red" }, { label: "manual audit", tone: "amber" }];
  if (state.currentAction === "fallback") return [{ label: "low confidence", tone: "amber" }, { label: "rules fallback", tone: "teal" }];
  if (state.currentAction === "duplicate") return [{ label: "duplicate email", tone: "amber" }, { label: "merge needed", tone: "amber" }];
  return defaultFlags;
}

function riskPills(flags) {
  return flags.map((flag) => `<span class="risk-pill ${flag.tone}">${escapeHtml(flag.label)}</span>`).join("");
}

function selectCandidate(index) {
  state.activeIndex = index;
  state.reviewMode = false;
  state.currentAction = candidates[index].route === "Invalid" ? "invalid" : candidates[index].route === "Hold" ? "hold" : "hot";
  render();
}

function handleAction(action) {
  if (state.reviewMode && action !== "review") return;
  state.currentAction = action;
  state.reviewMode = action === "review" ? !state.reviewMode : false;
  if (action === "fallback") {
    state.aiEnabled = false;
    els.aiToggle.checked = false;
  }
  if (action === "risky" && !state.riskFlags.includes("prompt_injection")) {
    state.riskFlags.unshift("prompt_injection");
  }
  state.feedback.unshift({
    event: `${routeForAction(action, candidates[state.activeIndex])} applied`,
    label: "operator feedback",
    note: `Captured from ${candidates[state.activeIndex].id} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
  });
  render();
}

function exportTrainingData() {
  state.exports += 1;
  const payload = {
    exportedAt: new Date().toISOString(),
    activeCandidate: candidates[state.activeIndex],
    aiEnabled: state.aiEnabled,
    reviewMode: state.reviewMode,
    feedback: state.feedback,
    coOccurringRiskFlags: state.riskFlags,
    calibration: {
      accuracy: els.accuracyBadge.textContent,
      confidence: els.confidenceValue.textContent,
      route: els.routeBadge.textContent
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `autoapplyops-training-export-${state.exports}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openReport() {
  els.modalSummary.textContent = state.reviewMode
    ? "Human review mode is reducing automation risk while preserving labeled examples."
    : "Model alignment remains within recruiter review tolerance.";
  els.brierScore.textContent = state.reviewMode ? "0.074" : "0.061";
  els.falseAdvance.textContent = state.currentAction === "risky" ? "0.9%" : "1.8%";
  els.reviewUplift.textContent = state.reviewMode ? "+18.2%" : "+14.6%";
  if (typeof els.reportModal.showModal === "function") {
    els.reportModal.showModal();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

for (const control of controls) {
  control.addEventListener("click", () => handleAction(control.dataset.action));
}

els.aiToggle.addEventListener("change", () => {
  state.aiEnabled = els.aiToggle.checked;
  if (state.aiEnabled && state.currentAction === "fallback") state.currentAction = "hot";
  render();
});

els.exportTraining.addEventListener("click", exportTrainingData);
els.openReport.addEventListener("click", openReport);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.reportModal.open) els.reportModal.close();
  if (event.target.closest("input, button, dialog")) return;
  const keyMap = { h: "hot", o: "hold", d: "duplicate", i: "invalid", f: "fallback", r: "review", p: "risky" };
  const action = keyMap[event.key.toLowerCase()];
  if (action) handleAction(action);
});

tickClock();
setInterval(tickClock, 1000);
render();
