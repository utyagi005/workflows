# Security Notes

AutoApplyOps is a portfolio workflow, so the default repository is safe to share and intentionally does not include real credentials or raw applicant data.

## Current Controls

- Workflow export is inactive by default.
- No n8n credentials are embedded in `workflows/autoapplyops-intake.json`.
- `.gitignore` excludes `.env`, local n8n data, execution dumps, SQLite files, and credential exports.
- `npm run validate` checks the workflow JSON for required nodes and common secret markers.
- `sanitizeForLog` stores initials and email domain rather than full name or raw email.
- Optional shared-secret checking can reject public webhook payloads before routing.
- Duplicate `applicationId` values can route to a merge/discard review path rather than creating repeated follow-ups.
- A dedicated error workflow sanitizes failure context before building an owner-alert payload.

## Production Hardening

- Replace the portfolio shared-secret check with HMAC signature validation before processing public webhook payloads.
- Persist idempotency keys such as `applicationId` in n8n Data Tables, Redis, Postgres, Airtable, or Sheets.
- Keep n8n credential values in n8n credential storage or environment variables.
- Disable raw execution-data retention for sensitive workflows or set a short retention window.
- Do not send full payloads to Slack, email, or logs.
- Add an error branch that notifies the owner without exposing applicant PII.

## Manual Review Checklist

- Search for API keys, bearer tokens, personal emails, and webhook secrets before pushing.
- Confirm screenshots and videos use mock data only.
- Confirm exported workflow JSON contains no credential IDs tied to a private n8n account.
- Confirm test payloads are synthetic and safe to share.
- Confirm the error-handler workflow is configured in n8n before production activation.
