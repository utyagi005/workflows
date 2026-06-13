# AutoApplyOps AI Architecture

## Purpose

The AI readiness upgrade keeps AutoApplyOps transparent while adding a local assistant layer for classification support, explanation drafting, and review-queue triage. The existing workflow already validates payloads, computes a deterministic score, returns a decision matrix, and creates a follow-up draft. The AI layer should not replace that core rules engine. Instead, it should act as an advisory component that can summarize messy notes, suggest reason-code refinements, and flag applications that deserve human attention when the structured signals are incomplete.

This architecture is intentionally conservative because internship application data can include names, email addresses, role histories, and free-text notes. AI output must be treated as a recommendation, not an automated final decision. The system of record remains the workflow result, the sanitized report, and the human review queue.

## Why Ollama

Ollama is the preferred first runtime because it supports local inference with a simple HTTP API and keeps portfolio demonstrations credential-free. AutoApplyOps already avoids private production dependencies where possible, and Ollama follows that pattern: reviewers can run the workflow without buying an API key, provisioning a cloud model account, or sending applicant information to a third-party model provider.

Local inference also makes the privacy story easier to explain. Raw intake notes can be minimized before they are sent to the model, and the request never needs to leave the operator's machine for the demo path. That matters for a workflow whose documentation already emphasizes sanitized logging and avoiding unnecessary exposure of personal data.

Ollama also gives the project an easy failure boundary. If the service is unavailable, slow, or disabled, the deterministic scoring path still works. The workflow can continue to validate, score, route, and generate its standard follow-up draft. This is better than making the entire intake pipeline depend on a remote AI service.

## Why `gemma3:4b`

`gemma3:4b` is the default model because it balances local resource use with enough language capability for the tasks AutoApplyOps needs. The project does not need a massive general-purpose model to choose between "hot", "review", "duplicate", and "low" paths. It needs concise summarization, careful extraction from short notes, draft wording suggestions, and uncertainty signals that can be reviewed by a person.

A 4B-class model is a practical default for laptops and demo environments. It should be easier to download, start, and run than larger models, which improves repeatability for portfolio reviewers. Choosing `gemma3:4b` also makes the system's limits clear: the AI layer is not presented as a perfect evaluator or ranking authority. It is a lightweight assistant wrapped by deterministic validation, threshold checks, and human review.

The model name is configurable through `AUTOAPPLYOPS_AI_MODEL` so operators can test larger or smaller Ollama models without changing workflow logic. The default should remain stable in examples and docs so the setup path is predictable.

## Fallback Design Rationale

The fallback design is fail-open for workflow continuity and fail-closed for autonomous AI action. When `AUTOAPPLYOPS_AI_ENABLED` is false, when `OLLAMA_BASE_URL` is missing, when Ollama does not respond, or when the model returns malformed output, AutoApplyOps should continue through the existing rules-based score and route. The AI fields should be marked as unavailable with a clear reason such as `ai_disabled`, `ollama_unreachable`, or `ai_output_invalid`.

This keeps the intake workflow reliable. A model outage should not block an application from being logged, scored, or surfaced for manual review. At the same time, the workflow should never pretend that missing AI output is a confident AI decision. The dashboard and reports should distinguish deterministic score, AI suggestion, confidence, and fallback reason.

Fallback also protects demo integrity. A reviewer should be able to run `npm run verify` and inspect reports even if Ollama is not installed. AI readiness is an enhancement to the operational flow, not a hidden prerequisite for the baseline project.

## Confidence Threshold

The operational human-review threshold is `confidence < 0.55`. This means the AI Copilot is allowed to provide a summary and suggested route, but any output below 0.55 is treated as too uncertain for autonomous routing. Human review is also triggered when `recommendedAction === "escalate_to_human"` or when any risk flag has `severity === "high"`.

The 0.55 threshold is intentionally conservative without making the model useless. It sits just above an uncertain midpoint, so the dashboard can still show medium-confidence AI assistance while forcing low-confidence decisions into recruiter judgment. The deterministic score remains visible beside the AI confidence, which prevents the local model from becoming an opaque ranking authority.

The threshold should be calibrated over time using stored feedback. Early demos should treat 0.55 as a starting point, not a permanent claim of measured accuracy. Calibration reports compare confidence buckets with reviewer outcomes and recommend whether the threshold should move upward for precision or downward for recall.

## Human Review SLA

Any AI-assisted item that is low-confidence, conflicting, invalid, duplicate-sensitive, or high-impact should surface on the dashboard with a human review SLA of 24h. The dashboard should show the deadline as a first-class operational field, not bury it in logs. A visible `humanReviewSla: "24h"` or equivalent dashboard badge ensures the AI layer creates accountability instead of ambiguity.

The 24h SLA matches the project's fast-response posture for promising internship opportunities while giving a reviewer enough time to inspect context before follow-up. It also gives future metrics a concrete target: count how many AI-assisted review items were resolved within 24 hours, which routes created delays, and whether fallback cases need better alerts.

## Guardrails

The AI prompt should receive only the minimum sanitized fields required for advice: role, company, source, normalized skills, deadline distance, existing score, reason codes, and redacted or summarized notes. Email addresses and unnecessary personal details should be excluded. The AI response should be structured JSON with a suggested route, confidence, rationale, risk flags, and suggested reviewer action.

Human approval remains required before sending follow-up communication that depends on AI interpretation. The workflow should keep the existing deterministic follow-up draft available and clearly mark any AI-edited wording as a suggestion.

## Backwards Compatibility Contract

`workflows/autoapplyops-intake.json` is frozen for backwards compatibility. It remains the original importable workflow path used by the first portfolio release, older README links, demo scripts, and reviewers who already imported the file into n8n. The AI upgrade therefore adds `workflows/autoapplyops-main.json` as the canonical deterministic export and `workflows/autoapplyops-ai-copilot.json` as the optional enrichment workflow instead of rewriting the original intake file.

Some logic is intentionally duplicated between the frozen intake export and the new main export. In a normal application, shared workflow generation might extract common code. Here, preserving the original artifact is more important because n8n workflow JSON is a user-facing deliverable, not just internal source. The duplication is documented in the main workflow sticky note, and future changes should treat `autoapplyops-intake.json` as an archived compatibility contract unless a user explicitly requests a breaking migration.
