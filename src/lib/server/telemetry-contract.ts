import { z } from 'zod';

/** Conservative ingestion defaults; controller thresholds require commissioning for each installation. */
export const TELEMETRY_DEFAULTS={maximumFutureSkewMs:5*60_000,staleAfterMs:24*60*60_000,significantFlowM3h:0.3} as const;

const numeric = <T extends string, U extends string>(metric:T,unit:U) => z.object({metric:z.literal(metric),value:z.number(),unit:z.literal(unit)}).strict();
export const measurementSchema=z.discriminatedUnion('metric',[
  numeric('temperatureC','°C'),numeric('temperatureMaxC','°C'),numeric('temperatureMinC','°C'),
  numeric('relativeHumidityPct','%'),numeric('relativeHumidityMaxPct','%'),numeric('relativeHumidityMinPct','%'),
  numeric('soilMoisturePct','%'),numeric('flowM3h','m³/h'),numeric('pressureBar','bar'),
  numeric('rainfallIncrementMm','mm'),numeric('rainfallCumulativeMm','mm'),numeric('deliveredVolumeLiters','L'),
  numeric('windSpeedMps','m/s'),numeric('solarRadiationMjM2Day','MJ/m²/day'),
  z.object({metric:z.literal('valveState'),value:z.enum(['OPEN','CLOSED','OPENING','CLOSING','FAILED']),unit:z.literal('state')}).strict(),
  z.object({metric:z.literal('pumpState'),value:z.enum(['ON','OFF','STARTING','FAILED']),unit:z.literal('state')}).strict(),
]);
export const telemetrySchema=z.object({
  version:z.literal(1),deviceId:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),eventId:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
  observedAt:z.iso.datetime({offset:true}),measurements:z.array(measurementSchema).min(1).max(16),rawPayload:z.record(z.string(),z.unknown()).optional(),
}).strict().superRefine((value,context)=>{
  const metrics=value.measurements.map(item=>item.metric);
  if(new Set(metrics).size!==metrics.length)context.addIssue({code:'custom',message:'An event cannot contain duplicate measurement metrics.',path:['measurements']});
  if(metrics.includes('rainfallIncrementMm')&&metrics.includes('rainfallCumulativeMm'))context.addIssue({code:'custom',message:'Choose increment or cumulative rainfall semantics, not both.',path:['measurements']});
});
export type TelemetryInput=z.infer<typeof telemetrySchema>;

const limits:Partial<Record<TelemetryInput['measurements'][number]['metric'],[number,number]>>={temperatureC:[-40,65],temperatureMaxC:[-40,65],temperatureMinC:[-40,65],relativeHumidityPct:[0,100],relativeHumidityMaxPct:[0,100],relativeHumidityMinPct:[0,100],soilMoisturePct:[0,60],flowM3h:[0,200],pressureBar:[0,16],rainfallIncrementMm:[0,300],rainfallCumulativeMm:[0,3000],deliveredVolumeLiters:[0,1e9],windSpeedMps:[0,80],solarRadiationMjM2Day:[0,50]};
const kindMetrics:Record<string,string[]>={
  weather:['temperatureC','temperatureMaxC','temperatureMinC','relativeHumidityPct','relativeHumidityMaxPct','relativeHumidityMinPct','windSpeedMps','solarRadiationMjM2Day'],
  rain:['rainfallIncrementMm','rainfallCumulativeMm'],soil:['soilMoisturePct'],flow:['flowM3h','deliveredVolumeLiters'],pressure:['pressureBar'],valve:['valveState'],pump:['pumpState'],
};

export function validateTelemetryQuality(input:TelemetryInput,kind:string,nowMs:number):'valid'|'outlier'|'stale' {
  if(!kindMetrics[kind] || input.measurements.some(measurement=>!kindMetrics[kind].includes(measurement.metric)))throw new Error('Measurements do not match the registered device type.');
  if(Date.parse(input.observedAt)>nowMs+TELEMETRY_DEFAULTS.maximumFutureSkewMs)throw new Error('Measurement timestamp is more than five minutes in the future.');
  if(input.measurements.some(measurement=>{const range=limits[measurement.metric];return range&&typeof measurement.value==='number'&&(measurement.value<range[0]||measurement.value>range[1]);}))return 'outlier';
  return nowMs-Date.parse(input.observedAt)>TELEMETRY_DEFAULTS.staleAfterMs?'stale':'valid';
}
