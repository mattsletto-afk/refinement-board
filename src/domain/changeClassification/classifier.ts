import type { ChangeClassification, ChangeType, ClassificationResult } from './types';

const UNSAFE_CHANGE_TYPES: ReadonlySet<ChangeType> = new Set([
  'schema_migration',
  'agent_logic_edit',
  'dependency_update',
]);

const SCHEMA_MIGRATION_PATTERNS: readonly RegExp[] = [
  /prisma\/migrations\//i,
  /\.sql$/i,
  /schema\.prisma$/i,
  /migration\./i,
];

const AGENT_LOGIC_PATTERNS: readonly RegExp[] = [
  /src\/domain\//i,
  /src\/infrastructure\//i,
  /app\/api\//i,
  /SimJobRunner/i,
  /coordinator/i,
  /agent.*runner/i,
  /runner.*agent/i,
];

const DEPENDENCY_PATTERNS: readonly RegExp[] = [
  /package\.json$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock/i,
  /requirements\.txt$/i,
  /Pipfile/i,
];

const SAFE_PATTERNS: readonly RegExp[] = [
  /\.md$/i,
  /docs\//i,
  /README/i,
  /\.test\.(ts|tsx|js|jsx)$/i,
  /\.spec\.(ts|tsx|js|jsx)$/i,
  /__tests__\//i,
  /app\/.*\/page\.tsx$/i,
  /components\//i,
];

function detectChangeType(filePath: string, description: string): ChangeType {
  const combined = `${filePath} ${description}`;

  for (const pattern of SCHEMA_MIGRATION_PATTERNS) {
    if (pattern.test(combined)) {
      return 'schema_migration';
    }
  }

  for (const pattern of DEPENDENCY_PATTERNS) {
    if (pattern.test(filePath)) {
      return 'dependency_update';
    }
  }

  for (const pattern of AGENT_LOGIC_PATTERNS) {
    if (pattern.test(combined)) {
      return 'agent_logic_edit';
    }
  }

  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(filePath)) {
      if (/\.test\.|__tests__|spec\./i.test(filePath)) {
        return 'test_update';
      }
      if (/\.md$|docs\//i.test(filePath)) {
        return 'documentation';
      }
      if (/page\.tsx|components\//i.test(filePath)) {
        return 'ui_update';
      }
    }
  }

  return 'unknown';
}

function classifyChangeType(changeType: ChangeType): ChangeClassification {
  return UNSAFE_CHANGE_TYPES.has(changeType) ? 'UNSAFE' : 'SAFE';
}

function buildReason(changeType: ChangeType, classification: ChangeClassification): string {
  const reasonMap: Record<ChangeType, string> = {
    schema_migration: 'Schema migrations modify database structure and require human review before application',
    agent_logic_edit: 'Changes to agent domain logic or API routes require human review to prevent unintended autonomous behavior',
    dependency_update: 'Dependency updates may introduce security vulnerabilities and require human review',
    config_update: 'Configuration updates are applied immediately as they are low risk',
    documentation: 'Documentation changes are applied immediately as they carry no execution risk',
    test_update: 'Test file updates are applied immediately as they do not affect production logic',
    ui_update: 'UI component changes are applied immediately as they carry minimal runtime risk',
    unknown: classification === 'SAFE'
      ? 'Change type could not be determined but pattern analysis indicates low risk'
      : 'Change type could not be determined; defaulting to safe application',
  };

  return reasonMap[changeType];
}

export function classifyChange(
  filePath: string,
  description: string,
): ClassificationResult {
  const changeType = detectChangeType(filePath, description);
  const classification = classifyChangeType(changeType);
  const reason = buildReason(changeType, classification);

  return { classification, changeType, reason };
}

export function isUnsafeChangeType(changeType: ChangeType): boolean {
  return UNSAFE_CHANGE_TYPES.has(changeType);
}
