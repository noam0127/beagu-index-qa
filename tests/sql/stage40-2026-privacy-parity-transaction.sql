
-- QA-only staged, reversible SQL transaction. Never run on a production project.
BEGIN;
DO $guard$
BEGIN
 IF (SELECT count(*) FROM auth.users)<>0 OR (SELECT count(*) FROM public.beagu_2026_results_snapshot)<>0
 OR NOT EXISTS (SELECT 1 FROM public.schools WHERE school_id='STAGE38-FICTIONAL-001')
 OR EXISTS (SELECT 1 FROM public.schools WHERE school_id='TST9090')
 THEN RAISE EXCEPTION 'STAGE40_QA_ONLY_FIXTURE_REFUSED'; END IF;
END $guard$;
INSERT INTO auth.users (id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-0000-4000-8000-000000004040','00000000-0000-0000-0000-000000000000',
'authenticated','authenticated','stage40-privacy@example.invalid','{}'::jsonb,'{}'::jsonb,now(),now());
INSERT INTO public.schools(school_id,school_name,sido)
VALUES ('TST9090','40단계 개인정보 게이트 가상 학교','시험');
INSERT INTO public.beagu_2026_results_snapshot
 (school_id,approved_at,approval_status,privacy_reviewed,questions,payload_sha256,
 approved_payload_sha256,source_snapshot_at,updated_at,school_match_status,approved_by,approval_evidence)
VALUES
 ('TST9090',now()-interval '9 hours','PENDING',false,
 '[{"id":"Q01","valid":1,"invalid":0,"counts":[1]},{"id":"Q31","valid":1,"invalid":0,"counts":[1]}]'::jsonb,
 repeat('a',64),repeat('a',64),now()-interval '72 hours',now()-interval '48 hours',
 'EXACT_REGION_OFFICE_NAME','00000000-0000-4000-8000-000000004040',
 jsonb_build_object('decision','APPROVE_EXACT_SNAPSHOT',
 'source_scoring','source scoring verification',
 'school_identity','school identity verification',
 'duplicate_responses','duplicates verification',
 'consent','consent verified basis',
 'small_sample','small sample and cells',
 'reidentification','reidentification evaluated',
 'prior_data_combination','other releases combination')
);
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_pending_snapshot_leak'; END IF;
END $case$;
UPDATE public.beagu_2026_results_snapshot SET approval_status='APPROVED' WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_privacy_review_false_leak'; END IF;
END $case$;
UPDATE public.beagu_2026_results_snapshot SET privacy_reviewed=true WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_missing_basis_leak'; END IF;
END $case$;
INSERT INTO beagu_private.beagu_2026_publication_basis_review
 (school_id,payload_sha256,review_status,basis_type,notice_source_ref,notice_digest_sha256,
 notice_effective_at,publication_scope,reviewer_user_id,distinct_respondents_reviewed,
 personal_data_reviewed,small_sample_reviewed,reidentification_reviewed,
 prior_data_combination_reviewed,reviewed_at)
VALUES
 ('TST9090',repeat('a',64),'PENDING','EXPLICIT_RESPONDENT_CONSENT',
 'stage40-qa-published-consent-notice',repeat('c',64),
 now()-interval '96 hours','QA-only synthetic school aggregate verification',
 '00000000-0000-4000-8000-000000004040',
 true,true,true,true,true,now()-interval '24 hours');
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_pending_basis_leak'; END IF;
END $case$;
UPDATE beagu_private.beagu_2026_publication_basis_review SET review_status='VERIFIED' WHERE school_id='TST9090';
DO $case$
DECLARE v jsonb;
BEGIN
 v := public.beagu_2026_lv2_released_question_results('TST9090');
 IF jsonb_array_length(v)<>1 OR v->0->>'id'<>'Q01'
 THEN RAISE EXCEPTION 'QA_FAIL_exact_verified_release_or_sensitive_filter'; END IF;
 IF public.beagu_2026_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_lv1_24hour_early_release'; END IF;
END $case$;
UPDATE public.beagu_2026_results_snapshot SET approved_payload_sha256=repeat('b',64) WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_hash_mismatch'; END IF;
END $case$;
UPDATE public.beagu_2026_results_snapshot SET approved_payload_sha256=payload_sha256 WHERE school_id='TST9090';
UPDATE beagu_private.beagu_2026_publication_basis_review SET review_status='REJECTED' WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_revoked_basis'; END IF;
END $case$;
UPDATE beagu_private.beagu_2026_publication_basis_review SET review_status='PENDING',prior_data_combination_reviewed=false WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_prior_combination_unreviewed'; END IF;
END $case$;
UPDATE beagu_private.beagu_2026_publication_basis_review SET prior_data_combination_reviewed=true,review_status='VERIFIED' WHERE school_id='TST9090';
UPDATE public.beagu_2026_results_snapshot SET questions='[{"id":"Q01","invalid":1},{"id":"Q31","invalid":0}]'::jsonb WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_invalid_question'; END IF;
END $case$;
UPDATE public.beagu_2026_results_snapshot
 SET questions='[{"id":"Q01","valid":1,"invalid":0,"counts":[1]},{"id":"Q31","valid":1,"invalid":0,"counts":[1]}]'::jsonb,
 approval_evidence=jsonb_build_object('decision','APPROVE_EXACT_SNAPSHOT')
 WHERE school_id='TST9090';
DO $case$
BEGIN
 IF public.beagu_2026_lv2_released_question_results('TST9090') IS NOT NULL
 THEN RAISE EXCEPTION 'QA_FAIL_missing_review_evidence'; END IF;
END $case$;
UPDATE public.beagu_2026_results_snapshot SET
 approval_evidence=jsonb_build_object('decision','APPROVE_EXACT_SNAPSHOT',
 'source_scoring','source scoring verification','school_identity','school identity verification',
 'duplicate_responses','duplicates verification','consent','consent verified basis',
 'small_sample','small sample and cells','reidentification','reidentification evaluated',
 'prior_data_combination','other releases combination'),
 approved_at=now()-interval '25 hours'
WHERE school_id='TST9090';
DO $case$
DECLARE v jsonb;
BEGIN
 v:=public.beagu_2026_released_question_results('TST9090');
 IF jsonb_array_length(v)<>1 OR v->0->>'id'<>'Q01'
 THEN RAISE EXCEPTION 'QA_FAIL_lv1_after_24hours'; END IF;
 IF has_function_privilege('anon','public.beagu_2026_released_question_results(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.beagu_2026_lv2_released_question_results(text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.beagu_2026_lv2_released_question_results(text)','EXECUTE')
 THEN RAISE EXCEPTION 'QA_FAIL_rpc_role_grants'; END IF;
END $case$;
ROLLBACK;
SELECT (SELECT count(*) FROM auth.users)=0 AS cleaned_test_user,
       (SELECT count(*) FROM public.beagu_2026_results_snapshot)=0 AS cleaned_test_snapshot,
       (SELECT count(*) FROM beagu_private.beagu_2026_publication_basis_review)=0 AS cleaned_review,
       (SELECT count(*) FROM public.schools WHERE school_id='TST9090')=0 AS cleaned_test_school;
