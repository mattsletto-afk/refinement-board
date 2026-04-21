import type { NodeAssociationRow } from './sprintMembershipAdapter'

type RawNodeAssociationAttributes = {
  SOURCE_NODE_ID?: string
  SOURCE_NODE_ENTITY?: string
  SINK_NODE_ID?: string
  SINK_NODE_ENTITY?: string
  ASSOCIATION_TYPE?: string
  [key: string]: string | undefined
}

export function parseNodeAssociationRow(
  attrs: RawNodeAssociationAttributes
): NodeAssociationRow | null {
  const sourceNodeId = attrs['SOURCE_NODE_ID']?.trim()
  const sourceNodeEntity = attrs['SOURCE_NODE_ENTITY']?.trim()
  const sinkNodeId = attrs['SINK_NODE_ID']?.trim()
  const sinkNodeEntity = attrs['SINK_NODE_ENTITY']?.trim()
  const associationType = attrs['ASSOCIATION_TYPE']?.trim()

  if (
    !sourceNodeId ||
    !sourceNodeEntity ||
    !sinkNodeId ||
    !sinkNodeEntity ||
    !associationType
  ) {
    return null
  }

  return {
    sourceNodeId,
    sourceNodeEntity,
    sinkNodeId,
    sinkNodeEntity,
    associationType,
  }
}

export function parseNodeAssociationXmlBlock(xmlText: string): NodeAssociationRow[] {
  const rows: NodeAssociationRow[] = []
  const rowPattern = /<NodeAssociation([^>]*)\/?>/g
  const attrPattern = /([A-Z_]+)="([^"]*)"/g

  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowPattern.exec(xmlText)) !== null) {
    const attrsText = rowMatch[1]
    const attrs: RawNodeAssociationAttributes = {}

    let attrMatch: RegExpExecArray | null
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
