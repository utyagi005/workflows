# AutoApplyOps Operations Runbook

## Production Setup Checklist

1. Import `workflows/autoapplyops-intake.json`.
2. Import `workflows/autoapplyops-error-handler.json`.
3. In the main workflow settings, select **AutoApplyOps - Error Handler** as the error workflow.
4. Keep both workflows inactive until testing is complete.
5. Use the n8n Test URL while building and the Production URL only after publishing.
6. Set `AUTOAPPLYOPS_WEBHOOK_SECRET` in the n8n environment for simple shared-secret demo protection.
7. For a real public workflow, replace shared-secret checking with signed HMAC verification.
8. Store idempotency keys in a persistent system such as n8n Data Tables, Redis, Postgres, Airtable, or Sheets.

## Test Matrix

| Case | Sample | Expected result |
| --- | --- | --- |
| Hot lead | `samples/high-priority-application.json` | `valid`, `hot`, `High Priority Follow-up` |
| Review queue | `samples/review-application.json` | `valid`, `review`, `Review Queue` |
| Invalid payload | `samples/invalid-application.json` | `invalid`, `Needs Manual Repair` |
| Duplicate replay | `samples/duplicate-application.json` | `valid`, `duplicate`, `Duplicate Review` |
| Secret failure | `samples/secret-failure-application.json` | `invalid`, `Needs Manual Repair` |
| Tuned profile | `samples/tuned-weights-application.json` | `valid`, `review`, score explanation changes |

## Failure Response

When the main workflow errors:

- The error workflow should produce a sanitized owner-alert payload.
- Do not send raw applicant payloads into Slack, email, or public issue trackers.
- Open the failed execution in n8n, inspect only the fields needed to debug, then retry with the currently saved workflow after patching.

## Retention Guidance

- Keep execution data only as long as needed for debugging.
- Prefer sanitized reports over raw applicant payloads.
- Rotate webhook secrets after demos, screen recordings, or shared testing.

## Portfolio Evidence

Regenerate evidence before presenting:

```bash
npm run verify
npm run screenshots
npm run demo:video
```

The generated reports live in `docs/reports/`.
