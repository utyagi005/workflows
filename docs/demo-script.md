# AutoApplyOps Demo Script

## Demo Goal

Show how AutoApplyOps turns an incoming internship application lead into a validated, scored, routed, and documented follow-up workflow. The demo should make the automation easy to understand in under three minutes.

## Audience

This demo is intended for portfolio reviewers, recruiters, hiring managers, and technical peers who want to see practical n8n automation skills applied to a realistic operations problem.

## Runtime

Target length: 2 to 3 minutes.

## Recording Plan

### 1. Opening Shot

Show the n8n workflow canvas and introduce the project:

> AutoApplyOps is an n8n automation for internship application triage. It receives application payloads through a webhook, validates the data, scores the opportunity, routes high-priority items, logs a sanitized report, and drafts follow-up messages.

Keep the camera on the workflow canvas long enough for viewers to see the main stages.

### 2. Webhook Intake

Show the webhook trigger and a sample incoming payload. Use non-sensitive mock data.

Call out the key fields:

- Applicant or lead identifier
- Company
- Role
- Deadline
- Location or remote status
- Relevant skills
- Source channel

Narration:

> The workflow starts with a structured webhook payload. This keeps intake flexible while still giving the workflow enough information to validate and prioritize the application.

### 3. Validation Step

Show the validation logic or node output. Demonstrate one valid payload and briefly mention how incomplete payloads are handled.

Narration:

> Before scoring, AutoApplyOps checks that required fields are present. Invalid or incomplete records do not break the workflow; they produce a clear validation result so the issue can be reviewed.

### 4. Scoring Step

Show the scoring output for a high-priority sample.

Suggested visible fields:

- `score`
- `priority`
- `reasonCodes`
- `deadlineUrgency`
- `skillMatch`

Narration:

> The scoring step converts raw intake details into a transparent priority decision. The goal is not to hide the logic, but to make the triage decision easy to audit.

### 5. Routing Step

Show the branch or route for high-priority applications.

Narration:

> High-priority applications move into a faster response path. Medium and low-priority records can still be logged for later review, so every lead gets a consistent outcome.

### 6. Sanitized JSON Report

Show the generated JSON report. Avoid showing real personal information.

Recommended fields to highlight:

- `applicationId`
- `validationStatus`
- `score`
- `priority`
- `route`
- `reasonCodes`
- `sanitizedPayload`
- `followUpStatus`

Narration:

> The report is sanitized so the workflow keeps useful operational context without retaining unnecessary personal data.

### 7. Follow-Up Message

Show the generated follow-up message or draft output.

Narration:

> AutoApplyOps also prepares follow-up copy, which reduces repetitive writing while keeping a human in control of the final send.

### 8. Closing Shot

Return to the full workflow canvas or a summary screen.

Closing narration:

> This project demonstrates webhook automation, validation, scoring, conditional routing, privacy-aware reporting, and follow-up generation in a single n8n workflow.

## Suggested Sample Payloads

### High Priority

```json
{
  "applicationId": "demo-001",
  "applicantName": "Demo Applicant",
  "email": "demo.applicant@example.com",
  "company": "Northstar Robotics",
  "role": "Software Engineering Intern",
  "deadline": "2026-06-18",
  "location": "Remote",
  "skills": ["JavaScript", "APIs", "automation", "PostgreSQL"],
  "source": "career-page",
  "notes": "Strong match for automation and backend workflow experience."
}
```

### Needs Review

```json
{
  "applicationId": "demo-002",
  "company": "Civic Data Lab",
  "role": "Operations Intern",
  "deadline": "2026-07-10",
  "location": "Hybrid",
  "skills": ["documentation", "spreadsheets"],
  "source": "job-board"
}
```

### Invalid Or Incomplete

```json
{
  "applicationId": "demo-003",
  "company": "Missing Fields Inc.",
  "source": "manual-entry"
}
```

## Shot Checklist

- n8n workflow canvas
- Webhook payload
- Validation result
- Score and priority output
- High-priority routing branch
- Sanitized JSON report
- Follow-up message draft
- Final workflow summary

## Media Notes

- Use mock data only.
- Blur or crop credentials, webhook URLs, API keys, and private account details.
- Keep the workflow canvas readable by zooming into each section before explaining it.
- Use captions or brief on-screen labels for each stage.
- Keep the final video focused on outcome and decision flow, not every node setting.
