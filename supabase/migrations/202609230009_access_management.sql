alter table public.profiles add column permissions text[] not null default '{}'::text[];
alter table public.profiles add column can_manage_admins boolean not null default false;
alter table public.profiles add column disabled_at timestamptz;
alter table public.profiles add constraint supported_permissions check(permissions <@ array['simulation.manage','devices.manage','parameters.manage','audit.read']::text[]);
update public.profiles set permissions=array['simulation.manage','devices.manage','parameters.manage','audit.read'] where role='admin';

create table private.owner_registry (
  singleton boolean primary key default true check(singleton),
  initial_owner_id uuid not null unique references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
revoke all on private.owner_registry from public,anon,authenticated,service_role;

create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check(email=lower(email)),
  requested_role public.user_role not null check(requested_role in ('admin','owner')),
  requested_permissions text[] not null default '{}'::text[] check(requested_permissions <@ array['simulation.manage','devices.manage','parameters.manage','audit.read']::text[]),
  requested_can_manage_admins boolean not null default false,
  requested_by uuid not null references public.profiles(id),
  target_user_id uuid references public.profiles(id),
  status text not null default 'pending' check(status in ('pending','invited','added','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index admin_invitation_pending_email on public.admin_invitations(email) where status='pending';
alter table public.admin_invitations enable row level security;
revoke all on public.admin_invitations from anon,authenticated;
grant select on public.admin_invitations to authenticated;
grant all on public.admin_invitations to service_role;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('admin','owner') and disabled_at is null);
$$;
create function private.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and disabled_at is null and
    (role='owner' or (role='admin' and p_permission=any(permissions))));
$$;
create function private.can_manage_admins() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and disabled_at is null and
    (role='owner' or (role='admin' and can_manage_admins)));
$$;
revoke all on function private.has_permission(text),private.can_manage_admins() from public;
grant execute on function private.has_permission(text),private.can_manage_admins() to anon,authenticated,service_role;
create policy management_read on public.admin_invitations for select to authenticated using((select private.can_manage_admins()));

-- The effective actor is normally the signed-in JWT subject. Only a verified invitation completion
-- can supply an original actor while executing with server-only Auth credentials.
create function private.access_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is not null then return auth.uid(); end if;
  if auth.role()='service_role' then return nullif(current_setting('agriflow.invitation_actor',true),'')::uuid; end if;
  return null;
end;
$$;
revoke all on function private.access_actor() from public,anon,authenticated;

create function private.guard_profile_access() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; initial_owner uuid; bootstrap boolean;
begin
  select initial_owner_id into initial_owner from private.owner_registry where singleton for update;
  if tg_op='DELETE' then
    if old.role='owner' or old.id=initial_owner then raise exception 'Owner accounts must not be deleted' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='INSERT' and new.role='farmer' and cardinality(new.permissions)=0 and not new.can_manage_admins then return new; end if;
  if tg_op='UPDATE' and old.id<>new.id then raise exception 'Identity is immutable' using errcode='42501'; end if;
  bootstrap:=auth.role()='service_role' and current_setting('agriflow.bootstrap_owner',true)=new.id::text and initial_owner=new.id;
  if new.id=initial_owner and (new.role<>'owner' or new.disabled_at is not null) then raise exception 'The initial owner is permanent and cannot be disabled or demoted' using errcode='42501'; end if;
  if bootstrap then return new; end if;
  select * into actor from public.profiles where id=private.access_actor() and disabled_at is null;
  if not found or (actor.role<>'owner' and (actor.role<>'admin' or not actor.can_manage_admins)) then raise exception 'Admin management permission required' using errcode='42501'; end if;
  if actor.id=new.id then raise exception 'Self changes to access rights are not permitted' using errcode='42501'; end if;
  if ((tg_op='UPDATE' and old.role='owner') or new.role='owner') and actor.role<>'owner' then raise exception 'Only owners may manage owner accounts' using errcode='42501'; end if;
  if actor.role<>'owner' and (not new.permissions <@ actor.permissions or (new.can_manage_admins and not actor.can_manage_admins)) then raise exception 'Cannot delegate permissions beyond your own' using errcode='42501'; end if;
  if tg_op='UPDATE' and old.role='owner' and old.disabled_at is null and (new.role<>'owner' or new.disabled_at is not null)
    and (select count(*) from public.profiles where role='owner' and disabled_at is null)<=1 then
    raise exception 'The last active owner cannot be removed' using errcode='23514';
  end if;
  if new.role='farmer' and (cardinality(new.permissions)>0 or new.can_manage_admins) then raise exception 'A farmer cannot receive administrator permissions' using errcode='22023'; end if;
  return new;
end;
$$;
create trigger guard_profile_access before insert or update or delete on public.profiles for each row execute function private.guard_profile_access();

-- Auth's service API bypasses RLS. Protect deletion, bans and identity changes at the database too.
-- Password changes remain available to normal authenticated/invitation/recovery Auth flows; the
-- application exposes no privileged password/reset/delete/ban API for another account.
create function private.guard_owner_auth_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.profiles where id=old.id and role='owner') then
    if tg_op='DELETE' then raise exception 'Owner Auth identity cannot be deleted' using errcode='42501'; end if;
    if new.id is distinct from old.id or new.email is distinct from old.email or new.phone is distinct from old.phone or
       new.deleted_at is distinct from old.deleted_at or (new.banned_until is distinct from old.banned_until and new.banned_until>now()) then
      raise exception 'Owner identity changes and bans require privileged operator recovery, not the Auth admin API' using errcode='42501';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger protect_owner_auth_identity before update or delete on auth.users for each row execute function private.guard_owner_auth_identity();

create function private.bootstrap_initial_owner(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing_owner uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Trusted server bootstrap required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('agriflow-owner-bootstrap'));
  select initial_owner_id into existing_owner from private.owner_registry where singleton for update;
  if existing_owner is not null then
    if existing_owner<>p_user_id then raise exception 'An initial owner is already bound; UUID replacement is forbidden' using errcode='42501'; end if;
    return jsonb_build_object('id',existing_owner,'alreadyBound',true);
  end if;
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user_id and u.email_confirmed_at is not null) then raise exception 'A confirmed Auth identity is required' using errcode='22023'; end if;
  insert into private.owner_registry(initial_owner_id) values(p_user_id);
  perform set_config('agriflow.bootstrap_owner',p_user_id::text,true);
  update public.profiles set role='owner',permissions=array['simulation.manage','devices.manage','parameters.manage','audit.read'],can_manage_admins=true,disabled_at=null where id=p_user_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(p_user_id,'owner.bootstrap','profile',p_user_id::text,'{"method":"trusted-server-bootstrap","protected":true}');
  return jsonb_build_object('id',p_user_id,'alreadyBound',false);
end;
$$;
create function public.bootstrap_initial_owner(p_user_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.bootstrap_initial_owner(p_user_id); $$;
revoke all on function private.bootstrap_initial_owner(uuid),public.bootstrap_initial_owner(uuid) from public,anon,authenticated;
grant execute on function private.bootstrap_initial_owner(uuid),public.bootstrap_initial_owner(uuid) to service_role;

create function private.manage_access(p_user_id uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.profiles; updated public.profiles; actor public.profiles; next_permissions text[]; next_role public.user_role; next_manage boolean;
begin
  if not private.can_manage_admins() then raise exception 'Admin management permission required' using errcode='42501'; end if;
  perform 1 from private.owner_registry where singleton for update;
  select * into actor from public.profiles where id=auth.uid() and disabled_at is null;
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Account not found' using errcode='P0002'; end if;
  next_role:=coalesce((p_changes->>'role')::public.user_role,target.role);
  next_permissions:=case when p_changes ? 'permissions' then array(select distinct jsonb_array_elements_text(p_changes->'permissions')) else target.permissions end;
  next_manage:=coalesce((p_changes->>'canManageAdmins')::boolean,target.can_manage_admins);
  if next_role='owner' then next_permissions:=array['simulation.manage','devices.manage','parameters.manage','audit.read'];next_manage:=true;end if;
  if next_role='farmer' then next_permissions:='{}';next_manage:=false;end if;
  update public.profiles set role=next_role,permissions=next_permissions,can_manage_admins=next_manage,
    disabled_at=case when p_changes ? 'disabled' then case when (p_changes->>'disabled')::boolean then now() else null end else disabled_at end
    where id=p_user_id returning * into updated;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'access.update','profile',p_user_id::text,
    jsonb_build_object('before',jsonb_build_object('role',target.role,'permissions',target.permissions,'canManageAdmins',target.can_manage_admins,'disabled',target.disabled_at is not null),
    'after',jsonb_build_object('role',updated.role,'permissions',updated.permissions,'canManageAdmins',updated.can_manage_admins,'disabled',updated.disabled_at is not null)));
  return jsonb_build_object('id',updated.id,'role',updated.role,'permissions',updated.permissions,'canManageAdmins',updated.can_manage_admins,'disabled',updated.disabled_at is not null);
end;
$$;
create function public.manage_admin_access(p_user_id uuid,p_changes jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.manage_access(p_user_id,p_changes); $$;
revoke all on function private.manage_access(uuid,jsonb),public.manage_admin_access(uuid,jsonb) from public,anon;
grant execute on function private.manage_access(uuid,jsonb),public.manage_admin_access(uuid,jsonb) to authenticated;

create function private.request_invitation(p_email text,p_role public.user_role,p_permissions text[],p_can_manage_admins boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target public.profiles; invitation public.admin_invitations; normalized_email text:=lower(trim(p_email));
begin
  if not private.can_manage_admins() then raise exception 'Admin management permission required' using errcode='42501'; end if;
  perform 1 from private.owner_registry where singleton for update;
  select * into actor from public.profiles where id=auth.uid() and disabled_at is null;
  if p_role not in ('admin','owner') then raise exception 'Invalid invitation role' using errcode='22023'; end if;
  if p_role='owner' and actor.role<>'owner' then raise exception 'Only owners grant ownership' using errcode='42501'; end if;
  if actor.role<>'owner' and (not p_permissions <@ actor.permissions or (p_can_manage_admins and not actor.can_manage_admins)) then raise exception 'Cannot delegate permissions beyond your own' using errcode='42501'; end if;
  select p.* into target from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=normalized_email;
  if target.id=actor.id then raise exception 'Self invitations cannot change access' using errcode='42501'; end if;
  if target.role='owner' then raise exception 'Owner invitations cannot overwrite an existing owner; use authorized owner management' using errcode='42501'; end if;
  insert into public.admin_invitations(email,requested_role,requested_permissions,requested_can_manage_admins,requested_by,target_user_id)
    values(normalized_email,p_role,p_permissions,p_can_manage_admins,auth.uid(),target.id) returning * into invitation;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'access.invitation.request','invitation',invitation.id::text,jsonb_build_object('email',normalized_email,'role',p_role,'permissions',p_permissions));
  return jsonb_build_object('id',invitation.id,'email',invitation.email,'role',invitation.requested_role,'targetUserId',invitation.target_user_id,'status',invitation.status);
end;
$$;
create function public.request_admin_invitation(p_email text,p_role public.user_role,p_permissions text[],p_can_manage_admins boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.request_invitation(p_email,p_role,p_permissions,p_can_manage_admins); $$;
revoke all on function private.request_invitation(text,public.user_role,text[],boolean),public.request_admin_invitation(text,public.user_role,text[],boolean) from public,anon;
grant execute on function private.request_invitation(text,public.user_role,text[],boolean),public.request_admin_invitation(text,public.user_role,text[],boolean) to authenticated;

create function private.finish_invitation(p_invitation_id uuid,p_user_id uuid,p_error_code text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation public.admin_invitations; actor public.profiles; target public.profiles; grants text[];
begin
  if auth.role()<>'service_role' then raise exception 'Trusted invitation handler required' using errcode='42501'; end if;
  perform 1 from private.owner_registry where singleton for update;
  select * into invitation from public.admin_invitations where id=p_invitation_id for update;
  if not found then raise exception 'Invitation not found' using errcode='P0002'; end if;
  if invitation.status<>'pending' then return jsonb_build_object('id',invitation.id,'status',invitation.status,'duplicate',true); end if;
  select * into actor from public.profiles where id=invitation.requested_by and disabled_at is null;
  if p_error_code is not null or actor.id is null or (actor.role<>'owner' and (actor.role<>'admin' or not actor.can_manage_admins or invitation.requested_role='owner' or not invitation.requested_permissions <@ actor.permissions)) then
    update public.admin_invitations set status='failed',error_code=coalesce(p_error_code,'requester_permissions_changed'),completed_at=now() where id=p_invitation_id;
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(invitation.requested_by,'access.invitation.failed','invitation',p_invitation_id::text,jsonb_build_object('reason',coalesce(p_error_code,'requester_permissions_changed')));
    return jsonb_build_object('id',p_invitation_id,'status','failed');
  end if;
  select p.* into target from public.profiles p join auth.users u on u.id=p.id where p.id=p_user_id and lower(u.email)=invitation.email for update of p;
  if not found or target.id=actor.id or target.role='owner' then raise exception 'Invitation target does not match an eligible Auth identity' using errcode='42501'; end if;
  perform set_config('agriflow.invitation_actor',actor.id::text,true);
  grants:=case when invitation.requested_role='owner' then array['simulation.manage','devices.manage','parameters.manage','audit.read'] else invitation.requested_permissions end;
  update public.profiles set role=invitation.requested_role,permissions=grants,can_manage_admins=invitation.requested_role='owner' or invitation.requested_can_manage_admins,disabled_at=null where id=target.id;
  update public.admin_invitations set status=case when invitation.target_user_id is null then 'invited' else 'added' end,target_user_id=target.id,completed_at=now() where id=p_invitation_id returning * into invitation;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(actor.id,'access.invitation.granted','profile',target.id::text,jsonb_build_object('invitationId',invitation.id,'role',invitation.requested_role,'permissions',grants,'canManageAdmins',invitation.requested_can_manage_admins));
  return jsonb_build_object('id',invitation.id,'status',invitation.status,'userId',target.id);
end;
$$;
create function public.finish_admin_invitation(p_invitation_id uuid,p_user_id uuid,p_error_code text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.finish_invitation(p_invitation_id,p_user_id,p_error_code); $$;
revoke all on function private.finish_invitation(uuid,uuid,text),public.finish_admin_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.finish_invitation(uuid,uuid,text),public.finish_admin_invitation(uuid,uuid,text) to service_role;

create function private.access_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.can_manage_admins() then raise exception 'Admin management permission required' using errcode='42501'; end if;
  select jsonb_build_object('actor',(select jsonb_build_object('id',p.id,'email',u.email,'role',p.role,'permissions',p.permissions,'canManageAdmins',p.role='owner' or p.can_manage_admins) from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid()),
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',u.email,'role',p.role,'permissions',p.permissions,'canManageAdmins',p.role='owner' or p.can_manage_admins,'disabled',p.disabled_at is not null,'protectedOwner',exists(select 1 from private.owner_registry where initial_owner_id=p.id)) order by p.created_at) from public.profiles p join auth.users u on u.id=p.id where p.role in ('admin','owner')),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from (select * from public.admin_invitations order by created_at desc limit 50) i),'[]'::jsonb)) into result;
  return result;
end;
$$;
create function public.admin_access_overview() returns jsonb
language sql security invoker set search_path='' as $$ select private.access_overview(); $$;
revoke all on function private.access_overview(),public.admin_access_overview() from public,anon;
grant execute on function private.access_overview(),public.admin_access_overview() to authenticated;

create function private.record_owner_recovery(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' or not exists(select 1 from private.owner_registry where initial_owner_id=p_user_id) then raise exception 'Trusted initial-owner recovery only' using errcode='42501'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(p_user_id,'owner.recovery.request','profile',p_user_id::text,'{"method":"trusted-operator-generated-private-auth-link"}');
end;
$$;
create function public.record_owner_recovery(p_user_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.record_owner_recovery(p_user_id); $$;
revoke all on function private.record_owner_recovery(uuid),public.record_owner_recovery(uuid) from public,anon,authenticated;
grant execute on function private.record_owner_recovery(uuid),public.record_owner_recovery(uuid) to service_role;

-- Reads and mutations are capability-aware; an admin role alone is not a grant to every cockpit tool.
drop policy admin_read on public.profiles;
create policy admin_read on public.profiles for select to authenticated using((select private.can_manage_admins()));
drop policy admin_read on public.audit_logs;
create policy admin_read on public.audit_logs for select to authenticated using((select private.has_permission('audit.read')));
do $$ declare t text; begin
  foreach t in array array['telemetry','commissioning_runs'] loop
    execute format('drop policy admin_read on public.%I',t);
    execute format('create policy admin_read on public.%I for select to authenticated using ((select private.has_permission(''devices.manage'')) or (select private.has_permission(''audit.read'')))',t);
  end loop;
  foreach t in array array['simulation_controls','state_mutations','simulation_events'] loop
    execute format('drop policy admin_read on public.%I',t);
    execute format('create policy admin_read on public.%I for select to authenticated using ((select private.has_permission(''simulation.manage'')) or (select private.has_permission(''audit.read'')))',t);
  end loop;
end $$;

-- Replace checks in the already-reviewed private bodies; their atomic implementations are unchanged.
do $$ declare definition text; begin
  select pg_get_functiondef('private.commit_state(uuid,bigint,uuid,text,text,jsonb,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,'if not private.is_admin() then','if not private.has_permission(''simulation.manage'') then');execute definition;
  select pg_get_functiondef('private.credential_metadata(text)'::regprocedure) into definition;
  definition:=replace(definition,'if not private.is_admin() then','if not private.has_permission(''devices.manage'') then');execute definition;
  select pg_get_functiondef('private.mutate_configuration(text,jsonb)'::regprocedure) into definition;
  definition:=replace(definition,'if not private.is_admin() then','if not private.has_permission(case when p_action like ''parameter.%'' then ''parameters.manage'' when p_action like ''alert.%'' then ''simulation.manage'' else ''devices.manage'' end) then');execute definition;
end $$;
