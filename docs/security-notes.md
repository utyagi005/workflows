# Security Notes

AutoApplyOps is a portfolio workflow, so the default repository is safe to share and intentionally does not include real credentials or raw applicant data.

## Current Controls

- Workflow export is inactive by default.
- No n8n credentials are embedded in `workflows/autoapplyops-intake.json`.
- `.gitignore` excludes `.env`, local n8n data, execution dumps, SQLite files, and credential exports.
- `npm run validate` checks the workflow JSON for required nodes and common secret markers.
- `sanitizeForLog` stores initials and email domain rather than full name or raw email.

## Production Hardening

- Add shared secret or HMAC validation before processing public webhook payloads.
- Reject duplicate events with an idempotency key such as `applicationId`.
- Keep n8n credential values in n8n credential storage or environment variables.
- Disable raw execution-data retention for sensitive workflows or set a short retention window.
- Do not send full payloads to Slack, email, or logs.
- Add an error branch that notifies the owner without exposing applicant PII.

## Manual Review Checklist

- Search for API keys, bearer tokens, personal emails, and webhook secrets before pushing.
- Confirm screenshots and videos use mock data only.
- Confirm exported workflow JSON contains no credential IDs tied to a private n8n account.
- Confirm test payloads are synthetic and safe to share.
