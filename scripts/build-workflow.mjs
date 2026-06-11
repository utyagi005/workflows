import { mkdirSync, writeFileSync } from "node:fs";

const scoringCode = String.raw`
const DEFAULT_TARGET_SKILLS = ["javascript", "typescript", "node", "api", "apis", "automation", "n8n", "postgresql", "python", "sql", "webhook", "react"];
const REQUIRED_FIELDS = ["applicationId", "company", "role", "source"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeSkillList(skills) {
  const list = Array.isArray(skills) ? skills : typeof skills === "string" ? skills.split(",") : [];
  return [...new Set(list.map((skill) => clean(skill).toLowerCase()).filter(Boolean))];
}

function normalizePayload(payload = {}) {
  const body = payload.body && typeof payload.body === "object" ? payload.body : payload;
  return {
    applicationId: clean(body.applicationId || body.id || body.leadId),
    applicantName: clean(body.applicantName || body.name || "Demo Applicant"),
    email: clean(body.email),
    company: clean(body.company),
    role: clean(body.role || body.title),
    source: clean(body.source || "manual-entry"),
    deadline: clean(body.deadline || body.applyBy),
    location: clean(body.location || "Unknown"),
    skills: normalizeSkillList(body.skills),
    notes: clean(body.notes || body.resume_text || body.summary),
    receivedAt: clean(body.receivedAt || body.received_at) || new Date().toISOString()
  };
}

function validatePayload(normalized) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!normalized[field]) errors.push({ field, message: field + " is required" });
  }
  if (normalized.email && !EMAIL_RE.test(normalized.email)) {
    errors.push({ field: "email", message: "email must be valid when provided" });
  }
  if (normalized.deadline && Number.isNaN(Date.parse(normalized.deadline))) {
    errors.push({ field: "deadline", message: "deadline must be a valid date when provided" });
  }
  return { valid: errors.length === 0, errors };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreDeadline(deadline, now) {
  if (!deadline) return { points: 8, reason: "deadline_missing_review", daysUntilDeadline: null };
  const days = Math.ceil((new Date(deadline) - now) / 86400000);
  if (days < 0) return { points: 0, reason: "deadline_expired", daysUntilDeadline: days };
  if (days <= 7) return { points: 25, reason: "deadline_urgent", daysUntilDeadline: days };
  if (days <= 21) return { points: 18, reason: "deadline_soon", daysUntilDeadline: days };
  return { points: 12, reason: "deadline_open", daysUntilDeadline: days };
}

function scoreSkills(skills, targetSkills) {
  const matches = skills.filter((skill) => targetSkills.includes(skill));
  const ratio = targetSkills.length ? matches.length / Math.min(targetSkills.length, 6) : 0;
  return { points: clamp(Math.round(ratio * 30), 0, 30), matches, reason: matches.length ? "skill_match_" + matches.length : "skill_match_none" };
}

function scoreRole(role) {
  const value = role.toLowerCase();
  if (value.includes("software") || value.includes("developer") || value.includes("automation")) return { points: 20, reason: "role_high_fit" };
  if (value.includes("data") || value.includes("operations") || value.includes("analyst")) return { points: 14, reason: "role_medium_fit" };
  return { points: 7, reason: "role_low_fit" };
}

function scoreLocation(location) {
  const value = location.toLowerCase();
  if (value.includes("remote")) return { points: 10, reason: "location_remote" };
  if (value.includes("toronto") || value.includes("hybrid")) return { points: 7, reason: "location_workable" };
  return { points: 4, reason: "location_needs_review" };
}

function scoreCompleteness(normalized) {
  const present = ["email", "deadline", "location", "skills", "notes"].filter((field) => {
    const value = normalized[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
  return { points: present >= 4 ? 10 : present >= 2 ? 6 : 2, reason: "payload_complete_" + present };
}

function scoreSource(source) {
  const value = source.toLowerCase();
  if (value.includes("referral") || value.includes("career")) return { points: 5, reason: "source_high_signal" };
  if (value.includes("linkedin") || value.includes("job")) return { points: 3, reason: "source_medium_signal" };
  return { points: 1, reason: "source_manual_or_unknown" };
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function sanitizeForLog(normalized) {
  return {
    applicationId: normalized.applicationId,
    applicant: normalized.applicantName ? initials(normalized.applicantName) : "unknown",
    emailDomain: normalized.email && EMAIL_RE.test(normalized.email) ? normalized.email.split("@")[1] : null,
    company: normalized.company,
    role: normalized.role,
    source: normalized.source,
    deadline: normalized.deadline || null,
    location: normalized.location,
    skills: normalized.skills,
    notesLength: normalized.notes ? normalized.notes.length : 0,
    receivedAt: normalized.receivedAt
  };
}

function humanList(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items.at(-1);
}

function draftFollowUp(normalized, priority, matches) {
  const greeting = normalized.applicantName ? "Hi " + normalized.applicantName.split(" ")[0] + "," : "Hi there,";
  const matchText = matches.length
    ? "Your background in " + humanList(matches) + " lines up well with this " + normalized.role + " opportunity."
    : "Thanks for sharing your interest in the " + normalized.role + " opportunity.";
  const ask = priority === "hot"
    ? "Could you do a quick 15-minute review today or tomorrow so we can move before the deadline?"
    : "I added this to the review queue and will follow up with next steps after the next batch review.";
  return greeting + "\n\n" + matchText + "\n\n" + ask + "\n\nBest,\nAutoApplyOps";
}

const now = new Date();
const normalized = normalizePayload($json);
const validation = validatePayload(normalized);

let result;
if (!validation.valid) {
  result = {
    applicationId: normalized.applicationId || "unassigned",
    validationStatus: "invalid",
    validationErrors: validation.errors,
    score: 0,
    priority: "invalid",
    route: "Needs Manual Repair",
    reasonCodes: validation.errors.map((error) => "missing_or_invalid_" + error.field),
    sanitizedPayload: sanitizeForLog(normalized),
    followUpDraft: "Payload needs required fields before a follow-up can be drafted."
  };
} else {
  const targetSkills = DEFAULT_TARGET_SKILLS;
  const deadlineSignal = scoreDeadline(normalized.deadline, now);
  const skillSignal = scoreSkills(normalized.skills, targetSkills);
  const roleSignal = scoreRole(normalized.role);
  const locationSignal = scoreLocation(normalized.location);
  const completenessSignal = scoreCompleteness(normalized);
  const sourceSignal = scoreSource(normalized.source);
  const score = clamp(deadlineSignal.points + skillSignal.points + roleSignal.points + locationSignal.points + completenessSignal.points + sourceSignal.points, 0, 100);
  const priority = score >= 80 ? "hot" : score >= 55 ? "review" : "low";
  const route = priority === "hot" ? "High Priority Follow-up" : priority === "review" ? "Review Queue" : "Archive with Weekly Digest";
  result = {
    applicationId: normalized.applicationId,
    validationStatus: "valid",
    validationErrors: [],
    score,
    priority,
    route,
    reasonCodes: [deadlineSignal.reason, skillSignal.reason, roleSignal.reason, locationSignal.reason, completenessSignal.reason, sourceSignal.reason].filter(Boolean),
    skillMatches: skillSignal.matches,
    deadlineDays: deadlineSignal.daysUntilDeadline,
    sanitizedPayload: sanitizeForLog(normalized),
    followUpDraft: draftFollowUp(normalized, priority, skillSignal.matches)
  };
}

result.auditTrail = [
  { at: now.toISOString(), event: "webhook_received" },
  { at: now.toISOString(), event: validation.valid ? "payload_validated" : "payload_rejected" },
  { at: now.toISOString(), event: "candidate_scored_" + result.score },
  { at: now.toISOString(), event: "route_" + result.route.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") }
];

return [{ json: result }];
`.trim();

const workflow = {
  name: "AutoApplyOps - Internship Application Triage",
  nodes: [
    {
      parameters: {
        content:
          "AutoApplyOps accepts a sanitized internship application payload, validates required fields, scores fit, routes priority, and returns a follow-up draft.",
        height: 220,
        width: 340,
        color: 4
      },
      id: "f5c71f76-7bb9-4867-8d4c-08a3dc2ad1e9",
      name: "Workflow Overview",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-1120, -260]
    },
    {
      parameters: {
        httpMethod: "POST",
        path: "autoapplyops/intake",
        responseMode: "responseNode",
        options: {
          allowedOrigins: "*"
        }
      },
      id: "6a7c8ad2-40e8-43cb-8c02-8ecb9a3180bb",
      name: "Webhook Intake",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-900, 80],
      webhookId: "autoapplyops-intake"
    },
    {
      parameters: {
        jsCode: scoringCode
      },
      id: "412dd6f5-9c40-4b52-8ebf-7e5a4e032ef7",
      name: "Validate + Score Application",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-620, 80]
    },
    {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: {
                  caseSensitive: true,
                  leftValue: "",
                  typeValidation: "strict",
                  version: 2
                },
                conditions: [
                  {
                    leftValue: "={{ $json.priority }}",
                    rightValue: "hot",
                    operator: {
                      type: "string",
                      operation: "equals"
                    }
                  }
                ],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Hot Lead"
            },
            {
              conditions: {
                options: {
                  caseSensitive: true,
                  leftValue: "",
                  typeValidation: "strict",
                  version: 2
                },
                conditions: [
                  {
                    leftValue: "={{ $json.priority }}",
                    rightValue: "review",
                    operator: {
                      type: "string",
                      operation: "equals"
                    }
                  }
                ],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Review Queue"
            },
            {
              conditions: {
                options: {
                  caseSensitive: true,
                  leftValue: "",
                  typeValidation: "strict",
                  version: 2
                },
                conditions: [
                  {
                    leftValue: "={{ $json.priority }}",
                    rightValue: "invalid",
                    operator: {
                      type: "string",
                      operation: "equals"
                    }
                  }
                ],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Invalid"
            }
          ]
        },
        options: {
          fallbackOutput: "extra",
          renameFallbackOutput: "Low Priority"
        }
      },
      id: "d3bec2cd-9c6f-4e58-a0c5-619e04cb6bf9",
      name: "Route Priority",
      type: "n8n-nodes-base.switch",
      typeVersion: 3.2,
      position: [-330, 80]
    },
    {
      parameters: {
        jsCode:
          "return items.map((item) => ({ json: { ...item.json, notificationChannel: 'fast-response', ownerAction: 'Review today and send follow-up draft' } }));"
      },
      id: "69e12fab-e110-4c1a-91dc-d2e0c165d642",
      name: "Hot Lead Action",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-20, -120]
    },
    {
      parameters: {
        jsCode:
          "return items.map((item) => ({ json: { ...item.json, notificationChannel: 'batch-review', ownerAction: 'Review during the next application batch' } }));"
      },
      id: "6829d2d5-cd7a-4835-bd7e-927ef195e0cc",
      name: "Review Queue Action",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-20, 80]
    },
    {
      parameters: {
        jsCode:
          "return items.map((item) => ({ json: { ...item.json, notificationChannel: 'manual-repair', ownerAction: 'Fix required fields and replay payload' } }));"
      },
      id: "0ebd0d5e-1d9a-4b12-858d-23ac7121b388",
      name: "Invalid Payload Action",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-20, 280]
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: "={{ $json }}",
        options: {
          responseCode: "={{ $json.validationStatus === 'invalid' ? 422 : 200 }}"
        }
      },
      id: "5dfdb7cc-3501-4be6-ad09-22fccf14cb6c",
      name: "Respond with Triage Report",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [290, 80]
    }
  ],
  connections: {
    "Webhook Intake": {
      main: [
        [
          {
            node: "Validate + Score Application",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Validate + Score Application": {
      main: [
        [
          {
            node: "Route Priority",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Route Priority": {
      main: [
        [
          {
            node: "Hot Lead Action",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Review Queue Action",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Invalid Payload Action",
            type: "main",
            index: 0
          }
        ],
        [
          {
            node: "Review Queue Action",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Hot Lead Action": {
      main: [
        [
          {
            node: "Respond with Triage Report",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Review Queue Action": {
      main: [
        [
          {
            node: "Respond with Triage Report",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Invalid Payload Action": {
      main: [
        [
          {
            node: "Respond with Triage Report",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  },
  active: false,
  settings: {
    executionOrder: "v1",
    saveManualExecutions: true
  },
  versionId: "autoapplyops-v1",
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: "portfolio-demo"
  },
  tags: [
    {
      name: "portfolio"
    },
    {
      name: "internship"
    }
  ]
};

mkdirSync("workflows", { recursive: true });
writeFileSync("workflows/autoapplyops-intake.json", `${JSON.stringify(workflow, null, 2)}\n`);
console.log("Generated workflows/autoapplyops-intake.json");
