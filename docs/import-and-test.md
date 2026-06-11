# Import And Test Guide

## Import

Use both workflow exports:

- `workflows/autoapplyops-intake.json`
- `workflows/autoapplyops-error-handler.json`

In n8n UI:

1. Open n8n.
2. Choose **Import from File** from the workflow menu.
3. Select `workflows/autoapplyops-intake.json`.
4. Select `workflows/autoapplyops-error-handler.json`.
5. In the main workflow settings, set the error workflow to **AutoApplyOps - Error Handler**.
6. Keep both workflows inactive until you are ready to test.

With n8n CLI:

```bash
n8n import:workflow --input=workflows/autoapplyops-intake.json
n8n import:workflow --input=workflows/autoapplyops-error-handler.json
```

For a directory of JSON workflow files:

```bash
n8n import:workflow --separate --input=workflows/
```

## Manual Test Payloads

Use these files:

- `samples/high-priority-application.json`
- `samples/review-application.json`
- `samples/invalid-application.json`

Example webhook request:

```bash
curl -X POST "$N8N_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  --data @samples/high-priority-application.json
```

## Expected Paths

| Sample | Expected status | Expected priority | Expected route |
| --- | --- | --- | --- |
| `high-priority-application.json` | `valid` | `hot` | `High Priority Follow-up` |
| `review-application.json` | `valid` | `review` | `Review Queue` |
| `invalid-application.json` | `invalid` | `invalid` | `Needs Manual Repair` |

## Optional Runtime Config

AutoApplyOps can accept a `config` object in the webhook payload:

```json
{
  "config": {
    "targetSkills": ["javascript", "api", "automation", "n8n"],
    "weights": {
      "deadline": 20,
      "skills": 40,
      "role": 20,
      "location": 10,
      "completeness": 5,
      "source": 5
    },
    "knownApplicationIds": ["demo-001"],
    "requireSharedSecret": true,
    "expectedSharedSecret": "expected-secret"
  }
}
```

This lets reviewers test flexibility without editing the workflow JSON.

## Extra Cases To Try

- Duplicate path: send a payload with `config.knownApplicationIds` containing that payload's `applicationId`.
- Shared-secret failure: set `config.requireSharedSecret` to `true` and send the wrong `sharedSecret`.
- Weight tuning: increase `config.weights.skills` and inspect the `decisionMatrix`.

## Local Project Verification

```bash
npm install
npm run verify
npm run screenshots
npm run demo:video
```

The local demo does not replace n8n testing, but it proves the scoring logic, sample payloads, screenshots, GIF preview, and demo video can be recreated without private credentials.

## Generated Evidence

`npm run verify` writes:

- `docs/reports/sample-simulation.json`
- `docs/reports/sample-simulation.md`
- `docs/reports/workflow-scorecard.md`
