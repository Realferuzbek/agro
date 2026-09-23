import { applyObservedRainfall, recalculateRecommendation } from '@/domain';
import type { DeviceReading, SimulationState } from '@/domain/types';
import { TELEMETRY_DEFAULTS,type TelemetryInput } from './telemetry-contract';

export interface MeasuredBinding { id:string; name:string; kind:DeviceReading['kind']; zone_id?:string|null; configuration?:Record<string,unknown>; }
const modelDay=(timestamp:string)=>new Date(Date.parse(timestamp)+5*3600_000).toISOString().slice(0,10);

/** Commissioned observations only. ET budgets and delivered volume are never inferred from a sensor sample. */
export function applyMeasuredObservation(state:SimulationState,input:TelemetryInput,binding:MeasuredBinding,previous:Record<string,{value?:unknown}>|null):SimulationState|null {
  if(modelDay(input.observedAt)!==modelDay(state.clock))return null;
  let next=structuredClone(state);
  const rain=input.measurements.find(item=>item.metric==='rainfallIncrementMm'||item.metric==='rainfallCumulativeMm');
  let rainfallMm=0;
  if(rain&&typeof rain.value==='number') {
    if(rain.metric==='rainfallIncrementMm')rainfallMm=rain.value;
    else {
      const baseline=previous?.rainfallCumulativeMm?.value;
      // The first cumulative reading establishes a baseline; counter resets never become negative rainfall.
      if(typeof baseline==='number'&&rain.value>=baseline)rainfallMm=rain.value-baseline;
    }
  }
  if(rainfallMm>0) {
    next=applyObservedRainfall(next,rainfallMm,input.observedAt);
  }
  const measurement=input.measurements[0];
  const reading:DeviceReading={id:binding.id,name:binding.name,kind:binding.kind,status:'online',...(binding.zone_id?{zoneId:binding.zone_id}:{}),lastSeen:input.observedAt,datum:{value:measurement.value,unit:measurement.unit,provenance:'MEASURED',sourceId:binding.id,measuredAt:input.observedAt,quality:'valid'}};
  const deviceIndex=next.devices.findIndex(item=>item.id===binding.id);
  if(deviceIndex<0)next.devices.push(reading);else next.devices[deviceIndex]=reading;
  const flow=input.measurements.find(item=>item.metric==='flowM3h');
  const configuredThreshold=binding.configuration?.significantFlowM3h;
  const significantFlowM3h=typeof configuredThreshold==='number'&&Number.isFinite(configuredThreshold)&&configuredThreshold>=0?configuredThreshold:TELEMETRY_DEFAULTS.significantFlowM3h;
  if(flow&&typeof flow.value==='number'&&flow.value>significantFlowM3h&&next.control.pumpState==='OFF'&&next.zones.every(zone=>zone.valveState==='CLOSED')) {
    reading.status='warning';reading.datum.quality='conflict';
    next.alerts.push({id:`measured-conflict:${binding.id}:${input.eventId}`,deviceId:binding.id,type:'TELEMETRY_CONFLICT',severity:'critical',title:'Flow conflicts with the controller state',message:'Significant flow was reported while the pump is off and all modeled valves are closed. Check the device binding and actual controller state.',detectedAt:input.observedAt,status:'active',evidence:`${flow.value} m³/h; pump OFF; modeled valves CLOSED.`,possibleCauses:['Sensor or binding configuration','Controller state mismatch','Unexpected water delivery']});
  }
  next.events.push({id:`measured:${input.deviceId}:${input.eventId}`,at:input.observedAt,type:'measured-observation',message:rainfallMm>0?`${rainfallMm.toFixed(2)} mm observed rain entered the water balance.`:'Validated measured telemetry received. No water delivery inferred.'});
  next.version+=1;
  const result=recalculateRecommendation(next);
  if(rainfallMm>0)result.recommendation.reason='The recommendation was recalculated after observed rainfall entered the root-zone water balance.';
  return result;
}
