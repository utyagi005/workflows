# Import And Test Guide

## Import

Use `workflows/autoapplyops-intake.json`.

In n8n UI:

1. Open n8n.
2. Choose **Import from File** from the workflow menu.
3. Select `workflows/autoapplyops-intake.json`.
4. Keep the workflow inactive until you are ready to test.

With n8n CLI:

```bash
n8n import:workflow --input=workflows/autoapplyops-intake.json
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

## Local Project Verification

```bash
npm install
npm run verify
npm run screenshots
npm run demo:video
```

The local demo does not replace n8n testing, but it proves the scoring logic, sample payloads, screenshots, and demo video can be recreated without private credentials.
