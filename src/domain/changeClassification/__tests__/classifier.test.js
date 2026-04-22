const { describe, test, expect, beforeEach } = require('@jest/globals');

// Inline the classifier logic for sandbox testing
const UNSAFE_CHANGE_TYPES = new Set([
  'schema_migration',
  'agent_logic_edit',
  'dependency_update',
]);

const SCHEMA_MIGRATION_PATTERNS = [
  /prisma\/migrations\//i,
  /\.sql$/i,
  /schema\.prisma$/i,
  /migration\./i,
];

const AGENT_LOGIC_PATTERNS = [
  /src\/domain\//i,
  /src\/infrastructure\//i,
  /app\/api\//i,
  /SimJobRunner/i,
  /coordinator/i,
  /agent.*runner/i,
  /runner.*agent/i,
];

const DEPENDENCY_PATTERNS = [
  /package\.json$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock/i,
  /requirements\.txt$/i,
  /Pipfile/i,
];

const SAFE_PATTERNS = [
  /\.md$/i,
  /docs\//i,
  /README/i,
  /\.test\.(ts|tsx|js|jsx)$/i,
  /\.spec\.(ts|tsx|js|jsx)$/i,
  /__tests__\//i,
  /app\/.*\/page\.tsx$/i,
  /components\//i,
];

function detectChangeType(filePath, description) {
  const combined = `${filePath} ${description}`;

  for (const pattern of SCHEMA_MIGRATION_PATTERNS) {
    if (pattern.test(combined)) return 'schema_migration';
  }

  for (const pattern of DEPENDENCY_PATTERNS) {
    if (pattern.test(filePath)) return 'dependency_update';
  }

  for (const pattern of AGENT_LOGIC_PATTERNS) {
    if (pattern.test(combined)) return 'agent_logic_edit';
  }

  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(filePath)) {
      if (/\.test\.|__tests__|spec\./i.test(filePath)) return 'test_update';
      if (/\.md$|docs\//i.test(filePath)) return 'documentation';
      if (/page\.tsx|components\//i.test(filePath)) return 'ui_update';
    }
  }

  return 'unknown';
}

function classifyChangeType(changeType) {
  return UNSAFE_CHANGE_TYPES.has(changeType) ? 'UNSAFE' : 'SAFE';
}

function classifyChange(filePath, description) {
  const changeType = detectChangeType(filePath, description);
  const classification = classifyChangeType(changeType);
  return { classification, changeType };
}

function isUnsafeChangeType(changeType) {
  return UNSAFE_CHANGE_TYPES.has(changeType);
}

describe('classifyChange', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('schema migrations', () => {
    test('classifies prisma migration files as UNSAFE schema_migration', () => {
      const result = classifyChange('prisma/migrations/20240101_add_table.sql', 'Add new table');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('schema_migration');
    });

    test('classifies schema.prisma edits as UNSAFE schema_migration', () => {
      const result = classifyChange('prisma/schema.prisma', 'Add new model');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('schema_migration');
    });

    test('classifies .sql files as UNSAFE schema_migration', () => {
      const result = classifyChange('db/init.sql', 'Initialize DB');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('schema_migration');
    });

    test('classifies files with migration in description as UNSAFE schema_migration', () => {
      const result = classifyChange('scripts/run.ts', 'Apply migration for new column');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('schema_migration');
    });
  });

  describe('agent logic edits', () => {
    test('classifies src/domain changes as UNSAFE agent_logic_edit', () => {
      const result = classifyChange('src/domain/changeClassification/classifier.ts', 'Update classifier');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('agent_logic_edit');
    });

    test('classifies src/infrastructure changes as UNSAFE agent_logic_edit', () => {
      const result = classifyChange('src/infrastructure/db/client.ts', 'Update DB client');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('agent_logic_edit');
    });

    test('classifies app/api changes as UNSAFE agent_logic_edit', () => {
      const result = classifyChange('app/api/proposed-changes/route.ts', 'Add new endpoint');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('agent_logic_edit');
    });

    test('classifies SimJobRunner references as UNSAFE agent_logic_edit', () => {
      const result = classifyChange('src/lib/SimJobRunner.ts', 'Refactor job runner');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('agent_logic_edit');
    });

    test('classifies coordinator files as UNSAFE agent_logic_edit', () => {
      const result = classifyChange('src/coordinator/index.ts', 'Update coordinator logic');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('agent_logic_edit');
    });
  });

  describe('dependency updates', () => {
    test('classifies package.json changes as UNSAFE dependency_update', () => {
      const result = classifyChange('package.json', 'Add new dependency');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('dependency_update');
    });

    test('classifies package-lock.json as UNSAFE dependency_update', () => {
      const result = classifyChange('package-lock.json', 'Lock file update');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('dependency_update');
    });

    test('classifies yarn.lock as UNSAFE dependency_update', () => {
      const result = classifyChange('yarn.lock', 'Yarn lock update');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('dependency_update');
    });

    test('classifies requirements.txt as UNSAFE dependency_update', () => {
      const result = classifyChange('requirements.txt', 'Add flask');
      expect(result.classification).toBe('UNSAFE');
      expect(result.changeType).toBe('dependency_update');
    });
  });

  describe('safe changes', () => {
    test('classifies .md files as SAFE documentation', () => {
      const result = classifyChange('docs/api.md', 'Update API docs');
      expect(result.classification).toBe('SAFE');
      expect(result.changeType).toBe('documentation');
    });

    test('classifies README as SAFE documentation', () => {
      const result = classifyChange('README.md', 'Update readme');
      expect(result.classification).toBe('SAFE');
      expect(result.changeType).toBe('documentation');
    });

    test('classifies test files as SAFE test_update', () => {
      const result = classifyChange('src/lib/__tests__/foo.test.ts', 'Add test coverage');
      expect(result.classification).toBe('SAFE');
      expect(result.changeType).toBe('test_update');
    });

    test('classifies .spec.ts files as SAFE test_update', () => {
      const result = classifyChange('src/foo.spec.ts', 'Add specs');
      expect(result.classification).toBe('SAFE');
      expect(result.changeType).toBe('test_update');
    });

    test('classifies page.tsx files as SAFE ui_update', () => {
      const result = classifyChange('app/dashboard/page.tsx', 'Update dashboard layout');
      expect(result.classification).toBe('SAFE');
      expect(result.changeType).toBe('ui_update');
    });

    test('classifies component files as SAFE ui_update', () => {
      const result = classifyChange('components/Button.tsx', 'Update button styles');
      expect(result.classification).toBe('SAFE');
      expect(result.changeType).toBe('ui_update');
    });
  });

  describe('unknown change type', () => {
    test('returns unknown for unrecognized files', () => {
      const result = classifyChange('some/random/file.txt', 'Some change');
      expect(result.changeType).toBe('unknown');
    });
  });
});

describe('isUnsafeChangeType', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns true for schema_migration', () => {
    expect(isUnsafeChangeType('schema_migration')).toBe(true);
  });

  test('returns true for agent_logic_edit', () => {
    expect(isUnsafeChangeType('agent_logic_edit')).toBe(true);
  });

  test('returns true for dependency_update', () => {
    expect(isUnsafeChangeType('dependency_update')).toBe(true);
  });

  test('returns false for documentation', () => {
    expect(isUnsafeChangeType('documentation')).toBe(false);
  });

  test('returns false for test_update', () => {
    expect(isUnsafeChangeType('test_update')).toBe(false);
  });

  test('returns false for ui_update', () => {
    expect(isUnsafeChangeType('ui_update')).toBe(false);
  });

  test('returns false for config_update', () => {
    expect(isUnsafeChangeType('config_update')).toBe(false);
  });

  test('returns false for unknown', () => {
    expect(isUnsafeChangeType('unknown')).toBe(false);
  });
});

describe('approval gate status assignment', () => {
  beforeEach(() => jest.clearAllMocks());

  function getInitialStatus(classification) {
    return classification === 'SAFE' ? 'applied' : 'pending_approval';
  }

  test('SAFE changes get applied status immediately', () => {
    expect(getInitialStatus('SAFE')).toBe('applied');
  });

  test('UNSAFE changes get pending_approval status', () => {
    expect(getInitialStatus('UNSAFE')).toBe('pending_approval');
  });

  test('schema migration results in pending_approval', () => {
    const { classification } = classifyChange('prisma/schema.prisma', 'Add model');
    expect(getInitialStatus(classification)).toBe('pending_approval');
  });

  test('documentation update results in applied immediately', () => {
    const { classification } = classifyChange('docs/guide.md', 'Update guide');
    expect(getInitialStatus(classification)).toBe('applied');
  });

  test('agent logic edit results in pending_approval', () => {
    const { classification } = classifyChange('src/domain/foo/bar.ts', 'Refactor domain logic');
    expect(getInitialStatus(classification)).toBe('pending_approval');
  });
});

describe('approval decision logic', () => {
  beforeEach(() => jest.clearAllMocks());

  function processDecision(currentStatus, decision) {
    if (currentStatus !== 'pending_approval') {
      throw new Error(`Change is not pending approval (current status: ${currentStatus})`);
    }
    return decision.approved ? 'approved' : 'rejected';
  }

  test('approving a pending change yields approved status', () => {
    expect(processDecision('pending_approval', { approved: true })).toBe('approved');
  });

  test('rejecting a pending change yields rejected status', () => {
    expect(processDecision('pending_approval', { approved: false })).toBe('rejected');
  });

  test('approving an already-approved change throws', () => {
    expect(() => processDecision('approved', { approved: true })).toThrow(
      'not pending approval',
    );
  });

  test('approving an applied change throws', () => {
    expect(() => processDecision('applied', { approved: true })).toThrow(
      'not pending approval',
    );
  });

  test('approving a rejected change throws', () => {
    expect(() => processDecision('rejected', { approved: true })).toThrow(
      'not pending approval',
    );
  });
});

describe('classification priority order', () => {
  beforeEach(() => jest.clearAllMocks());

  test('schema migration takes priority over agent logic pattern', () => {
    const result = classifyChange('src/domain/migration.sql', 'SQL migration in domain');
    expect(result.changeType).toBe('schema_migration');
  });

  test('dependency update takes priority over safe patterns', () => {
    const result = classifyChange('package.json', 'Update package.json');
    expect(result.changeType).toBe('dependency_update');
    expect(result.classification).toBe('UNSAFE');
  });

  test('test files inside __tests__ are classified as test_update', () => {
    const result = classifyChange('src/__tests__/classifier.test.ts', 'New tests');
    expect(result.changeType).toBe('test_update');
    expect(result.classification).toBe('SAFE');
  });
});
