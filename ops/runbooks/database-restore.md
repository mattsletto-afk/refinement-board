# Database Restore Runbook

## Overview

This runbook describes how to restore the SQLite database (`dev.db`) from a backup file created by the automated backup system.

## Backup Location

Backup files are stored in `backups/` at the repo root, named `dev-<ISO-timestamp>.db`.

## Restore Steps

1. **Stop the application** (to avoid file locks):

   ```bash
   # If using PM2:
   pm2 stop refinement-board

   # Or kill the Next.js dev server:
   pkill -f "next start"
   ```

2. **Identify the backup to restore**:

   ```bash
   ls -lh backups/ | sort -k6,7
   ```

3. **Copy the backup over the live database**:

   ```bash
   cp backups/dev-<TIMESTAMP>.db dev.db
   ```

4. **Verify the restore**:

   ```bash
   sqlite3 dev.db ".tables"
   sqlite3 dev.db "SELECT COUNT(*) FROM UserStory;"
   ```

5. **Restart the application**:

   ```bash
   pm2 start refinement-board
   # or
   npm run start
   ```

## Automated Backup

Backups are triggered via:

- **API**: `POST /api/admin/backup`
- **GitHub Actions**: `.github/workflows/backup.yml` (runs on schedule)

## Notes

- Backups are a file copy — they capture the exact state at the time of the copy.
- SQLite WAL mode may need a checkpoint before backup for consistency: `PRAGMA wal_checkpoint(FULL);`
- For production, consider off-site storage (S3, GCS) for the backup files.
