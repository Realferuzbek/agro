-- Read-only security verification. A fabricated non-admin subject cannot mutate application state.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}',true);
do $$
declare denied boolean:=false;
begin
  begin
    perform public.admin_mutate_configuration('parameter.create','{}'::jsonb);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Non-admin mutation was not denied'; end if;
end;
$$;
rollback;

select
  (select count(*) from supabase_migrations.schema_migrations where version between '202609210001' and '202609230009') as recorded_migrations,
  (select count(*) from pg_tables where schemaname='public' and not rowsecurity) as public_tables_without_rls,
  (select count(*) from public.profiles where role='admin') as hosted_admin_count,
  (select count(*) from public.profiles where role='owner' and disabled_at is null) as hosted_active_owner_count,
  (select count(*) from private.owner_registry r join public.profiles p on p.id=r.initial_owner_id where p.role='owner' and p.disabled_at is null) as protected_initial_owner_count,
  (select count(*) from auth.users) as hosted_auth_user_count,
  (select array_agg(tablename order by tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public') as realtime_tables,
  (select count(*) from pg_event_trigger where evtname='ensure_rls' and evtenabled='O') as platform_rls_trigger_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable' and p.prosecdef) as preserved_platform_function_count,
  has_table_privilege('authenticated','public.profiles','UPDATE') as authenticated_can_edit_roles,
  has_table_privilege('authenticated','public.device_credentials','SELECT') as authenticated_can_read_credential_hashes,
  (select state->'calculation'->>'engineVersion' from public.product_state where field_id='00000000-0000-4000-8000-000000000002') as golden_engine_version,
  (select state->'recommendation'->>'parameterVersion' from public.product_state where field_id='00000000-0000-4000-8000-000000000002') as golden_parameter_version,
  (select count(*) from public.parameter_sets where version='potato-loam-demo-1.0.0') as matching_composite_registry_rows;
