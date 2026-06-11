import test from "node:test";
import assert from "node:assert/strict";
import { evaluateApplication, sanitizeForLog } from "../src/scoring.mjs";

const NOW = "2026-06-10T12:00:00.000Z";

test("routes a strong internship lead to high priority", () => {
  const result = evaluateApplication(
    {
      applicationId: "demo-001",
      applicantName: "Demo Applicant",
      email: "demo.applicant@example.com",
      company: "Northstar Robotics",
      role: "Software Engineering Intern",
      deadline: "2026-06-16",
      location: "Remote",
      skills: ["JavaScript", "APIs", "automation", "PostgreSQL"],
      source: "career-page",
      notes: "Strong match for automation and backend workflow experience."
    },
    { now: NOW }
  );

  assert.equal(result.validationStatus, "valid");
  assert.equal(result.priority, "hot");
  assert.equal(result.route, "High Priority Follow-up");
  assert.ok(result.score >= 80);
  assert.deepEqual(result.skillMatches, ["javascript", "apis", "automation", "postgresql"]);
  assert.match(result.followUpDraft, /15-minute review/);
});

test("keeps medium fit applications in the review queue", () => {
  const result = evaluateApplication(
    {
      applicationId: "demo-002",
      applicantName: "Casey Review",
      company: "Civic Data Lab",
      role: "Operations Intern",
      deadline: "2026-07-10",
      location: "Hybrid",
      skills: ["documentation", "spreadsheets", "SQL", "automation", "API"],
      source: "job-board"
    },
    { now: NOW }
  );

  assert.equal(result.validationStatus, "valid");
  assert.equal(result.priority, "review");
  assert.equal(result.route, "Review Queue");
});

test("invalid payloads return validation details instead of throwing", () => {
  const result = evaluateApplication(
    {
      applicationId: "demo-003",
      company: "Missing Fields Inc.",
      source: "manual-entry"
    },
    { now: NOW }
  );

  assert.equal(result.validationStatus, "invalid");
  assert.equal(result.priority, "invalid");
  assert.equal(result.route, "Needs Manual Repair");
  assert.deepEqual(result.validationErrors.map((error) => error.field), ["role"]);
});

test("sanitized logs remove raw email and full name", () => {
  const sanitized = sanitizeForLog({
    applicationId: "demo-004",
    applicantName: "Private Person",
    email: "private.person@example.com",
    company: "Example Co",
    role: "Software Intern",
    source: "referral",
    deadline: "2026-06-20",
    location: "Remote",
    skills: ["javascript"],
    notes: "Confidential note",
    receivedAt: NOW
  });

  assert.equal(sanitized.applicant, "PP");
  assert.equal(sanitized.emailDomain, "example.com");
  assert.equal(Object.hasOwn(sanitized, "email"), false);
  assert.equal(Object.hasOwn(sanitized, "applicantName"), false);
});
