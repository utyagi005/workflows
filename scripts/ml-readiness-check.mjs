import { existsSync, readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  createFeedbackStore,
  defaultFeedbackStore,
  exportForTraining,
  recordFeedback
} from "../lib/feedback-store.mjs";

const checks = [];

await check("Feedback schema file exists and is valid JSON Schema draft-07", () => {
  const schema = JSON.parse(readFileSync("schemas/autoapplyops-feedback.schema.json", "utf8"));
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  assert(schema.$schema === "http://json-schema.org/draft-07/schema#");
  ajv.compile(schema);
});

await check("feedback-store exports required functions", async () => {
  const module = await import("../lib/feedback-store.mjs");
  for (const name of ["recordFeedback", "getFeedbackStats", "exportForTraining", "getCalibrationReport", "createFeedbackStore"]) {
    assert(typeof module[name] === "function", `${name} export missing`);
  }
});

await check("SQLite DB initializes without error", () => {
  const store = createFeedbackStore(":memory:");
  assert(store.db, "in-memory DB was not created");
});

await check("recordFeedback rejects records missing required fields", () => {
  const store = createFeedbackStore(":memory:");
  assertThrows(() => store.recordFeedback({ ...feedbackRecord(), feedbackId: undefined }));
});

await check("exportForTraining produces consistent feature vectors", () => {
  const store = createFeedbackStore(":memory:");
  store.recordFeedback(feedbackRecord({ aiWasCorrect: true, confidenceAtDecision: 0.8 }));
  store.recordFeedback(feedbackRecord({ aiWasCorrect: false, confidenceAtDecision: 0.6, riskFlagsAtDecision: ["missing_resume"] }));
  const rows = store.exportForTraining();
  assert(rows.length === 2, "expected two trainable rows");
  assert(new Set(rows.map((row) => row.features.length)).size === 1, "feature vector shape mismatch");
});

await check("Calibration report returns 5 buckets", () => {
  const store = createFeedbackStore(":memory:");
  assert(store.getCalibrationReport().length === 5, "expected five confidence buckets");
});

await check("At least 1 feedback record exists in DB after simulate-samples", () => {
  const stats = defaultFeedbackStore.getFeedbackStats();
  assert(stats.total >= 1, "run npm run simulate before ml:check");
});

await check("Training export file is written to data/training-export.json", () => {
  exportForTraining();
  assert(existsSync("data/training-export.json"), "training export missing");
});

await check("docs/ml-roadmap.md exists and is portfolio-depth", () => {
  assert(existsSync("docs/ml-roadmap.md"), "docs/ml-roadmap.md missing");
  assert(readFileSync("docs/ml-roadmap.md", "utf8").trim().split(/\s+/).length > 800, "ml roadmap must be >800 words");
});

await check("createFeedbackStore(\":memory:\") factory export exists", () => {
  const store = createFeedbackStore(":memory:");
  assert(store.dbPath === ":memory:", "factory did not honor :memory:");
});

await check("Singleton uses FEEDBACK_DB_PATH env var", () => {
  const source = readFileSync("lib/feedback-store.mjs", "utf8");
  assert(source.includes("process.env.FEEDBACK_DB_PATH"), "singleton path does not reference FEEDBACK_DB_PATH");
});

await check("prevent_feedback_update trigger exists in DB schema", () => {
  const store = createFeedbackStore(":memory:");
  const trigger = store.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='prevent_feedback_update'").get();
  assert(trigger?.name === "prevent_feedback_update", "append-only trigger missing");
});

await check("Migration infrastructure runs without error on fresh DB", () => {
  const store = createFeedbackStore(":memory:");
  assert(store.db.prepare("PRAGMA user_version").get().user_version === 1, "fresh DB did not migrate to v1");
});

await check("Stub mode activates and returns stubMode:true", () => {
  const store = createFeedbackStore(":memory:", { forceStub: true });
  assert(store.getFeedbackStats().stubMode === true, "stub mode did not activate");
});

await check("exportForTraining excludes provisional records and logs count", () => {
  const store = createFeedbackStore(":memory:");
  store.recordFeedback(
    feedbackRecord({
      source: "auto_advance",
      decision: "still_in_process",
      decisionMadeBy: "system",
      aiWasCorrect: true
    })
  );
  const logs = captureStderr(() => store.exportForTraining());
  assert(logs.includes("excluded 1 provisional auto_advance records"), "provisional exclusion log missing");
});

await check("exportForTraining prefers follow_up_resolution over auto_advance", () => {
  const store = createFeedbackStore(":memory:");
  const applicationId = crypto.randomUUID();
  store.recordFeedback(
    feedbackRecord({
      applicationId,
      source: "auto_advance",
      decision: "still_in_process",
      decisionMadeBy: "system",
      aiWasCorrect: true
    })
  );
  store.recordFeedback(
    feedbackRecord({
      applicationId,
      source: "follow_up_resolution",
      decision: "hired",
      decisionMadeBy: "human_reviewer",
      aiWasCorrect: true
    })
  );
  const rows = store.exportForTraining();
  assert(rows.length === 1 && rows[0].source === "follow_up_resolution", "follow-up resolution was not preferred");
});

await check("data/.gitkeep exists and runtime DB is ignored", () => {
  assert(existsSync("data/.gitkeep"), "data/.gitkeep missing");
  const gitignore = readFileSync(".gitignore", "utf8");
  assert(gitignore.includes("data/feedback.db"), "data/feedback.db missing from .gitignore");
});

await check("AJV validation callsites import ajv-formats", () => {
  const files = ["lib/ai-evaluator.mjs", "lib/feedback-store.mjs", "scripts/ml-readiness-check.mjs", "tests/ai-evaluator.test.mjs"];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (text.includes('from "ajv"')) {
      assert(text.includes('from "ajv-formats"'), `${file} imports ajv without ajv-formats`);
      assert(text.includes("addFormats(ajv)"), `${file} does not call addFormats(ajv)`);
    }
  }
});

for (const result of checks) {
  const marker = result.pass ? "PASS" : "FAIL";
  console.log(`${marker} ${result.name}${result.reason ? ` - ${result.reason}` : ""}`);
}

if (checks.some((result) => !result.pass)) {
  process.exitCode = 1;
}

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, reason: error.message });
  }
}

function feedbackRecord(overrides = {}) {
  return {
    feedbackId: crypto.randomUUID(),
    applicationId: overrides.applicationId || crypto.randomUUID(),
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

function captureStderr(fn) {
  const original = process.stderr.write;
  let output = "";
  process.stderr.write = (chunk, ...args) => {
    output += String(chunk);
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return output;
}

function assert(condition, message = "assertion failed") {
  if (!condition) throw new Error(message);
}

function assertThrows(fn) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error("expected function to throw");
}
