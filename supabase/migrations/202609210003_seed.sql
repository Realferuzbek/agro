create function public.initialize_demo_state(p_field_id uuid,p_state jsonb,p_forecasts jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; calc_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_field_id::text));
  if exists(select 1 from public.product_state where field_id=p_field_id) then return jsonb_build_object('initialized',false,'reason','already_initialized'); end if;
  for item in select value from jsonb_array_elements(p_state->'devices') loop
    insert into public.devices(id,field_id,zone_id,name,kind,mode,configuration)
      values(item->>'id',p_field_id,item->>'zoneId',item->>'name',item->>'kind','SIMULATED',jsonb_build_object('depthCm',item->'depthCm','freshnessSeconds',300)) on conflict(id) do nothing;
    insert into public.device_latest_state(device_id,field_id,observed_at,provenance,quality,measurements)
      values(item->>'id',p_field_id,(item->>'lastSeen')::timestamptz,'SIMULATED',item->'datum'->>'quality',item->'datum') on conflict(device_id) do nothing;
  end loop;
  insert into public.product_state(field_id,revision,state) values(p_field_id,0,p_state);
  insert into public.simulation_controls(field_id,status,speed) values(p_field_id,'paused',1);
  insert into public.calculation_runs(field_id,revision,engine_version,parameter_version,calculated_at,input_snapshot,output_snapshot)
    values(p_field_id,0,p_state->'calculation'->>'engineVersion',p_state->'calculation'->>'parameterVersion',(p_state->>'clock')::timestamptz,p_state->'calculation'->'input',p_state->'calculation') returning id into calc_id;
  insert into public.recommendations(field_id,calculation_id,revision,recommendation) values(p_field_id,calc_id,0,p_state->'recommendation');
  for item in select value from jsonb_array_elements(p_state->'alerts') loop
    insert into public.alerts(id,field_id,type,severity,detected_at,status,evidence)
      values((p_state->>'id')||':'||(item->>'id'),p_field_id,item->>'type',item->>'severity',(item->>'detectedAt')::timestamptz,item->>'status',item);
  end loop;
  for item in select value from jsonb_array_elements(p_state->'history') loop
    insert into public.weather_observations(field_id,observed_at,source_id,provenance,data)
      values(p_field_id,(item->>'at')::timestamptz,'simulated-history','SIMULATED',item) on conflict do nothing;
  end loop;
  for item in select value from jsonb_array_elements(p_forecasts) loop
    insert into public.weather_forecasts(field_id,issued_at,valid_at,source_id,data)
      values(p_field_id,(p_state->>'clock')::timestamptz,(item->>'date')::timestamptz,'simulated-forecast',item) on conflict do nothing;
  end loop;
  insert into public.audit_logs(action,entity_type,entity_id,details) values('seed.initialize','field',p_field_id::text,jsonb_build_object('engineVersion',p_state->'calculation'->>'engineVersion'));
  return jsonb_build_object('initialized',true,'revision',0);
end;
$$;
revoke all on function public.initialize_demo_state(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.initialize_demo_state(uuid,jsonb,jsonb) to service_role;
