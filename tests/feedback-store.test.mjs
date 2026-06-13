import test from "node:test";
import assert from "node:assert/strict";
import { v4 as uuidv4 } from "uuid";
import { createFeedbackStore, defaultFeedbackStore } from "../lib/feedback-store.mjs";

test("recordFeedback inserts a valid record successfully", () => {
  const store = createFeedbackStore(":memory:");
  const inserted = store.recordFeedback(record({ decision: "hired", aiWasCorrect: true, confidenceAtDecision: 0.82 }));

  assert.equal(inserted.decision, "hired");
  assert.equal(store.getFeedbackStats().total, 1);
});

test("recordFeedback throws on missing required fields", () => {
  const store = createFeedbackStore(":memory:");
  const invalid = record();
  delete invalid.feedbackId;

  assert.throws(() => store.recordFeedback(invalid), /feedbackId/);
  assert.throws(() => store.recordFeedback({ ...record(), applicationId: undefined }), /applicationId/);
  assert.throws(() => store.recordFeedback({ ...record(), decision: undefined }), /decision/);
});

test("recordFeedback throws on invalid enum value for decision", () => {
  const store = createFeedbackStore(":memory:");

  assert.throws(() => store.recordFeedback(record({ decision: "maybe_later" })), /decision/);
});

test("getFeedbackStats returns correct counts after three inserts", () => {
  const store = createFeedbackStore(":memory:");
  store.recordFeedback(record({ decision: "hired", aiWasCorrect: true, confidenceAtDecision: 0.8 }));
  store.recordFeedback(record({ decision: "rejected", aiWasCorrect: false, confidenceAtDecision: 0.7 }));
  store.recordFeedback(record({ source: "duplicate_guard", decision: "duplicate", aiWasCorrect: null, confidenceAtDecision: null }));

  const stats = store.getFeedbackStats();
  assert.equal(stats.total, 3);
  assert.equal(stats.aiCorrect, 1);
  assert.equal(stats.aiIncorrect, 1);
  assert.equal(stats.aiNull, 1);
  assert.equal(stats.decisionDistribution.hired, 1);
  assert.equal(stats.decisionDistribution.rejected, 1);
  assert.equal(stats.decisionDistribution.duplicate, 1);
});

test("exportForTraining returns consistent feature vector shape and excludes null AI correctness", () => {
  const store = createFeedbackStore(":memory:");
  store.recordFeedback(record({ aiWasCorrect: true, confidenceAtDecision: 0.8, riskFlagsAtDecision: ["missing_resume"] }));
  store.recordFeedback(record({ aiWasCorrect: false, confidenceAtDecision: 0.6, riskFlagsAtDecision: ["salary_mismatch", "credential_gap"] }));
  store.recordFeedback(record({ aiWasCorrect: null, confidenceAtDecision: null, source: "duplicate_guard", decision: "duplicate" }));

  const exported = store.exportForTraining();
  assert.equal(exported.length, 2);
  assert.equal(new Set(exported.map((row) => row.features.length)).size, 1);
  assert.deepEqual(exported.map((row) => row.label).sort(), [0, 1]);
});

test("getCalibrationReport returns exactly five buckets with expected accuracy", () => {
  const store = createFeedbackStore(":memory:");
  store.recordFeedback(record({ aiWasCorrect: true, confidenceAtDecision: 0.1 }));
  store.recordFeedback(record({ aiWasCorrect: false, confidenceAtDecision: 0.3 }));
  store.recordFeedback(record({ aiWasCorrect: true, confidenceAtDecision: 0.75 }));
  store.recordFeedback(record({ aiWasCorrect: true, confidenceAtDecision: 0.9 }));

  const report = store.getCalibrationReport();
  assert.equal(report.length, 5);
  assert.equal(report[0].bucket, "0.0-0.2");
  assert.equal(report[0].accuracy, 1);
  assert.equal(report[1].accuracy, 0);
  assert.equal(report[3].accuracy, 1);
});

test("schema migration upgrades a version 0 database to version 1 with append-only trigger", () => {
  const store = createFeedbackStore(":memory:");
  const version = store.db.prepare("PRAGMA user_version").get().user_version;
  const trigger = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'prevent_feedback_update'")
    .get();

  assert.equal(version, 1);
  assert.equal(trigger.name, "prevent_feedback_update");
  const inserted = store.recordFeedback(record({ decision: "rejected" }));
  assert.throws(
    () => store.db.prepare("UPDATE feedback SET decision = 'hired' WHERE feedbackId = ?").run(inserted.feedbackId),
    /append-only/
  );
});

test("exportForTraining excludes provisional auto_advance records", () => {
  const store = createFeedbackStore(":memory:");
  store.recordFeedback(
    record({
      source: "auto_advance",
      decision: "still_in_process",
      decisionMadeBy: "system",
      aiWasCorrect: true,
      confidenceAtDecision: 0.9
    })
  );

  assert.deepEqual(store.exportForTraining(), []);
});

test("exportForTraining prefers follow_up_resolution over auto_advance for the same applicationId", () => {
  const store = createFeedbackStore(":memory:");
  const applicationId = "follow-up-001";
  store.recordFeedback(
    record({
      applicationId,
      source: "auto_advance",
      decision: "still_in_process",
      decisionMadeBy: "system",
      aiWasCorrect: true,
      confidenceAtDecision: 0.9
    })
  );
  store.recordFeedback(
    record({
      applicationId,
      source: "follow_up_resolution",
      decision: "hired",
      decisionMadeBy: "human_reviewer",
      aiWasCorrect: true,
      confidenceAtDecision: 0.9
    })
  );

  const exported = store.exportForTraining();
  assert.equal(exported.length, 1);
  assert.equal(exported[0].applicationId, applicationId);
  assert.equal(exported[0].source, "follow_up_resolution");
});

test("createFeedbackStore can degrade to stub mode without throwing", () => {
  const store = createFeedbackStore(":memory:", { forceStub: true });

  assert.equal(store.recordFeedback(record()), null);
  assert.deepEqual(store.getFeedbackStats(), {
    total: 0,
    aiCorrect: 0,
    aiIncorrect: 0,
    aiNull: 0,
    stubMode: true,
    reason: "better-sqlite3 unavailable"
  });
  assert.equal(store.exportForTraining(), null);
  assert.equal(store.getCalibrationReport(), null);
});

test("default singleton path is not in-memory outside test-specific factory use", () => {
  assert.notEqual(defaultFeedbackStore.dbPath, ":memory:");
});

function record(overrides = {}) {
  return {
    feedbackId: uuidv4(),
    applicationId: overrides.applicationId || uuidv4(),
    evaluatedAt: "2026-06-10T12:00:00.000Z",
    feedbackRecordedAt: "2026-06-10T13:00:00.000Z",
    source: "human_review",
    decision: "rejected",
    decisionMadeBy: "human_reviewer",
    aiWasCorrect: false,
    confidenceAtDecision: 0.64,
    riskFlagsAtDecision: ["role_scope_unclear"],
    resumeSignalScoreAtDecision: 64,
    overrideReason: null,
    modelUsed: "gemma3:4b",
    feedbackVersion: "1.0",
    ...overrides
  };
}
