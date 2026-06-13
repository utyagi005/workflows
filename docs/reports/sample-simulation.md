# AutoApplyOps Sample Simulation

| Sample | Status | Priority | Route | Score | Next step |
| --- | --- | --- | --- | ---: | --- |
| `high-priority-application.json` | valid | hot | High Priority Follow-up | 90 | send_follow_up_for_human_approval |
| `review-application.json` | valid | review | Review Queue | 61 | batch_review |
| `invalid-application.json` | invalid | invalid | Needs Manual Repair | 0 | repair_payload |
| `duplicate-application.json` | valid | duplicate | Duplicate Review | 45 | merge_or_discard_duplicate |
| `secret-failure-application.json` | invalid | invalid | Needs Manual Repair | 0 | repair_payload |
| `tuned-weights-application.json` | valid | review | Review Queue | 70 | batch_review |
| `ai-success-application.json` | valid | hot | High Priority Follow-up | 100 | send_follow_up_for_human_approval |
| `ai-fallback-application.json` | valid | review | Review Queue | 56 | batch_review |
| `human-review-application.json` | valid | review | Review Queue | 61 | batch_review |
| `risky-payload-application.json` | valid | hot | High Priority Follow-up | 90 | send_follow_up_for_human_approval |
