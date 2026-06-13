# AutoApplyOps ML Roadmap

## Current State

AutoApplyOps currently relies on deterministic intake logic. A webhook payload is normalized, validated, scored with explicit weights, routed to a next action, and returned with a decision matrix, reason codes, automation hints, sanitized payload fields, and a follow-up draft. This is the correct foundation for AI and ML readiness because every decision already has structured features and human-readable explanations.

The current scoring profile uses signals such as deadline urgency, target-skill matches, role fit, location compatibility, payload completeness, source quality, and duplicate detection. These signals are easy to audit and map cleanly into future model features. The output categories are also practical labels for learning: `hot`, `review`, `low`, `duplicate`, and `invalid`, along with route names such as `High Priority Follow-up`, `Review Queue`, `Duplicate Review`, `Archive with Weekly Digest`, and `Needs Manual Repair`.

The first AI upgrade should be advisory rather than autonomous. A local Ollama model, defaulting to `gemma3:4b`, can summarize messy notes, identify uncertainty, suggest a route, and generate rationale. The deterministic score remains the source of truth unless a human reviewer accepts a different outcome. This keeps the workflow explainable while creating labeled data for later training.

The project should treat the dashboard as an operations surface. AI confidence, fallback reason, and human review status should be visible next to the route. Any AI-assisted item that is low-confidence, conflicting, invalid, duplicate-sensitive, or otherwise risky should carry a 24h human review SLA on the dashboard. The SLA is not a decoration; it is a promise that AI uncertainty creates a review task with a measurable deadline.

## Training Trigger Criteria

Training should not begin just because the workflow can store feedback. A useful first model needs enough reviewed examples to learn from actual operator decisions rather than from the existing rules alone. The initial trigger should require at least 200 append-only feedback records, with at least 30 examples in each major actionable category where possible: hot, review, low, duplicate, and invalid or repair. If duplicate and invalid volumes are naturally lower, they can remain rule-dominant until enough examples accumulate.

The training set should also meet quality criteria. At least 90 percent of records used for training should have a final reviewer outcome, a timestamp, the deterministic route, the scoring profile version, and either AI metadata or an explicit fallback reason. Records with missing labels, unresolved review status, or raw private notes should be excluded from training export.

Disagreement is especially valuable. A training run is worth considering when there are at least 30 cases where the reviewer corrected either the deterministic route or the AI suggested route. Those corrections teach the future model where the rules are too rigid or where the language model is overconfident.

Calibration should be another trigger. If the 0.70 AI confidence threshold shows poor alignment with reviewer outcomes over a meaningful sample, the next step may be threshold tuning rather than model training. For example, if the 0.70-0.84 bucket has low reviewer agreement, raise the threshold or send more cases to human review. If agreement is strong and the review queue is overloaded, consider allowing more AI suggestions to influence the visible recommendation while still requiring review for follow-up communication.

Training should be postponed when the feedback data is narrow, stale, or biased toward demo samples. A model trained mostly on synthetic payloads would look impressive in the repo but fail to improve real triage quality. The roadmap should prefer fewer high-quality human-reviewed labels over a large set of self-generated labels.

## Feature Engineering Notes

The first feature set should be structured, privacy-aware, and close to the current decision matrix. Recommended features include normalized score, priority, route, deadline bucket, days until deadline bucket, skill-match count, target-skill coverage ratio, role-fit bucket, location-fit bucket, source category, payload completeness count, duplicate flag, validation error count, and reason-code indicators.

Text features should be minimized and transformed before export. Instead of storing raw notes, use derived features such as notes length bucket, presence of target keywords, count of recognized skills, and optional local embedding identifiers if a future local embedding model is added. Direct email addresses, full applicant names, raw resumes, and unredacted notes should not be part of training data.

Categorical values should be stable. Route and reason-code names need versioning because model training depends on consistent labels. If a route name changes in the workflow, the feedback export should include both the stored route and the scoring profile version so historical examples remain interpretable.

The AI advisory layer can add features too: suggested route, confidence, rationale category, risk flags, fallback reason, model name, and prompt version. These fields are useful for meta-modeling and calibration even before a custom model exists. For example, the system can learn that certain risk flags correlate with reviewer corrections, or that one prompt version created more low-confidence outputs than another.

The target label should be the reviewer outcome, not the AI suggestion and not the deterministic score. The deterministic score is an input. The AI suggestion is an input. The human-reviewed final route is the label. That separation prevents the future ML system from merely copying the old rules or amplifying local model mistakes.

## Feedback Loop Design

The feedback loop starts at the dashboard. Every triage result should make it easy for a reviewer to accept, correct, or defer the recommendation. The reviewer action should write an append-only feedback row with the application key, deterministic route, AI suggestion when present, confidence, final label, reviewer note, timestamp, model name, prompt version, scoring profile version, and SLA status.

Append-only feedback is important because operational decisions change. A reviewer might initially mark an item as review, then later promote it to hot after receiving additional context. Both events should remain visible. Reports can use the latest final label for training while preserving earlier events for audit.

The feedback loop should produce two recurring artifacts. The training export is a sanitized JSONL or CSV file for future supervised learning. The calibration report is a Markdown or JSON summary that compares confidence buckets, AI agreement, deterministic route agreement, reviewer corrections, and 24h human review SLA performance.

The workflow should treat low-confidence and disagreement cases as priority feedback opportunities. If AI confidence is below 0.70, or if the AI suggested route conflicts with the deterministic route, the item should be surfaced for human review instead of quietly following the AI recommendation. These cases are valuable because they expose uncertainty and create high-signal labels.

Human review should remain part of the loop even after future ML deployment. The target is assisted prioritization, not unreviewed applicant communication. Follow-up messages influenced by AI or ML should require approval until the system has strong calibration evidence, clear rollback behavior, and a production privacy review.

## Privacy and Auditability

Privacy is a design constraint, not a cleanup task. The workflow should collect only the data needed to triage applications and explain decisions. Sanitized reports should avoid unnecessary personal details, and the feedback store should avoid raw emails, full resumes, or unredacted free-text notes. If an identifier is needed, prefer an internal application ID or a hash.

Local-first AI with Ollama supports this privacy stance because advisory inference can run without sending applicant data to a remote provider. The prompt should still be minimized. Passing less data to a local model is safer, easier to debug, and easier to explain to reviewers.

Auditability depends on preserving the chain of decision evidence. Each record should make clear what the rules engine decided, what the AI layer suggested, how confident it was, whether fallback occurred, what the reviewer decided, and whether the 24h SLA was met. This allows an operator to answer practical questions: why did this application get routed to review, why did the model disagree, who approved the final outcome, and what changed after calibration?

The SQLite feedback store should use append-only rows and a `PRAGMA user_version` migration pattern. Schema changes should be explicit, versioned, and applied in order. Training exports should include schema version, prompt version, model name, and scoring profile version so experiments can be reproduced.

Retention should be limited. Demo data can be reset. Production data should have a defined retention window, and exported training files should be treated as sensitive even when sanitized. The roadmap should never require storing raw applicant histories just to improve a model.

## Model Deployment Path (Future)

The future deployment path should move in stages. Stage one is the current deterministic workflow with AI advisory output and feedback capture. Stage two is calibration: measure whether confidence scores and route suggestions align with reviewer outcomes. Stage three is a lightweight supervised model trained on sanitized feedback exports once trigger criteria are met. Stage four is controlled deployment where the model can influence recommendations but still routes uncertain or high-impact cases to human review.

The first trained model does not need to be complex. A logistic regression, gradient-boosted tree, or small classifier over structured features may outperform a language model for route prediction because the inputs are tabular and the labels are operational. The local LLM can remain useful for summarization and rationale, while the supervised model handles calibrated route probability.

Deployment should preserve fallback behavior. If the trained model is missing, stale, or below confidence threshold, AutoApplyOps should use the deterministic route and surface review when needed. If the model disagrees with deterministic scoring, the dashboard should show both outputs and require reviewer approval until enough evidence supports automation.

Model artifacts should be versioned with training data date range, feature schema, label definition, evaluation metrics, and threshold settings. A release should include a rollback path to the prior model or to rules-only routing. No model should be promoted based only on aggregate accuracy; the evaluation should inspect hot-lead recall, false hot rates, duplicate handling, invalid payload handling, and review-SLA impact.

The long-term goal is not to make AutoApplyOps opaque. The goal is to make the workflow smarter while keeping the original strengths: deterministic validation, readable reason codes, sanitized audit trails, explicit dashboard accountability, and human judgment where uncertainty matters.
