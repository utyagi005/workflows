# AutoApplyOps Feedback Store

## Overview

The feedback store is a local SQLite database accessed through `better-sqlite3`. It records reviewer outcomes for AI-assisted and rules-only decisions so AutoApplyOps can audit recommendations, export training data, and produce calibration reports without adding a hosted database requirement to the demo.

SQLite fits the current project shape: it is file-based, easy to inspect, simple to reset for demos, and reliable enough for a single-operator workflow. `better-sqlite3` is the preferred Node.js client because it offers a synchronous API that is straightforward inside scripts and small workflow utilities. The store should be treated as local operational evidence, not as a place to retain unnecessary raw applicant data.

## Append-Only Records

Feedback records should be append-only. Each review action inserts a new row instead of mutating historical decisions in place. This preserves an audit trail when a reviewer changes their mind, when a route is corrected, or when a calibration run needs to compare the original suggestion with later outcomes.

Each record should include a stable application identifier or hashed intake identifier, the deterministic route, the AI suggested route when present, AI confidence when present, the final reviewer label, reviewer notes, timestamp, model name, prompt version, scoring profile version, and fallback reason when AI was unavailable. Sensitive free text should be minimized. If notes are needed, store short reviewer annotations rather than full raw resumes or emails.

Append-only storage makes reports more trustworthy. A calibration script can reconstruct what the system believed at the time of review and compare that with the human outcome. If the same application is reviewed twice, both events remain visible.

## Migration Pattern

Schema migrations should use SQLite's `PRAGMA user_version` value as the local version marker. On startup, the store opens the database, reads `PRAGMA user_version`, applies any missing migrations in ascending order inside a transaction, and then sets `PRAGMA user_version` to the latest schema number.

The pattern should stay simple:

1. Version 0 means a new database with no application tables.
2. Each migration creates or alters tables deterministically.
3. Every migration is idempotent where practical, but the version number remains the source of truth.
4. The final version update happens only after the migration transaction succeeds.

This avoids a heavier migration framework while still documenting how the local store evolves. It also makes the database easy to reason about during portfolio review: open the file, check the schema, and verify the version.

## Training Export

Training export should produce a sanitized JSONL or CSV dataset from append-only feedback records. The export should include the structured signals that are safe and useful for future modeling: score, priority, route, reason codes, skill-match counts, deadline bucket, source category, completeness count, deterministic decision, AI suggestion, AI confidence, reviewer outcome, and review timestamp.

The export should exclude direct identifiers, raw email addresses, raw resume text, and full private notes. When an identifier is needed for deduplication, use a hash or internal application key. The goal is to support future supervised learning and threshold tuning without turning the feedback store into a sensitive applicant archive.

Exports should be reproducible. A script can accept a date range and write a versioned artifact such as `feedback-export-YYYY-MM-DD.jsonl`. The export should include metadata for model name, prompt version, schema version, and scoring profile so future experiments can explain what generated the labels.

## Calibration Report

The calibration report should summarize how well AI confidence matched reviewer outcomes. It can group records into confidence buckets such as 0.00-0.49, 0.50-0.69, 0.70-0.84, and 0.85-1.00, then report agreement rate, disagreement rate, review count, and common route changes for each bucket.

The report should also compare AI suggestions against deterministic routes. Useful questions include: how often did AI agree with the rule-based route, how often did reviewers accept an AI override, how often did low-confidence items need correction, and whether the 0.70 threshold is too permissive or too strict.

For operations, the report should include review-SLA metrics. Any item requiring human review should be measured against the 24h SLA, with counts for on-time, late, and unresolved feedback. This connects model quality with the real dashboard responsibility created by the AI readiness upgrade.

Calibration output should be plain and auditable. Markdown is enough for portfolio review, while JSON can support charts later. The key requirement is that every conclusion can be traced back to append-only feedback rows rather than overwritten state.

## Degraded Operation

`better-sqlite3` is a native Node addon, so it can fail to install on machines without node-gyp build tools. AutoApplyOps treats that as degraded operation, not as a fatal application error. `lib/feedback-store.mjs` wraps the `better-sqlite3` load in a guarded runtime path. If the import fails, the module logs one structured warning to stderr with `module: "feedback-store"`, `status: "degraded"`, and the impact that feedback will not persist locally.

In degraded mode, the exported functions still exist so the rest of the dashboard, simulator, and verification scripts can keep running. `recordFeedback()` returns `null`, `exportForTraining()` returns `null`, `getCalibrationReport()` returns `null`, and `getFeedbackStats()` returns:

```json
{
  "total": 0,
  "aiCorrect": 0,
  "aiIncorrect": 0,
  "aiNull": 0,
  "stubMode": true,
  "reason": "better-sqlite3 unavailable"
}
```

This is important for a portfolio workflow because reviewers should be able to inspect the project even when their machine is missing native build tools. The README documents the recommended build-tool installation path for macOS, Ubuntu, and Windows.

## Corrections and Schema Evolution

Feedback records are append-only at both the application and database levels. The v1 migration creates a `prevent_feedback_update` trigger:

```sql
CREATE TRIGGER prevent_feedback_update
BEFORE UPDATE ON feedback
BEGIN
  SELECT RAISE(ABORT, 'feedback records are append-only');
END;
```

This prevents quiet mutation of historical labels. If a reviewer later discovers that a decision was wrong, the correction should be represented as a new record in a future schema version rather than by updating the original row.

Version 2 is intentionally not implemented yet, but the migration file reserves the intended fields as SQL comments:

```sql
-- correctedFeedbackId UUID (points to the record being superseded)
-- isCorrected BOOLEAN DEFAULT 0 (set on the original record)
```

Example future correction model:

- Original record: `feedbackId=AAA`, `decision="rejected"`.
- Correction record: `feedbackId=BBB`, `correctedFeedbackId=AAA`, `decision="hired"`.
- Future `exportForTraining()` behavior: prefer correction records, exclude superseded originals, and keep both rows available for audit history.

Until v2 exists, corrections can still be modeled as separate v1 feedback events with the same `applicationId`, but consumers should treat them as separate observations rather than destructive edits.
