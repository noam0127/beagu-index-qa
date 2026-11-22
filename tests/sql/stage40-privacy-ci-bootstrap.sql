-- Local PostgreSQL fixture for staging privacy parity; no network, no real users.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA beagu_private;
CREATE TABLE auth.users(
 id uuid primary key,instance_id uuid,aud varchar,role varchar,email varchar,
 raw_app_meta_data jsonb,raw_user_meta_data jsonb,created_at timestamptz,updated_at timestamptz
);
CREATE TABLE public.schools(
 school_id text primary key,school_name text not null,sido text not null
);
INSERT INTO public.schools(school_id,school_name,sido)
 VALUES('STAGE38-FICTIONAL-001','QA-only isolated baseline school','QA');
CREATE TABLE public.beagu_2026_results_snapshot(
 school_id text primary key check(school_id ~ '^TST[0-9]{4}$'),
 approved_at timestamptz,
 approval_status text not null,
 privacy_reviewed boolean not null default false,
 questions jsonb not null default '[]'::jsonb
);
ALTER TABLE public.beagu_2026_results_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beagu_2026_results_snapshot FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.beagu_2026_results_snapshot TO service_role;
