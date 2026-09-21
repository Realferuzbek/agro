import type { AgronomyInput, AgronomyParameters, AgronomyResult, EtoResult, WeatherInput } from './types';

export const ENGINE_VERSION = '1.0.0';
export const FAO_SOURCES = [
  { title: 'FAO Irrigation and Drainage Paper 56 — Meteorological data', organization: 'FAO', year: 1998, url: 'https://www.fao.org/4/x0490e/x0490e07.htm' },
  { title: 'FAO-56 — Dual crop coefficient', organization: 'FAO', year: 1998, url: 'https://www.fao.org/4/x0490e/x0490e0c.htm' },
  { title: 'FAO-56 — Soil water stress', organization: 'FAO', year: 1998, url: 'https://www.fao.org/4/x0490e/x0490e0e.htm' },
] as const;
export const DEFAULT_PARAMETERS: AgronomyParameters = {
  version: 'potato-loam-demo-1.0.0', fieldAreaM2: 10000, fieldCapacity: .30, wiltingPoint: .14,
  rootDepthM: .5, evaporationDepthM: .1, readilyEvaporableWaterMm: 9, cropHeightM: .6,
  kcb: 1.1, depletionFraction: .35, applicationEfficiency: .9, wettedFraction: .4,
  earlyWarningFraction: .9, actionDepletionFraction: 1, targetDepletionFraction: .8, capillaryRiseMm: 0,
};
export const POTATO_PARAMETERS = { version: 'potato-reference-1.0.0', kcbInitial: .15, kcbMid: 1.1, kcbEnd: .65, maximumHeightM: .6, referenceStageDays: [25, 30, 45, 30], demoStageDays: [20, 20, 30, 20], demoStageProvenance: 'SIMULATED', notes: '90-day season and stage/root development are simulation assumptions. Kcb values are reference inputs, not local calibration.' } as const;
export const GOLDEN_WEATHER: WeatherInput = { date: '2026-04-25', latitudeDeg: 41.3, elevationM: 450, temperatureMaxC: 28, temperatureMinC: 14, relativeHumidityMaxPct: 75, relativeHumidityMinPct: 35, windSpeedMps: 2.2, solarRadiationMjM2Day: 20.5 };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function finite(value: number, name: string) { if (!Number.isFinite(value)) throw new Error(`${name} must be finite`); }
function positive(value: number, name: string) { finite(value, name); if (value <= 0) throw new Error(`${name} must be positive`); }
function nonnegative(value: number, name: string) { finite(value, name); if (value < 0) throw new Error(`${name} must not be negative`); }
export function depthToLiters(depthMm: number, areaM2: number) { nonnegative(depthMm, 'depthMm'); positive(areaM2, 'areaM2'); return depthMm * areaM2; }
export function litersToDepth(volumeLiters: number, areaM2: number) { nonnegative(volumeLiters, 'volumeLiters'); positive(areaM2, 'areaM2'); return volumeLiters / areaM2; }
export function litersToM3(volumeLiters: number) { nonnegative(volumeLiters, 'volumeLiters'); return volumeLiters / 1000; }
export function runtimeMinutes(volumeLiters: number, flowM3h: number) { nonnegative(volumeLiters, 'volumeLiters'); positive(flowM3h, 'flowM3h'); return volumeLiters / (flowM3h * 1000) * 60; }
/** FAO-56 equation 11; pressure in kPa. Negative air temperatures are valid. */
export function saturationVaporPressure(temperatureC: number) { finite(temperatureC, 'temperatureC'); if (temperatureC < -80 || temperatureC > 65) throw new Error('Temperature outside supported range'); return .6108 * Math.exp(17.27 * temperatureC / (temperatureC + 237.3)); }
/** Equation 17: pair maximum humidity with minimum temperature. */
export function actualVaporPressure(tmin: number, tmax: number, rhmin: number, rhmax: number) { if (rhmin < 0 || rhmax > 100 || rhmin > rhmax) throw new Error('Invalid humidity range'); return (saturationVaporPressure(tmin) * rhmax / 100 + saturationVaporPressure(tmax) * rhmin / 100) / 2; }
export function dayOfYear(date: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected an ISO calendar date'); const timestamp = Date.parse(`${date}T00:00:00Z`); if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date'); return Math.floor((timestamp - Date.UTC(Number(date.slice(0, 4)), 0, 1)) / 86400000) + 1; }
/** Equations 21–25, MJ m−2 day−1. Polar limits are explicitly constrained. */
export function extraterrestrialRadiation(latitudeDeg: number, day: number) { finite(latitudeDeg, 'latitude'); if (Math.abs(latitudeDeg) > 90 || day < 1 || day > 366) throw new Error('Invalid latitude/day'); const phi = latitudeDeg * Math.PI / 180; const inverseDistance = 1 + .033 * Math.cos(2 * Math.PI * day / 365); const declination = .409 * Math.sin(2 * Math.PI * day / 365 - 1.39); const sunset = Math.acos(clamp(-Math.tan(phi) * Math.tan(declination), -1, 1)); return Math.max(0, 1440 / Math.PI * .082 * inverseDistance * (sunset * Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.sin(sunset))); }
/** Daily FAO-56 equation 6. G=0; canonical FAO 273.16 K conversion in Eq 39. */
export function calculateEto(w: WeatherInput): EtoResult {
  Object.entries(w).forEach(([key, value]) => { if (typeof value === 'number') finite(value, key); });
  if (w.temperatureMinC > w.temperatureMaxC) throw new Error('Minimum temperature exceeds maximum');
  nonnegative(w.windSpeedMps, 'wind'); nonnegative(w.solarRadiationMjM2Day, 'radiation');
  if (w.elevationM < -500 || w.elevationM > 9000) throw new Error('Unsupported elevation');
  const day = dayOfYear(w.date), mean = (w.temperatureMaxC + w.temperatureMinC) / 2;
  const es = (saturationVaporPressure(w.temperatureMinC) + saturationVaporPressure(w.temperatureMaxC)) / 2;
  const ea = actualVaporPressure(w.temperatureMinC, w.temperatureMaxC, w.relativeHumidityMinPct, w.relativeHumidityMaxPct);
  const delta = 4098 * saturationVaporPressure(mean) / (mean + 237.3) ** 2;
  const pressure = 101.3 * ((293 - .0065 * w.elevationM) / 293) ** 5.26;
  const gamma = .000665 * pressure;
  const ra = extraterrestrialRadiation(w.latitudeDeg, day), rso = (.75 + .00002 * w.elevationM) * ra;
  const rns = .77 * w.solarRadiationMjM2Day;
  // FAO bounds Rs/Rso at 1. The 0.3 lower limit avoids a negative cloudiness factor on exceptionally dark days.
  const ratio = rso > 0 ? clamp(w.solarRadiationMjM2Day / rso, .3, 1) : .3;
  const rnl = 4.903e-9 * ((w.temperatureMaxC + 273.16) ** 4 + (w.temperatureMinC + 273.16) ** 4) / 2 * (.34 - .14 * Math.sqrt(ea)) * (1.35 * ratio - .35);
  const rn = rns - rnl;
  const etoMm = Math.max(0, (.408 * delta * rn + gamma * 900 / (mean + 273) * w.windSpeedMps * (es - ea)) / (delta + gamma * (1 + .34 * w.windSpeedMps)));
  return { etoMm, dayOfYear: day, meanTemperatureC: mean, saturationVaporPressureKpa: es, actualVaporPressureKpa: ea, vaporPressureDeficitKpa: es - ea, slopeKpaC: delta, atmosphericPressureKpa: pressure, psychrometricConstantKpaC: gamma, extraterrestrialRadiationMjM2Day: ra, clearSkyRadiationMjM2Day: rso, netShortwaveRadiationMjM2Day: rns, netLongwaveRadiationMjM2Day: rnl, netRadiationMjM2Day: rn };
}
export function cropStage(daysAfterPlanting: number, stageDays: readonly number[] = POTATO_PARAMETERS.demoStageDays) {
  if (stageDays.length !== 4 || stageDays.some(d => !Number.isFinite(d) || d <= 0)) throw new Error('Four positive stage durations required');
  finite(daysAfterPlanting, 'daysAfterPlanting'); const [initial, development, mid, late] = stageDays;
  const day = Math.max(0, daysAfterPlanting);
  if (day < initial) return { stage: 'Initial', progress: day / initial, kcb: .15 };
  if (day < initial + development) { const progress = (day - initial) / development; return { stage: 'Development', progress, kcb: .15 + .95 * progress }; }
  if (day < initial + development + mid) return { stage: 'Mid-season', progress: (day - initial - development) / mid, kcb: 1.1 };
  const progress = clamp((day - initial - development - mid) / late, 0, 1);
  return { stage: progress === 1 ? 'Harvest ready' : 'Late season', progress, kcb: 1.1 - .45 * progress };
}
/** Eq 70: stage-mean climate, not daily weather. The golden fixture supplies Kcb directly. */
export function adjustBasalCoefficient(kcb: number, stageWindMps: number, stageRhMinPct: number, heightM: number) { positive(heightM, 'heightM'); nonnegative(kcb, 'kcb'); if (kcb < .45) return kcb; return kcb + (.04 * (clamp(stageWindMps, 1, 6) - 2) - .004 * (clamp(stageRhMinPct, 20, 80) - 45)) * (heightM / 3) ** .3; }
export function validateParameters(p: AgronomyParameters) {
  Object.entries(p).forEach(([key, value]) => { if (typeof value === 'number') finite(value, key); });
  if (!(p.fieldCapacity > p.wiltingPoint && p.wiltingPoint >= 0 && p.fieldCapacity <= 1)) throw new Error('Field capacity must exceed wilting point');
  for (const key of ['fieldAreaM2', 'rootDepthM', 'evaporationDepthM', 'cropHeightM'] as const) positive(p[key], key);
  if (!(p.applicationEfficiency > 0 && p.applicationEfficiency <= 1)) throw new Error('Efficiency must be in (0,1]');
  if (!(p.wettedFraction > 0 && p.wettedFraction <= 1)) throw new Error('Wetted fraction must be in (0,1]');
  if (!(p.depletionFraction > 0 && p.depletionFraction < 1)) throw new Error('Invalid depletion fraction');
  if (!(p.targetDepletionFraction >= 0 && p.targetDepletionFraction < p.earlyWarningFraction && p.earlyWarningFraction <= p.actionDepletionFraction && p.actionDepletionFraction <= 1)) throw new Error('Invalid management thresholds');
  nonnegative(p.capillaryRiseMm, 'capillaryRiseMm'); nonnegative(p.kcb, 'kcb');
  const tew = 1000 * (p.fieldCapacity - .5 * p.wiltingPoint) * p.evaporationDepthM;
  if (!(p.readilyEvaporableWaterMm > 0 && p.readilyEvaporableWaterMm < tew)) throw new Error('REW must be positive and below TEW');
}
/** Equations 71–76; persist De separately from root-zone depletion. */
export function evaporationCoefficients(p: AgronomyParameters, w: WeatherInput, surfaceDepletionMm: number) {
  validateParameters(p); nonnegative(surfaceDepletionMm, 'surfaceDepletionMm');
  const tewMm = 1000 * (p.fieldCapacity - .5 * p.wiltingPoint) * p.evaporationDepthM;
  const kcmax = Math.max(1.2 + (.04 * (w.windSpeedMps - 2) - .004 * (w.relativeHumidityMinPct - 45)) * (p.cropHeightM / 3) ** .3, p.kcb + .05);
  const canopyFraction = clamp((Math.max(.01, p.kcb - .15) / Math.max(.01, kcmax - .15)) ** (1 + .5 * p.cropHeightM), 0, .99);
  const exposedWettedFraction = Math.max(.01, Math.min(1 - canopyFraction, p.wettedFraction * (1 - 2 / 3 * canopyFraction)));
  const kr = surfaceDepletionMm <= p.readilyEvaporableWaterMm ? 1 : clamp((tewMm - surfaceDepletionMm) / (tewMm - p.readilyEvaporableWaterMm), 0, 1);
  const ke = Math.max(0, Math.min(kr * (kcmax - p.kcb), exposedWettedFraction * kcmax));
  return { tewMm, kcmax, canopyFraction, exposedWettedFraction, kr, ke };
}
export function totalAvailableWater(fieldCapacity: number, wiltingPoint: number, rootDepthM: number) { if (!(fieldCapacity > wiltingPoint && wiltingPoint >= 0 && fieldCapacity <= 1)) throw new Error('Invalid soil water bounds'); positive(rootDepthM, 'rootDepthM'); return 1000 * (fieldCapacity - wiltingPoint) * rootDepthM; }
export function stressCoefficient(depletionMm: number, tawMm: number, rawMm: number) { positive(tawMm, 'tawMm'); if (rawMm < 0 || rawMm >= tawMm) throw new Error('RAW must be below TAW'); nonnegative(depletionMm, 'depletionMm'); return depletionMm <= rawMm ? 1 : clamp((tawMm - depletionMm) / (tawMm - rawMm), 0, 1); }
/** Eq 85/88. Return explicit overflow and unmet ET so clamping never hides a mass-balance loss. */
export function rootWaterBalance(startMm: number, rainMm: number, runoffMm: number, netIrrigationMm: number, etcMm: number, tawMm: number, capillaryRiseMm = 0) {
  [startMm, rainMm, runoffMm, netIrrigationMm, etcMm, capillaryRiseMm].forEach(value => nonnegative(value, 'water balance input'));
  positive(tawMm, 'tawMm'); if (runoffMm > rainMm || startMm > tawMm) throw new Error('Invalid water balance bounds');
  const unconstrained = startMm - (rainMm - runoffMm) - netIrrigationMm - capillaryRiseMm + etcMm;
  const deepPercolationMm = Math.max(0, -unconstrained), unmetEtMm = Math.max(0, unconstrained - tawMm);
  return { depletionMm: clamp(unconstrained, 0, tawMm), deepPercolationMm, unmetEtMm };
}
/** Eq 77–79: irrigation concentrated over fw, evaporation over few; Tew=0 demo assumption. */
export function surfaceWaterBalance(startMm: number, rainMm: number, runoffMm: number, netIrrigationMm: number, evaporationMm: number, wettedFraction: number, exposedWettedFraction: number, tewMm: number) {
  [startMm, rainMm, runoffMm, netIrrigationMm, evaporationMm].forEach(value => nonnegative(value, 'surface balance input'));
  if (runoffMm > rainMm || wettedFraction <= 0 || wettedFraction > 1 || exposedWettedFraction <= 0 || exposedWettedFraction > 1 || startMm > tewMm) throw new Error('Invalid surface balance bounds');
  const unconstrained = startMm - (rainMm - runoffMm) - netIrrigationMm / wettedFraction + evaporationMm / exposedWettedFraction;
  return { depletionMm: clamp(unconstrained, 0, tewMm), drainageMm: Math.max(0, -unconstrained) };
}
/** Golden convention: weather ET occurs before late-day rain/irrigation. */
export function calculateAgronomy(input: AgronomyInput): AgronomyResult {
  const p = input.parameters; validateParameters(p); const eto = calculateEto(input.weather);
  const evaporation = evaporationCoefficients(p, input.weather, input.surfaceDepletionMm);
  const tawMm = totalAvailableWater(p.fieldCapacity, p.wiltingPoint, p.rootDepthM);
  if (input.rootZoneDepletionMm > tawMm || input.surfaceDepletionMm > evaporation.tewMm) throw new Error('Starting depletion exceeds available water');
  const potentialEtcMm = (p.kcb + evaporation.ke) * eto.etoMm;
  const adjustedDepletionFraction = clamp(p.depletionFraction + .04 * (5 - potentialEtcMm), .1, .8), rawMm = adjustedDepletionFraction * tawMm;
  const ks = stressCoefficient(input.rootZoneDepletionMm, tawMm, rawMm);
  const unconstrainedEt = (ks * p.kcb + evaporation.ke) * eto.etoMm;
  const balance = rootWaterBalance(input.rootZoneDepletionMm, input.observedRainMm, input.runoffMm ?? 0, input.netIrrigationMm ?? 0, unconstrainedEt, tawMm, p.capillaryRiseMm);
  const etcMm = unconstrainedEt - balance.unmetEtMm;
  const evaporationMm = Math.min(evaporation.ke * eto.etoMm, etcMm);
  const surface = surfaceWaterBalance(input.surfaceDepletionMm, input.observedRainMm, input.runoffMm ?? 0, input.netIrrigationMm ?? 0, evaporationMm, p.wettedFraction, evaporation.exposedWettedFraction, evaporation.tewMm);
  const targetDepletionMm = p.targetDepletionFraction * rawMm, irrigationRequired = balance.depletionMm >= p.actionDepletionFraction * rawMm;
  const netDepthMm = irrigationRequired ? Math.max(0, balance.depletionMm - targetDepletionMm) : 0;
  const grossDepthMm = netDepthMm / p.applicationEfficiency;
  return { ...eto, ...evaporation, engineVersion: ENGINE_VERSION, parameterVersion: p.version, input: structuredClone(input), kcb: p.kcb, ks, potentialEtcMm, etcMm, evaporationMm, tawMm, adjustedDepletionFraction, rawMm, startingDepletionMm: input.rootZoneDepletionMm, rootZoneDepletionMm: balance.depletionMm, surfaceDepletionMm: surface.depletionMm, deepPercolationMm: balance.deepPercolationMm, surfaceDrainageMm: surface.drainageMm, targetDepletionMm, netDepthMm, grossDepthMm, netVolumeLiters: netDepthMm * p.fieldAreaM2, grossVolumeLiters: grossDepthMm * p.fieldAreaM2, irrigationRequired };
}
export function calculateGolden(): AgronomyResult { return calculateAgronomy({ weather: { ...GOLDEN_WEATHER }, parameters: { ...DEFAULT_PARAMETERS }, rootZoneDepletionMm: 22, surfaceDepletionMm: 17, observedRainMm: 2, runoffMm: 0, netIrrigationMm: 0 }); }
