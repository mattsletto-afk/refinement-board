import { prisma } from './client'
import type { Persona, PersonaPlacement } from '@/src/domain/types'

function safeParseJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) } catch { return fallback }
}

function serializePersona(r: {
  id: string; name: string; description: string; roleType: string; chesspiece: string
  color: string; strengths: string; weaknesses: string; focusAreas: string
  defaultPrompts: string; systemPrompt: string; agentType: string; model: string | null; enabled: boolean
  createdAt: Date; updatedAt: Date
}): Persona {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    roleType: r.roleType as Persona['roleType'],
    chesspiece: r.chesspiece as Persona['chesspiece'],
    color: r.color,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    focusAreas: r.focusAreas,
    defaultPrompts: safeParseJson(r.defaultPrompts, []),
    systemPrompt: r.systemPrompt,
    agentType: r.agentType as Persona['agentType'],
    model: r.model,
    enabled: r.enabled,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

function serializePlacement(r: {
  id: string; projectId: string; personaId: string; workstreamId: string | null
  sequence: number; createdAt: Date; persona?: Parameters<typeof serializePersona>[0] | null
  workstream?: { id: string; projectId: string | null; name: string; color: string | null; sequence: number; createdAt: Date; updatedAt: Date } | null
}): PersonaPlacement {
  return {
    id: r.id,
    projectId: r.projectId,
    personaId: r.personaId,
    workstreamId: r.workstreamId,
    sequence: r.sequence,
    createdAt: r.createdAt.toISOString(),
    persona: r.persona ? serializePersona(r.persona) : undefined,
    workstream: r.workstream
      ? { id: r.workstream.id, projectId: r.workstream.projectId ?? '', name: r.workstream.name, color: r.workstream.color ?? '#6366f1', sequence: r.workstream.sequence, description: null, focusAreas: [], createdAt: r.workstream.createdAt.toISOString(), updatedAt: r.workstream.updatedAt.toISOString() }
      : undefined,
  }
}

// ── Global persona library ────────────────────────────────────────────────────

export async function listPersonas(): Promise<Persona[]> {
  const rows = await prisma.persona.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map(serializePersona)
}

export async function getPersona(id: string): Promise<Persona | null> {
  const row = await prisma.persona.findUnique({ where: { id } })
  return row ? serializePersona(row) : null
}

export async function createPersona(data: Partial<Persona> & { name: string }): Promise<Persona> {
  const row = await prisma.persona.create({
    data: {
      name: data.name,
      description: data.description ?? '',
      roleType: data.roleType ?? 'contributor',
      chesspiece: data.chesspiece ?? 'pawn',
      color: data.color ?? '#6366f1',
      strengths: data.strengths ?? '',
      weaknesses: data.weaknesses ?? '',
      focusAreas: data.focusAreas ?? '',
      defaultPrompts: JSON.stringify(data.defaultPrompts ?? []),
      systemPrompt: data.systemPrompt ?? '',
      agentType: data.agentType ?? 'human',
      model: data.model ?? null,
      enabled: data.enabled ?? true,
    },
  })
  return serializePersona(row)
}

export async function updatePersona(id: string, data: Partial<Persona>): Promise<Persona> {
  const updateData: Record<string, unknown> = { ...data }
  if (data.defaultPrompts !== undefined) {
    updateData.defaultPrompts = JSON.stringify(data.defaultPrompts)
  }
  const row = await prisma.persona.update({ where: { id }, data: updateData })
  return serializePersona(row)
}

export async function deletePersona(id: string): Promise<void> {
  await prisma.persona.delete({ where: { id } })
}

// ── Project persona placements ────────────────────────────────────────────────

export async function listPlacements(projectId: string): Promise<PersonaPlacement[]> {
  const rows = await prisma.projectPersonaPlacement.findMany({
    where: { projectId },
    include: { persona: true, workstream: true },
    orderBy: { sequence: 'asc' },
  })
  return rows.map(serializePlacement)
}

export async function addPlacement(
  projectId: string,
  personaId: string,
  workstreamId: string | null,
  sequence?: number
): Promise<PersonaPlacement> {
  const count = await prisma.projectPersonaPlacement.count({ where: { projectId } })
  const row = await prisma.projectPersonaPlacement.upsert({
    where: { id: `${projectId}_${personaId}_${workstreamId ?? ''}` },
    create: { projectId, personaId, workstreamId, sequence: sequence ?? count },
    update: { workstreamId, sequence: sequence ?? count },
    include: { persona: true, workstream: true },
  })
  return serializePlacement(row)
}

export async function removePlacement(id: string): Promise<void> {
  await prisma.projectPersonaPlacement.delete({ where: { id } })
}

export async function reorderPlacements(updates: { id: string; workstreamId: string | null; sequence: number }[]): Promise<void> {
  await prisma.$transaction(
    updates.map(({ id, workstreamId, sequence }) =>
      prisma.projectPersonaPlacement.update({ where: { id }, data: { workstreamId, sequence } })
    )
  )
}
