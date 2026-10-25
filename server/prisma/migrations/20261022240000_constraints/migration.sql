-- Physical integrity constraints beyond what Prisma expresses.
-- Applied by `npx prisma migrate dev` automatically.

-- 1. Scores must lie within the category's stored range and honor its step.
CREATE OR REPLACE FUNCTION check_vote_score() RETURNS trigger AS $$
DECLARE
  cat "Category";
BEGIN
  SELECT * INTO cat FROM "Category" WHERE id = NEW."categoryId";
  IF cat.id IS NULL THEN
    RAISE EXCEPTION 'Score references an unknown category';
  END IF;
  IF NEW.score < cat."minScore" OR NEW.score > cat."maxScore" OR ((NEW.score - cat."minScore") % cat.step) <> 0 THEN
    RAISE EXCEPTION 'Score % is outside the allowed range/steps of category % (min=%, max=%, step=%)',
      NEW.score, cat.name, cat."minScore", cat."maxScore", cat.step;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vote_score_range ON "VoteScore";
CREATE TRIGGER trg_vote_score_range
  BEFORE INSERT OR UPDATE ON "VoteScore"
  FOR EACH ROW EXECUTE FUNCTION check_vote_score();

-- 3. Self-vote prevention: a voter whose room-membership team equals the
--    vote's team is rejected.
CREATE OR REPLACE FUNCTION check_no_self_vote() RETURNS trigger AS $$
DECLARE
  voter_team "RoomMember"."teamId"%TYPE;
BEGIN
  SELECT "teamId" INTO voter_team FROM "RoomMember"
    WHERE "roomId" = NEW."roomId" AND "userId" = NEW."voterId";
  IF voter_team IS NOT NULL AND voter_team = NEW."teamId" THEN
    RAISE EXCEPTION 'Participants cannot vote for their own team';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_self_vote ON "Vote";
CREATE TRIGGER trg_no_self_vote
  BEFORE INSERT OR UPDATE ON "Vote"
  FOR EACH ROW EXECUTE FUNCTION check_no_self_vote();
