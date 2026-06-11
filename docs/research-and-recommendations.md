# Research And Recommendations

## Sources Reviewed

- n8n workflow export/import documentation: https://docs.n8n.io/workflows/export-import/
- n8n CLI import documentation: https://docs.n8n.io/hosting/cli-commands/
- n8n Webhook node documentation: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
- n8n Webhook common issues on Test URL vs Production URL: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/common-issues/
- n8n Error handling documentation: https://docs.n8n.io/flow-logic/error-handling/
- n8n Error Trigger documentation: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/
- n8n Respond to Webhook documentation: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/
- n8n retry/rate-limit guidance: https://docs.n8n.io/integrations/builtin/rate-limits/
- n8n memory guidance warning to avoid oversized Code-node processing: https://docs.n8n.io/hosting/scaling/memory-errors/

## Recommendations Implemented

| Recommendation | Why it matters | Implementation |
| --- | --- | --- |
| Keep workflows importable JSON | n8n supports JSON export/import for sharing and review. | `workflows/autoapplyops-intake.json`, `workflows/autoapplyops-error-handler.json` |
| Keep shared workflows inactive | Imported workflows should not immediately run in another environment. | Validation asserts `active: false`. |
| Separate production error handling | n8n supports workflow-level error workflows starting with Error Trigger. | Dedicated `AutoApplyOps - Error Handler` workflow. |
| Make webhook behavior explicit | n8n uses different Test and Production URLs. | README and operations runbook document test vs production use. |
| Return one clear webhook response | Respond to Webhook uses the first incoming item and should be deliberate. | One response node returns the triage report. |
| Avoid credential leakage | n8n workflows may be shared; secrets belong in credentials/env vars. | `.gitignore`, validator secret scan, no credential exports. |
| Explain every decision | Recruiters and reviewers need to audit automation logic. | `decisionMatrix`, `reasonCodes`, `automationHints`. |
| Add idempotency pattern | Webhooks can replay; duplicate handling prevents repeated follow-ups. | `knownApplicationIds` and `Duplicate Review` route. |
| Add repeatable evidence | A strong portfolio repo should prove behavior without private accounts. | `npm run verify`, simulation report, screenshots, GIF, MP4. |

## Remaining Production Recommendations

- Replace the demo shared-secret check with signed HMAC verification at the edge of the workflow.
- Persist idempotency keys outside the payload config using n8n Data Tables, Redis, Postgres, Airtable, or Sheets.
- Replace action-stub Code nodes with real Slack, email, task, or database nodes once credentials are available.
- Split very large future logic into sub-workflows or data nodes instead of growing a single Code node indefinitely.
- Add node-level retry settings on outbound HTTP/API nodes when real integrations are connected.
