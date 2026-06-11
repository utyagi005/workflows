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

mkdirSync("workflows", { recursive: true });
writeFileSync("workflows/autoapplyops-intake.json", `${JSON.stringify(workflow, null, 2)}\n`);
console.log("Generated workflows/autoapplyops-intake.json");
