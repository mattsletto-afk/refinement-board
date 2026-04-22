const { describe, test, expect, beforeEach } = require('@jest/globals')

beforeEach(() => jest.clearAllMocks())

// Inline parser logic
function parseNodeAssociationRow(attrs) {
  const sourceNodeId = attrs['SOURCE_NODE_ID']?.trim()
  const sourceNodeEntity = attrs['SOURCE_NODE_ENTITY']?.trim()
  const sinkNodeId = attrs['SINK_NODE_ID']?.trim()
  const sinkNodeEntity = attrs['SINK_NODE_ENTITY']?.trim()
  const associationType = attrs['ASSOCIATION_TYPE']?.trim()

  if (!sourceNodeId || !sourceNodeEntity || !sinkNodeId || !sinkNodeEntity || !associationType) {
    return null
  }

  return { sourceNodeId, sourceNodeEntity, sinkNodeId, sinkNodeEntity, associationType }
}

function parseNodeAssociationXmlBlock(xmlText) {
  const rows = []
  const rowPattern = /<NodeAssociation([^>]*)\/?>/g
  const attrPattern = /([A-Z_]+)="([^"]*)"/g

  let rowMatch
  while ((rowMatch = rowPattern.exec(xmlText)) !== null) {
    const attrsText = rowMatch[1]
    const attrs = {}

    let attrMatch
    while ((attrMatch = attrPattern.exec(attrsText)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
    }
    attrPattern.lastIndex = 0

    const row = parseNodeAssociationRow(attrs)
    if (row !== null) {
      rows.push(row)
    }
  }

  return rows
}

describe('parseNodeAssociationRow', () => {
  test('returns parsed row for valid attributes', () => {
    const attrs = {
      SOURCE_NODE_ID: '42',
      SOURCE_NODE_ENTITY: 'Sprint',
      SINK_NODE_ID: '100',
      SINK_NODE_ENTITY: 'Issue',
      ASSOCIATION_TYPE: 'IssueInSprint',
    }
    const result = parseNodeAssociationRow(attrs)
    expect(result).toEqual({
      sourceNodeId: '42',
      sourceNodeEntity: 'Sprint',
      sinkNodeId: '100',
      sinkNodeEntity: 'Issue',
      associationType: 'IssueInSprint',
    })
  })

  test('returns null when SOURCE_NODE_ID is missing', () => {
    const attrs = {
      SOURCE_NODE_ENTITY: 'Sprint',
      SINK_NODE_ID: '100',
      SINK_NODE_ENTITY: 'Issue',
      ASSOCIATION_TYPE: 'IssueInSprint',
    }
    expect(parseNodeAssociationRow(attrs)).toBeNull()
  })

  test('returns null when ASSOCIATION_TYPE is missing', () => {
    const attrs = {
      SOURCE_NODE_ID: '42',
      SOURCE_NODE_ENTITY: 'Sprint',
      SINK_NODE_ID: '100',
      SINK_NODE_ENTITY: 'Issue',
    }
    expect(parseNodeAssociationRow(attrs)).toBeNull()
  })

  test('trims whitespace from attribute values', () => {
    const attrs = {
      SOURCE_NODE_ID: '  42  ',
      SOURCE_NODE_ENTITY: '  Sprint  ',
      SINK_NODE_ID: '  100  ',
      SINK_NODE_ENTITY: '  Issue  ',
      ASSOCIATION_TYPE: '  IssueInSprint  ',
    }
    const result = parseNodeAssociationRow(attrs)
    expect(result).not.toBeNull()
    expect(result.sourceNodeId).toBe('42')
    expect(result.associationType).toBe('IssueInSprint')
  })

  test('returns null when SINK_NODE_ENTITY is missing', () => {
    const attrs = {
      SOURCE_NODE_ID: '42',
      SOURCE_NODE_ENTITY: 'Sprint',
      SINK_NODE_ID: '100',
      ASSOCIATION_TYPE: 'IssueInSprint',
    }
    expect(parseNodeAssociationRow(attrs)).toBeNull()
  })
})

describe('parseNodeAssociationXmlBlock', () => {
  test('parses multiple NodeAssociation elements', () => {
    const xml = `
      <NodeAssociation SOURCE_NODE_ID="1" SOURCE_NODE_ENTITY="Sprint" SINK_NODE_ID="10" SINK_NODE_ENTITY="Issue" ASSOCIATION_TYPE="IssueInSprint"/>
      <NodeAssociation SOURCE_NODE_ID="1" SOURCE_NODE_ENTITY="Sprint" SINK_NODE_ID="11" SINK_NODE_ENTITY="Issue" ASSOCIATION_TYPE="IssueInSprint"/>
    `
    const rows = parseNodeAssociationXmlBlock(xml)
    expect(rows).toHaveLength(2)
    expect(rows[0].sourceNodeId).toBe('1')
    expect(rows[0].sinkNodeId).toBe('10')
    expect(rows[1].sinkNodeId).toBe('11')
  })

  test('returns empty array for xml with no NodeAssociation elements', () => {
    const xml = '<SomeOtherTag ATTR="val"/>'
    expect(parseNodeAssociationXmlBlock(xml)).toHaveLength(0)
  })

  test('skips elements with missing required attributes', () => {
    const xml = `
      <NodeAssociation SOURCE_NODE_ID="1" SOURCE_NODE_ENTITY="Sprint" SINK_NODE_ID="10" SINK_NODE_ENTITY="Issue" ASSOCIATION_TYPE="IssueInSprint"/>
      <NodeAssociation SOURCE_NODE_ID="" SOURCE_NODE_ENTITY="Sprint" SINK_NODE_ID="11" SINK_NODE_ENTITY="Issue" ASSOCIATION_TYPE="IssueInSprint"/>
    `
    const rows = parseNodeAssociationXmlBlock(xml)
    expect(rows).toHaveLength(1)
    expect(rows[0].sinkNodeId).toBe('10')
  })

  test('parses IssueInVersion rows too (non-sprint associations still parsed)', () => {
    const xml = `
      <NodeAssociation SOURCE_NODE_ID="5" SOURCE_NODE_ENTITY="Version" SINK_NODE_ID="20" SINK_NODE_ENTITY="Issue" ASSOCIATION_TYPE="IssueInVersion"/>
    `
    const rows = parseNodeAssociationXmlBlock(xml)
    expect(rows).toHaveLength(1)
    expect(rows[0].associationType).toBe('IssueInVersion')
  })

  test('handles empty xml string', () => {
    expect(parseNodeAssociationXmlBlock('')).toHaveLength(0)
  })

  test('parses non-self-closing NodeAssociation tags', () => {
    const xml = '<NodeAssociation SOURCE_NODE_ID="3" SOURCE_NODE_ENTITY="Sprint" SINK_NODE_ID="30" SINK_NODE_ENTITY="Issue" ASSOCIATION_TYPE="IssueInSprint">'
    const rows = parseNodeAssociationXmlBlock(xml)
    expect(rows).toHaveLength(1)
    expect(rows[0].sourceNodeId).toBe('3')
  })
})
