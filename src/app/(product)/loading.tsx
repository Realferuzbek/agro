'use client';
import { useCopy } from '@/config/locale-copy';
export default function Loading() {const copy = useCopy(); return <div aria-label={copy.system.loadingField} aria-busy="true" className="loading-view"><div className="skeleton" style={{width:110,height:12}}/><div className="skeleton" style={{width:'55%',height:35,marginTop:18}}/><div className="skeleton" style={{height:290,marginTop:30,borderRadius:15}}/><div className="grid four section-gap">{[1,2,3,4].map(i=><div className="skeleton" key={i} style={{height:145,borderRadius:12}}/>)}</div></div>; }
