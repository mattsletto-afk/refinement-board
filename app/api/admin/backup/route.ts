import { NextResponse } from 'next/server'
import { copyFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * POST /api/admin/backup
 * Copies dev.db to a timestamped backup file in the backups/ directory.
 */
export async function POST(): Promise<NextResponse> {
  const repoRoot  = process.cwd()
  const srcDb     = path.join(repoRoot, 'dev.db')
  const backupDir = path.join(repoRoot, 'backups')

  await mkdir(backupDir, { recursive: true })

  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(backupDir, `dev-${timestamp}.db`)

  try {
    await copyFile(srcDb, backupFile)
    return NextResponse.json({
      ok:     true,
      backup: backupFile,
      ts:     timestamp,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Backup failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
