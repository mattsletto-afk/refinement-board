import type { AgentRole, EffortPoints, MeetingCost, MeetingType } from './types'

// ── Meeting cost table ────────────────────────────────────────────────────────
// All costs are per single occurrence unless noted.
//
// Direct EP = time physically in the meeting
// Indirect EP = pre-meeting prep + post-meeting follow-up + context-switch
//               recovery time (re-entering focused work takes ~20-30 min each
//               time a meeting interrupts a deep-work block)
//
// Full-cost roles = roles that must prepare, present, or own action items.
// Observer fraction = fraction of totalEP charged to roles that merely attend.

export const MEETING_COSTS: Record<MeetingType, MeetingCost> = {
  'daily-standup': {
    type: 'daily-standup',
    // 15-min meeting × 5 days = 75 min direct; ~45 min weekly context-switch drag
    directEP: 0.60,
    indirectEP: 0.40,
    totalEP: 1.00,
    fullCostRoles: ['delivery', 'coordinator', 'reviewer', 'executive'],
    observerFraction: 1.0,
    defaultFrequencyPerWeek: 1,  // Billed as weekly aggregate
  },
  'weekly-review': {
    type: 'weekly-review',
    // 60-min review + 30-min prep + 30-min follow-up/notes
    directEP: 0.50,
    indirectEP: 0.75,
    totalEP: 1.25,
    fullCostRoles: ['coordinator', 'reviewer'],
    observerFraction: 0.5,
    defaultFrequencyPerWeek: 1,
  },
  'blocker-workshop': {
    type: 'blocker-workshop',
    // 90-min session + 30-min pre-alignment + 45-min follow-up actions
    directEP: 0.75,
    indirectEP: 1.00,
    totalEP: 1.75,
    fullCostRoles: ['coordinator', 'delivery'],
    observerFraction: 0.5,
    defaultFrequencyPerWeek: 0,  // Ad hoc — caller supplies frequency
  },
  'executive-checkpoint': {
    type: 'executive-checkpoint',
    // 60-min exec meeting + 2h deck prep (coordinator/reviewer) + follow-up
    directEP: 0.50,
    indirectEP: 1.75,
    totalEP: 2.25,
    fullCostRoles: ['coordinator', 'executive'],
    observerFraction: 0.3,
    defaultFrequencyPerWeek: 0,
  },
  'sprint-planning': {
    type: 'sprint-planning',
    // 2h session + 1h pre-grooming + 30-min capacity sizing
    directEP: 1.00,
    indirectEP: 0.75,
    totalEP: 1.75,
    fullCostRoles: ['coordinator', 'delivery'],
    observerFraction: 0.6,
    defaultFrequencyPerWeek: 0,  // Once per sprint (every 2 weeks)
  },
  'retrospective': {
    type: 'retrospective',
    // 90-min retro + 30-min prep
    directEP: 0.75,
    indirectEP: 0.25,
    totalEP: 1.00,
    fullCostRoles: ['coordinator', 'delivery', 'reviewer'],
    observerFraction: 0.8,
    defaultFrequencyPerWeek: 0,  // Once per sprint
  },
  'ad-hoc-sync': {
    type: 'ad-hoc-sync',
    // 30-min call, but arrives unscheduled — full context-switch cost applies
    directEP: 0.25,
    indirectEP: 0.50,
    totalEP: 0.75,
    fullCostRoles: ['delivery', 'coordinator', 'reviewer', 'executive'],
    observerFraction: 0.8,
    defaultFrequencyPerWeek: 0,
  },
}

// ── Per-agent meeting cost ────────────────────────────────────────────────────

export function computeAgentMeetingCost(
  meetings: MeetingType[],
  role: AgentRole,
): EffortPoints {
  return meetings.reduce((total, type) => {
    const cost = MEETING_COSTS[type]
    const isFullCost = cost.fullCostRoles.includes(role)
    return total + (isFullCost ? cost.totalEP : cost.totalEP * cost.observerFraction)
  }, 0)
}

// ── Weekly meeting schedule builders ─────────────────────────────────────────
// Returns the standard recurring meetings for a typical project week.

export function standardWeekMeetings(includeSprintCeremony = false): MeetingType[] {
  const base: MeetingType[] = ['daily-standup', 'weekly-review']
  if (includeSprintCeremony) base.push('sprint-planning', 'retrospective')
  return base
}

// ── Meeting cost breakdown for reporting ─────────────────────────────────────

export function meetingCostBreakdown(meetings: MeetingType[]): Array<{
  type: MeetingType
  totalEP: EffortPoints
  directEP: EffortPoints
  indirectEP: EffortPoints
}> {
  return meetings.map(type => ({
    type,
    totalEP: MEETING_COSTS[type].totalEP,
    directEP: MEETING_COSTS[type].directEP,
    indirectEP: MEETING_COSTS[type].indirectEP,
  }))
}
