import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sharedScoringSource = readFileSync("src/scoring.mjs", "utf8").replaceAll("export function", "function");
const scoringCode = `${sharedScoringSource}

const config = $json.config && typeof $json.config === "object" ? $json.config : {};
const runtimeOptions = {
  targetSkills: $json.targetSkills || config.targetSkills || DEFAULT_TARGET_SKILLS,
  weights: $json.weights || config.weights || DEFAULT_WEIGHTS,
  knownApplicationIds: $json.knownApplicationIds || config.knownApplicationIds || [],
  requireSharedSecret: Boolean($json.requireSharedSecret || config.requireSharedSecret),
  expectedSharedSecret: $json.expectedSharedSecret || config.expectedSharedSecret || $env.AUTOAPPLYOPS_WEBHOOK_SECRET || ""
};

return [{ json: evaluateApplication($json, runtimeOptions) }];
`.trim();

const workflow = {
  name: "AutoApplyOps - Internship Application Triage",
  nodes: [
    {
      parameters: {
        content:
          "AutoApplyOps accepts a sanitized internship application payload, validates required fields, applies configurable scoring weights, detects duplicate IDs, routes priority, and returns a follow-up draft with automation hints.",
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
                    rightValue: "duplicate",
                    operator: {
                      type: "string",
                      operation: "equals"
                    }
                  }
                ],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Duplicate"
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
        jsCode:
          "return items.map((item) => ({ json: { ...item.json, notificationChannel: 'duplicate-review', ownerAction: 'Merge duplicate record or discard replayed webhook event' } }));"
      },
      id: "6a2797c3-d1a9-481e-b415-b6a1ed2646de",
      name: "Duplicate Review Action",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-20, 470]
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
            node: "Duplicate Review Action",
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
    },
    "Duplicate Review Action": {
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

const errorWorkflow = {
  name: "AutoApplyOps - Error Handler",
  nodes: [
    {
      parameters: {
        content:
          "Attach this workflow in AutoApplyOps workflow settings as the Error workflow. It starts from Error Trigger, sanitizes the failure context, and creates an owner-alert payload without leaking raw applicant data.",
        height: 220,
        width: 360,
        color: 5
      },
      id: "b40aa732-42a5-4800-9189-09f0a0f88a44",
      name: "Error Handler Note",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-760, -240]
    },
    {
      parameters: {},
      id: "2a9220b0-5a4f-4e1e-b1e6-cacbd6bf3701",
      name: "Error Trigger",
      type: "n8n-nodes-base.errorTrigger",
      typeVersion: 1,
      position: [-720, 40]
    },
    {
      parameters: {
        jsCode: `
return items.map((item) => {
  const payload = item.json || {};
  const execution = payload.execution || {};
  const workflow = payload.workflow || {};
  const error = payload.error || {};
  return {
    json: {
      alertType: "autoapplyops_workflow_error",
      workflowName: workflow.name || "AutoApplyOps",
      executionId: execution.id || "unknown",
      failedAt: new Date().toISOString(),
      errorName: error.name || "WorkflowError",
      errorMessage: String(error.message || "Unknown error").slice(0, 300),
      ownerAction: "Open the failed execution, inspect sanitized input, repair config or payload, then retry with currently saved workflow.",
      piiPolicy: "Do not paste raw applicant payloads into chat/email alerts."
    }
  };
});
`.trim()
      },
      id: "4517da79-1eb5-40d6-9f34-02dc520d38ce",
      name: "Sanitize Error Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-440, 40]
    },
    {
      parameters: {
        jsCode:
          "return items.map((item) => ({ json: { ...item.json, notificationChannel: 'workflow-owner', notificationStub: `[AutoApplyOps] ${item.json.workflowName} failed in execution ${item.json.executionId}: ${item.json.errorMessage}` } }));"
      },
      id: "69b18c16-d117-4a75-a83d-863e0ef6a630",
      name: "Build Owner Alert",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-160, 40]
    }
  ],
  connections: {
    "Error Trigger": {
      main: [
        [
          {
            node: "Sanitize Error Context",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Sanitize Error Context": {
      main: [
        [
          {
            node: "Build Owner Alert",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  },
  active: false,
  settings: {
    executionOrder: "v1"
  },
  versionId: "autoapplyops-error-v1",
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: "portfolio-demo"
  },
  tags: [
    {
      name: "portfolio"
    },
    {
      name: "error-handling"
    }
  ]
};

const mainWorkflow = {
  ...workflow,
  name: "AutoApplyOps - Main Deterministic Triage",
  versionId: "autoapplyops-main-v1",
  nodes: [
    {
      parameters: {
        content:
          "// Intentional duplication — autoapplyops-intake.json is frozen for backwards compatibility. See docs/ai-architecture.md.\n\nThis canonical main export mirrors the deterministic intake flow and marks where the optional AI Copilot workflow slots in after validation.",
        height: 220,
        width: 380,
        color: 6
      },
      id: "3d353319-9156-4417-8be8-ad0b784e8a64",
      name: "Backwards Compatibility Contract",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-1260, 20]
    },
    {
      parameters: {
        content:
          "Optional AI enrichment slot: after Validate + Score Application succeeds, call AutoApplyOps - AI Copilot if local Ollama is available. The deterministic route remains the fallback and source of truth.",
        height: 180,
        width: 340,
        color: 7
      },
      id: "777e6fc8-dfd3-4838-9e3c-298a1d08d29b",
      name: "AI Copilot Slot",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-630, -170]
    },
    ...workflow.nodes
  ]
};

const aiCopilotWorkflow = {
  name: "AutoApplyOps - AI Copilot",
  nodes: [
    {
      parameters: {
        content:
          "Credential-safe AI Copilot export. Ollama is called through HTTP Request at http://localhost:11434/api/generate. If Ollama is down, slow, or returns invalid JSON, the workflow falls back to the deterministic route and marks aiStatus=fallback.",
        height: 240,
        width: 380,
        color: 7
      },
      id: "7a459f9f-5a8e-4e61-8d3d-1c53a47f830f",
      name: "Fallback Behavior Note",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [-1180, -300]
    },
    {
      parameters: {
        content:
          "Human Review uses the n8n Wait-node resume-webhook pattern. A reviewer approves, rejects, or archives from the resume URL; that resolution is the feedback collection point for ML readiness.",
        height: 220,
        width: 360,
        color: 5
      },
      id: "b5837f37-8b35-4ab7-b93a-1ef6dc0f2f72",
      name: "Human Review Resume Note",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [380, -300]
    },
    {
      parameters: {
        httpMethod: "POST",
        path: "autoapplyops/ai-copilot",
        responseMode: "lastNode",
        options: {
          allowedOrigins: "*"
        }
      },
      id: "bde7bd3b-85b1-4429-960c-593ee3d9db7f",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-1000, 80],
      webhookId: "autoapplyops-ai-copilot"
    },
    {
      parameters: {
        jsCode: `
const required = ["applicationId", "company", "role", "source"];
const missing = required.filter((field) => !$json[field]);
return [{ json: { ...$json, validationStatus: missing.length ? "invalid" : "valid", validationErrors: missing } }];
`.trim()
      },
      id: "08f83ea3-1d07-40a3-a1b8-46d5cc908be6",
      name: "Validate Payload",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-740, 80]
    },
    {
      parameters: {
        jsCode: scoringCode.replace("return [{ json: evaluateApplication($json, runtimeOptions) }];", "const scoringResult = evaluateApplication($json, runtimeOptions);\nreturn [{ json: { ...$json, scoringResult } }];")
      },
      id: "f65d2e4f-8214-4e51-a197-9a0c7a2f36c48",
      name: "Deterministic Score",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-480, 80]
    },
    {
      parameters: {
        method: "POST",
        url: "={{ $env.OLLAMA_BASE_URL || 'http://localhost:11434' }}/api/generate",
        sendBody: true,
        contentType: "json",
        jsonBody:
          "={{ { model: $env.AUTOAPPLYOPS_AI_MODEL || 'gemma3:4b', stream: false, format: 'json', prompt: JSON.stringify({ sanitizedPayload: $json.scoringResult.sanitizedPayload, deterministicScore: $json.scoringResult.score, route: $json.scoringResult.route, requiredShape: { aiFitSummary: '1-3 sentence plain summary', resumeSignalScore: 0, riskFlags: [], followUpTone: 'neutral', recommendedAction: 'hold', confidence: 0.55, aiStatus: 'available', modelUsed: $env.AUTOAPPLYOPS_AI_MODEL || 'gemma3:4b', evaluatedAt: new Date().toISOString() } }) } }}",
        options: {
          timeout: 5000,
          response: {
            response: {
              neverError: true
            }
          }
        }
      },
      id: "c1df1a13-8e47-42b9-8a61-0a7fdc6e06d6",
      name: "AI Evaluate",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [-210, 80],
      notesInFlow: true,
      notes: "Local Ollama call only; no credentials. Downstream Route Decision treats HTTP errors, timeout, invalid JSON, or missing fields as aiStatus=fallback."
    },
    {
      parameters: {
        jsCode: `
const scoring = $json.scoringResult || {};
let ai = null;
try {
  ai = typeof $json.response === "string" ? JSON.parse($json.response) : null;
} catch (error) {
  ai = null;
}
const required = ["aiFitSummary", "resumeSignalScore", "riskFlags", "followUpTone", "recommendedAction", "confidence", "aiStatus", "modelUsed", "evaluatedAt"];
const complete = ai && required.every((field) => Object.hasOwn(ai, field));
if (!complete) {
  ai = {
    aiFitSummary: "AI unavailable; deterministic rules engine is routing this application.",
    resumeSignalScore: scoring.score || 0,
    riskFlags: scoring.priority === "duplicate" ? [{ flag: "duplicate_suspected", severity: "medium" }] : [],
    followUpTone: scoring.priority === "hot" ? "warm" : "neutral",
    recommendedAction: scoring.priority === "hot" ? "advance" : scoring.priority === "low" ? "archive" : "hold",
    confidence: scoring.priority === "hot" ? 0.78 : 0.58,
    aiStatus: "fallback",
    modelUsed: "rules-engine/v1",
    evaluatedAt: new Date().toISOString()
  };
}
const humanReviewRequired = ai.confidence < 0.55 || ai.recommendedAction === "escalate_to_human" || ai.riskFlags.some((risk) => risk.severity === "high");
const route = scoring.priority === "duplicate" ? "duplicate" : humanReviewRequired ? "human_review" : ai.recommendedAction;
return [{ json: { ...$json, aiEvaluation: ai, humanReviewRequired, routeDecision: route } }];
`.trim()
      },
      id: "af7d1275-0efa-4e0c-bbce-e6d43a68c4bd",
      name: "Route Decision",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [50, 80]
    },
    {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                conditions: [{ leftValue: "={{ $json.routeDecision }}", rightValue: "advance", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Hot Lead"
            },
            {
              conditions: {
                conditions: [{ leftValue: "={{ $json.routeDecision }}", rightValue: "hold", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Hold"
            },
            {
              conditions: {
                conditions: [{ leftValue: "={{ $json.routeDecision }}", rightValue: "human_review", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Human Review"
            },
            {
              conditions: {
                conditions: [{ leftValue: "={{ $json.routeDecision }}", rightValue: "archive", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Archive"
            },
            {
              conditions: {
                conditions: [{ leftValue: "={{ $json.routeDecision }}", rightValue: "duplicate", operator: { type: "string", operation: "equals" } }],
                combinator: "and"
              },
              renameOutput: true,
              outputKey: "Duplicate Guard"
            }
          ]
        },
        options: {
          fallbackOutput: "extra",
          renameFallbackOutput: "Hold"
        }
      },
      id: "c335f219-6bcb-44a2-a88b-7c86f148b45d",
      name: "Route Switch",
      type: "n8n-nodes-base.switch",
      typeVersion: 3.2,
      position: [310, 80]
    },
    {
      parameters: { jsCode: "return items.map((item) => ({ json: { ...item.json, exitPoint: 'hot_lead', feedbackSource: 'auto_advance' } }));" },
      id: "b39c1fae-70fb-4a32-878a-4efbcb1b2fbb",
      name: "Hot Lead",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [620, -130]
    },
    {
      parameters: { jsCode: "return items.map((item) => ({ json: { ...item.json, exitPoint: 'hold' } }));" },
      id: "40df2f6e-7ec4-4958-b57c-5185bf8f1988",
      name: "Hold",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [620, 20]
    },
    {
      parameters: {
        resume: "webhook",
        options: {}
      },
      id: "a6ade404-854e-4f66-96a6-fb13b6986f24",
      name: "Human Review",
      type: "n8n-nodes-base.wait",
      typeVersion: 1.1,
      position: [620, 170],
      notesInFlow: true,
      notes: "Reviewer resolves through the Wait resume webhook. Record feedback with source=human_review when the resume payload is received."
    },
    {
      parameters: { jsCode: "return items.map((item) => ({ json: { ...item.json, exitPoint: 'archive', feedbackSource: 'auto_archive' } }));" },
      id: "58c10daf-ae2d-4f2d-9a04-7c652ec3d71d",
      name: "Archive",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [620, 320]
    },
    {
      parameters: { jsCode: "return items.map((item) => ({ json: { ...item.json, exitPoint: 'duplicate_guard', feedbackSource: 'duplicate_guard' } }));" },
      id: "0eeec2a2-fc16-46e5-9654-b01fe7f46f7e",
      name: "Duplicate Guard",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [620, 470]
    }
  ],
  connections: {
    Webhook: { main: [[{ node: "Validate Payload", type: "main", index: 0 }]] },
    "Validate Payload": { main: [[{ node: "Deterministic Score", type: "main", index: 0 }]] },
    "Deterministic Score": { main: [[{ node: "AI Evaluate", type: "main", index: 0 }]] },
    "AI Evaluate": { main: [[{ node: "Route Decision", type: "main", index: 0 }]] },
    "Route Decision": { main: [[{ node: "Route Switch", type: "main", index: 0 }]] },
    "Route Switch": {
      main: [
        [{ node: "Hot Lead", type: "main", index: 0 }],
        [{ node: "Hold", type: "main", index: 0 }],
        [{ node: "Human Review", type: "main", index: 0 }],
        [{ node: "Archive", type: "main", index: 0 }],
        [{ node: "Duplicate Guard", type: "main", index: 0 }],
        [{ node: "Hold", type: "main", index: 0 }]
      ]
    }
  },
  active: false,
  settings: {
    executionOrder: "v1"
  },
  versionId: "autoapplyops-ai-copilot-v1",
  meta: {
    templateCredsSetupCompleted: true,
    instanceId: "portfolio-demo"
  },
  tags: [{ name: "portfolio" }, { name: "ai-copilot" }, { name: "ollama" }]
};

mkdirSync("workflows", { recursive: true });
writeFileSync("workflows/autoapplyops-main.json", `${JSON.stringify(mainWorkflow, null, 2)}\n`);
writeFileSync("workflows/autoapplyops-ai-copilot.json", `${JSON.stringify(aiCopilotWorkflow, null, 2)}\n`);
writeFileSync("workflows/autoapplyops-error-handler.json", `${JSON.stringify(errorWorkflow, null, 2)}\n`);
console.log("Generated workflows/autoapplyops-main.json, workflows/autoapplyops-ai-copilot.json, and workflows/autoapplyops-error-handler.json");
