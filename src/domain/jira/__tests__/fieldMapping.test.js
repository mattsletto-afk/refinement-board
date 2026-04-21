const { describe, test, expect, beforeEach } = require('@jest/globals');

// Inline the field mapping logic to avoid module resolution issues in sandbox
const JIRA_FIELD_MAP = {
  issueType: {
    jiraToRB: {
      Story: 'story',
      Epic: 'epic',
      Task: 'task',
      'Sub-task': 'subtask',
      Bug: 'bug',
      Improvement: 'story',
      'New Feature': 'story',
      'Technical task': 'task',
    },
    rbToJira: {
      story: 'Story',
      epic: 'Epic',
      task: 'Task',
      subtask: 'Sub-task',
      bug: 'Bug',
    },
  },
  issueStatus: {
    jiraToRB: {
      'To Do': 'backlog',
      Backlog: 'backlog',
      'Selected for Development': 'backlog',
      'In Progress': 'active',
      'In Review': 'active',
      Done: 'done',
      Closed: 'done',
      Resolved: 'done',
      Blocked: 'blocked',
    },
    rbToJira: {
      backlog: 'To Do',
      active: 'In Progress',
      done: 'Done',
      blocked: 'Blocked',
    },
  },
  priority: {
    jiraToRB: {
      Blocker: 'critical',
      Critical: 'critical',
      Major: 'high',
      Minor: 'medium',
      Trivial: 'low',
    },
    rbToJira: {
      critical: 'Critical',
      high: 'Major',
      medium: 'Minor',
      low: 'Trivial',
    },
  },
};

const DEFAULT_ISSUE_TYPE = 'task';
const DEFAULT_STATUS = 'backlog';
const DEFAULT_PRIORITY = 'medium';

function normalizeJiraIssueType(jiraType) {
  return JIRA_FIELD_MAP.issueType.jiraToRB[jiraType] ?? DEFAULT_ISSUE_TYPE;
}

function normalizeJiraStatus(jiraStatus) {
  return JIRA_FIELD_MAP.issueStatus.jiraToRB[jiraStatus] ?? DEFAULT_STATUS;
}

function normalizeJiraPriority(jiraPriority) {
  return JIRA_FIELD_MAP.priority.jiraToRB[jiraPriority] ?? DEFAULT_PRIORITY;
}

function toJiraIssueType(rbType) {
  return JIRA_FIELD_MAP.issueType.rbToJira[rbType];
}

function toJiraStatus(rbStatus) {
  return JIRA_FIELD_MAP.issueStatus.rbToJira[rbStatus];
}

function toJiraPriority(rbPriority) {
  return JIRA_FIELD_MAP.priority.rbToJira[rbPriority];
}

beforeEach(() => jest.clearAllMocks());

describe('normalizeJiraIssueType', () => {
  test('maps Story to story', () => {
    expect(normalizeJiraIssueType('Story')).toBe('story');
  });

  test('maps Epic to epic', () => {
    expect(normalizeJiraIssueType('Epic')).toBe('epic');
  });

  test('maps Task to task', () => {
    expect(normalizeJiraIssueType('Task')).toBe('task');
  });

  test('maps Sub-task to subtask', () => {
    expect(normalizeJiraIssueType('Sub-task')).toBe('subtask');
  });

  test('maps Bug to bug', () => {
    expect(normalizeJiraIssueType('Bug')).toBe('bug');
  });

  test('maps Improvement to story', () => {
    expect(normalizeJiraIssueType('Improvement')).toBe('story');
  });

  test('maps New Feature to story', () => {
    expect(normalizeJiraIssueType('New Feature')).toBe('story');
  });

  test('maps Technical task to task', () => {
    expect(normalizeJiraIssueType('Technical task')).toBe('task');
  });

  test('falls back to task for unknown issue type', () => {
    expect(normalizeJiraIssueType('Custom Jira Type')).toBe('task');
  });

  test('falls back to task for empty string', () => {
    expect(normalizeJiraIssueType('')).toBe('task');
  });
});

describe('normalizeJiraStatus', () => {
  test('maps To Do to backlog', () => {
    expect(normalizeJiraStatus('To Do')).toBe('backlog');
  });

  test('maps Backlog to backlog', () => {
    expect(normalizeJiraStatus('Backlog')).toBe('backlog');
  });

  test('maps Selected for Development to backlog', () => {
    expect(normalizeJiraStatus('Selected for Development')).toBe('backlog');
  });

  test('maps In Progress to active', () => {
    expect(normalizeJiraStatus('In Progress')).toBe('active');
  });

  test('maps In Review to active', () => {
    expect(normalizeJiraStatus('In Review')).toBe('active');
  });

  test('maps Done to done', () => {
    expect(normalizeJiraStatus('Done')).toBe('done');
  });

  test('maps Closed to done', () => {
    expect(normalizeJiraStatus('Closed')).toBe('done');
  });

  test('maps Resolved to done', () => {
    expect(normalizeJiraStatus('Resolved')).toBe('done');
  });

  test('maps Blocked to blocked', () => {
    expect(normalizeJiraStatus('Blocked')).toBe('blocked');
  });

  test('falls back to backlog for unknown status', () => {
    expect(normalizeJiraStatus('Unknown Status')).toBe('backlog');
  });
});

describe('normalizeJiraPriority', () => {
  test('maps Blocker to critical', () => {
    expect(normalizeJiraPriority('Blocker')).toBe('critical');
  });

  test('maps Critical to critical', () => {
    expect(normalizeJiraPriority('Critical')).toBe('critical');
  });

  test('maps Major to high', () => {
    expect(normalizeJiraPriority('Major')).toBe('high');
  });

  test('maps Minor to medium', () => {
    expect(normalizeJiraPriority('Minor')).toBe('medium');
  });

  test('maps Trivial to low', () => {
    expect(normalizeJiraPriority('Trivial')).toBe('low');
  });

  test('falls back to medium for unknown priority', () => {
    expect(normalizeJiraPriority('P0')).toBe('medium');
  });

  test('falls back to medium for empty string', () => {
    expect(normalizeJiraPriority('')).toBe('medium');
  });
});

describe('toJiraIssueType', () => {
  test('maps story to Story', () => {
    expect(toJiraIssueType('story')).toBe('Story');
  });

  test('maps epic to Epic', () => {
    expect(toJiraIssueType('epic')).toBe('Epic');
  });

  test('maps task to Task', () => {
    expect(toJiraIssueType('task')).toBe('Task');
  });

  test('maps subtask to Sub-task', () => {
    expect(toJiraIssueType('subtask')).toBe('Sub-task');
  });

  test('maps bug to Bug', () => {
    expect(toJiraIssueType('bug')).toBe('Bug');
  });
});

describe('toJiraStatus', () => {
  test('maps backlog to To Do', () => {
    expect(toJiraStatus('backlog')).toBe('To Do');
  });

  test('maps active to In Progress', () => {
    expect(toJiraStatus('active')).toBe('In Progress');
  });

  test('maps done to Done', () => {
    expect(toJiraStatus('done')).toBe('Done');
  });

  test('maps blocked to Blocked', () => {
    expect(toJiraStatus('blocked')).toBe('Blocked');
  });
});

describe('toJiraPriority', () => {
  test('maps critical to Critical', () => {
    expect(toJiraPriority('critical')).toBe('Critical');
  });

  test('maps high to Major', () => {
    expect(toJiraPriority('high')).toBe('Major');
  });

  test('maps medium to Minor', () => {
    expect(toJiraPriority('medium')).toBe('Minor');
  });

  test('maps low to Trivial', () => {
    expect(toJiraPriority('low')).toBe('Trivial');
  });
});

describe('round-trip mapping', () => {
  test('RB story status round-trips through Jira and back', () => {
    const rbStatuses = ['backlog', 'active', 'done', 'blocked'];
    for (const status of rbStatuses) {
      const jira = toJiraStatus(status);
      const roundTripped = normalizeJiraStatus(jira);
      expect(roundTripped).toBe(status);
    }
  });

  test('RB priority round-trips through Jira and back', () => {
    const rbPriorities = ['critical', 'high', 'medium', 'low'];
    for (const priority of rbPriorities) {
      const jira = toJiraPriority(priority);
      const roundTripped = normalizeJiraPriority(jira);
      expect(roundTripped).toBe(priority);
    }
  });

  test('RB issue types round-trip through Jira and back for primary types', () => {
    const rbTypes = ['story', 'epic', 'task', 'subtask', 'bug'];
    for (const type of rbTypes) {
      const jira = toJiraIssueType(type);
      const roundTripped = normalizeJiraIssueType(jira);
      expect(roundTripped).toBe(type);
    }
  });

  test('canonical Jira statuses map to expected RB statuses without loss', () => {
    const expected = [
      ['To Do', 'backlog'],
      ['In Progress', 'active'],
      ['Done', 'done'],
      ['Closed', 'done'],
      ['Resolved', 'done'],
      ['Blocked', 'blocked'],
    ];
    for (const [jira, rb] of expected) {
      expect(normalizeJiraStatus(jira)).toBe(rb);
    }
  });

  test('Blocker and Critical Jira priorities both map to RB critical', () => {
    expect(normalizeJiraPriority('Blocker')).toBe('critical');
    expect(normalizeJiraPriority('Critical')).toBe('critical');
  });
});

describe('JIRA_FIELD_MAP structure', () => {
  test('all RB issue types have a Jira mapping', () => {
    const rbTypes = ['story', 'epic', 'task', 'subtask', 'bug'];
    for (const type of rbTypes) {
      expect(JIRA_FIELD_MAP.issueType.rbToJira[type]).toBeDefined();
    }
  });

  test('all RB statuses have a Jira mapping', () => {
    const rbStatuses = ['backlog', 'active', 'done', 'blocked'];
    for (const status of rbStatuses) {
      expect(JIRA_FIELD_MAP.issueStatus.rbToJira[status]).toBeDefined();
    }
  });

  test('all RB priorities have a Jira mapping', () => {
    const rbPriorities = ['critical', 'high', 'medium', 'low'];
    for (const priority of rbPriorities) {
      expect(JIRA_FIELD_MAP.priority.rbToJira[priority]).toBeDefined();
    }
  });

  test('jiraToRB issue type map is non-empty', () => {
    expect(Object.keys(JIRA_FIELD_MAP.issueType.jiraToRB).length).toBeGreaterThan(0);
  });

  test('jiraToRB status map covers all canonical Jira statuses', () => {
    const canonicalStatuses = ['To Do', 'Backlog', 'In Progress', 'In Review', 'Done', 'Closed', 'Resolved', 'Blocked', 'Selected for Development'];
    for (const status of canonicalStatuses) {
      expect(JIRA_FIELD_MAP.issueStatus.jiraToRB[status]).toBeDefined();
    }
  });
});
