'use client';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from './ui';
import { localDate } from '@/lib/format';
type Credential = { id:string; prefix:string; createdAt:string; expiresAt:string|null; revokedAt:string|null; lastUsedAt:string|null };
export function DeviceCredentials({deviceId,refreshKey}:{deviceId:string;refreshKey:string}) {
  const [credentials,setCredentials]=useState<Credential[]>([]);const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[checkedAt,setCheckedAt]=useState(0);
  const load=useCallback(async()=>{try{const r=await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/credentials`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setCredentials(d.credentials??[]);setCheckedAt(Date.now());setError('');}catch(e){setError(e instanceof Error?e.message:'Credential metadata unavailable.');}},[deviceId]);
  useEffect(()=>{const task=setTimeout(()=>void load(),0);return()=>clearTimeout(task);},[load,refreshKey]);
  async function revoke(id:string){setBusy(true);try{const r=await fetch(`/api/admin/devices/${encodeURIComponent(deviceId)}/credentials`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();}catch(e){setError(e instanceof Error?e.message:'Revocation failed.');}finally{setBusy(false);}}
  return <div style={{marginTop:24}}><h3>Credential lifecycle</h3>{error&&<p role="alert" className="form-error">{error}</p>}{credentials.length?<div className="table-wrap"><table><thead><tr>{['Prefix','Created','Last used','Status','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{credentials.map(c=><tr key={c.id}><td><code>{c.prefix}…</code></td><td>{localDate(c.createdAt)}</td><td>{c.lastUsedAt?localDate(c.lastUsedAt):'Never'}</td><td><Badge tone={c.revokedAt?'neutral':'green'}>{c.revokedAt?'Revoked':c.expiresAt&&Date.parse(c.expiresAt)<checkedAt?'Expired':'Active'}</Badge></td><td><button className="button small danger" disabled={busy||!!c.revokedAt} onClick={()=>void revoke(c.id)}>Revoke</button></td></tr>)}</tbody></table></div>:<p className="stat-caption">No credentials issued for this device.</p>}</div>;
}
