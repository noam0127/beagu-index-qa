-- TEST ONLY: run against ycwuugggqbunlbwuzvbx.
-- Checked and executed via isolated Supabase SQL tool on 2026-11-23.
-- Every synthetic row is rolled back. DO NOT run on the production project.
BEGIN;
DO $$
BEGIN
 IF current_database() IS NULL THEN RAISE EXCEPTION 'DATABASE_IDENTITY_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM public.beagu_2026_results_snapshot WHERE school_id='TST9090')
 THEN RAISE EXCEPTION 'TEST_SCHOOL_COLLISION'; END IF;
END $$;
INSERT INTO public.beagu_2026_results_snapshot
(school_id,approved_at,approval_status,privacy_reviewed,questions)
VALUES ('TST9090',now()-interval '9 hours','PENDING',false,
 '[{"id":"Q01","value":0.4}]'::jsonb);
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.beagu_2026_lv2_released_question_results('TST9090');
 IF v IS NOT NULL THEN RAISE EXCEPTION 'PENDING_SNAPSHOT_LEAK'; END IF;
END $$;
UPDATE public.beagu_2026_results_snapshot
SET approval_status='APPROVED' WHERE school_id='TST9090';
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.beagu_2026_lv2_released_question_results('TST9090');
 IF v IS NOT NULL THEN RAISE EXCEPTION 'UNREVIEWED_SNAPSHOT_LEAK'; END IF;
END $$;
UPDATE public.beagu_2026_results_snapshot
SET privacy_reviewed=true WHERE school_id='TST9090';
DO $$
DECLARE v jsonb;
BEGIN
 v:=public.beagu_2026_lv2_released_question_results('TST9090');
 IF v IS DISTINCT FROM '[{"id":"Q01","value":0.4}]'::jsonb
 THEN RAISE EXCEPTION 'REVIEWED_SNAPSHOT_NOT_AVAILABLE'; END IF;
END $$;
ROLLBACK;
SELECT count(*)=0 AS synthetic_row_rolled_back
FROM public.beagu_2026_results_snapshot WHERE school_id='TST9090';
