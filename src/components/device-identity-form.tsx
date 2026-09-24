'use client';
import { useCopy, useLocale } from '@/config/locale-copy';
import { displayLabel } from '@/config/presentation';
import type { FormEvent } from 'react';

export type RegisteredDevice = { id:string; name:string; kind:string; mode:string; field_id:string; zone_id:string|null; enabled:boolean; configuration:Record<string,unknown> };

export function DeviceIdentityForm({device,busy,onSubmit,onCancel}:{device?:RegisteredDevice;busy:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>Promise<void>;onCancel:()=>void}) {const copy = useCopy();const locale = useLocale();
  return <form onSubmit={onSubmit}>
    <div className="grid two">
      <label className="form-field">{copy.deviceIdentityForm.deviceId}<input name="id" required pattern="[A-Za-z0-9_-]+" maxLength={80} readOnly={!!device} defaultValue={device?.id}/></label>
      <label className="form-field">{copy.deviceIdentityForm.name}<input name="name" required maxLength={100} defaultValue={device?.name}/></label>
      <label className="form-field">{copy.deviceIdentityForm.kind}<select name="kind" aria-label={copy.deviceIdentityForm.kind} defaultValue={device?.kind??'weather'}>{['weather','rain','soil','flow','pressure','valve','pump'].map(kind=><option key={kind} value={kind}>{displayLabel(kind,locale)}</option>)}</select></label>
      <label className="form-field">{copy.deviceIdentityForm.sourceMode}<select name="mode" aria-label={copy.deviceIdentityForm.sourceMode} defaultValue={device?.mode??'SIMULATED'}>{['SIMULATED','MEASURED'].map(mode=><option key={mode} value={mode}>{displayLabel(mode,locale)}</option>)}</select></label>
      <label className="form-field">{copy.deviceIdentityForm.assignment}<select name="zoneId" aria-label={copy.deviceIdentityForm.assignment} defaultValue={device?.zone_id??''}><option value="">{copy.deviceIdentityForm.wholeField}</option>{['A','B','C','D'].map(zone=><option value={zone} key={zone}>{copy.deviceIdentityForm.zone}{zone}</option>)}</select></label>
    </div>
    <label className="form-field">{copy.deviceIdentityForm.configurationJson}<textarea name="configuration" required rows={5} className="json-view" defaultValue={JSON.stringify(device?.configuration??{},null,2)}/></label>
    <p className="fine-print">{copy.deviceIdentityForm.recordAdapterSettingsFirmwareAndCalibrationMetadataHere}</p>
    <div className="control-actions"><button className="button primary" disabled={busy}>{device?copy.deviceIdentityForm.saveConfiguration:copy.deviceIdentityForm.saveIdentity}</button><button className="button" type="button" disabled={busy} onClick={onCancel}>{copy.deviceIdentityForm.cancel}</button></div>
  </form>;
}
