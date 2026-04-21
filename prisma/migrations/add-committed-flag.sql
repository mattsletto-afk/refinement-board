-- Add committed flag to work item hierarchy (SQLite)
-- Run once: npx prisma db execute --file prisma/migrations/add-committed-flag.sql --schema prisma/schema.prisma
-- Then add `committed Boolean @default(false)` to Epic, Feature, UserStory in schema.prisma and run `npx prisma generate`

ALTER TABLE "Epic"      ADD COLUMN "committed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Feature"   ADD COLUMN "committed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserStory" ADD COLUMN "committed" INTEGER NOT NULL DEFAULT 0;
