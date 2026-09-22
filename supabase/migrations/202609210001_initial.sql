-- AgriFlow: authoritative data is persisted; only explicitly public demo data is readable anonymously.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.user_role as enum ('farmer', 'admin');
create type public.data_provenance as enum ('SIMULATED', 'MEASURED', 'FORECAST', 'ESTIMATED', 'DERIVED', 'MANUAL', 'REFERENCE');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'farmer',
  display_name text,
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, role) values (new.id, 'farmer');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null,
  is_public_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.fields (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id),
  name text not null,
  area_m2 numeric not null check (area_m2 > 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index fields_farm_idx on public.fields(farm_id);

create function private.can_read_field(p_field_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.fields f join public.farms farm on farm.id=f.farm_id
    where f.id=p_field_id and farm.is_public_demo) or private.is_admin();
$$;
revoke all on function private.can_read_field(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.is_admin() to anon;
grant execute on function private.can_read_field(uuid) to anon, authenticated, service_role;

create table public.parameter_sets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crop','soil','policy','irrigation','simulation')),
  version text not null,
  name text not null,
  parameters jsonb not null check (jsonb_typeof(parameters)='object'),
  source jsonb not null check (jsonb_typeof(source)='object'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(kind,version)
);

create table public.devices (
  id text primary key,
  field_id uuid not null references public.fields(id),
  zone_id text,
  name text not null,
  kind text not null,
  mode text not null default 'SIMULATED' check (mode in ('SIMULATED','MEASURED')),
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index devices_field_idx on public.devices(field_id);
create table public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id),
  token_hash text not null unique check(length(token_hash)=64),
  token_prefix text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.product_state (
  field_id uuid primary key references public.fields(id),
  revision bigint not null default 0 check(revision>=0),
  state jsonb not null check(jsonb_typeof(state)='object'),
  updated_at timestamptz not null default now()
);
create table public.state_mutations (
  field_id uuid not null references public.fields(id),
  idempotency_key uuid not null,
  request_hash text not null,
  revision bigint not null,
  actor_id uuid references public.profiles(id),
  action text not null,
  created_at timestamptz not null default now(),
  primary key(field_id,idempotency_key)
);
create table public.simulation_controls (
  field_id uuid primary key references public.fields(id),
  status text not null default 'paused' check(status in ('running','paused')),
  speed integer not null default 1 check(speed in (1,10,60)),
  updated_at timestamptz not null default now()
);
create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id),
  revision bigint not null,
  engine_version text not null,
  parameter_version text not null,
  calculated_at timestamptz not null,
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
  provenance public.data_provenance not null default 'DERIVED',
  created_at timestamptz not null default now(),
  unique(field_id,revision)
);
create index calculations_field_date_idx on public.calculation_runs(field_id,calculated_at desc);
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id),
  calculation_id uuid not null references public.calculation_runs(id),
  revision bigint not null,
  recommendation jsonb not null,
  created_at timestamptz not null default now(),
  unique(field_id,revision)
);

create table public.telemetry (
  id bigint generated always as identity primary key,
  field_id uuid not null references public.fields(id),
  device_id text not null references public.devices(id),
  event_id text not null,
  content_hash text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  provenance public.data_provenance not null,
  quality text not null check(quality in ('valid','outlier','stale','conflict','invalid')),
  normalized jsonb not null,
  raw_payload jsonb,
  unique(device_id,event_id)
);
create index telemetry_field_time_idx on public.telemetry(field_id,observed_at desc);
create index telemetry_device_time_idx on public.telemetry(device_id,observed_at desc);
create table public.device_latest_state (
  device_id text primary key references public.devices(id),
  field_id uuid not null references public.fields(id),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  provenance public.data_provenance not null,
  quality text not null,
  measurements jsonb not null
);

create table public.weather_observations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id),
  observed_at timestamptz not null,
  source_id text not null,
  provenance public.data_provenance not null check(provenance in ('SIMULATED','MEASURED','MANUAL')),
  data jsonb not null,
  unique(field_id,source_id,observed_at)
);
create table public.weather_forecasts (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id),
  issued_at timestamptz not null,
  valid_at timestamptz not null,
  source_id text not null,
  provenance public.data_provenance not null default 'FORECAST' check(provenance='FORECAST'),
  data jsonb not null,
  unique(field_id,source_id,issued_at,valid_at)
);
create index weather_observations_field_time_idx on public.weather_observations(field_id,observed_at desc);
create index weather_forecasts_field_time_idx on public.weather_forecasts(field_id,valid_at desc);

create table public.irrigation_runs (
  id text primary key,
  field_id uuid not null references public.fields(id),
  status text not null,
  started_at timestamptz not null,
  updated_at timestamptz not null,
  snapshot jsonb not null
);
create index irrigation_runs_field_time_idx on public.irrigation_runs(field_id,started_at desc);
create table public.alerts (
  id text primary key,
  field_id uuid not null references public.fields(id),
  type text not null,
  severity text not null,
  detected_at timestamptz not null,
  status text not null default 'open',
  evidence jsonb not null,
  resolution text,
  updated_at timestamptz not null default now()
);
create index alerts_field_time_idx on public.alerts(field_id,detected_at desc);
create table public.simulation_events (
  id text primary key,
  field_id uuid not null references public.fields(id),
  revision bigint not null,
  simulated_at timestamptz not null,
  type text not null,
  payload jsonb not null
);
create index simulation_events_field_time_idx on public.simulation_events(field_id,simulated_at desc);
create table public.commissioning_runs (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(id),
  field_id uuid not null references public.fields(id),
  mode text not null check(mode='SIMULATED'),
  results jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_time_idx on public.audit_logs(created_at desc);

-- Explicit grants, RLS enabled on every exposed table. No anonymous/authenticated role receives direct write grants.
do $$ declare t text; begin
  foreach t in array array['profiles','farms','fields','parameter_sets','devices','device_credentials','product_state','state_mutations','simulation_controls','calculation_runs','recommendations','telemetry','device_latest_state','weather_observations','weather_forecasts','irrigation_runs','alerts','simulation_events','commissioning_runs','audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t <> 'device_credentials' then
      execute format('grant select on public.%I to authenticated',t);
      execute format('create policy admin_read on public.%I for select to authenticated using ((select private.is_admin()))',t);
    end if;
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;
create policy profile_self_read on public.profiles for select to authenticated using (id=(select auth.uid()));
grant select on public.farms,public.fields,public.parameter_sets,public.devices,public.product_state,public.calculation_runs,public.recommendations,public.device_latest_state,public.weather_observations,public.weather_forecasts,public.irrigation_runs,public.alerts to anon;
create policy demo_read on public.farms for select to anon,authenticated using (is_public_demo);
create policy demo_read on public.fields for select to anon,authenticated using (private.can_read_field(id));
create policy reference_read on public.parameter_sets for select to anon,authenticated using(true);
do $$ declare t text; begin
  foreach t in array array['devices','product_state','calculation_runs','recommendations','device_latest_state','weather_observations','weather_forecasts','irrigation_runs','alerts'] loop
    execute format('create policy demo_read on public.%I for select to anon,authenticated using (private.can_read_field(field_id))',t);
  end loop;
end $$;

-- SECURITY DEFINER is kept in unexposed private; public wrappers are SECURITY INVOKER.
create function private.commit_state(
  p_field_id uuid, p_expected_revision bigint, p_idempotency_key uuid,
  p_request_hash text, p_action text, p_state jsonb, p_bundle jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_row public.product_state; prior public.state_mutations; next_revision bigint; item jsonb; calc_id uuid;
begin
  if not private.is_admin() then raise exception 'Administrator role required' using errcode='42501'; end if;
  if jsonb_typeof(p_state)<>'object' or (p_state->>'schemaVersion')::integer<>1 then raise exception 'Invalid state schema' using errcode='22023'; end if;
  select * into current_row from public.product_state where field_id=p_field_id for update;
  if not found then raise exception 'Field state not initialized' using errcode='P0002'; end if;
  select * into prior from public.state_mutations where field_id=p_field_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_hash<>p_request_hash then raise exception 'Idempotency key reused for different request' using errcode='22023'; end if;
    return jsonb_build_object('revision',current_row.revision,'state',current_row.state,'duplicate',true);
  end if;
  if current_row.revision<>p_expected_revision then raise exception 'State version conflict' using errcode='40001'; end if;
  next_revision := current_row.revision+1;
  update public.product_state set state=p_state, revision=next_revision, updated_at=now() where field_id=p_field_id;
  insert into public.state_mutations(field_id,idempotency_key,request_hash,revision,actor_id,action) values(p_field_id,p_idempotency_key,p_request_hash,next_revision,auth.uid(),p_action);
  if p_bundle ? 'simulationControl' then
    insert into public.simulation_controls(field_id,status,speed) values(p_field_id,p_bundle->'simulationControl'->>'status',(p_bundle->'simulationControl'->>'speed')::integer)
      on conflict(field_id) do update set status=excluded.status,speed=excluded.speed,updated_at=now();
  end if;

  if p_bundle ? 'calculation' then
    insert into public.calculation_runs(field_id,revision,engine_version,parameter_version,calculated_at,input_snapshot,output_snapshot)
    values(p_field_id,next_revision,p_bundle->'calculation'->>'engineVersion',p_bundle->'calculation'->>'parameterVersion',
      (p_state->>'clock')::timestamptz,p_bundle->'calculation'->'inputs',p_bundle->'calculation'->'outputs') returning id into calc_id;
    insert into public.recommendations(field_id,calculation_id,revision,recommendation) values(p_field_id,calc_id,next_revision,p_state->'recommendation');
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_bundle->'events','[]'::jsonb)) loop
    insert into public.simulation_events(id,field_id,revision,simulated_at,type,payload)
      values(item->>'id',p_field_id,next_revision,(item->>'at')::timestamptz,item->>'type',item) on conflict(id) do nothing;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_bundle->'alerts','[]'::jsonb)) loop
    insert into public.alerts(id,field_id,type,severity,detected_at,status,evidence)
      values(item->>'id',p_field_id,item->>'type',item->>'severity',(item->>'detectedAt')::timestamptz,coalesce(item->>'status','open'),item)
      on conflict(id) do update set status=excluded.status,evidence=excluded.evidence,updated_at=now();
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_bundle->'telemetry','[]'::jsonb)) loop
    insert into public.telemetry(field_id,device_id,event_id,content_hash,observed_at,provenance,quality,normalized)
      values(p_field_id,item->>'deviceId',item->>'eventId',item->>'hash',(item->>'at')::timestamptz,'SIMULATED',item->>'quality',item->'measurements') on conflict(device_id,event_id) do nothing;
    insert into public.device_latest_state(device_id,field_id,observed_at,provenance,quality,measurements)
      values(item->>'deviceId',p_field_id,(item->>'at')::timestamptz,'SIMULATED',item->>'quality',item->'measurements')
      on conflict(device_id) do update set observed_at=excluded.observed_at,received_at=now(),quality=excluded.quality,measurements=excluded.measurements
        where excluded.observed_at>=public.device_latest_state.observed_at;
  end loop;
  if p_bundle ? 'irrigation' then
    item:=p_bundle->'irrigation';
    insert into public.irrigation_runs(id,field_id,status,started_at,updated_at,snapshot)
      values(item->>'id',p_field_id,item->>'status',(item->>'startedAt')::timestamptz,(p_state->>'clock')::timestamptz,item)
      on conflict(id) do update set status=excluded.status,updated_at=excluded.updated_at,snapshot=excluded.snapshot;
  end if;
  if p_bundle ? 'observation' then
    insert into public.weather_observations(field_id,observed_at,source_id,provenance,data)
      values(p_field_id,(p_state->>'clock')::timestamptz,'simulated-weather','SIMULATED',p_bundle->'observation') on conflict do nothing;
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_bundle->'forecasts','[]'::jsonb)) loop
    insert into public.weather_forecasts(field_id,issued_at,valid_at,source_id,data)
      values(p_field_id,(p_state->>'clock')::timestamptz,(item->>'validAt')::timestamptz,'simulated-forecast',item) on conflict do nothing;
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
    values(auth.uid(),p_action,'field',p_field_id::text,jsonb_build_object('revision',next_revision,'simulationClock',p_state->>'clock'));
  return jsonb_build_object('revision',next_revision,'state',p_state,'duplicate',false);
end;
$$;
create function public.commit_simulation_state(p_field_id uuid,p_expected_revision bigint,p_idempotency_key uuid,p_request_hash text,p_action text,p_state jsonb,p_bundle jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.commit_state(p_field_id,p_expected_revision,p_idempotency_key,p_request_hash,p_action,p_state,p_bundle);
$$;
revoke all on function private.commit_state(uuid,bigint,uuid,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.commit_simulation_state(uuid,bigint,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function private.commit_state(uuid,bigint,uuid,text,text,jsonb,jsonb),public.commit_simulation_state(uuid,bigint,uuid,text,text,jsonb,jsonb) to authenticated;

-- Realtime publishes only the compact public state and alert projections.
alter publication supabase_realtime add table public.product_state,public.alerts,public.device_latest_state;
