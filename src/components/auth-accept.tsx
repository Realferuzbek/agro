'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { authCopy as copy } from '@/config/access-copy';

export function AuthAccept() {
  const started=useRef(false),[status,setStatus]=useState<'loading'|'ready'|'saved'|'invalid'>('loading'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(started.current)return;started.current=true;
    const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.slice(1));
    // Remove single-use credentials before any navigation or rendering of errors.
    window.history.replaceState(null,'',url.pathname);
    async function verify(){
      try{
        const client=createBrowserSupabaseClient();if(!client)throw new Error(copy.unavailable);
        const accessToken=fragment.get('access_token'),refreshToken=fragment.get('refresh_token'),code=url.searchParams.get('code'),tokenHash=url.searchParams.get('token_hash'),type=url.searchParams.get('type');
        if(fragment.has('error')||url.searchParams.has('error'))throw new Error(copy.invalid);
        if(accessToken&&refreshToken){const {error:sessionError}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});if(sessionError)throw new Error(copy.invalid);}
        else if(code){const {error:exchangeError}=await client.auth.exchangeCodeForSession(code);if(exchangeError)throw new Error(copy.invalid);}
        else if(tokenHash&&(type==='invite'||type==='recovery')){const {error:otpError}=await client.auth.verifyOtp({token_hash:tokenHash,type});if(otpError)throw new Error(copy.invalid);}
        const {data,error:userError}=await client.auth.getUser();if(userError||!data.user)throw new Error(copy.invalid);
        setStatus('ready');
      }catch(caught){setStatus('invalid');setError(caught instanceof Error?caught.message:copy.invalid);}
    }
    void verify();
  },[]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,data=new FormData(form),password=String(data.get('password'));setError('');if(password!==data.get('confirmPassword')){setError(copy.mismatch);return;}setBusy(true);
    try{const client=createBrowserSupabaseClient();if(!client)throw new Error(copy.unavailable);const {error:saveError}=await client.auth.updateUser({password});if(saveError)throw new Error('The password could not be saved. Use a unique password of at least 12 characters, or request a fresh secure link.');form.reset();await client.auth.signOut();setStatus('saved');}catch(caught){setError(caught instanceof Error?caught.message:copy.unavailable);}finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="card login-card"><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.description}</p>{status==='loading'&&<p role="status">{copy.loading}</p>}{error&&<p role="alert" className="form-error">{error}</p>}{status==='ready'&&<form onSubmit={save}><label className="form-field">{copy.password}<input type="password" name="password" minLength={12} maxLength={256} autoComplete="new-password" required/></label><label className="form-field">{copy.confirmPassword}<input type="password" name="confirmPassword" minLength={12} maxLength={256} autoComplete="new-password" required/></label><p className="fine-print">{copy.passwordHint}</p><button className="button primary" disabled={busy}>{busy?copy.saving:copy.save}</button></form>}{status==='saved'&&<p role="status">{copy.saved}</p>}{status!=='loading'&&<Link className="button" href="/admin">{copy.signIn}</Link>}</section></main>;
}
