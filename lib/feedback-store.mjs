import { createRequire } from "node:module";
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const FEEDBACK_SCHEMA_PATH = new URL("../schemas/autoapplyops-feedback.schema.json", import.meta.url);
const FEEDBACK_SCHEMA = JSON.parse(readFileSync(FEEDBACK_SCHEMA_PATH, "utf8"));
const DEFAULT_DB_PATH = "data/feedback.db";
const DEFAULT_EXPORT_PATH = "data/training-export.json";
const LATEST_SCHEMA_VERSION = 1;
const FLAG_COLUMNS = [
  "salary_mismatch",
  "location_conflict",
  "role_scope_unclear",
  "duplicate_suspected",
  "missing_resume",
  "unrealistic_timeline",
  "credential_gap"
];
const SOURCE_ENCODING = {
  human_review: 0,
  auto_advance: 1,
  auto_archive: 2,
  duplicate_guard: 3,
  follow_up_resolution: 4
};

const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validateFeedback = ajv.compile(FEEDBACK_SCHEMA);
const require = createRequire(import.meta.url);
let DatabaseConstructor = null;
let sqliteLoadError = null;
let stubWarningLogged = false;
let singletonStore = null;

try {
  DatabaseConstructor = require("better-sqlite3");
} catch (error) {
  sqliteLoadError = error;
}

export function createFeedbackStore(dbPath = process.env.FEEDBACK_DB_PATH ?? DEFAULT_DB_PATH, options = {}) {
  const Database = options.forceStub ? null : options.Database || DatabaseConstructor;
  if (!Database) {
    logStubWarning(sqliteLoadError);
    return createStubStore(dbPath);
  }

  const shouldInitializeFile = dbPath !== ":memory:" && !existsSync(dbPath);
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  if (shouldInitializeFile) {
    process.stderr.write(`[feedback-store] initialized new database at ${dbPath}\n`);
  }
  runMigrations(db);

  return {
    db,
    dbPath,
    stubMode: false,
    recordFeedback(feedbackRecord) {
      const normalized = normalizeRecord(feedbackRecord);
      validateRecord(normalized);
      db.prepare(
        `INSERT INTO feedback (
          feedbackId,
          applicationId,
          evaluatedAt,
          feedbackRecordedAt,
          source,
          decision,
          decisionMadeBy,
          aiWasCorrect,
          confidenceAtDecision,
          riskFlagsAtDecision,
          resumeSignalScoreAtDecision,
          overrideReason,
          modelUsed,
          feedbackVersion
        ) VALUES (
          @feedbackId,
          @applicationId,
          @evaluatedAt,
          @feedbackRecordedAt,
          @source,
          @decision,
          @decisionMadeBy,
          @aiWasCorrect,
          @confidenceAtDecision,
          @riskFlagsAtDecision,
          @resumeSignalScoreAtDecision,
          @overrideReason,
          @modelUsed,
          @feedbackVersion
        )`
      ).run(toDbRecord(normalized));
      return normalized;
    },
    getFeedbackStats() {
      const records = getAllRecords(db);
      const correct = records.filter((record) => record.aiWasCorrect === true);
      const incorrect = records.filter((record) => record.aiWasCorrect === false);
      const aiNull = records.filter((record) => record.aiWasCorrect === null);

      return {
        total: records.length,
        aiCorrect: correct.length,
        aiIncorrect: incorrect.length,
        aiNull: aiNull.length,
        decisionDistribution: countBy(records, "decision"),
        averageConfidenceWhenCorrect: average(correct.map((record) => record.confidenceAtDecision)),
        averageConfidenceWhenIncorrect: average(incorrect.map((record) => record.confidenceAtDecision)),
        flagCoOccurrences: flagCoOccurrences(records)
      };
    },
    exportForTraining() {
      const records = getAllRecords(db);
      const followUpApplications = new Set(
        records.filter((record) => record.source === "follow_up_resolution").map((record) => record.applicationId)
      );
      const provisionalRecords = records.filter(
        (record) => record.source === "auto_advance" && record.decision === "still_in_process"
      );
      const resolvedProvisional = provisionalRecords.filter((record) => followUpApplications.has(record.applicationId));
      const excludedProvisional = provisionalRecords.length;

      process.stderr.write(`[training-export] excluded ${excludedProvisional} provisional auto_advance records\n`);
      process.stderr.write(`[training-export] resolved ${resolvedProvisional.length} provisional records via follow-up\n`);

      const trainingRows = records
        .filter((record) => record.aiWasCorrect !== null)
        .filter((record) => !(record.source === "auto_advance" && record.decision === "still_in_process"))
        .map((record) => ({
          applicationId: record.applicationId,
          source: record.source,
          features: featureVector(record),
          label: record.aiWasCorrect ? 1 : 0
        }));

      if (dbPath !== ":memory:") {
        const exportPath = options.exportPath || DEFAULT_EXPORT_PATH;
        mkdirSync(dirname(exportPath), { recursive: true });
        writeFileSync(exportPath, `${JSON.stringify(trainingRows, null, 2)}\n`);
      }

      return trainingRows;
    },
    getCalibrationReport() {
      const records = getAllRecords(db).filter(
        (record) => record.aiWasCorrect !== null && record.confidenceAtDecision !== null
      );
      return [
        { bucket: "0.0-0.2", min: 0.0, max: 0.2 },
        { bucket: "0.2-0.4", min: 0.2, max: 0.4 },
        { bucket: "0.4-0.6", min: 0.4, max: 0.6 },
        { bucket: "0.6-0.8", min: 0.6, max: 0.8 },
        { bucket: "0.8-1.0", min: 0.8, max: 1.0 }
      ].map((bucket, index, buckets) => {
        const inBucket = records.filter((record) => {
          const confidence = record.confidenceAtDecision;
          const upperInclusive = index === buckets.length - 1;
          return confidence >= bucket.min && (upperInclusive ? confidence <= bucket.max : confidence < bucket.max);
        });
        const correct = inBucket.filter((record) => record.aiWasCorrect === true).length;
        return {
          bucket: bucket.bucket,
          count: inBucket.length,
          correct,
          accuracy: inBucket.length ? correct / inBucket.length : null
        };
      });
    }
  };
}

export const defaultFeedbackStore = {
  get dbPath() {
    return process.env.FEEDBACK_DB_PATH ?? DEFAULT_DB_PATH;
  },
  recordFeedback(feedbackRecord) {
    return getSingletonStore().recordFeedback(feedbackRecord);
  },
  getFeedbackStats() {
    return getSingletonStore().getFeedbackStats();
  },
  exportForTraining() {
    return getSingletonStore().exportForTraining();
  },
  getCalibrationReport() {
    return getSingletonStore().getCalibrationReport();
  }
};

export const recordFeedback = (feedbackRecord) => defaultFeedbackStore.recordFeedback(feedbackRecord);
export const getFeedbackStats = () => defaultFeedbackStore.getFeedbackStats();
export const exportForTraining = () => defaultFeedbackStore.exportForTraining();
export const getCalibrationReport = () => defaultFeedbackStore.getCalibrationReport();

function getSingletonStore() {
  const dbPath = process.env.FEEDBACK_DB_PATH ?? DEFAULT_DB_PATH;
  if (!singletonStore || singletonStore.dbPath !== dbPath) {
    singletonStore = createFeedbackStore(dbPath);
  }
  return singletonStore;
}

function runMigrations(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  const migrations = [{ version: 1, migrate: migrate_v0_to_v1 }];
  const pending = migrations.filter((migration) => migration.version > current);

  if (!pending.length) return;

  const migrate = db.transaction(() => {
    for (const migration of pending) {
      migration.migrate(db);
      db.pragma(`user_version = ${migration.version}`);
    }
  });
  migrate();
}

function migrate_v0_to_v1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      feedbackId TEXT PRIMARY KEY,
      applicationId TEXT NOT NULL,
      evaluatedAt TEXT NOT NULL,
      feedbackRecordedAt TEXT NOT NULL,
      source TEXT NOT NULL,
      decision TEXT NOT NULL,
      decisionMadeBy TEXT NOT NULL,
      aiWasCorrect INTEGER,
      confidenceAtDecision REAL,
      riskFlagsAtDecision TEXT NOT NULL,
      resumeSignalScoreAtDecision INTEGER,
      overrideReason TEXT,
      modelUsed TEXT NOT NULL,
      feedbackVersion TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_application_id ON feedback(applicationId);
    CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);

    DROP TRIGGER IF EXISTS prevent_feedback_update;
    CREATE TRIGGER prevent_feedback_update
    BEFORE UPDATE ON feedback
    BEGIN
      SELECT RAISE(ABORT, 'feedback records are append-only');
    END;

    -- Reserved for schema version 2 only:
    -- correctedFeedbackId UUID (points to the record being superseded)
    -- isCorrected BOOLEAN DEFAULT 0 (set on the original record)
  `);
}

function normalizeRecord(feedbackRecord) {
  return {
    ...feedbackRecord,
    aiWasCorrect: feedbackRecord.aiWasCorrect ?? null,
    confidenceAtDecision: feedbackRecord.confidenceAtDecision ?? null,
    riskFlagsAtDecision: Array.isArray(feedbackRecord.riskFlagsAtDecision) ? feedbackRecord.riskFlagsAtDecision : [],
    resumeSignalScoreAtDecision: feedbackRecord.resumeSignalScoreAtDecision ?? null,
    overrideReason: feedbackRecord.overrideReason ?? null,
    feedbackVersion: feedbackRecord.feedbackVersion || "1.0"
  };
}

function validateRecord(feedbackRecord) {
  if (validateFeedback(feedbackRecord)) return;
  const message = validateFeedback.errors
    .map((error) => `${error.instancePath.replace("/", "") || error.params?.missingProperty || "record"} ${error.message}`)
    .join("; ");
  throw new Error(`Invalid feedback record: ${message}`);
}

function toDbRecord(record) {
  return {
    ...record,
    aiWasCorrect: record.aiWasCorrect === null ? null : record.aiWasCorrect ? 1 : 0,
    riskFlagsAtDecision: JSON.stringify(record.riskFlagsAtDecision)
  };
}

function fromDbRecord(row) {
  return {
    ...row,
    aiWasCorrect: row.aiWasCorrect === null ? null : Boolean(row.aiWasCorrect),
    riskFlagsAtDecision: JSON.parse(row.riskFlagsAtDecision || "[]")
  };
}

function getAllRecords(db) {
  return db.prepare("SELECT * FROM feedback ORDER BY feedbackRecordedAt ASC, feedbackId ASC").all().map(fromDbRecord);
}

function featureVector(record) {
  return [
    record.resumeSignalScoreAtDecision ?? 0,
    record.confidenceAtDecision ?? 0,
    ...FLAG_COLUMNS.map((flag) => (record.riskFlagsAtDecision.includes(flag) ? 1 : 0)),
    SOURCE_ENCODING[record.source] ?? -1
  ];
}

function countBy(records, key) {
  return records.reduce((counts, record) => {
    counts[record[key]] = (counts[record[key]] || 0) + 1;
    return counts;
  }, {});
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function flagCoOccurrences(records) {
  const counts = new Map();
  for (const record of records) {
    const flags = [...new Set(record.riskFlagsAtDecision)].sort();
    for (let i = 0; i < flags.length; i += 1) {
      for (let j = i + 1; j < flags.length; j += 1) {
        const pair = `${flags[i]} + ${flags[j]}`;
        counts.set(pair, (counts.get(pair) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair));
}

function createStubStore(dbPath) {
  return {
    dbPath,
    stubMode: true,
    recordFeedback() {
      return null;
    },
    getFeedbackStats() {
      return {
        total: 0,
        aiCorrect: 0,
        aiIncorrect: 0,
        aiNull: 0,
        stubMode: true,
        reason: "better-sqlite3 unavailable"
      };
    },
    exportForTraining() {
      return null;
    },
    getCalibrationReport() {
      return null;
    }
  };
}

function logStubWarning(error) {
  if (stubWarningLogged) return;
  stubWarningLogged = true;
  process.stderr.write(
    `${JSON.stringify({
      level: "warn",
      module: "feedback-store",
      status: "degraded",
      reason: "better-sqlite3 unavailable",
      impact: "Feedback will not persist locally",
      error: error?.message || "forced stub mode"
    })}\n`
  );
}
