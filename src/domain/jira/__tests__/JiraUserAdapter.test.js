const { describe, test, expect, beforeEach } = require('@jest/globals')

// Inline the adapter logic to keep tests self-contained
function adaptJiraUser(cwdUser, appUser) {
  return {
    userKey: appUser.user_key,
    userName: cwdUser.user_name,
    displayName: cwdUser.display_name,
    emailAddress: cwdUser.email_address,
    active: cwdUser.active,
    externalId: cwdUser.external_id,
    directoryId: cwdUser.directory_id,
    createdDate: cwdUser.created_date,
    updatedDate: cwdUser.updated_date,
  }
}

function adaptJiraUsers(cwdUsers, appUsers) {
  const appUserByLowerName = new Map(
    appUsers.map((u) => [u.lower_user_name, u])
  )

  const personas = []

  for (const cwdUser of cwdUsers) {
    const appUser = appUserByLowerName.get(cwdUser.lower_user_name)
    if (appUser === undefined) {
      continue
    }
    personas.push(adaptJiraUser(cwdUser, appUser))
  }

  return personas
}

function buildUserKeyIndex(personas) {
  return new Map(personas.map((p) => [p.userKey, p]))
}

function buildUserNameIndex(personas) {
  return new Map(personas.map((p) => [p.userName.toLowerCase(), p]))
}

// Fixtures
const makeCwdUser = (overrides = {}) => ({
  user_name: 'jsmith',
  lower_user_name: 'jsmith',
  display_name: 'John Smith',
  email_address: 'jsmith@example.com',
  credential: 'hashed_password',
  created_date: 1700000000000,
  updated_date: 1700001000000,
  active: true,
  external_id: 'ext-001',
  directory_id: 10000,
  ...overrides,
})

const makeAppUser = (overrides = {}) => ({
  user_key: 'JIRAUSER10001',
  lower_user_name: 'jsmith',
  user_name: 'jsmith',
  ...overrides,
})

describe('adaptJiraUser', () => {
  beforeEach(() => jest.clearAllMocks())

  test('maps user_key from appUser into Persona.userKey', () => {
    const persona = adaptJiraUser(makeCwdUser(), makeAppUser({ user_key: 'JIRAUSER99999' }))
    expect(persona.userKey).toBe('JIRAUSER99999')
  })

  test('maps display_name from cwdUser into Persona.displayName', () => {
    const persona = adaptJiraUser(makeCwdUser({ display_name: 'Jane Doe' }), makeAppUser())
    expect(persona.displayName).toBe('Jane Doe')
  })

  test('maps email_address from cwdUser into Persona.emailAddress', () => {
    const persona = adaptJiraUser(makeCwdUser({ email_address: 'jane@corp.io' }), makeAppUser())
    expect(persona.emailAddress).toBe('jane@corp.io')
  })

  test('maps active flag from cwdUser', () => {
    const activePersona = adaptJiraUser(makeCwdUser({ active: true }), makeAppUser())
    const inactivePersona = adaptJiraUser(makeCwdUser({ active: false }), makeAppUser())
    expect(activePersona.active).toBe(true)
    expect(inactivePersona.active).toBe(false)
  })

  test('maps created_date and updated_date as numeric timestamps', () => {
    const persona = adaptJiraUser(
      makeCwdUser({ created_date: 1234567890, updated_date: 9876543210 }),
      makeAppUser()
    )
    expect(persona.createdDate).toBe(1234567890)
    expect(persona.updatedDate).toBe(9876543210)
  })

  test('maps external_id and directory_id from cwdUser', () => {
    const persona = adaptJiraUser(
      makeCwdUser({ external_id: 'ext-abc', directory_id: 42 }),
      makeAppUser()
    )
    expect(persona.externalId).toBe('ext-abc')
    expect(persona.directoryId).toBe(42)
  })

  test('maps user_name from cwdUser into Persona.userName', () => {
    const persona = adaptJiraUser(makeCwdUser({ user_name: 'alice' }), makeAppUser())
    expect(persona.userName).toBe('alice')
  })
})

describe('adaptJiraUsers', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns a Persona for each matched cwd_user/app_user pair', () => {
    const cwdUsers = [
      makeCwdUser({ user_name: 'jsmith', lower_user_name: 'jsmith' }),
      makeCwdUser({ user_name: 'adoe', lower_user_name: 'adoe', email_address: 'adoe@example.com' }),
    ]
    const appUsers = [
      makeAppUser({ user_key: 'JIRAUSER10001', lower_user_name: 'jsmith' }),
      makeAppUser({ user_key: 'JIRAUSER10002', lower_user_name: 'adoe' }),
    ]
    const personas = adaptJiraUsers(cwdUsers, appUsers)
    expect(personas).toHaveLength(2)
    expect(personas[0].userKey).toBe('JIRAUSER10001')
    expect(personas[1].userKey).toBe('JIRAUSER10002')
  })

  test('skips cwd_user rows with no matching app_user', () => {
    const cwdUsers = [
      makeCwdUser({ lower_user_name: 'ghost' }),
      makeCwdUser({ lower_user_name: 'jsmith' }),
    ]
    const appUsers = [
      makeAppUser({ lower_user_name: 'jsmith', user_key: 'JIRAUSER10001' }),
    ]
    const personas = adaptJiraUsers(cwdUsers, appUsers)
    expect(personas).toHaveLength(1)
    expect(personas[0].userName).toBe('jsmith')
  })

  test('returns empty array when no cwd_users provided', () => {
    const personas = adaptJiraUsers([], [makeAppUser()])
    expect(personas).toHaveLength(0)
  })

  test('returns empty array when no app_users provided', () => {
    const personas = adaptJiraUsers([makeCwdUser()], [])
    expect(personas).toHaveLength(0)
  })

  test('matches on lower_user_name case-insensitively via the stored lowercase key', () => {
    const cwdUsers = [makeCwdUser({ lower_user_name: 'alice', user_name: 'Alice' })]
    const appUsers = [makeAppUser({ lower_user_name: 'alice', user_key: 'JIRAUSER20001' })]
    const personas = adaptJiraUsers(cwdUsers, appUsers)
    expect(personas).toHaveLength(1)
    expect(personas[0].userKey).toBe('JIRAUSER20001')
  })

  test('preserves user_key from app_user for traceability across all returned personas', () => {
    const cwdUsers = [
      makeCwdUser({ lower_user_name: 'u1' }),
      makeCwdUser({ lower_user_name: 'u2' }),
      makeCwdUser({ lower_user_name: 'u3' }),
    ]
    const appUsers = [
      makeAppUser({ lower_user_name: 'u1', user_key: 'KEY-1' }),
      makeAppUser({ lower_user_name: 'u2', user_key: 'KEY-2' }),
      makeAppUser({ lower_user_name: 'u3', user_key: 'KEY-3' }),
    ]
    const personas = adaptJiraUsers(cwdUsers, appUsers)
    const keys = personas.map((p) => p.userKey)
    expect(keys).toEqual(['KEY-1', 'KEY-2', 'KEY-3'])
  })
})

describe('buildUserKeyIndex', () => {
  beforeEach(() => jest.clearAllMocks())

  test('builds a Map keyed by userKey', () => {
    const p1 = adaptJiraUser(makeCwdUser({ lower_user_name: 'u1' }), makeAppUser({ lower_user_name: 'u1', user_key: 'KEY-1' }))
    const p2 = adaptJiraUser(makeCwdUser({ lower_user_name: 'u2' }), makeAppUser({ lower_user_name: 'u2', user_key: 'KEY-2' }))
    const index = buildUserKeyIndex([p1, p2])
    expect(index.get('KEY-1')).toBe(p1)
    expect(index.get('KEY-2')).toBe(p2)
  })

  test('returns empty Map for empty personas array', () => {
    const index = buildUserKeyIndex([])
    expect(index.size).toBe(0)
  })

  test('lookup by userKey returns correct persona', () => {
    const persona = adaptJiraUser(
      makeCwdUser({ display_name: 'Specific Person' }),
      makeAppUser({ user_key: 'UNIQUE-KEY-42' })
    )
    const index = buildUserKeyIndex([persona])
    const found = index.get('UNIQUE-KEY-42')
    expect(found).toBeDefined()
    expect(found.displayName).toBe('Specific Person')
  })
})

describe('buildUserNameIndex', () => {
  beforeEach(() => jest.clearAllMocks())

  test('builds a Map keyed by lowercase userName', () => {
    const p = adaptJiraUser(makeCwdUser({ user_name: 'JSmith' }), makeAppUser())
    const index = buildUserNameIndex([p])
    expect(index.has('jsmith')).toBe(true)
  })

  test('lookup by lowercase userName returns correct persona', () => {
    const p = adaptJiraUser(
      makeCwdUser({ user_name: 'BobMarley', email_address: 'bob@reg.gae' }),
      makeAppUser({ user_key: 'BOB-KEY' })
    )
    const index = buildUserNameIndex([p])
    const found = index.get('bobmarley')
    expect(found).toBeDefined()
    expect(found.emailAddress).toBe('bob@reg.gae')
  })

  test('returns empty Map for empty input', () => {
    const index = buildUserNameIndex([])
    expect(index.size).toBe(0)
  })

  test('all personas are addressable via their lowercased userName', () => {
    const personas = [
      adaptJiraUser(makeCwdUser({ user_name: 'Alpha', lower_user_name: 'alpha' }), makeAppUser({ lower_user_name: 'alpha', user_key: 'K1' })),
      adaptJiraUser(makeCwdUser({ user_name: 'Beta', lower_user_name: 'beta' }), makeAppUser({ lower_user_name: 'beta', user_key: 'K2' })),
    ]
    const index = buildUserNameIndex(personas)
    expect(index.get('alpha').userKey).toBe('K1')
    expect(index.get('beta').userKey).toBe('K2')
  })
})
