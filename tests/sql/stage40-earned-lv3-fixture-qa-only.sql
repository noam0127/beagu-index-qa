-- QA-ONLY: disposable fixture control for real v1.1.0 earned Lv2 -> linked Lv3 E2E.
-- Do NOT execute in production Supabase. Drop the function on completion.
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.schools WHERE school_id='STAGE38-FICTIONAL-001') <> 1
     OR (SELECT count(*) FROM auth.users) <> 0
     OR (SELECT count(*) FROM beagu_private.challenge_identity_codes) <> 0
     OR (SELECT count(*) FROM beagu_private.challenge_referral_profiles) <> 0
     OR (SELECT count(*) FROM beagu_private.challenge_device_claims) <> 0
     OR (SELECT count(*) FROM public.beagu_level_sessions) <> 0
     OR (SELECT count(*) FROM public.beagu_postit_member_accounts) <> 0
     OR (SELECT count(*) FROM public.beagu_site_release_jobs_v1) <> 0
     OR (SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1) IS NOT NULL
  THEN RAISE EXCEPTION 'STAGE40_LV3_QA_ONLY_GUARD_REJECTED'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.beagu_stage40_earned_lv3_fixture_once(
 p_action text, p_visitor uuid, p_identity_code text,
 p_device_hash text DEFAULT NULL, p_referral_hash text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE n integer;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(404011232026::bigint);
 IF (SELECT count(*) FROM public.schools WHERE school_id='STAGE38-FICTIONAL-001')<>1
   OR (SELECT production_sha FROM public.beagu_site_release_state_v1 WHERE id=1) IS NOT NULL
   OR p_visitor IS NULL
   OR p_identity_code !~ '^QA-[A-Za-z0-9]{12,40}$'
 THEN RETURN FALSE; END IF;
 IF p_action='create' THEN
   IF p_device_hash !~ '^[a-f0-9]{64}$'
     OR p_referral_hash !~ '^[a-f0-9]{64}$'
     OR (SELECT count(*) FROM auth.users)<>0
     OR (SELECT count(*) FROM beagu_private.challenge_identity_codes)<>0
     OR (SELECT count(*) FROM beagu_private.challenge_referral_profiles)<>0
     OR (SELECT count(*) FROM beagu_private.challenge_device_claims)<>0
     OR (SELECT count(*) FROM public.beagu_level_sessions)<>0
     OR (SELECT count(*) FROM public.beagu_postit_member_accounts)<>0
   THEN RETURN FALSE; END IF;
   INSERT INTO beagu_private.challenge_identity_codes
      (campaign,visitor_id,participant_no,identity_code)
   VALUES ('2026',p_visitor,90909090,p_identity_code);
   INSERT INTO beagu_private.challenge_referral_profiles
      (campaign,visitor_id,identity_code_sha256,referral_token_sha256,access_level,valid_referrals,disabled)
   VALUES ('2026',p_visitor,pg_catalog.encode(extensions.digest(p_identity_code,'sha256'),'hex'),
      p_referral_hash,1,0,false);
   INSERT INTO beagu_private.challenge_device_claims
      (campaign,visitor_id,device_secret_sha256)
   VALUES ('2026',p_visitor,p_device_hash);
   RETURN TRUE;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM beagu_private.challenge_identity_codes
     WHERE campaign='2026' AND visitor_id=p_visitor AND identity_code=p_identity_code
       AND participant_no=90909090)
 THEN RETURN FALSE; END IF;
 IF p_action='upgrade' THEN
   UPDATE beagu_private.challenge_referral_profiles
   SET access_level=2,valid_referrals=1,upgraded_at=pg_catalog.now()
   WHERE campaign='2026' AND visitor_id=p_visitor AND access_level=1
    AND valid_referrals=0 AND upgraded_at IS NULL AND disabled=false;
   GET DIAGNOSTICS n=ROW_COUNT;
   RETURN n=1;
 ELSIF p_action='revoke' THEN
   UPDATE beagu_private.challenge_referral_profiles SET disabled=true
   WHERE campaign='2026' AND visitor_id=p_visitor AND disabled=false;
   GET DIAGNOSTICS n=ROW_COUNT;
   RETURN n=1;
 ELSIF p_action='cleanup' THEN
   DELETE FROM beagu_private.challenge_device_claims
      WHERE campaign='2026' AND visitor_id=p_visitor;
   DELETE FROM beagu_private.challenge_referral_profiles
      WHERE campaign='2026' AND visitor_id=p_visitor;
   DELETE FROM beagu_private.challenge_identity_codes
      WHERE campaign='2026' AND visitor_id=p_visitor AND participant_no=90909090;
   RETURN TRUE;
 END IF;
 RETURN FALSE;
END
$body$;
REVOKE ALL ON FUNCTION public.beagu_stage40_earned_lv3_fixture_once(text,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage40_earned_lv3_fixture_once(text,uuid,text,text,text)
 TO service_role;
