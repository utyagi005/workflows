import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { evaluateApplication, validateAiEvaluation } from "../lib/ai-evaluator.mjs";
import { evaluateApplication as scoreApplication } from "../src/scoring.mjs";

const NOW = "2026-06-10T12:00:00.000Z";
const schema = JSON.parse(readFileSync("schemas/autoapplyops-ai-evaluation.schema.json", "utf8"));

test("AI schema validates a complete mock evaluation and rejects partial output", () => {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const complete = {
    aiFitSummary: "Strong match for the automation role. The resume shows relevant workflow and API experience.",
    resumeSignalScore: 88,
    riskFlags: [{ flag: "role_scope_unclear", severity: "low" }],
    followUpTone: "warm",
    recommendedAction: "advance",
    confidence: 0.82,
    aiStatus: "available",
    modelUsed: "mock-gemma",
    evaluatedAt: "2026-06-10T12:00:00.000Z"
  };

  assert.equal(validate(complete), true);
  assert.equal(validate({ ...complete, confidence: 1.2 }), false);
  const { modelUsed, ...partial } = complete;
  assert.equal(validate(partial), false);
});

test("valid mock Ollama JSON response is accepted after schema validation", async () => {
  const { baseUrl, close, requests } = await createMockOllamaServer(async () => ({
    response: JSON.stringify({
      aiFitSummary: "Strong match for this automation internship. The resume shows useful API and workflow evidence.",
      resumeSignalScore: 91,
      riskFlags: [],
      followUpTone: "warm",
      recommendedAction: "advance",
      confidence: 0.88,
      aiStatus: "available",
      modelUsed: "gemma3:4b",
      evaluatedAt: "2026-06-10T12:00:00.000Z"
    })
  }));
  const restore = withEnv({ NODE_ENV: "test", OLLAMA_BASE_URL: baseUrl, AUTOAPPLYOPS_AI_MODEL: "gemma3:4b" });

  try {
    const scoringResult = scoreApplication(samplePayload(), { now: NOW });
    const result = await evaluateApplication(samplePayload(), scoringResult);

    assert.equal(result.aiStatus, "available");
    assert.equal(result.modelUsed, "gemma3:4b");
    assert.equal(result.recommendedAction, "advance");
    assert.equal(validateAiEvaluation(result).valid, true);
    assert.equal(requests.length, 1);
  } finally {
    restore();
    await close();
  }
});

test("bad JSON from Ollama triggers deterministic fallback", async () => {
  const { baseUrl, close } = await createMockOllamaServer(async () => ({ response: "{not json" }));
  const restore = withEnv({ NODE_ENV: "test", OLLAMA_BASE_URL: baseUrl });

  try {
    const scoringResult = scoreApplication(samplePayload(), { now: NOW });
    const result = await evaluateApplication(samplePayload(), scoringResult);

    assert.equal(result.aiStatus, "fallback");
    assert.equal(result.modelUsed, "rules-engine/v1");
    assert.equal(result.recommendedAction, "advance");
    assert.equal(validateAiEvaluation(result).valid, true);
  } finally {
    restore();
    await close();
  }
});

test("timeout over five seconds triggers fallback", async () => {
  const { baseUrl, close } = await createMockOllamaServer(
    async () => ({
      response: JSON.stringify({
        aiFitSummary: "This response arrives too late.",
        resumeSignalScore: 70,
        riskFlags: [],
        followUpTone: "neutral",
        recommendedAction: "hold",
        confidence: 0.7,
        aiStatus: "available",
        modelUsed: "slow-mock",
        evaluatedAt: "2026-06-10T12:00:00.000Z"
      })
    }),
    5200
  );
  const restore = withEnv({ NODE_ENV: "test", OLLAMA_BASE_URL: baseUrl });

  try {
    const scoringResult = scoreApplication(samplePayload(), { now: NOW });
    const started = Date.now();
    const result = await evaluateApplication(samplePayload(), scoringResult);

    assert.equal(result.aiStatus, "fallback");
    assert.ok(Date.now() - started < 5100);
  } finally {
    restore();
    await close();
  }
});

test("missing required AI fields trigger fallback instead of merging partial response", async () => {
  const { baseUrl, close } = await createMockOllamaServer(async () => ({
    response: JSON.stringify({
      aiFitSummary: "Partial response should not be used.",
      resumeSignalScore: 72,
      confidence: 0.7,
      aiStatus: "available",
      modelUsed: "mock"
    })
  }));
  const restore = withEnv({ NODE_ENV: "test", OLLAMA_BASE_URL: baseUrl });

  try {
    const scoringResult = scoreApplication(samplePayload(), { now: NOW });
    const result = await evaluateApplication(samplePayload(), scoringResult);

    assert.equal(result.aiStatus, "fallback");
    assert.equal(result.modelUsed, "rules-engine/v1");
    assert.equal(result.followUpTone, "warm");
  } finally {
    restore();
    await close();
  }
});

test("NODE_ENV=test with no mock base URL never calls real Ollama", async () => {
  const restore = withEnv({ NODE_ENV: "test", OLLAMA_BASE_URL: undefined });

  try {
    const scoringResult = scoreApplication(samplePayload(), { now: NOW });
    const result = await evaluateApplication(samplePayload(), scoringResult);

    assert.equal(result.aiStatus, "disabled");
    assert.equal(result.modelUsed, "rules-engine/v1");
  } finally {
    restore();
  }
});

function samplePayload(overrides = {}) {
  return {
    applicationId: "demo-ai-001",
    applicantName: "Avery Systems",
    email: "avery@example.com",
    company: "Northstar Robotics",
    role: "Software Engineering Intern",
    deadline: "2026-06-16",
    location: "Remote",
    skills: ["JavaScript", "APIs", "automation", "PostgreSQL"],
    source: "career-page",
    notes: "Built n8n-style workflow automations with API integrations.",
    ...overrides
  };
}

async function createMockOllamaServer(handler, delayMs = 0) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", async () => {
      requests.push({ url: request.url, method: request.method, body });
      const payload = await handler({ request, body });
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      }, delayMs);
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function withEnv(values) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
