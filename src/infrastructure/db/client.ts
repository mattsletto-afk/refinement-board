import { PrismaClient } from '@/app/generated/prisma/client'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { neonConfig } = require('@neondatabase/serverless')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaNeon } = require('@prisma/adapter-neon')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws')

// Use ws for WebSocket connections in Node.js (not needed in edge/browser environments)
neonConfig.webSocketConstructor = ws

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
