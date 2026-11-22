-- QA-ONLY staging parity migration, derived from pinned RC 5c95aad.
-- NEVER apply to the production Supabase project.
-- This is a restrictive change: existing data has no evidence and stays hidden.
DO $stage_only$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE school_id='STAGE38-FICTIONAL-001')
     OR (SELECT count(*) FROM auth.users)>0
     OR (SELECT count(*) FROM public.beagu_2026_results_snapshot)>0
  THEN RAISE EXCEPTION 'QA_ONLY_STAGE40_PRIVACY_MIGRATION_REFUSED'; END IF;
END $stage_only$;
ALTER TABLE public.beagu_2026_results_snapshot
  ADD COLUMN IF NOT EXISTS payload_sha256 text,
  ADD COLUMN IF NOT EXISTS approved_payload_sha256 text,
  ADD COLUMN IF NOT EXISTS source_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS school_match_status text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approval_evidence jsonb;
-- Critical: staging privacy_reviewed flag required IN ADDITION to RC evidence.

create table if not exists beagu_private.beagu_2026_publication_basis_review (
  school_id text primary key references public.schools(school_id),
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  review_status text not null default 'PENDING'
    check(review_status in ('PENDING','VERIFIED','REJECTED')),
  basis_type text check(basis_type in ('EXPLICIT_RESPONDENT_CONSENT','OTHER_DOCUMENTED_LEGAL_BASIS')),
  notice_source_ref text,
  notice_digest_sha256 text check(notice_digest_sha256 ~ '^[a-f0-9]{64}$'),
  notice_effective_at timestamptz,
  publication_scope text,
  reviewer_user_id uuid references auth.users(id),
  distinct_respondents_reviewed boolean not null default false,
  personal_data_reviewed boolean not null default false,
  small_sample_reviewed boolean not null default false,
  reidentification_reviewed boolean not null default false,
  prior_data_combination_reviewed boolean not null default false,
  reviewed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  constraint beagu_2026_verified_basis_complete check(
    review_status <> 'VERIFIED' OR (
      basis_type is not null
      and length(trim(coalesce(notice_source_ref,'')))>=12
      and length(trim(coalesce(publication_scope,'')))>=20
      and notice_digest_sha256 is not null
      and notice_effective_at is not null
      and reviewer_user_id is not null
      and reviewed_at is not null
      and distinct_respondents_reviewed
      and personal_data_reviewed
      and small_sample_reviewed
      and reidentification_reviewed
      and prior_data_combination_reviewed
    )
  )
);
alter table beagu_private.beagu_2026_publication_basis_review enable row level security;
revoke all on beagu_private.beagu_2026_publication_basis_review from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_publication_basis_review to service_role;


create or replace function public.beagu_2026_released_question_results(p_school_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (
    select coalesce(jsonb_agg(q.value),'[]'::jsonb)
    from jsonb_array_elements(r.questions) q(value)
    where q.value->>'id' not in ('Q31','Q51')
  ) from public.beagu_2026_results_snapshot r
  where p_school_id ~ '^[A-Z0-9]{7}$'
    and r.school_id=p_school_id
    and r.approval_status='APPROVED'
    and r.privacy_reviewed is true
    and r.approved_payload_sha256=r.payload_sha256
    and r.approved_at <= now()-interval '24 hours'
    and r.approved_at >= r.updated_at
    and r.school_match_status='EXACT_REGION_OFFICE_NAME'
    and length(trim(r.approved_by))>=2
    and r.approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'
    and not exists(select 1 from unnest(array[
      'source_scoring','school_identity','duplicate_responses',
      'consent','small_sample','reidentification','prior_data_combination']) k
      where coalesce(length(trim(r.approval_evidence->>k)),0)<10)
    and not exists(select 1 from jsonb_array_elements(r.questions) q
      where coalesce((q->>'invalid')::integer,1)>0)
    and exists(
      select 1 from beagu_private.beagu_2026_publication_basis_review b
      where b.school_id=r.school_id
        and b.payload_sha256=r.payload_sha256
        and b.review_status='VERIFIED'
        and b.reviewer_user_id::text=r.approved_by
        and b.reviewed_at>=r.source_snapshot_at
        and b.notice_effective_at<=r.source_snapshot_at
        and b.distinct_respondents_reviewed
        and b.personal_data_reviewed
        and b.small_sample_reviewed
        and b.reidentification_reviewed
        and b.prior_data_combination_reviewed
    )
$$;
revoke all on function public.beagu_2026_released_question_results(text) from public,anon,authenticated;
grant execute on function public.beagu_2026_released_question_results(text) to service_role;

create or replace function public.beagu_2026_lv2_released_question_results(p_school_id text)
returns jsonb language sql stable security definer set search_path='' as $$
  select (
    select coalesce(jsonb_agg(q.value),'[]'::jsonb)
    from jsonb_array_elements(r.questions) q(value)
    where q.value->>'id' not in ('Q31','Q51')
  ) from public.beagu_2026_results_snapshot r
  where p_school_id ~ '^[A-Z0-9]{7}$'
    and r.school_id=p_school_id
    and r.approval_status='APPROVED'
    and r.privacy_reviewed is true
    and r.approved_payload_sha256=r.payload_sha256
    and r.approved_at is not null
    and r.approved_at <= now()
    and r.approved_at >= r.source_snapshot_at
    and r.approved_at >= r.updated_at
    and r.payload_sha256 ~ '^[a-f0-9]{64}$'
    and r.approved_payload_sha256 ~ '^[a-f0-9]{64}$'
    and r.school_match_status='EXACT_REGION_OFFICE_NAME'
    and length(trim(r.approved_by))>=2
    and r.approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'
    and not exists(select 1 from unnest(array[
      'source_scoring','school_identity','duplicate_responses',
      'consent','small_sample','reidentification','prior_data_combination']) k
      where coalesce(length(trim(r.approval_evidence->>k)),0)<10)
    and not exists(select 1 from jsonb_array_elements(r.questions) q
      where coalesce((q->>'invalid')::integer,1)>0)
    and exists(
      select 1 from beagu_private.beagu_2026_publication_basis_review b
      where b.school_id=r.school_id
        and b.payload_sha256=r.payload_sha256
        and b.review_status='VERIFIED'
        and b.reviewer_user_id::text=r.approved_by
        and b.reviewed_at>=r.source_snapshot_at
        and b.notice_effective_at<=r.source_snapshot_at
        and b.distinct_respondents_reviewed
        and b.personal_data_reviewed
        and b.small_sample_reviewed
        and b.reidentification_reviewed
        and b.prior_data_combination_reviewed
    )
$$;
revoke all on function public.beagu_2026_lv2_released_question_results(text) from public, anon, authenticated;
grant execute on function public.beagu_2026_lv2_released_question_results(text) to service_role;
