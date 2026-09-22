begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public','product_state','Authoritative field state is persisted');
select has_table('public','telemetry','Telemetry history exists');
select ok(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
),'Every exposed application table enables RLS');
select ok(not has_table_privilege('anon','public.product_state','UPDATE'),'Anonymous users cannot update field state');
select ok(not has_table_privilege('authenticated','public.profiles','UPDATE'),'Authenticated users cannot self-assign administrator roles');
select ok(not has_table_privilege('anon','public.telemetry','SELECT'),'Raw telemetry is not anonymous data');
select ok(not has_table_privilege('authenticated','public.device_credentials','SELECT'),'Credential hashes remain server-only');
select ok(has_table_privilege('anon','public.product_state','SELECT'),'Public projection supports anonymous read with RLS');
select ok(not has_function_privilege('anon','public.commit_simulation_state(uuid,bigint,uuid,text,text,jsonb,jsonb)','EXECUTE'),'Anonymous callers cannot execute authoritative simulation writes');
select ok(has_function_privilege('authenticated','public.commit_simulation_state(uuid,bigint,uuid,text,text,jsonb,jsonb)','EXECUTE'),'Authenticated users can reach the RPC, which checks administrator role internally');
select ok(not has_function_privilege('authenticated','public.ingest_and_recalculate(uuid,text,text,text,timestamptz,text,jsonb,jsonb,bigint,jsonb,jsonb,timestamptz)','EXECUTE'),'Device ingestion transaction is restricted to the verified server');
select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('commit_simulation_state','admin_mutate_configuration','admin_credential_metadata','ingest_telemetry_event','initialize_demo_state','ingest_and_recalculate') and p.prosecdef
),'Exposed application RPCs use security invoker; privileged bodies stay in private schema');

select * from finish();
rollback;
