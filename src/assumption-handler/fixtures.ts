import { randomUUID } from 'crypto'
import type {
  Assumption,
  AssumptionHandlerRequest,
  AssumptionHandlerResponse,
  HandlerContext,
  ModelInvoker,
  ModelResponse,
} from './types'

// ── New-spec fixtures ─────────────────────────────────────────────────────────

/** Fixture 1 — Simulation scenario: sprint kickoff with missing task details and a blocked pricing field */
export const FIXTURE_SIMULATION_REQUEST: AssumptionHandlerRequest = {
  requestId: 'req-simulation-001',
  appMode: 'simulation',
  context: {
    projectName: 'Salesforce Knowledge Migration',
    phase: 'Execution — Sprint 2',
    description: 'Migrating legacy KB articles into Salesforce Knowledge with new category taxonomy.',
  },
  fields: [
    // green
    { path: 'task.title',       severity: 'major',    currentValue: '',   context: 'Task has no title — blocks developer assignment' },
    { path: 'task.description', severity: 'minor',    currentValue: null, context: 'Description missing — needed for handoff' },
    // yellow
    { path: 'project.teamSize', severity: 'major',    currentValue: null, context: 'Team size unknown — needed for capacity planning' },
    // red
    { path: 'pricing.licensePerSeat', severity: 'critical', currentValue: null, context: 'License cost unknown' },
  ],
  existingVerifiedValues: { 'project.name': 'Salesforce Knowledge Migration' },
  maxAssumptions: 5,
}

/** Valid model response for the simulation fixture — returned by mock invoker */
export const FIXTURE_SIMULATION_RESPONSE: AssumptionHandlerResponse = {
  requestId: 'req-simulation-001',
  assumptions: [
    {
      field: 'task.title',
      proposedValue: 'Configure Knowledge article types and data categories',
      confidence: 'high',
      rationale: 'Sprint 2 scope includes Knowledge taxonomy setup; this is the canonical first task in that work.',
      synthetic: true,
      source: 'synthetic',
    },
    {
      field: 'task.description',
      proposedValue: 'In Setup > Knowledge > Article Types, create the required article types. Assign data categories under the Category Groups defined in Sprint 1.',
      confidence: 'medium',
      rationale: 'Standard Salesforce Knowledge setup sequence — describes the expected implementation steps.',
      synthetic: true,
      source: 'synthetic',
    },
    {
      field: 'project.teamSize',
      proposedValue: 4,
      confidence: 'medium',
      rationale: 'Typical Salesforce migration engagement size: 1 PM, 1 architect, 2 developers.',
      synthetic: true,
      source: 'system-inferred',
    },
  ],
  blocked: [
    {
      field: 'pricing.licensePerSeat',
      reason: 'Pricing data must not be invented. Obtain from Salesforce account executive.',
      level: 'red',
    },
  ],
  synthetic: [
    {
      field: 'task.title',
      value: 'Configure Knowledge article types and data categories',
      synthetic: true,
      confidence: 'high',
      label: '[SYNTHETIC: task title — sprint 2 Knowledge setup]',
    },
    {
      field: 'task.description',
      value: 'In Setup > Knowledge > Article Types, create the required article types...',
      synthetic: true,
      confidence: 'medium',
      label: '[SYNTHETIC: task description — standard Knowledge setup steps]',
    },
    {
      field: 'project.teamSize',
      value: 4,
      synthetic: true,
      confidence: 'medium',
      label: '[SYNTHETIC: estimated team size — typical Salesforce migration engagement]',
    },
  ],
  warnings: [],
}

/** Fixture 2 — Backlog ranking scenario: story effort and a revenue target missing */
export const FIXTURE_BACKLOG_REQUEST: AssumptionHandlerRequest = {
  requestId: 'req-backlog-001',
  appMode: 'demo',
  context: {
    projectName: 'Customer Portal Rebuild',
    sprintGoal: 'Refine and rank Q2 backlog for planning meeting',
    storyCount: 12,
  },
  fields: [
    // green
    { path: 'persona.name',          severity: 'minor',    currentValue: '',   context: 'Persona for user story has no name' },
    // yellow
    { path: 'story.effort',          severity: 'major',    currentValue: null, context: 'Effort estimate missing — blocks sprint capacity calc' },
    { path: 'project.timelineWeeks', severity: 'critical', currentValue: null, context: 'Timeline unknown — needed for roadmap' },
    // red
    { path: 'revenue.q2Target',      severity: 'critical', currentValue: null, context: 'Revenue target unknown' },
    { path: 'kpi.conversionRate',    severity: 'major',    currentValue: null, context: 'Baseline conversion rate unknown' },
  ],
}

export const FIXTURE_BACKLOG_RESPONSE: AssumptionHandlerResponse = {
  requestId: 'req-backlog-001',
  assumptions: [
    {
      field: 'persona.name',
      proposedValue: 'Portal User',
      confidence: 'high',
      rationale: 'Generic but accurate label for an authenticated customer accessing the rebuilt portal.',
      synthetic: true,
      source: 'synthetic',
    },
    {
      field: 'story.effort',
      proposedValue: 5,
      confidence: 'medium',
      rationale: 'Median story point value for portal UI stories in comparable projects; adjust after team estimation.',
      synthetic: true,
      source: 'system-inferred',
    },
    {
      field: 'project.timelineWeeks',
      proposedValue: 12,
      confidence: 'medium',
      rationale: 'Standard Q2 planning cycle is 12 weeks; consistent with storyCount of 12 at 1 story per week.',
      synthetic: true,
      source: 'system-inferred',
    },
  ],
  blocked: [
    { field: 'revenue.q2Target',   reason: 'Revenue data must not be invented. Source from finance.', level: 'red' },
    { field: 'kpi.conversionRate', reason: 'KPI data must not be invented. Source from analytics team.', level: 'red' },
  ],
  synthetic: [
    { field: 'persona.name',          value: 'Portal User', synthetic: true, confidence: 'high',   label: '[SYNTHETIC: persona name — authenticated portal customer]' },
    { field: 'story.effort',          value: 5,             synthetic: true, confidence: 'medium', label: '[SYNTHETIC: story effort — median estimate for portal UI work]' },
    { field: 'project.timelineWeeks', value: 12,            synthetic: true, confidence: 'medium', label: '[SYNTHETIC: timeline — standard Q2 planning cycle]' },
  ],
  warnings: ['story.effort and project.timelineWeeks are synthetic — validate with team before committing to plan'],
}

/** Fixture 3 — Demo workflow scenario: persona details, compliance gate, and security policy missing */
export const FIXTURE_DEMO_REQUEST: AssumptionHandlerRequest = {
  requestId: 'req-demo-001',
  appMode: 'demo',
  context: {
    projectName: 'Agentforce Pilot',
    audience: 'Executive demo — CTO and VP Product',
    demoDate: '2026-04-25',
  },
  fields: [
    // green
    { path: 'task.title',       severity: 'minor',    currentValue: '',   context: 'Demo scenario task missing a title' },
    { path: 'persona.name',     severity: 'minor',    currentValue: null, context: 'AI agent persona has no name assigned' },
    // yellow
    { path: 'project.teamSize', severity: 'minor',    currentValue: null, context: 'Team size for demo context' },
    // red
    { path: 'compliance.soc2Controls', severity: 'critical', currentValue: null, context: 'SOC 2 control list unknown' },
    { path: 'security.apiKeyPolicy',   severity: 'critical', currentValue: null, context: 'API key rotation policy unknown' },
    { path: 'budget.pilotCost',        severity: 'major',    currentValue: null, context: 'Pilot cost estimate unknown' },
  ],
  existingVerifiedValues: { 'project.name': 'Agentforce Pilot', 'project.status': 'active' },
}

export const FIXTURE_DEMO_RESPONSE: AssumptionHandlerResponse = {
  requestId: 'req-demo-001',
  assumptions: [
    {
      field: 'task.title',
      proposedValue: 'Configure Agentforce agent actions for case deflection demo',
      confidence: 'high',
      rationale: 'CTO demo scenario context implies agent actions are the primary demo capability.',
      synthetic: true,
      source: 'synthetic',
    },
    {
      field: 'persona.name',
      proposedValue: 'Service Agent',
      confidence: 'high',
      rationale: 'Generic Agentforce service persona name — suitable for executive demo context.',
      synthetic: true,
      source: 'synthetic',
    },
    {
      field: 'project.teamSize',
      proposedValue: 3,
      confidence: 'medium',
      rationale: 'Typical Agentforce pilot: 1 architect, 1 developer, 1 PM.',
      synthetic: true,
      source: 'system-inferred',
    },
  ],
  blocked: [
    { field: 'compliance.soc2Controls', reason: 'Compliance information must not be invented. Source from security team.', level: 'red' },
    { field: 'security.apiKeyPolicy',   reason: 'Security facts must not be invented. Source from InfoSec.', level: 'red' },
    { field: 'budget.pilotCost',        reason: 'Budget data must not be invented. Source from finance.', level: 'red' },
  ],
  synthetic: [
    { field: 'task.title',   value: 'Configure Agentforce agent actions for case deflection demo', synthetic: true, confidence: 'high',   label: '[SYNTHETIC: task title — demo scenario task]' },
    { field: 'persona.name', value: 'Service Agent',                                               synthetic: true, confidence: 'high',   label: '[SYNTHETIC: persona name — Agentforce service agent]' },
    { field: 'project.teamSize', value: 3,                                                         synthetic: true, confidence: 'medium', label: '[SYNTHETIC: team size — typical Agentforce pilot team]' },
  ],
  warnings: [],
}

// ── Mock model invokers ───────────────────────────────────────────────────────

/** Returns a valid AssumptionHandlerResponse for the simulation fixture */
export function createMockInvoker(
  response?: AssumptionHandlerResponse,
): ModelInvoker {
  return async () => JSON.stringify(response ?? FIXTURE_SIMULATION_RESPONSE)
}

/** Stub that always returns invalid JSON — for testing error paths */
export function createFailingInvoker(): ModelInvoker {
  return async () => 'not valid json'
}

/** Stub that returns a response with a red-field assumption — for rejection testing */
export function createRedFieldInvoker(requestId: string): ModelInvoker {
  return async () => JSON.stringify({
    requestId,
    assumptions: [{
      field: 'pricing.unit',
      proposedValue: 9.99,
      confidence: 'high',
      rationale: 'Attempted red-field assumption',
      synthetic: true,
      source: 'synthetic',
    }],
    blocked: [],
    synthetic: [],
    warnings: [],
  })
}

// ── Legacy fixtures (preserved) ───────────────────────────────────────────────

export const FIXTURE_ASSUMPTIONS: Assumption[] = [
  {
    id: randomUUID(),
    entityType: 'task',
    entityId: 'task-001',
    field: 'title',
    currentValue: '',
    proposedValue: 'Configure Salesforce Knowledge article types',
    rationale: 'Story has no tasks — this task covers the missing setup step',
    confidence: 'high',
    status: 'unverified',
    verified: false,
    classification: 'green',
    createdAt: '2026-04-18T10:00:00.000Z',
    updatedAt: '2026-04-18T10:00:00.000Z',
  },
  {
    id: randomUUID(),
    entityType: 'task',
    entityId: 'task-002',
    field: 'description',
    currentValue: null,
    proposedValue: 'Set up data categories and assign to article types in Setup > Knowledge.',
    rationale: 'Description is missing; this is required for developer handoff',
    confidence: 'medium',
    status: 'unverified',
    verified: false,
    classification: 'green',
    createdAt: '2026-04-18T10:01:00.000Z',
    updatedAt: '2026-04-18T10:01:00.000Z',
  },
  {
    id: randomUUID(),
    entityType: 'story',
    entityId: 'story-001',
    field: 'priority',
    currentValue: 'medium',
    proposedValue: 'high',
    rationale: 'Foundation story — blocks 4 downstream features',
    confidence: 'high',
    status: 'unverified',
    verified: false,
    classification: 'red',
    createdAt: '2026-04-18T10:02:00.000Z',
    updatedAt: '2026-04-18T10:02:00.000Z',
  },
  {
    id: randomUUID(),
    entityType: 'risk',
    entityId: 'risk-001',
    field: 'description',
    currentValue: null,
    proposedValue: 'Integration between Knowledge and Service Cloud may require custom Apex triggers.',
    rationale: 'Risk description is missing — needed for risk register',
    confidence: 'high',
    status: 'unverified',
    verified: false,
    classification: 'green',
    createdAt: '2026-04-18T10:03:00.000Z',
    updatedAt: '2026-04-18T10:03:00.000Z',
  },
  {
    id: randomUUID(),
    entityType: 'story',
    entityId: 'story-002',
    field: 'epicId',
    currentValue: null,
    proposedValue: 'epic-knowledge-migration',
    rationale: 'Story is not linked to an epic — hierarchy is incomplete',
    confidence: 'high',
    status: 'unverified',
    verified: false,
    classification: 'yellow',
    createdAt: '2026-04-18T10:04:00.000Z',
    updatedAt: '2026-04-18T10:04:00.000Z',
  },
]

export function createLegacyMockInvoker(response?: Partial<ModelResponse>): import('./types').LegacyModelInvoker {
  return async () => ({
    content: JSON.stringify({
      reasonable: true,
      improves: true,
      risks: [],
      suggestedConfidence: 'high',
      notes: 'Mock response — no real model called',
    }),
    inputTokens: 0,
    outputTokens: 0,
    ...response,
  })
}

export function createOpenAIInvoker(model = 'gpt-4o-mini'): ModelInvoker {
  return async ({ system, developer, user }) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey })

    const completion = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system',    content: system },
        { role: 'developer', content: developer } as never,
        { role: 'user',      content: user },
      ],
    })

    return completion.choices[0]?.message?.content ?? ''
  }
}

export function createAnthropicInvoker(model = 'claude-sonnet-4-6'): ModelInvoker {
  return async ({ system, developer, user }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: `${system}\n\n${developer}`,
      messages: [{ role: 'user', content: user }],
    })

    const block = message.content[0]
    return block.type === 'text' ? block.text : ''
  }
}

export function createFixtureContext(overrides: Partial<import('./types').HandlerContext> = {}): import('./types').HandlerContext {
  return {
    simulationMode: 'enabled',
    projectId: 'proj-salesforce-knowledge',
    runId: 'run-fixture-001',
    invokeModel: createLegacyMockInvoker(),
    ...overrides,
  }
}
