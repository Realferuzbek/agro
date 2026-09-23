'use client';
import { copy } from '@/config/copy';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { type IrrigationZone } from '@/domain';
import { Card, Badge } from './ui';
import { duration, localDate, volume } from '@/lib/format';
type Run = { id: string; status: string; startedAt: string; updatedAt: string; targetVolumeLiters: number; deliveredVolumeLiters: number; zones: IrrigationZone[]; reason: string };
export function IrrigationHistory() {
  const [runs,setRuns] = useState<Run[]>([]);const [error,setError]=useState('');const[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{try{const response=await fetch('/api/history',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error);setRuns(data.runs);setError('');}catch(e){setError(e instanceof Error?e.message:copy.irrigationHistory.historyIsUnavailable);}finally{setLoading(false);}},[]);
  useEffect(()=>{const id=setTimeout(()=>void load(),0);return()=>clearTimeout(id);},[load]);
  return <Card className="section-gap" title={copy.irrigationHistory.recordedIrrigationSessions} action={<button className="button small" onClick={()=>void load()} aria-label={copy.irrigationHistory.refreshIrrigationHistory}><RefreshCw size={12}/></button>}>
    {error?<p role="status" className="form-error">{error}</p>:loading?<p className="stat-caption">{copy.irrigationHistory.loadingSavedSessions}</p>:runs.length===0?<p className="stat-caption">{copy.irrigationHistory.noSharedIrrigationSessionsHaveBeenRecordedSession}</p>:<div className="table-wrap" tabIndex={0}><table><thead><tr>{[copy.irrigationHistory.started,copy.irrigationHistory.reason,copy.irrigationHistory.targetDelivered,copy.irrigationHistory.elapsed,copy.irrigationHistory.zones,copy.irrigationHistory.status].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{runs.map(run=><tr key={run.id}><td><strong>{localDate(run.startedAt,{hour:'2-digit',minute:'2-digit',hour12:false})}</strong></td><td style={{maxWidth:230}}>{run.reason}</td><td>{volume(run.targetVolumeLiters)} / {volume(run.deliveredVolumeLiters)}</td><td>{duration((Date.parse(run.updatedAt)-Date.parse(run.startedAt))/60000)}</td><td>{run.zones.map(z=>z.id).join(' → ')}</td><td><Badge tone={run.status==='completed'?'green':'neutral'}>{run.status}</Badge></td></tr>)}</tbody></table></div>}
  </Card>;
}
