-- TEST ONLY: isolated staging project ycwuugggqbunlbwuzvbx.
-- Verified 2026-11-23; staging state A→B→A without production state changes.
-- This checks DB state transitions, NOT live deploy-controller execution.
-- Commit SHAs below are intentionally fake; entire transaction rolled back.
BEGIN;
DO $$
DECLARE s public.beagu_site_release_state_v1%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.beagu_site_release_state_v1 WHERE id=1 FOR UPDATE;
 IF s.staging_sha IS NOT NULL OR s.production_sha IS NOT NULL
 THEN RAISE EXCEPTION 'INITIAL_STAGING_STATE_NOT_EMPTY'; END IF;
END $$;
UPDATE public.beagu_site_release_state_v1
SET staging_sha=repeat('a',40),staging_version='stage40qa-A' WHERE id=1;
DO $$
DECLARE s public.beagu_site_release_state_v1%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.beagu_site_release_state_v1 WHERE id=1;
 IF s.staging_sha<>repeat('a',40) OR s.production_sha IS NOT NULL
 THEN RAISE EXCEPTION 'A_STATE_OR_PRODUCTION_ISOLATION_FAILED'; END IF;
END $$;
UPDATE public.beagu_site_release_state_v1
SET staging_sha=repeat('b',40),staging_version='stage40qa-B' WHERE id=1;
DO $$
DECLARE s public.beagu_site_release_state_v1%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.beagu_site_release_state_v1 WHERE id=1;
 IF s.staging_sha<>repeat('b',40) OR s.production_sha IS NOT NULL
 THEN RAISE EXCEPTION 'B_STATE_OR_PRODUCTION_ISOLATION_FAILED'; END IF;
END $$;
UPDATE public.beagu_site_release_state_v1
SET staging_sha=repeat('a',40),staging_version='stage40qa-A' WHERE id=1;
DO $$
DECLARE s public.beagu_site_release_state_v1%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.beagu_site_release_state_v1 WHERE id=1;
 IF s.staging_sha<>repeat('a',40) OR s.staging_version<>'stage40qa-A'
    OR s.production_sha IS NOT NULL
 THEN RAISE EXCEPTION 'ROLLBACK_OR_PRODUCTION_ISOLATION_FAILED'; END IF;
END $$;
ROLLBACK;
SELECT staging_sha IS NULL AND staging_version IS NULL
    AND production_sha IS NULL AND production_version IS NULL AS fully_rolled_back
FROM public.beagu_site_release_state_v1 WHERE id=1;
