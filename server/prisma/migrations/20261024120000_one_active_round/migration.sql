-- A room may have at most one live (PENDING / OPEN / PAUSED) round.
-- Without this, concurrent "select team" calls could create several live
-- rounds and votes would land on whichever one a client happened to load.

-- 1. Repair existing data: keep the newest live round per room, close the rest.
UPDATE "VotingRound" r
SET status = 'CLOSED', "closedAt" = COALESCE(r."closedAt", now())
WHERE r.status IN ('PENDING', 'OPEN', 'PAUSED')
  AND EXISTS (
    SELECT 1 FROM "VotingRound" newer
    WHERE newer."roomId" = r."roomId"
      AND newer.status IN ('PENDING', 'OPEN', 'PAUSED')
      AND (newer."createdAt", newer.id) > (r."createdAt", r.id)
  );

-- 2. Enforce it.
CREATE UNIQUE INDEX "VotingRound_one_active_per_room"
  ON "VotingRound" ("roomId")
  WHERE status IN ('PENDING', 'OPEN', 'PAUSED');
