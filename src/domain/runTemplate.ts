// Resolves {{PLACEHOLDER}} variables in a run template from live project/session state.

export const DEFAULT_RUN_TEMPLATE = `Operate in Draft Execution Mode.

You are running a project simulation sprint inside Refinement Board.

---

# CONTEXT

Project Brief:
{{BRIEF}}

Existing Work Items:
{{WORK_ITEMS}}

Existing Suggestions:
{{SUGGESTIONS}}

Simulation State:
- Sprint Number: {{SPRINT_NUMBER}}
- Token Budget: {{TOKEN_BUDGET}}
- Agents Assigned: {{AGENTS}}

---

# MODE

Draft Execution Mode means:

- Automatically convert high-confidence ideas into structured draft suggestions
- Avoid repeating previous suggestions
- Evolve existing suggestions instead of recreating them
- Assign orphaned items automatically
- Create missing structure
- Generate sprint-ready outputs

---

# ADDITIONAL RULES

You are allowed to plan with incomplete information.

Missing information must:
- become assumptions
- become risks

NOT a reason to stop.

---

# OBJECTIVES FOR THIS RUN

1. Advance project structure
2. Reduce ambiguity
3. Prepare sprint-ready work
4. Identify risks
5. Avoid duplication

---

# SPECIAL INSTRUCTIONS

- If epics already exist → refine them
- If stories are unparented → assign them
- If risks are missing → create baseline risks
- If tasks are missing → generate starter tasks
- If suggestions already exist → evolve them instead of duplicating
- Applied fingerprints (DO NOT recreate): {{APPLIED_FINGERPRINTS}}
- Duplicate fingerprints (ignore): {{DUPLICATE_FINGERPRINTS}}

---

# IMPORTANT

Do NOT output generic suggestions like "Create Epic: X".
Instead: check if it exists, refine or expand it, or create it only if truly new.

---

Proceed with execution. Return the JSON object defined in your system prompt.`

export interface TemplateContext {
  brief: string
  workItems: string
  suggestions: string
  sprintNumber: number
  tokenBudget: number
  agents: string
  appliedFingerprints: string
  duplicateFingerprints: string
}

export function resolveTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replace('{{BRIEF}}', ctx.brief || 'No briefing provided.')
    .replace('{{WORK_ITEMS}}', ctx.workItems)
    .replace('{{SUGGESTIONS}}', ctx.suggestions || 'None — first run.')
    .replace('{{SPRINT_NUMBER}}', String(ctx.sprintNumber))
    .replace('{{TOKEN_BUDGET}}', ctx.tokenBudget.toLocaleString())
    .replace('{{AGENTS}}', ctx.agents)
    .replace('{{APPLIED_FINGERPRINTS}}', ctx.appliedFingerprints || 'none')
    .replace('{{DUPLICATE_FINGERPRINTS}}', ctx.duplicateFingerprints || 'none')
}
