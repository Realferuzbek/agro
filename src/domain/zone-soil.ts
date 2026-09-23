import { calculateAgronomy, clamp, rootWaterBalance, surfaceWaterBalance, validateParameters } from './agronomy';
import type { AgronomyResult, SimulationState, ZoneSoilConfiguration, ZoneSoilLedger } from './types';

export function elapsedDayEtFraction(clock: string): number { const local = new Date(Date.parse(clock) + 5 * 3600000); const seconds = local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds(); return clamp((seconds - 6 * 3600) / (12 * 3600), 0, 1); }
export function weightedZoneValue(state: SimulationState, value: (zone: ZoneSoilLedger) => number): number { return state.soilModel!.zones.reduce((sum, zone) => sum + value(zone) * zone.parameters.fieldAreaM2 / state.field.areaM2, 0); }

/** Local ledgers are authoritative in this opt-in mode; field numbers are summaries only. */
export function synchronizeZoneSummary(state: SimulationState): void {
  if (!state.soilModel) return;
  const average = (value: (zone: ZoneSoilLedger) => number) => weightedZoneValue(state, value);
  state.soil.rootZoneDepletionMm = average(zone => zone.rootZoneDepletionMm);
  state.soil.surfaceDepletionMm = average(zone => zone.surfaceDepletionMm);
  state.soil.rawMm = average(zone => zone.calculation.rawMm);
  state.soil.tawMm = average(zone => zone.calculation.tawMm);
  state.soil.fieldCapacity = average(zone => zone.parameters.fieldCapacity);
  state.soil.wiltingPoint = average(zone => zone.parameters.wiltingPoint);
  state.field.rootDepthM = average(zone => zone.parameters.rootDepthM);
  state.soil.deepPercolationMm = average(zone => zone.accounting.deepPercolationMm);
  state.accounting.appliedEtMm = average(zone => zone.accounting.appliedEtMm);
  state.accounting.netDeliveryMm = average(zone => zone.accounting.netDeliveryMm);
  state.accounting.observedRainMm = average(zone => zone.accounting.observedRainMm);
  const first = state.soilModel.zones[0].calculation;
  const summary: AgronomyResult = { ...first, parameterVersion: state.soilModel.version, aggregation: 'area-weighted-zone-summary', zoneCalculations: Object.fromEntries(state.soilModel.zones.map(zone => [zone.zoneId, zone.calculation])) };
  const keys = ['kcb', 'kcmax', 'canopyFraction', 'exposedWettedFraction', 'tewMm', 'kr', 'ke', 'ks', 'potentialEtcMm', 'etcMm', 'evaporationMm', 'tawMm', 'adjustedDepletionFraction', 'rawMm', 'startingDepletionMm', 'targetDepletionMm', 'surfaceDrainageMm'] as const;
  for (const key of keys) summary[key] = average(zone => zone.calculation[key]);
  summary.rootZoneDepletionMm = state.soil.rootZoneDepletionMm;
  summary.surfaceDepletionMm = state.soil.surfaceDepletionMm;
  summary.deepPercolationMm = state.soil.deepPercolationMm;
  summary.irrigationRequired = state.soilModel.zones.some(zone => zone.rootZoneDepletionMm >= zone.calculation.rawMm * zone.parameters.actionDepletionFraction);
  summary.netVolumeLiters = state.soilModel.zones.reduce((sum, zone) => sum + (zone.rootZoneDepletionMm >= zone.calculation.rawMm * zone.parameters.actionDepletionFraction ? Math.max(0, zone.rootZoneDepletionMm - zone.calculation.targetDepletionMm) * zone.parameters.fieldAreaM2 : 0), 0);
  summary.grossVolumeLiters = state.soilModel.zones.reduce((sum, zone) => sum + (zone.rootZoneDepletionMm >= zone.calculation.rawMm * zone.parameters.actionDepletionFraction ? Math.max(0, zone.rootZoneDepletionMm - zone.calculation.targetDepletionMm) * zone.parameters.fieldAreaM2 / zone.parameters.applicationEfficiency : 0), 0);
  summary.netDepthMm = summary.netVolumeLiters / state.field.areaM2;
  summary.grossDepthMm = summary.grossVolumeLiters / state.field.areaM2;
  state.calculation = summary;
}

export function configureZoneSoilState(state: SimulationState, configuration: ZoneSoilConfiguration): SimulationState {
  if (state.status === 'running' || state.status === 'paused') throw new Error('Stop the irrigation run before changing soil accounting');
  if (!configuration.version.trim() || !configuration.source.trim()) throw new Error('Zone configuration requires version and source');
  if (configuration.zones.length !== state.zones.length || new Set(configuration.zones.map(zone => zone.zoneId)).size !== state.zones.length) throw new Error('Explicit soil configuration for all four zones is required');
  const next = structuredClone(state), fraction = elapsedDayEtFraction(state.clock);
  const zones: ZoneSoilLedger[] = state.zones.map(zone => {
    const configured = configuration.zones.find(item => item.zoneId === zone.id);
    if (!configured) throw new Error(`Missing soil configuration for zone ${zone.id}`);
    validateParameters(configured.parameters);
    if (configured.parameters.capillaryRiseMm !== 0) throw new Error('This simulation requires zero capillary rise; a groundwater flux adapter is not configured');
    if (!configured.parameters.version.trim() || Math.abs(configured.parameters.fieldAreaM2 - zone.areaM2) > 1e-8) throw new Error(`Zone ${zone.id} parameters require a version and the configured zone area`);
    const calculation = calculateAgronomy({ weather: state.weather, parameters: configured.parameters, rootZoneDepletionMm: configured.rootZoneDepletionMm, surfaceDepletionMm: configured.surfaceDepletionMm, observedRainMm: 0, surfaceWetting: state.surfaceWetting });
    return { ...structuredClone(configured), calculation, surfaceWetting: state.surfaceWetting ?? 'drip', accounting: { day: state.accounting.day, appliedEtMm: calculation.etcMm * fraction, observedRainMm: state.rain.observedMm, netDeliveryMm: 0, deepPercolationMm: 0 } };
  });
  if (Math.abs(zones.reduce((sum, zone) => sum + zone.parameters.fieldAreaM2, 0) - state.field.areaM2) > 1e-8) throw new Error('Zone areas must exactly cover the field');
  next.soilModel = { mode: 'zone-specific', version: configuration.version, source: configuration.source, configuredAt: state.clock, zones };
  next.version++; next.status = 'idle';
  next.control = { ...next.control, activeZoneIndex: 0, activeZoneSeconds: 0, pumpState: 'OFF', pauseReason: null, runStartedAt: null, runTargetLiters: 0, deliveredVolumeLiters: 0, rainPaused: false };
  for (const zone of next.zones) { zone.state = 'idle'; zone.valveState = 'CLOSED'; zone.flowM3h = 0; zone.pressureBar = 0; zone.deliveredVolumeLiters = 0; }
  synchronizeZoneSummary(next);
  return next;
}

/** A scientific projection copy; never use it to commit delivery or observation state. */
export function zoneProjectionState(state: SimulationState, zone: ZoneSoilLedger): SimulationState {
  const view: SimulationState = { ...state, soilModel: undefined, field: { ...state.field, areaM2: zone.parameters.fieldAreaM2, rootDepthM: zone.parameters.rootDepthM }, parameters: { ...zone.parameters }, calculation: zone.calculation, soil: { ...state.soil, rootZoneDepletionMm: zone.rootZoneDepletionMm, surfaceDepletionMm: zone.surfaceDepletionMm, fieldCapacity: zone.parameters.fieldCapacity, wiltingPoint: zone.parameters.wiltingPoint, rawMm: zone.calculation.rawMm, tawMm: zone.calculation.tawMm }, zones: state.zones.map(item => ({ ...item })), accounting: { ...state.accounting, appliedEtMm: zone.accounting.appliedEtMm }, surfaceWetting: zone.surfaceWetting };
  return view;
}

export function addZoneRain(state: SimulationState, rainfallMm: number): void {
  for (const zone of state.soilModel!.zones) {
    const balance = rootWaterBalance(zone.rootZoneDepletionMm, rainfallMm, 0, 0, 0, zone.calculation.tawMm);
    zone.rootZoneDepletionMm = balance.depletionMm; zone.accounting.deepPercolationMm += balance.deepPercolationMm; zone.accounting.observedRainMm += rainfallMm;
    zone.surfaceDepletionMm = Math.max(0, zone.surfaceDepletionMm - rainfallMm);
  }
  synchronizeZoneSummary(state);
}
export function addZoneDelivery(state: SimulationState, zoneId: string, grossLiters: number): void {
  const zone = state.soilModel!.zones.find(item => item.zoneId === zoneId)!;
  const netDepth = grossLiters * zone.parameters.applicationEfficiency / zone.parameters.fieldAreaM2;
  const balance = rootWaterBalance(zone.rootZoneDepletionMm, 0, 0, netDepth, 0, zone.calculation.tawMm);
  zone.rootZoneDepletionMm = balance.depletionMm; zone.accounting.netDeliveryMm += netDepth; zone.accounting.deepPercolationMm += balance.deepPercolationMm;
  zone.surfaceDepletionMm = Math.max(0, zone.surfaceDepletionMm - netDepth / zone.parameters.wettedFraction); zone.surfaceWetting = 'drip';
  synchronizeZoneSummary(state);
}
export function addZoneDailyEt(state: SimulationState): void {
  const fraction = elapsedDayEtFraction(state.clock);
  for (const zone of state.soilModel!.zones) {
    const target = zone.calculation.etcMm * fraction, increment = Math.max(0, target - zone.accounting.appliedEtMm);
    if (increment <= 0) continue;
    const balance = rootWaterBalance(zone.rootZoneDepletionMm, 0, 0, 0, increment, zone.calculation.tawMm);
    zone.rootZoneDepletionMm = balance.depletionMm;
    const evaporation = zone.calculation.etcMm > 0 ? increment * zone.calculation.evaporationMm / zone.calculation.etcMm : 0;
    zone.surfaceDepletionMm = surfaceWaterBalance(zone.surfaceDepletionMm, 0, 0, 0, evaporation, zone.parameters.wettedFraction, zone.calculation.exposedWettedFraction, zone.calculation.tewMm).depletionMm;
    zone.accounting.appliedEtMm += increment;
  }
  synchronizeZoneSummary(state);
}
