import { prisma } from '@/src/infrastructure/db/client';

interface Dependency { id?: string; blockerId: string; blockedId: string; createdAt?: Date }

type PrismaWithDependency = typeof prisma & {
  dependency: {
    findFirst: (args: {
      where: { blockerId: string; blockedId: string };
    }) => Promise<Dependency | null>;
    create: (args: { data: Dependency }) => Promise<Dependency>;
    findMany: (args?: {
      where?: { blockerId?: string; blockedId?: string };
      orderBy?: { createdAt?: 'asc' | 'desc' };
    }) => Promise<Dependency[]>;
    deleteMany: (args: {
      where: { blockerId?: string; blockedId?: string };
    }) => Promise<{ count: number }>;
  };
};

function db(): PrismaWithDependency {
  return prisma as PrismaWithDependency;
}

export async function findDependency(
  blockerId: string,
  blockedId: string,
): Promise<Dependency | null> {
  return db().dependency.findFirst({ where: { blockerId, blockedId } });
}

export async function createDependency(dep: Dependency): Promise<Dependency> {
  return db().dependency.create({ data: dep });
}

export async function findDependencies(filter?: {
  blockerId?: string;
  blockedId?: string;
}): Promise<Dependency[]> {
  return db().dependency.findMany({ where: filter ?? {} });
}

export async function upsertDependency(
  dep: Dependency,
): Promise<{ created: boolean; dependency: Dependency }> {
  const existing = await findDependency(dep.blockerId, dep.blockedId);
  if (existing) {
    return { created: false, dependency: existing };
  }
  const created = await createDependency(dep);
  return { created: true, dependency: created };
}
