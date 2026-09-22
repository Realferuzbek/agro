create function private.mutate_configuration(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; record_id text;
begin
  if not private.is_admin() then raise exception 'Administrator role required' using errcode='42501'; end if;
  if p_action='device.upsert' then
    insert into public.devices(id,field_id,zone_id,name,kind,mode,enabled,configuration)
      values(p_payload->>'id',(p_payload->>'fieldId')::uuid,nullif(p_payload->>'zoneId',''),p_payload->>'name',p_payload->>'kind',p_payload->>'mode',coalesce((p_payload->>'enabled')::boolean,true),coalesce(p_payload->'configuration','{}'::jsonb))
      on conflict(id) do update set field_id=excluded.field_id,zone_id=excluded.zone_id,name=excluded.name,kind=excluded.kind,mode=excluded.mode,enabled=excluded.enabled,configuration=excluded.configuration
      returning to_jsonb(devices.*) into result;
    record_id:=p_payload->>'id';
  elsif p_action='parameter.create' then
    insert into public.parameter_sets(kind,version,name,parameters,source,created_by)
      values(p_payload->>'kind',p_payload->>'version',p_payload->>'name',p_payload->'parameters',p_payload->'source',auth.uid()) returning to_jsonb(parameter_sets.*) into result;
    record_id:=result->>'id';
  elsif p_action='credential.create' then
    insert into public.device_credentials(device_id,token_hash,token_prefix,expires_at,created_by)
      values(p_payload->>'deviceId',p_payload->>'tokenHash',p_payload->>'tokenPrefix',nullif(p_payload->>'expiresAt','')::timestamptz,auth.uid())
      returning jsonb_build_object('id',id,'deviceId',device_id,'prefix',token_prefix,'expiresAt',expires_at,'createdAt',created_at) into result;
    record_id:=result->>'id';
  elsif p_action='credential.revoke' then
    update public.device_credentials set revoked_at=now() where id=(p_payload->>'id')::uuid returning jsonb_build_object('id',id,'revokedAt',revoked_at) into result;
    if not found then raise exception 'Credential not found' using errcode='P0002'; end if;
    record_id:=p_payload->>'id';
  elsif p_action='commissioning.create' then
    if not exists(select 1 from public.devices where id=p_payload->>'deviceId' and mode='SIMULATED') then
      raise exception 'Only simulated commissioning is supported; no physical test was performed' using errcode='22023';
    end if;
    insert into public.commissioning_runs(device_id,field_id,mode,results,created_by)
      select id,field_id,'SIMULATED',p_payload->'results',auth.uid() from public.devices where id=p_payload->>'deviceId'
      returning to_jsonb(commissioning_runs.*) into result;
    record_id:=result->>'id';
  elsif p_action='alert.resolve' then
    update public.alerts set status='resolved',resolution=p_payload->>'resolution',updated_at=now()
      where id=p_payload->>'id' returning to_jsonb(alerts.*) into result;
    if not found then raise exception 'Alert not found' using errcode='P0002'; end if;
    record_id:=p_payload->>'id';
  else raise exception 'Unsupported action' using errcode='22023';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
    values(auth.uid(),p_action,split_part(p_action,'.',1),record_id,
      case when p_action like 'credential.%' then coalesce(result,'{}'::jsonb) else p_payload end);
  return result;
end;
$$;
create function public.admin_mutate_configuration(p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.mutate_configuration(p_action,p_payload); $$;
revoke all on function private.mutate_configuration(text,jsonb),public.admin_mutate_configuration(text,jsonb) from public,anon;
grant execute on function private.mutate_configuration(text,jsonb),public.admin_mutate_configuration(text,jsonb) to authenticated;

create function private.credential_metadata(p_device_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator role required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'prefix',token_prefix,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'lastUsedAt',last_used_at) order by created_at desc)
    from public.device_credentials where device_id=p_device_id),'[]'::jsonb);
end;
$$;
create function public.admin_credential_metadata(p_device_id text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.credential_metadata(p_device_id); $$;
revoke all on function private.credential_metadata(text),public.admin_credential_metadata(text) from public,anon;
grant execute on function private.credential_metadata(text),public.admin_credential_metadata(text) to authenticated;

-- API authenticates a per-device bearer token and provides the verified credential ID.
-- Only the service role can execute this function. It rechecks revocation/binding inside the transaction.
create function public.ingest_telemetry_event(
  p_credential_id uuid,p_device_id text,p_event_id text,p_content_hash text,p_observed_at timestamptz,
  p_quality text,p_measurements jsonb,p_raw_payload jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare credential public.device_credentials; device public.devices; prior public.telemetry; accepted_id bigint; is_latest boolean;
begin
  select * into credential from public.device_credentials where id=p_credential_id for update;
  if not found or credential.device_id<>p_device_id or credential.revoked_at is not null or (credential.expires_at is not null and credential.expires_at<=now()) then
    raise exception 'Invalid device credential' using errcode='42501';
  end if;
  select * into device from public.devices where id=p_device_id and enabled=true for update;
  if not found then raise exception 'Device disabled or missing' using errcode='42501'; end if;
  if device.mode<>'MEASURED' then raise exception 'Ingestion requires a registered measured device; simulator writes use the simulation pipeline' using errcode='22023'; end if;
  select * into prior from public.telemetry where device_id=p_device_id and event_id=p_event_id;
  if found then
    if prior.content_hash<>p_content_hash then raise exception 'Event ID reused with different content' using errcode='22023'; end if;
    return jsonb_build_object('accepted',true,'duplicate',true,'id',prior.id,'quality',prior.quality,'latestUpdated',false);
  end if;
  -- A deterministic per-device rate bound uses PostgreSQL instead of process-local counters.
  if (select count(*) from public.telemetry where device_id=p_device_id and received_at>now()-interval '1 minute')>=120 then
    raise exception 'Device ingestion rate exceeded' using errcode='P0001';
  end if;
  insert into public.telemetry(field_id,device_id,event_id,content_hash,observed_at,provenance,quality,normalized,raw_payload)
    values(device.field_id,p_device_id,p_event_id,p_content_hash,p_observed_at,'MEASURED',p_quality,p_measurements,p_raw_payload) returning id into accepted_id;
  is_latest:=p_quality='valid' and not exists(select 1 from public.device_latest_state where device_id=p_device_id and observed_at>p_observed_at);
  if is_latest then
    insert into public.device_latest_state(device_id,field_id,observed_at,provenance,quality,measurements)
      values(p_device_id,device.field_id,p_observed_at,'MEASURED','valid',p_measurements)
      on conflict(device_id) do update set observed_at=excluded.observed_at,received_at=now(),provenance='MEASURED',quality='valid',measurements=excluded.measurements;
  end if;
  if p_quality<>'valid' then
    insert into public.alerts(id,field_id,type,severity,detected_at,evidence)
      values('ingest-'||accepted_id,device.field_id,case when p_quality='outlier' then 'SENSOR_OUTLIER' else 'TELEMETRY_CONFLICT' end,'warning',p_observed_at,
        jsonb_build_object('deviceId',p_device_id,'quality',p_quality,'measurements',p_measurements));
  end if;
  update public.device_credentials set last_used_at=now() where id=credential.id;
  return jsonb_build_object('accepted',true,'duplicate',false,'id',accepted_id,'quality',p_quality,'latestUpdated',is_latest,'fieldId',device.field_id);
end;
$$;
revoke all on function public.ingest_telemetry_event(uuid,text,text,text,timestamptz,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_telemetry_event(uuid,text,text,text,timestamptz,text,jsonb,jsonb) to service_role;

alter default privileges in schema public revoke execute on functions from public;
