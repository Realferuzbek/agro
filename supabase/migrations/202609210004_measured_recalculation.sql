-- The wrapper commits accepted telemetry and an optional commissioned field-model update atomically.
create function public.ingest_and_recalculate(
  p_credential_id uuid,p_device_id text,p_event_id text,p_content_hash text,p_observed_at timestamptz,
  p_quality text,p_measurements jsonb,p_raw_payload jsonb default null,
  p_expected_revision bigint default null,p_next_state jsonb default null,p_calculation jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare device public.devices; field_row public.fields; current_row public.product_state; receipt jsonb; calc_id uuid; next_revision bigint;
begin
  select * into device from public.devices where id=p_device_id;
  if p_next_state is not null then
    select * into field_row from public.fields where id=device.field_id;
    if field_row.settings->>'dataMode' is distinct from 'MEASURED' or device.configuration->>'fieldModelApproved' is distinct from 'true' or p_quality<>'valid' then
      raise exception 'A commissioned measured field binding is required' using errcode='42501';
    end if;
    select * into current_row from public.product_state where field_id=device.field_id for update;
    if not found then raise exception 'Field state not initialized' using errcode='P0002'; end if;
  end if;
  receipt:=public.ingest_telemetry_event(p_credential_id,p_device_id,p_event_id,p_content_hash,p_observed_at,p_quality,p_measurements,p_raw_payload);
  if p_next_state is not null and not (receipt->>'duplicate')::boolean then
    if current_row.revision<>p_expected_revision then raise exception 'State version conflict' using errcode='40001'; end if;
    if p_next_state->>'schemaVersion' is distinct from '1' then raise exception 'Invalid state schema' using errcode='22023'; end if;
    next_revision:=current_row.revision+1;
    update public.product_state set state=p_next_state,revision=next_revision,updated_at=now() where field_id=device.field_id;
    insert into public.calculation_runs(field_id,revision,engine_version,parameter_version,calculated_at,input_snapshot,output_snapshot)
      values(device.field_id,next_revision,p_next_state->'recommendation'->>'engineVersion',p_next_state->'recommendation'->>'parameterVersion',p_observed_at,
      jsonb_build_object('priorFieldState',current_row.state,'normalizedObservation',p_measurements,'deviceId',p_device_id,'eventId',p_event_id),p_calculation) returning id into calc_id;
    insert into public.recommendations(field_id,calculation_id,revision,recommendation) values(device.field_id,calc_id,next_revision,p_next_state->'recommendation');
    insert into public.audit_logs(action,entity_type,entity_id,details) values('telemetry.recalculate','field',device.field_id::text,jsonb_build_object('revision',next_revision,'deviceId',p_device_id,'eventId',p_event_id));
    receipt:=receipt||jsonb_build_object('fieldModelUpdated',true,'revision',next_revision);
  else receipt:=receipt||jsonb_build_object('fieldModelUpdated',false);
  end if;
  return receipt;
end;
$$;
revoke all on function public.ingest_and_recalculate(uuid,text,text,text,timestamptz,text,jsonb,jsonb,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_and_recalculate(uuid,text,text,text,timestamptz,text,jsonb,jsonb,bigint,jsonb,jsonb) to service_role;
