'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { useAccessCopy } from '@/config/locale-copy';
import { Badge, Card } from './ui';

type Member = {id:string;email:string;role:'farmer'|'admin'|'owner';canManageAdmins:boolean;disabled:boolean;protectedOwner:boolean;permissions?:string[]};
type Access = {actor:Pick<Member,'id'|'email'|'role'|'canManageAdmins'|'permissions'>;users:Member[];invitations:Array<{id:string;email:string;status:string}>};
function PermissionFields({member,actor}:{member?:Member;actor:Access['actor']}) {
  const copy = useAccessCopy();
  const permissionNames = Object.entries(copy.operationalPermissions);
  return <fieldset className="permission-fields"><legend>{copy.permissions}</legend>
    {permissionNames.map(([permission,label])=><label className="check-field" key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={member?.permissions?.includes(permission)??false} disabled={actor.role!=='owner'&&!actor.permissions?.includes(permission)}/>{label}</label>)}
    <label className="check-field"><input name="canManageAdmins" type="checkbox" defaultChecked={member?.canManageAdmins??false}/>{copy.manageAdmins}</label>
    <p className="fine-print">{copy.permissionsHint}</p>
  </fieldset>;
}

export function AdminAccess() {
  const copy = useAccessCopy();
  const [access,setAccess]=useState<Access|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState<string|null>(null);
  const load=useCallback(async()=>{try{const response=await fetch('/api/admin/access',{cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(response.status===403?copy.forbidden:body.error??copy.unavailable);setAccess(body);setError('');}catch(caught){setError(caught instanceof Error?caught.message:copy.unavailable);}},[copy.forbidden,copy.unavailable]);
  useEffect(()=>{const task=setTimeout(()=>void load(),0);return()=>clearTimeout(task);},[load]);
  async function submit(event:FormEvent<HTMLFormElement>,member?:Member){
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);setBusy(true);setMessage('');setError('');
    const payload={role:data.get('role'),canManageAdmins:data.has('canManageAdmins'),permissions:data.getAll('permissions'),...(member?{disabled:data.has('disabled')}:{email:data.get('email')})};
    try{const response=await fetch(member?`/api/admin/access/users/${encodeURIComponent(member.id)}`:'/api/admin/access/invitations',{method:member?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body.error??copy.unavailable);setMessage(member?copy.saved:copy.invitationSaved);setEditing(null);if(!member)form.reset();await load();}catch(caught){setError(caught instanceof Error?caught.message:copy.unavailable);}finally{setBusy(false);}
  }
  return <div>
    <Card title={copy.title} icon={ShieldCheck} action={<button className="button small" onClick={()=>void load()}><RefreshCw size={13}/>{copy.refresh}</button>}>
      <p className="card-description">{copy.description}</p>
      <p className="fine-print">{copy.ownerProtection}</p>
      {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="insight-strip" role="status">{message}</p>}
      {access&&<div className="access-members">{access.users.length?access.users.map(member=>{
        const protectedAccount=member.protectedOwner||member.id===access.actor.id||(member.role==='owner'&&access.actor.role!=='owner');
        return <article className="access-member" key={member.id}><div className="access-member-heading"><div><strong>{member.email}</strong><div className="access-badges"><Badge tone={member.role==='owner'?'green':'neutral'}>{copy[member.role]}</Badge>{member.protectedOwner&&<Badge tone="blue">{copy.protectedOwner}</Badge>}{member.disabled&&<Badge tone="amber">{copy.disabled}</Badge>}</div></div>{!protectedAccount&&<button className="button small" onClick={()=>setEditing(editing===member.id?null:member.id)}>{copy.edit}</button>}</div>
          {member.id===access.actor.id&&<p className="fine-print">{copy.selfProtection}</p>}
          {editing===member.id&&!protectedAccount&&<form onSubmit={event=>void submit(event,member)} className="section-gap"><label className="form-field">{copy.role}<select name="role" aria-label={copy.role} defaultValue={member.role}><option value="admin">{copy.admin}</option>{access.actor.role==='owner'&&<option value="owner">{copy.owner}</option>}<option value="farmer">{copy.farmer}</option></select></label><PermissionFields member={member} actor={access.actor}/><label className="check-field"><input type="checkbox" name="disabled" defaultChecked={member.disabled}/>{copy.disabled}</label><div className="control-actions"><button className="button primary" disabled={busy}>{copy.save}</button><button type="button" className="button" onClick={()=>setEditing(null)}>{copy.cancel}</button></div></form>}
        </article>;
      }):<p>{copy.noUsers}</p>}</div>}
    </Card>
    {access&&<Card title={copy.inviteTitle} className="section-gap" icon={UserPlus}><p className="card-description">{copy.inviteHint}</p><form onSubmit={event=>void submit(event)}><div className="grid two"><label className="form-field">{copy.email}<input required type="email" name="email" autoComplete="email" maxLength={254}/></label><label className="form-field">{copy.role}<select name="role" aria-label={copy.role} defaultValue="admin"><option value="admin">{copy.admin}</option>{access.actor.role==='owner'&&<option value="owner">{copy.owner}</option>}</select></label></div><PermissionFields actor={access.actor}/><button className="button primary" disabled={busy}>{copy.invite}</button></form></Card>}
    {access&&access.invitations.length>0&&<Card title={copy.pending} className="section-gap"><div className="table-wrap" tabIndex={0}><table><thead><tr><th>{copy.email}</th><th>{copy.status}</th></tr></thead><tbody>{access.invitations.map(invitation=><tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.status}</td></tr>)}</tbody></table></div></Card>}
  </div>;
}
