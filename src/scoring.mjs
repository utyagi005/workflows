const DEFAULT_TARGET_SKILLS = [
  "javascript",
  "typescript",
  "node",
  "api",
  "apis",
  "automation",
  "n8n",
  "postgresql",
  "python",
  "sql",
  "webhook",
  "react"
];

const REQUIRED_FIELDS = ["applicationId", "company", "role", "source"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function evaluateApplication(payload, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const targetSkills = normalizeSkillList(options.targetSkills || DEFAULT_TARGET_SKILLS);
  const normalized = normalizePayload(payload);
  const validation = validatePayload(normalized);

  if (!validation.valid) {
    return buildResult({
      normalized,
      validation,
      score: 0,
      priority: "invalid",
      route: "Needs Manual Repair",
      reasonCodes: validation.errors.map((error) => `missing_or_invalid_${error.field}`),
      followUpDraft: "Payload needs required fields before a follow-up can be drafted.",
      now
    });
  }

  const deadlineSignal = scoreDeadline(normalized.deadline, now);
  const skillSignal = scoreSkills(normalized.skills, targetSkills);
  const roleSignal = scoreRole(normalized.role);
  const locationSignal = scoreLocation(normalized.location);
  const completenessSignal = scoreCompleteness(normalized);
  const sourceSignal = scoreSource(normalized.source);

  const score = clamp(
    deadlineSignal.points +
      skillSignal.points +
      roleSignal.points +
      locationSignal.points +
      completenessSignal.points +
      sourceSignal.points,
    0,
    100
  );

  const priority = score >= 80 ? "hot" : score >= 55 ? "review" : "low";
  const route =
    priority === "hot"
      ? "High Priority Follow-up"
      : priority === "review"
        ? "Review Queue"
        : "Archive with Weekly Digest";

  const reasonCodes = [
    deadlineSignal.reason,
    skillSignal.reason,
    roleSignal.reason,
    locationSignal.reason,
    completenessSignal.reason,
    sourceSignal.reason
  ].filter(Boolean);

  return buildResult({
    normalized,
    validation,
    score,
    priority,
    route,
    reasonCodes,
    followUpDraft: draftFollowUp(normalized, priority, skillSignal.matches),
    now,
    skillMatches: skillSignal.matches,
    deadlineDays: deadlineSignal.daysUntilDeadline
  });
}

export function normalizePayload(payload = {}) {
  const body = payload.body && typeof payload.body === "object" ? payload.body : payload;
  const skills = Array.isArray(body.skills)
    ? body.skills
    : typeof body.skills === "string"
      ? body.skills.split(",")
      : [];

  return {
    applicationId: clean(body.applicationId || body.id || body.leadId),
    applicantName: clean(body.applicantName || body.name || "Demo Applicant"),
    email: clean(body.email),
    company: clean(body.company),
    role: clean(body.role || body.title),
    source: clean(body.source || "manual-entry"),
    deadline: clean(body.deadline || body.applyBy),
    location: clean(body.location || "Unknown"),
    skills: normalizeSkillList(skills),
    notes: clean(body.notes || body.resume_text || body.summary),
    receivedAt: clean(body.receivedAt || body.received_at) || new Date().toISOString()
  };
}

export function sanitizeForLog(normalized) {
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

function validatePayload(normalized) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!normalized[field]) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (normalized.email && !EMAIL_RE.test(normalized.email)) {
    errors.push({ field: "email", message: "email must be valid when provided" });
  }

  if (normalized.deadline && Number.isNaN(Date.parse(normalized.deadline))) {
    errors.push({ field: "deadline", message: "deadline must be a valid date when provided" });
  }

  return { valid: errors.length === 0, errors };
}

function scoreDeadline(deadline, now) {
  if (!deadline) {
    return { points: 8, reason: "deadline_missing_review", daysUntilDeadline: null };
  }

  const days = Math.ceil((new Date(deadline) - now) / 86_400_000);

  if (days < 0) {
    return { points: 0, reason: "deadline_expired", daysUntilDeadline: days };
  }

  if (days <= 7) {
    return { points: 25, reason: "deadline_urgent", daysUntilDeadline: days };
  }

  if (days <= 21) {
    return { points: 18, reason: "deadline_soon", daysUntilDeadline: days };
  }

  return { points: 12, reason: "deadline_open", daysUntilDeadline: days };
}

function scoreSkills(skills, targetSkills) {
  const matches = skills.filter((skill) => targetSkills.includes(skill));
  const ratio = targetSkills.length ? matches.length / Math.min(targetSkills.length, 6) : 0;
  const points = clamp(Math.round(ratio * 30), 0, 30);

  return {
    points,
    matches,
    reason: matches.length ? `skill_match_${matches.length}` : "skill_match_none"
  };
}

function scoreRole(role) {
  const value = role.toLowerCase();
  if (value.includes("software") || value.includes("developer") || value.includes("automation")) {
    return { points: 20, reason: "role_high_fit" };
  }
  if (value.includes("data") || value.includes("operations") || value.includes("analyst")) {
    return { points: 14, reason: "role_medium_fit" };
  }
  return { points: 7, reason: "role_low_fit" };
}

function scoreLocation(location) {
  const value = location.toLowerCase();
  if (value.includes("remote")) {
    return { points: 10, reason: "location_remote" };
  }
  if (value.includes("toronto") || value.includes("hybrid")) {
    return { points: 7, reason: "location_workable" };
  }
  return { points: 4, reason: "location_needs_review" };
}

function scoreCompleteness(normalized) {
  const optionalFields = ["email", "deadline", "location", "skills", "notes"];
  const present = optionalFields.filter((field) => {
    const value = normalized[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
  return { points: present >= 4 ? 10 : present >= 2 ? 6 : 2, reason: `payload_complete_${present}` };
}

function scoreSource(source) {
  const value = source.toLowerCase();
  if (value.includes("referral") || value.includes("career")) {
    return { points: 5, reason: "source_high_signal" };
  }
  if (value.includes("linkedin") || value.includes("job")) {
    return { points: 3, reason: "source_medium_signal" };
  }
  return { points: 1, reason: "source_manual_or_unknown" };
}

function draftFollowUp(normalized, priority, matches) {
  const greeting = normalized.applicantName ? `Hi ${normalized.applicantName.split(" ")[0]},` : "Hi there,";
  const matchText = matches.length
    ? `Your background in ${humanList(matches)} lines up well with this ${normalized.role} opportunity.`
    : `Thanks for sharing your interest in the ${normalized.role} opportunity.`;
  const ask =
    priority === "hot"
      ? "Could you do a quick 15-minute review today or tomorrow so we can move before the deadline?"
      : "I added this to the review queue and will follow up with next steps after the next batch review.";

  return `${greeting}\n\n${matchText}\n\n${ask}\n\nBest,\nAutoApplyOps`;
}

function buildResult({
  normalized,
  validation,
  score,
  priority,
  route,
  reasonCodes,
  followUpDraft,
  now,
  skillMatches = [],
  deadlineDays = null
}) {
  return {
    applicationId: normalized.applicationId || "unassigned",
    validationStatus: validation.valid ? "valid" : "invalid",
    validationErrors: validation.errors,
    score,
    priority,
    route,
    reasonCodes,
    skillMatches,
    deadlineDays,
    sanitizedPayload: sanitizeForLog(normalized),
    followUpDraft,
    auditTrail: [
      { at: now.toISOString(), event: "webhook_received" },
      { at: now.toISOString(), event: validation.valid ? "payload_validated" : "payload_rejected" },
      { at: now.toISOString(), event: `candidate_scored_${score}` },
      { at: now.toISOString(), event: `route_${slug(route)}` }
    ]
  };
}

function normalizeSkillList(skills) {
  return [...new Set(skills.map((skill) => clean(skill).toLowerCase()).filter(Boolean))];
}

function clean(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function humanList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
