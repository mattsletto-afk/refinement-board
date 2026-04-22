import type {
  ActiveBlocker,
  AgentCapacityProfile,
  ArtifactEconomics,
  ReworkEvent,
  SimulationWeek,
  TaskEconomics,
  WeeklyCapacityUsage,
} from './types'
import { computeAgentMeetingCost } from './meetings'
import { computeSwitchingPenalty } from './switching'
import { computeEffectiveCapacity, computeUtilisation, GOVERNANCE_BASELINE_EP, UNPLANNED_BASELINE_EP } from './capacity'
import { applyEffort, applyReview } from './progress'
import { applyReworkToTask } from './rework'
import { computeWeekThroughput, computeForecast, assembleWeek } from './engine'

// ── Project: "Horizon v2 launch" ──────────────────────────────────────────────
// A five-person cross-functional team delivering a product feature.
// Target completion: Week 4 (original plan assumes a clean run).
// What actually happens: meetings eat more than expected, a hard blocker stalls
// a core task in week 2, a deadline-driven shortcut in week 2 triggers severity-2
// rework in week 3, and governance demands in week 3 crowd out delivery work.
// By week 4 the team is one-and-a-half weeks behind the original forecast.

// ── Agent profiles ────────────────────────────────────────────────────────────

export const FIXTURE_AGENTS: AgentCapacityProfile[] = [
  { agentId: 'alice',  role: 'delivery',    nominalWeeklyEP: 20, maxDeliveryFraction: 0.75 },
  { agentId: 'bob',    role: 'delivery',    nominalWeeklyEP: 20, maxDeliveryFraction: 0.75 },
  { agentId: 'carol',  role: 'coordinator', nominalWeeklyEP: 20, maxDeliveryFraction: 0.45 },
  { agentId: 'david',  role: 'reviewer',    nominalWeeklyEP: 20, maxDeliveryFraction: 0.40 },
]

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function makeTasks(): TaskEconomics[] {
  return [
    { taskId: 'feature-a', title: 'Feature A — core implementation', ownerAgentId: 'alice', plannedEP: 18, actualEP: 0, state: 'not-started', progressPct: 0, reworkEvents: [], blockerIds: [], stateEnteredWeek: 1, downstreamTaskIds: ['artifact-spec'] },
    { taskId: 'feature-b', title: 'Feature B — API integration',      ownerAgentId: 'bob',   plannedEP: 16, actualEP: 0, state: 'not-started', progressPct: 0, reworkEvents: [], blockerIds: [], stateEnteredWeek: 1, downstreamTaskIds: [] },
    { taskId: 'sprint-planning-task', title: 'Sprint planning & kick-off', ownerAgentId: 'carol', plannedEP: 4,  actualEP: 0, state: 'not-started', progressPct: 0, reworkEvents: [], blockerIds: [], stateEnteredWeek: 1, downstreamTaskIds: [] },
    { taskId: 'status-deck', title: 'Executive status deck (governance)', ownerAgentId: 'david', plannedEP: 3,  actualEP: 0, state: 'not-started', progressPct: 0, reworkEvents: [], blockerIds: [], stateEnteredWeek: 1, downstreamTaskIds: [] },
  ]
}

export function makeArtifacts(): ArtifactEconomics[] {
  return [
    { artifactId: 'artifact-spec', artifactClass: 'planning', ownerAgentId: 'carol', creationEP: 2, maintenanceEP: 0.5, reviewEP: 1, state: 'not-started', valid: true, lastUpdatedWeek: 0 },
    { artifactId: 'artifact-release-notes', artifactClass: 'acceptance', ownerAgentId: 'david', creationEP: 1.5, maintenanceEP: 0.5, reviewEP: 0.5, state: 'not-started', valid: true, lastUpdatedWeek: 0 },
  ]
}

// ── Blockers ──────────────────────────────────────────────────────────────────

export const FIXTURE_BLOCKER_WEEK2: ActiveBlocker = {
  id: 'blocker-api-spec',
  taskId: 'feature-b',
  severity: 'hard',
  startWeek: 2,
  resolvedWeek: 4,   // Resolved at start of week 4, but week 3 is fully blocked
  description: 'External API specification not finalised; Bob cannot proceed with integration',
  affectedAgentIds: ['bob', 'carol'],
}

// ── Rework events ─────────────────────────────────────────────────────────────

export const FIXTURE_REWORK_WEEK3: ReworkEvent = {
  id: 'rework-feature-a-shortcut',
  taskId: 'feature-a',
  severity: 2,
  week: 3,
  originalEffortEP: 6,
  reworkEffortEP: 6,  // 1.0× multiplier for severity 2
  description: 'Alice skipped integration test coverage in week 2 to hit demo milestone; failure discovered in David\'s review',
  triggeredBy: 'Shortcut: test coverage skipped under deadline pressure',
  downstreamTaskIds: [],
}

// ── Week builder helpers ──────────────────────────────────────────────────────

function makeUsage(
  agentId: string,
  role: AgentCapacityProfile['role'],
  week: number,
  opts: {
    meetings: WeeklyCapacityUsage['meetingCost']
    governance: number
    blockerDrag: number
    switching: number
    unplanned: number
    rework: number
    delivery: number
  },
): WeeklyCapacityUsage {
  const nominal = 20
  const effective = computeEffectiveCapacity({
    nominal,
    meetingCost: opts.meetings,
    governanceCost: opts.governance,
    blockerDrag: opts.blockerDrag,
    switchingPenalty: opts.switching,
    unplannedWork: opts.unplanned,
  })
  const maxDeliveryFraction = role === 'delivery' ? 0.75 : role === 'coordinator' ? 0.45 : role === 'reviewer' ? 0.40 : 0.20
  const deliveryCeiling = nominal * maxDeliveryFraction
  const deliveryEP = Math.min(opts.delivery, effective - opts.rework, deliveryCeiling)
  return {
    agentId,
    week,
    nominal,
    meetingCost: opts.meetings,
    governanceCost: opts.governance,
    blockerDrag: opts.blockerDrag,
    switchingPenalty: opts.switching,
    unplannedWork: opts.unplanned,
    reworkCost: opts.rework,
    effective,
    deliveryEP: Math.max(0, deliveryEP),
    utilisation: computeUtilisation(Math.max(0, deliveryEP), nominal),
    breakdown: {
      delivery:     Math.max(0, deliveryEP),
      coordination: opts.meetings,
      reporting:    opts.governance,
      review:       0,
      rework:       opts.rework,
      unplanned:    opts.unplanned,
      blocked:      opts.blockerDrag,
    },
  }
}

// ── WEEK 1: Kick-off, sprint planning, early delivery ────────────────────────
// Sprint planning plus daily standups consume roughly 15% of each agent's week.
// Delivery EP is lower than optimists expect.

export function buildWeek1(): SimulationWeek {
  const tasks = makeTasks()
  const artifacts = makeArtifacts()
  const blockers: ActiveBlocker[] = []

  // Sprint planning: 1.75 EP each (full cost for delivery + coordinator)
  // Daily standups: 1.00 EP each
  // Weekly review: 1.25 EP for reviewer/coordinator

  const aliceUsage = makeUsage('alice', 'delivery', 1, {
    meetings: 1.00 + 1.75,  // standup + sprint planning
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(1),
    unplanned: UNPLANNED_BASELINE_EP.delivery,
    rework: 0,
    delivery: 13,
  })

  const bobUsage = makeUsage('bob', 'delivery', 1, {
    meetings: 1.00 + 1.75,
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(1),
    unplanned: UNPLANNED_BASELINE_EP.delivery,
    rework: 0,
    delivery: 13,
  })

  const carolUsage = makeUsage('carol', 'coordinator', 1, {
    meetings: 1.00 + 1.75 + 1.25,  // standup + sprint planning + weekly review
    governance: GOVERNANCE_BASELINE_EP.coordinator,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),  // Coordinating 2 delivery streams
    unplanned: UNPLANNED_BASELINE_EP.coordinator,
    rework: 0,
    delivery: 5,
  })

  const davidUsage = makeUsage('david', 'reviewer', 1, {
    meetings: 1.00 + 1.25,  // standup + weekly review (full cost)
    governance: GOVERNANCE_BASELINE_EP.reviewer,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(1),
    unplanned: UNPLANNED_BASELINE_EP.reviewer,
    rework: 0,
    delivery: 5,
  })

  const agentUsage = [aliceUsage, bobUsage, carolUsage, davidUsage]

  // Tasks advance: Alice and Bob both put 6 EP into their features
  let [featA, featB, sprintTask, deckTask] = tasks

  featA = applyEffort({ ...featA, blockerIds: [] }, 6, 1)
  featB = applyEffort({ ...featB, blockerIds: [] }, 6, 1)
  sprintTask = applyEffort({ ...sprintTask, blockerIds: [] }, 4, 1)
  sprintTask = applyReview(sprintTask, 1)  // Carol closes sprint planning task

  let [artSpec, artNotes] = artifacts
  artSpec = { ...artSpec, state: 'started', lastUpdatedWeek: 1 }

  const taskStates = [featA, featB, sprintTask, deckTask]

  const totalActualEP = agentUsage.reduce((s, a) => s + a.deliveryEP, 0)

  return assembleWeek({
    week: 1,
    agentUsage,
    taskStates,
    artifactStates: [artSpec, artNotes],
    reworkEvents: [],
    blockers,
    originalTargetWeek: 4,
    totalPlannedEP: 41,
    totalActualEP,
    pendingReworkEP: 0,
    narrative: [
      'Sprint planning consumed 1.75 EP per delivery agent — more than a full day.',
      'Daily standups added another 1 EP across the week (5 × 15 min + context drag).',
      `Alice and Bob each delivered ~${Math.round(aliceUsage.deliveryEP)} EP toward features; target was 15 EP each.`,
      'Carol is already splitting attention across 2 streams: coordination and artifact management.',
      'Forecast: on-track, but delivery EP came in below the idealised plan.',
    ],
  })
}

// ── WEEK 2: Hard blocker on Feature B, shortcut on Feature A ─────────────────
// External API spec delayed. Bob cannot integrate. Carol calls a blocker workshop.
// Alice shortcuts test coverage to hit an internal demo milestone.

export function buildWeek2(week1: SimulationWeek): SimulationWeek {
  const blockers: ActiveBlocker[] = [FIXTURE_BLOCKER_WEEK2]

  const [featA, featB, sprintTask, deckTask] = week1.taskStates
  const [artSpec, artNotes] = week1.artifactStates

  // Alice: 2 streams (feature-a + prep for demo); shortcut means she hits more EP but quality suffers
  const aliceUsage = makeUsage('alice', 'delivery', 2, {
    meetings: 1.00,  // standup only (no sprint ceremony this week)
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),  // Feature-A + demo prep = 2 streams
    unplanned: 1.5,  // Demo prep surprises
    rework: 0,
    delivery: 12,  // Pushes hard — but shortcuts test coverage
  })

  // Bob: hard-blocked on feature-b; switches to investigation & coordination
  const bobUsage = makeUsage('bob', 'delivery', 2, {
    meetings: 1.00 + 1.75,  // standup + blocker workshop
    governance: GOVERNANCE_BASELINE_EP.delivery + 0.5,  // Escalation email chain
    blockerDrag: 8,  // 100% of planned feature-b allocation blocked
    switching: computeSwitchingPenalty(3),  // feature-b (blocked) + investigation + ad hoc help
    unplanned: 2.0,  // Unplanned: investigating the API spec delay
    rework: 0,
    delivery: 2,  // Only incidental progress; can't advance feature-b
  })

  // Carol: blocker workshop + coordination overhead; splits 3 active streams
  const carolUsage = makeUsage('carol', 'coordinator', 2, {
    meetings: 1.00 + 1.75 + 1.25,  // standup + blocker workshop + weekly review
    governance: GOVERNANCE_BASELINE_EP.coordinator + 1.0,  // Blocker escalation docs
    blockerDrag: 1.0,  // Contagion: Carol is affected as coordinator for Bob's stream
    switching: computeSwitchingPenalty(3),  // feature-a, feature-b (escalation), artifact
    unplanned: 1.0,
    rework: 0,
    delivery: 3,
  })

  // David: reviews alice's week-1 progress; plans exec deck
  const davidUsage = makeUsage('david', 'reviewer', 2, {
    meetings: 1.00 + 1.25,  // standup + weekly review
    governance: GOVERNANCE_BASELINE_EP.reviewer,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),  // review + deck prep
    unplanned: UNPLANNED_BASELINE_EP.reviewer,
    rework: 0,
    delivery: 5,
  })

  const agentUsage = [aliceUsage, bobUsage, carolUsage, davidUsage]

  // Alice advances feature-a to ~substantial (shortcut means quality gap)
  let updatedFeatA = applyEffort({ ...featA, blockerIds: [] }, 8, 2)

  // Bob makes zero progress on feature-b (hard blocked); blockerIds updated
  let updatedFeatB = { ...featB, blockerIds: [FIXTURE_BLOCKER_WEEK2.id] }

  // David starts the exec deck
  let updatedDeck = applyEffort({ ...deckTask, blockerIds: [] }, 2, 2)

  // artSpec advances
  let updatedArtSpec = { ...artSpec, state: 'in-progress' as const, lastUpdatedWeek: 2 }

  const taskStates = [updatedFeatA, updatedFeatB, sprintTask, updatedDeck]
  const totalActualEP = agentUsage.reduce((s, a) => s + a.deliveryEP, 0)

  return assembleWeek({
    week: 2,
    agentUsage,
    taskStates,
    artifactStates: [updatedArtSpec, artNotes],
    reworkEvents: [],
    blockers,
    originalTargetWeek: 4,
    totalPlannedEP: 41,
    totalActualEP: week1.throughput.actualDeliveryEP + totalActualEP,
    pendingReworkEP: 0,
    narrative: [
      'Hard blocker: External API spec delayed. Feature B cannot proceed. Bob is effectively idle on his primary task.',
      'Bob switches to 3 active streams (investigation + ad hoc) — switching penalty of 4 EP.',
      'Blocker workshop adds 1.75 EP to Bob\'s and Carol\'s meeting load.',
      'Carol is now coordinating across 3 streams — 3 EP switching penalty this week.',
      'Alice pushes through under demo pressure, skipping test coverage. Progress looks good. Quality gap is invisible.',
      'Team looks busy. Actual delivery EP is 40% below what the plan assumed for this week.',
      'Forecast: still on-track on paper, but the blocker introduces hidden risk.',
    ],
  })
}

// ── WEEK 3: Rework surfaces, reporting crunch, blocker persists ───────────────
// Alice's shortcut fails in David's integration review. Severity-2 rework triggered.
// Carol must produce a formal governance report. Feature B still blocked.

export function buildWeek3(week2: SimulationWeek): SimulationWeek {
  const blockers = week2.blockers  // Blocker still active

  const [featA, featB, sprintTask, deckTask] = week2.taskStates
  const [artSpec, artNotes] = week2.artifactStates

  // Alice absorbs rework — 6 EP consumed re-doing integration tests and fixes
  const aliceUsage = makeUsage('alice', 'delivery', 3, {
    meetings: 1.00,
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),  // Feature-A (rework) + supporting david's review
    unplanned: 1.0,
    rework: 6,   // Full severity-2 rework: 1.0× original 6 EP
    delivery: 5, // Reduced — rework competes for capacity
  })

  // Bob: still hard-blocked; spends time on docs and investigation
  const bobUsage = makeUsage('bob', 'delivery', 3, {
    meetings: 1.00 + 1.25,  // standup + weekly review
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 8,
    switching: computeSwitchingPenalty(2),
    unplanned: 1.0,
    rework: 0,
    delivery: 2,
  })

  // Carol: governance reporting crunch + exec checkpoint prep
  const carolUsage = makeUsage('carol', 'coordinator', 3, {
    meetings: 1.00 + 1.25 + 2.25,  // standup + weekly review + exec checkpoint
    governance: 5.0,  // Full governance report (above baseline)
    blockerDrag: 1.0,  // Still paying coordination overhead on blocked feature-b
    switching: computeSwitchingPenalty(3),
    unplanned: 1.0,
    rework: 0,
    delivery: 1,  // Almost zero delivery this week — all overhead
  })

  // David: reviews alice's rework + contributes to exec deck
  const davidUsage = makeUsage('david', 'reviewer', 3, {
    meetings: 1.00 + 1.25 + 2.25,  // standup + weekly review + exec checkpoint
    governance: 3.0,  // Exec deck finalisation
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),  // Review + exec prep
    unplanned: 1.0,
    rework: 0,
    delivery: 4,
  })

  const agentUsage = [aliceUsage, bobUsage, carolUsage, davidUsage]

  // Apply rework to feature-a: rolls back progress ~25%
  let updatedFeatA = applyReworkToTask(featA, FIXTURE_REWORK_WEEK3)
  // Then apply some progress after rework
  updatedFeatA = applyEffort({ ...updatedFeatA, blockerIds: [] }, 3, 3)

  // Feature-b: still blocked
  const updatedFeatB = { ...featB, blockerIds: [FIXTURE_BLOCKER_WEEK2.id] }

  // David reviews and accepts the exec deck
  let updatedDeck = applyEffort({ ...deckTask, blockerIds: [] }, 1, 3)
  updatedDeck = applyReview(updatedDeck, 3)

  // artSpec: artifact invalidated by rework (Feature A's downstream spec is stale)
  const updatedArtSpec = { ...artSpec, valid: false, lastUpdatedWeek: 3, state: 'in-progress' as const }

  const taskStates = [updatedFeatA, updatedFeatB, sprintTask, updatedDeck]
  const totalActualEP = agentUsage.reduce((s, a) => s + a.deliveryEP, 0)
  const cumulativeActual = week2.throughput.actualDeliveryEP + totalActualEP

  return assembleWeek({
    week: 3,
    agentUsage,
    taskStates,
    artifactStates: [updatedArtSpec, artNotes],
    reworkEvents: [FIXTURE_REWORK_WEEK3],
    blockers,
    originalTargetWeek: 4,
    totalPlannedEP: 41,
    totalActualEP: cumulativeActual,
    pendingReworkEP: FIXTURE_REWORK_WEEK3.reworkEffortEP - 6, // 6 EP consumed this week, 0 pending
    narrative: [
      'Alice\'s week-2 shortcut surfaces: integration tests fail in David\'s review.',
      'Severity-2 rework triggered on Feature A — 6 EP consumed re-doing work believed complete.',
      'Feature A progress rolls back from ~78% to ~53%. The task is back in "in-progress".',
      'The planning artifact (artifact-spec) is invalidated: it was based on the pre-rework design.',
      'Feature B blocked for the second consecutive week. Bob accumulates 16 EP of blocked capacity.',
      'Carol has almost zero delivery output this week: exec checkpoint + governance report ate ~14 EP.',
      'Executive checkpoint demands a formal deck — Carol and David spend ~5 EP combined on governance theatre.',
      'Team throughput efficiency: ~28% of nominal EP reached delivery. The team is busy but the board barely moved.',
      'Forecast slips: first visible divergence from original target.',
    ],
  })
}

// ── WEEK 4: Blocker resolves, but rework cascade on Feature B ─────────────────
// API spec arrives but it has changed — Bob must rework the integration approach.
// Alice completes Feature A. Forecast shows 1.5-week slip from original target.

export const FIXTURE_REWORK_WEEK4: ReworkEvent = {
  id: 'rework-feature-b-api-change',
  taskId: 'feature-b',
  severity: 3,
  week: 4,
  originalEffortEP: 16,
  reworkEffortEP: 32,  // 2.0× multiplier for severity 3
  description: 'API spec arrived but endpoints changed significantly from assumptions Bob made during investigation. Entire integration layer must be rewritten.',
  triggeredBy: 'External API spec delivered 2 weeks late with breaking changes from assumed design',
  downstreamTaskIds: ['artifact-spec'],
}

export function buildWeek4(week3: SimulationWeek): SimulationWeek {
  // Blocker resolves at start of week 4
  const resolvedBlockers = week3.blockers.map(b =>
    b.id === FIXTURE_BLOCKER_WEEK2.id ? { ...b, resolvedWeek: 4 } : b,
  )

  const [featA, featB, sprintTask, deckTask] = week3.taskStates
  const [artSpec, artNotes] = week3.artifactStates

  // Alice: finishes Feature A, moves to review-ready
  const aliceUsage = makeUsage('alice', 'delivery', 4, {
    meetings: 1.00 + 1.00,  // standup + retrospective
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(1),
    unplanned: UNPLANNED_BASELINE_EP.delivery,
    rework: 0,
    delivery: 14,
  })

  // Bob: blocker resolved but immediately hits severity-3 rework
  // The resolved blocker doesn't help — the spec changed, requiring full rewrite
  const bobUsage = makeUsage('bob', 'delivery', 4, {
    meetings: 1.00 + 1.00 + 1.25,  // standup + retrospective + weekly review
    governance: GOVERNANCE_BASELINE_EP.delivery,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),  // rework + future design
    unplanned: 2.0,
    rework: 8,  // First week of 32 EP rework — can only absorb 8 this week
    delivery: 4,
  })

  // Carol: retrospective + sprint wrap-up + re-planning
  const carolUsage = makeUsage('carol', 'coordinator', 4, {
    meetings: 1.00 + 1.25 + 1.00,  // standup + weekly review + retrospective
    governance: GOVERNANCE_BASELINE_EP.coordinator + 1.5,  // Re-plan docs, forecast update
    blockerDrag: 0,
    switching: computeSwitchingPenalty(3),
    unplanned: 1.0,
    rework: 0,
    delivery: 4,
  })

  // David: reviews Feature A, plans next sprint
  const davidUsage = makeUsage('david', 'reviewer', 4, {
    meetings: 1.00 + 1.25 + 1.00,  // standup + weekly review + retrospective
    governance: GOVERNANCE_BASELINE_EP.reviewer,
    blockerDrag: 0,
    switching: computeSwitchingPenalty(2),
    unplanned: UNPLANNED_BASELINE_EP.reviewer,
    rework: 0,
    delivery: 7,
  })

  const agentUsage = [aliceUsage, bobUsage, carolUsage, davidUsage]

  // Alice completes Feature A
  let updatedFeatA = applyEffort({ ...featA, blockerIds: [] }, 8, 4)
  // Force to review-ready (she pushed to completion)
  updatedFeatA = { ...updatedFeatA, progressPct: 98, state: 'review-ready' }
  updatedFeatA = applyReview(updatedFeatA, 4)

  // Bob: rework immediately applied — Feature B rolls way back
  let updatedFeatB = applyReworkToTask({ ...featB, blockerIds: [] }, FIXTURE_REWORK_WEEK4)
  // Bob applies first 4 EP toward the rewrite
  updatedFeatB = applyEffort({ ...updatedFeatB, blockerIds: [] }, 4, 4)

  // artSpec invalidated again by the severity-3 rework
  const updatedArtSpec = { ...artSpec, valid: false, lastUpdatedWeek: 4 }
  const updatedArtNotes = { ...artNotes, state: 'started' as const, lastUpdatedWeek: 4 }

  const taskStates = [updatedFeatA, updatedFeatB, sprintTask, deckTask]
  const totalActualEP = agentUsage.reduce((s, a) => s + a.deliveryEP, 0)
  const cumulativeActual = week3.throughput.actualDeliveryEP + totalActualEP

  return assembleWeek({
    week: 4,
    agentUsage,
    taskStates,
    artifactStates: [updatedArtSpec, updatedArtNotes],
    reworkEvents: [FIXTURE_REWORK_WEEK4],
    blockers: resolvedBlockers,
    originalTargetWeek: 4,
    totalPlannedEP: 41,
    totalActualEP: cumulativeActual,
    pendingReworkEP: FIXTURE_REWORK_WEEK4.reworkEffortEP - 8,  // 24 EP rework still pending
    narrative: [
      'API spec finally arrives — but with breaking endpoint changes. The blocker resolves, then immediately causes severity-3 rework.',
      'Feature B must be entirely rewritten: 32 EP of rework (2× original planned effort).',
      'The planning artifact is invalidated for the second time — it is now two versions behind.',
      'Feature A accepted. Alice delivers. But at week 4 (the original target), only 1 of 2 features is done.',
      '24 EP of rework remains on Feature B after this week. At current pace, Feature B completes in ~2 more weeks.',
      'Retrospective held: the team diagnoses the pattern but the damage is done.',
      'Forecast: project will complete approximately week 5.5. Slippage: ~1.5 weeks from the original 4-week target.',
      'Team was never idle. Everyone was always busy. The project fell behind anyway.',
    ],
  })
}

// ── Four-week simulation ──────────────────────────────────────────────────────

export function buildFourWeekSimulation(): SimulationWeek[] {
  const w1 = buildWeek1()
  const w2 = buildWeek2(w1)
  const w3 = buildWeek3(w2)
  const w4 = buildWeek4(w3)
  return [w1, w2, w3, w4]
}

// ── Named exports for use in tests ────────────────────────────────────────────

export const FIXTURE_WEEK1 = buildWeek1()
export const FIXTURE_WEEK2 = buildWeek2(FIXTURE_WEEK1)
export const FIXTURE_WEEK3 = buildWeek3(FIXTURE_WEEK2)
export const FIXTURE_WEEK4 = buildWeek4(FIXTURE_WEEK3)
export const FIXTURE_SIMULATION = [FIXTURE_WEEK1, FIXTURE_WEEK2, FIXTURE_WEEK3, FIXTURE_WEEK4]
