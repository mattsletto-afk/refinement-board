const { describe, test, expect, beforeEach } = require('@jest/globals')

// ── Pure function implementations mirrored from adrService.ts ─────────────────

function buildAdrPrompt(input) {
  const optionsList = input.optionsConsidered
    .map((o, i) => `${i + 1}. ${o}`)
    .join('\n')
  const driversList = input.decisionDrivers
    .map((d) => `- ${d}`)
    .join('\n')

  return `You are a senior software architect. Generate an Architecture Decision Record (ADR) in structured JSON format.\n\nTitle: ${input.title}\n\nDecision Drivers:\n${driversList}\n\nOptions Considered:\n${optionsList}\n\nRespond with a JSON object with exactly these fields:\n- "decision": A clear statement of the decision made and which option was chosen (2-4 sentences)\n- "consequences": The positive and negative consequences of this decision (3-6 bullet points as a single string with newlines)\n\nContext for the decision:\n${input.context}\n\nRespond ONLY with the JSON object, no markdown, no explanation.`
}

function parseAdrLlmResponse(raw) {
  const trimmed = raw.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('LLM response did not contain a JSON object')
  }
  const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1)
  const parsed = JSON.parse(jsonStr)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('decision' in parsed) ||
    !('consequences' in parsed)
  ) {
    throw new Error('LLM response missing required ADR fields')
  }
  if (typeof parsed.decision !== 'string' || typeof parsed.consequences !== 'string') {
    throw new Error('ADR fields must be strings')
  }
  return {
    decision: parsed.decision,
    consequences: parsed.consequences,
  }
}

function formatAdrNumber(n) {
  return `ADR-${String(n).padStart(3, '0')}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks())

describe('buildAdrPrompt', () => {
  test('includes title in prompt', () => {
    const prompt = buildAdrPrompt({
      title: 'Choose database engine',
      context: 'We need persistent storage.',
      optionsConsidered: ['PostgreSQL', 'SQLite', 'MongoDB'],
      decisionDrivers: ['Performance', 'Simplicity'],
    })
    expect(prompt).toContain('Choose database engine')
  })

  test('numbers options starting at 1', () => {
    const prompt = buildAdrPrompt({
      title: 'Test',
      context: 'ctx',
      optionsConsidered: ['Option A', 'Option B'],
      decisionDrivers: ['Driver 1'],
    })
    expect(prompt).toContain('1. Option A')
    expect(prompt).toContain('2. Option B')
  })

  test('prefixes decision drivers with dash', () => {
    const prompt = buildAdrPrompt({
      title: 'Test',
      context: 'ctx',
      optionsConsidered: ['X', 'Y'],
      decisionDrivers: ['Scalability', 'Cost'],
    })
    expect(prompt).toContain('- Scalability')
    expect(prompt).toContain('- Cost')
  })

  test('includes context', () => {
    const prompt = buildAdrPrompt({
      title: 'T',
      context: 'We are under heavy load and need to scale.',
      optionsConsidered: ['A', 'B'],
      decisionDrivers: ['D'],
    })
    expect(prompt).toContain('We are under heavy load and need to scale.')
  })

  test('instructs LLM to respond with JSON only', () => {
    const prompt = buildAdrPrompt({
      title: 'T',
      context: 'c',
      optionsConsidered: ['A', 'B'],
      decisionDrivers: ['D'],
    })
    expect(prompt).toContain('Respond ONLY with the JSON object')
  })
})

describe('parseAdrLlmResponse', () => {
  test('parses valid JSON with decision and consequences', () => {
    const raw = JSON.stringify({
      decision: 'We will use PostgreSQL.',
      consequences: '+ Better performance\n- Needs migration',
    })
    const result = parseAdrLlmResponse(raw)
    expect(result.decision).toBe('We will use PostgreSQL.')
    expect(result.consequences).toBe('+ Better performance\n- Needs migration')
  })

  test('parses JSON embedded in surrounding text', () => {
    const raw = `Here is the ADR:\n{"decision":"Use SQLite.","consequences":"+ Simple"}\nEnd.`
    const result = parseAdrLlmResponse(raw)
    expect(result.decision).toBe('Use SQLite.')
  })

  test('throws when no JSON object found', () => {
    expect(() => parseAdrLlmResponse('No JSON here at all')).toThrow(
      'LLM response did not contain a JSON object'
    )
  })

  test('throws when decision field is missing', () => {
    const raw = JSON.stringify({ consequences: 'some text' })
    expect(() => parseAdrLlmResponse(raw)).toThrow(
      'LLM response missing required ADR fields'
    )
  })

  test('throws when consequences field is missing', () => {
    const raw = JSON.stringify({ decision: 'some decision' })
    expect(() => parseAdrLlmResponse(raw)).toThrow(
      'LLM response missing required ADR fields'
    )
  })

  test('throws when decision is not a string', () => {
    const raw = JSON.stringify({ decision: 42, consequences: 'text' })
    expect(() => parseAdrLlmResponse(raw)).toThrow('ADR fields must be strings')
  })

  test('throws when consequences is not a string', () => {
    const raw = JSON.stringify({ decision: 'text', consequences: ['a', 'b'] })
    expect(() => parseAdrLlmResponse(raw)).toThrow('ADR fields must be strings')
  })

  test('throws on invalid JSON', () => {
    expect(() => parseAdrLlmResponse('{not valid json}')).toThrow()
  })
})

describe('formatAdrNumber', () => {
  test('pads single digit with leading zeros', () => {
    expect(formatAdrNumber(1)).toBe('ADR-001')
  })

  test('pads two digit with one leading zero', () => {
    expect(formatAdrNumber(42)).toBe('ADR-042')
  })

  test('does not pad three digit numbers', () => {
    expect(formatAdrNumber(123)).toBe('ADR-123')
  })

  test('handles four digit numbers without truncation', () => {
    expect(formatAdrNumber(1000)).toBe('ADR-1000')
  })
})

describe('ADR status options', () => {
  const validStatuses = ['proposed', 'accepted', 'superseded', 'deprecated']

  test('proposed is a valid status', () => {
    expect(validStatuses).toContain('proposed')
  })

  test('accepted is a valid status', () => {
    expect(validStatuses).toContain('accepted')
  })

  test('superseded is a valid status', () => {
    expect(validStatuses).toContain('superseded')
  })

  test('deprecated is a valid status', () => {
    expect(validStatuses).toContain('deprecated')
  })

  test('there are exactly 4 valid statuses', () => {
    expect(validStatuses).toHaveLength(4)
  })
})

describe('buildAdrPrompt with edge cases', () => {
  test('single option handled gracefully', () => {
    const prompt = buildAdrPrompt({
      title: 'T',
      context: 'c',
      optionsConsidered: ['Only option'],
      decisionDrivers: ['D'],
    })
    expect(prompt).toContain('1. Only option')
  })

  test('empty options list produces no numbered options', () => {
    const prompt = buildAdrPrompt({
      title: 'T',
      context: 'c',
      optionsConsidered: [],
      decisionDrivers: ['D'],
    })
    expect(prompt).not.toContain('1.')
  })

  test('multiple drivers all appear in prompt', () => {
    const drivers = ['Security', 'Performance', 'Cost', 'Maintainability']
    const prompt = buildAdrPrompt({
      title: 'T',
      context: 'c',
      optionsConsidered: ['A', 'B'],
      decisionDrivers: drivers,
    })
    drivers.forEach((d) => expect(prompt).toContain(d))
  })
})

describe('parseAdrLlmResponse with whitespace', () => {
  test('handles leading/trailing whitespace in response', () => {
    const raw = `   ${JSON.stringify({ decision: 'd', consequences: 'c' })}   `
    const result = parseAdrLlmResponse(raw)
    expect(result.decision).toBe('d')
    expect(result.consequences).toBe('c')
  })

  test('handles empty string by throwing', () => {
    expect(() => parseAdrLlmResponse('')).toThrow()
  })
})
