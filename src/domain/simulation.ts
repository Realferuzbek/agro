import { calculateAgronomy, calculateGolden, clamp, cropStage, DEFAULT_PARAMETERS, ENGINE_VERSION, GOLDEN_WEATHER, POTATO_PARAMETERS, rootWaterBalance, runtimeMinutes, surfaceWaterBalance } from './agronomy';
import type { DeviceReading, FieldAlert, HistoryPoint, IrrigationZone, Recommendation, ScenarioDefinition, ScenarioId, SimulationState, ZoneSoilConfiguration } from './types';
import { DEVICE_QUALITY_POLICY } from './device-policy';
import { simulatedDeviceReadings } from './providers';
import { addZoneDailyEt, addZoneDelivery, addZoneRain, configureZoneSoilState, synchronizeZoneSummary, weightedZoneValue, zoneProjectionState } from './zone-soil';

export const DEMO_CLOCK = '2026-04-25T13:00:00.000Z'; // 18:00 Asia/Tashkent; today's ET budget is already accounted for.
export const SIMULATION_CONFIGURATION_VERSION = 'simulation-demo-1.0.0';
export const DEMO_FIELD = { id: 'north-potato-field', farmName: 'Tashkent Demo Farm', name: 'North Potato Field', region: 'Tashkent Region, Uzbekistan', crop: 'Potato', plantingDate: '2026-03-01', areaM2: 10000, widthM: 100, lengthM: 100, growthStage: 'Mid-season', daysAfterPlanting: 55, rootDepthM: .5 };
export const SIMULATION_POLICY = { schemaVersion: 1, maximumStepSeconds: 86400, integrationStepSeconds: 1, pressureNominalBar: 1.5, pumpRampSeconds: 20, valveRampSeconds: 30, anomalyGraceSeconds: 45, rainQuietMinutes: 30, historyIntervalSeconds: 300, historyLimit: 576, historySeedDays: 7, sensorLagSeconds: { shallow: 180, middle: 600, deep: 1800 }, highFlowRatio: 1.25, lowFlowRatio: .8, lowPressureBar: .8, significantFlowM3h: .3, rainProbabilityThresholdPct: 60, rainMeaningfulMm: 2, surfaceWettingRainMm: 3 } as const;
export const DEMO_DRIP_PROFILE = { version: 'drip-demo-1.0.0', provenance: 'SIMULATED', rowSpacingM: .8, emitterSpacingM: .3, nominalEmitterFlowLph: 1, rowsApproximate: 125, zoneCount: 4, applicationEfficiency: .9, designWholeFieldFlowM3h: 10000 / .8 / .3 / 1000, calibratedZoneFlowsM3h: [10.5, 10.3, 10.4, 10.2], notes: 'Conceptual pressure-compensating inline drip. Zone flows are configured simulation reference values; no physical commissioning has occurred.' } as const;
const FORECAST_RAIN_MM = [0, 0, 4, 2.5, 0, 0, 0] as const;
export const SCENARIOS: readonly ScenarioDefinition[] = [
  { id: 'normal-hot-day', name: 'Normal hot day', description: 'A healthy system delivers the computed irrigation plan.' },
  { id: 'rain-succeeds', name: 'Forecast rain succeeds', description: 'Seven millimetres arrive within the forecast window.' },
  { id: 'rain-fails', name: 'Forecast rain fails', description: 'The rain window closes without observed rainfall.' },
  { id: 'rain-underperforms', name: 'Rain underperforms', description: 'The golden scenario: 7 mm expected, 2 mm received.' },
  { id: 'unexpected-storm', name: 'Unexpected storm', description: 'Twelve millimetres arrive and reduce the irrigation requirement.' },
  { id: 'high-flow', name: 'High flow', description: 'A sustained flow excess pauses delivery for inspection.' },
  { id: 'low-flow', name: 'Low flow', description: 'A sustained flow deficit pauses delivery for inspection.' },
  { id: 'low-pressure', name: 'Low pressure', description: 'Insufficient operating pressure pauses the run.' },
  { id: 'sensor-offline', name: 'Soil sensor offline', description: 'Model fallback continues with moderate data completeness.' },
  { id: 'sensor-outlier', name: 'Soil sensor outlier', description: 'An implausible reading is quarantined from control.' },
  { id: 'valve-failure', name: 'Valve command failure', description: 'A valve fails to acknowledge its open command.' },
  { id: 'telemetry-conflict', name: 'Telemetry conflict', description: 'Flow conflicts with closed valves and an idle pump.' },
] as const;

const localDate = (clock: string) => new Date(Date.parse(clock) + 5 * 3600000).toISOString().slice(0, 10);
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();
const sumDelivery = (state: SimulationState) => state.zones.reduce((sum, zone) => sum + zone.deliveredVolumeLiters, 0);
const meanMoisture = (state: SimulationState) => state.soilModel ? 100 * weightedZoneValue(state, zone => zone.parameters.fieldCapacity - zone.rootZoneDepletionMm / (1000 * zone.parameters.rootDepthM)) : 100 * (state.soil.fieldCapacity - state.soil.rootZoneDepletionMm / (1000 * state.field.rootDepthM));

function event(state: SimulationState, type: string, message: string) { const sequence = (state.eventSequence ?? state.events.reduce((maximum, item) => { const suffix = Number(item.id.split(':').at(-1)); return Number.isSafeInteger(suffix) && suffix >= 0 ? Math.max(maximum, suffix) : maximum; }, 0)) + 1; state.eventSequence = sequence; state.events.push({ id: `${state.id}:${state.elapsedSeconds}:${sequence}`, at: state.clock, type, message }); if (state.events.length > 500) state.events.shift(); }
function alert(state: SimulationState, type: FieldAlert['type'], severity: FieldAlert['severity'], title: string, message: string, evidence: string, causes: string[] = []) {
  if (state.alerts.some(item => item.type === type && item.status === 'active')) return;
  state.alerts.push({ id: `${state.id}:${type}:${state.elapsedSeconds}`, type, severity, title, message, detectedAt: state.clock, status: 'active', evidence, possibleCauses: causes });
  event(state, 'alert', title);
}
function resolveAlert(state: SimulationState, type: FieldAlert['type'], resolution: string) { for (const item of state.alerts) if (item.type === type && item.status === 'active') { item.status = 'resolved'; item.resolution = resolution; } }
export function assessDataQuality(state: SimulationState): { status: Recommendation['confidence']; reasons: string[] } {
  const critical: string[] = [], optional: string[] = [], now = Date.parse(state.clock);
  function problem(device: DeviceReading): string | null {
    if (device.status !== 'online') return `${device.name} is ${device.status}`;
    if (device.datum.quality !== 'valid') return `${device.name} has ${device.datum.quality} data`;
    const measuredAt = Date.parse(device.datum.measuredAt), lastSeen = Date.parse(device.lastSeen), age = (now - Math.min(measuredAt, lastSeen)) / 1000;
    if (!Number.isFinite(age) || age > DEVICE_QUALITY_POLICY.freshnessSeconds[device.kind] || age < -DEVICE_QUALITY_POLICY.maximumFutureSkewSeconds) return `${device.name} data is not fresh`;
    return null;
  }
  for (const kind of DEVICE_QUALITY_POLICY.criticalKinds) if (!state.devices.some(device => device.kind === kind)) critical.push(`Required ${kind} channel is missing`);
  for (const zone of state.zones) if (!state.devices.some(device => device.kind === 'valve' && device.zoneId === zone.id)) critical.push(`Valve feedback for zone ${zone.id} is missing`);
  for (const depth of DEVICE_QUALITY_POLICY.soilDepthsCm) if (!state.devices.some(device => device.kind === 'soil' && device.depthCm === depth)) optional.push(`${depth} cm soil sensor is missing; water-balance fallback is available`);
  for (const device of state.devices) { const reason = problem(device); if (reason) (device.kind === 'soil' ? optional : critical).push(reason); }
  const reportedFlow = state.devices.find(device => device.kind === 'flow')?.datum.value;
  const reportedPump = state.devices.find(device => device.kind === 'pump')?.datum.value;
  const valveReadings = state.devices.filter(device => device.kind === 'valve');
  if (typeof reportedFlow === 'number' && reportedFlow > SIMULATION_POLICY.significantFlowM3h && reportedPump === 'OFF' && valveReadings.length > 0 && valveReadings.every(device => device.datum.value === 'CLOSED')) critical.push('Reported flow conflicts with an idle pump and closed valves');
  if (state.alerts.some(item => item.status === 'active' && item.severity === 'critical')) critical.push('An unresolved critical alert requires inspection');
  return { status: critical.length ? 'Degraded' : optional.length ? 'Moderate' : 'Complete', reasons: [...critical, ...optional] };
}
export function zoneRemainingMinutes(zone: IrrigationZone): number { const remaining = Math.max(0, zone.targetVolumeLiters - zone.deliveredVolumeLiters); return remaining === 0 ? 0 : runtimeMinutes(remaining, zone.flowM3h > 0 ? zone.flowM3h : zone.nominalFlowM3h); }

function forecastWeather(state: SimulationState, index: number, date: string) { const offset = clamp(index, 0, 6); return { ...state.weather, date, temperatureMaxC: [28, 29, 24, 23, 26, 28, 29][offset], temperatureMinC: [14, 15, 14, 13, 13, 14, 15][offset], solarRadiationMjM2Day: [20.5, 21, 15, 16.5, 20, 21, 22][offset] }; }
export interface NoRainProjectionPoint { at: string; depletionMm: number; rawMm: number; actionThresholdMm: number; }
/** Examine every hourly step and daily threshold boundary, without modifying the observation ledger. */
export function projectNoRainWindow(state: SimulationState, until: string): { points: NoRainProjectionPoint[]; safe: boolean } {
  if (state.soilModel) {
    const local = state.soilModel.zones.map(zone => projectNoRainWindow(zoneProjectionState(state, zone), until));
    return { safe: local.every(projection => projection.safe), points: local[0].points.map((point, index) => ({ at: point.at, depletionMm: weightedZoneValue(state, zone => local[state.soilModel!.zones.indexOf(zone)].points[index].depletionMm), rawMm: weightedZoneValue(state, zone => local[state.soilModel!.zones.indexOf(zone)].points[index].rawMm), actionThresholdMm: weightedZoneValue(state, zone => local[state.soilModel!.zones.indexOf(zone)].points[index].actionThresholdMm) })) };
  }
  const start = Date.parse(state.clock), end = Date.parse(until);
  if (!Number.isFinite(end) || end - start > 7 * 86400000) throw new Error('Rain forecast window must be within seven days');
  const points: NoRainProjectionPoint[] = [{ at: state.clock, depletionMm: state.soil.rootZoneDepletionMm, rawMm: state.soil.rawMm, actionThresholdMm: state.soil.rawMm * state.parameters.actionDepletionFraction }];
  let depletion = state.soil.rootZoneDepletionMm, surface = state.soil.surfaceDepletionMm, cursor = start;
  let date = localDate(state.clock), etc = state.calculation.potentialEtcMm, raw = state.soil.rawMm;
  while (cursor < end) {
    const boundary = Date.parse(`${date}T00:00:00+05:00`) + 86400000;
    const next = Math.min(cursor + 3600000, boundary, end);
    // Planning assumption: distribute forecast demand uniformly; unlike observed accounting this is a projected copy.
    depletion += etc * (next - cursor) / 86400000;
    points.push({ at: iso(next), depletionMm: depletion, rawMm: raw, actionThresholdMm: raw * state.parameters.actionDepletionFraction });
    cursor = next;
    if (cursor === boundary && cursor < end) {
      date = localDate(iso(cursor)); const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localDate(state.clock)}T00:00:00Z`)) / 86400000);
      const result = calculateAgronomy({ weather: forecastWeather(state, day, date), parameters: { ...state.parameters, kcb: cropStage(state.field.daysAfterPlanting + day).kcb }, rootZoneDepletionMm: Math.min(depletion, state.soil.tawMm), surfaceDepletionMm: surface, observedRainMm: 0, surfaceWetting: state.surfaceWetting });
      etc = result.potentialEtcMm; raw = result.rawMm; surface = result.surfaceDepletionMm;
      points.push({ at: iso(cursor), depletionMm: depletion, rawMm: raw, actionThresholdMm: raw * state.parameters.actionDepletionFraction });
    }
  }
  return { points, safe: points.every(point => point.depletionMm < point.actionThresholdMm) };
}
export function projectedNoRainDepletion(state: SimulationState, until: string): number { return projectNoRainWindow(state, until).points.at(-1)!.depletionMm; }
function updateRecommendation(state: SimulationState) {
  if (state.soilModel) { updateZoneRecommendations(state); return; }
  const target = state.parameters.targetDepletionFraction * state.soil.rawMm;
  const quality = assessDataQuality(state), confidence = quality.status, projection = projectNoRainWindow(state, state.rain.windowEnd), projected = projection.points.at(-1)!.depletionMm;
  const windowOpen = Date.parse(state.clock) < Date.parse(state.rain.windowEnd);
  const canWait = windowOpen && state.rain.probabilityPct >= SIMULATION_POLICY.rainProbabilityThresholdPct && state.rain.forecastMm >= SIMULATION_POLICY.rainMeaningfulMm && projection.safe;
  const rainArrivesTooLate = windowOpen && state.rain.forecastMm >= SIMULATION_POLICY.rainMeaningfulMm && !projection.safe;
  const required = state.soil.rootZoneDepletionMm >= state.soil.rawMm * state.parameters.actionDepletionFraction || (rainArrivesTooLate && state.soil.rootZoneDepletionMm > target);
  let status: Recommendation['status'] = required ? 'irrigate' : 'monitor';
  let reason = required ? 'The root zone has reached its action threshold. Refill to the configured management target.' : 'The field has enough available water. Continue monitoring soil and rainfall.';
  if (rainArrivesTooLate) reason = 'The no-rain projection reaches the action threshold before the forecast window ends. Plan irrigation before relying on that rainfall.';
  if (canWait) { status = 'wait-for-rain'; reason = 'The field can safely wait through the entire forecast window, even if no rain arrives. Only observed rain will change the water balance.'; }
  if (state.scenarioId === 'rain-underperforms' && state.rain.forecastMm === 7 && state.rain.observedMm === 2 && required) reason = 'Rain was lower than expected: 2.0 mm received against 7.0 mm forecast. The remaining root-zone need determines this plan.';
  if (state.status === 'running') { status = 'irrigating'; reason = 'Simulated delivery is integrating from zone flow. Volume, rather than a timer, determines completion.'; }
  if (state.status === 'completed' && !required) { status = 'complete'; reason = 'The field’s water need is covered by observed rain and simulated actual delivery. The water balance has been updated.'; }
  if (confidence === 'Degraded' || state.control.pauseReason) { status = 'blocked'; reason = state.control.pauseReason ?? `${quality.reasons[0]}. Restore valid critical channels before automatic control.`; }
  const netDepthMm = (required || state.status === 'running') ? Math.max(0, state.soil.rootZoneDepletionMm - target) : 0;
  const grossDepthMm = netDepthMm / state.parameters.applicationEfficiency;
  const grossVolumeLiters = grossDepthMm * state.field.areaM2;
  const runtimes = state.zones.map(zone => runtimeMinutes(grossVolumeLiters / 4, zone.flowM3h > 0 ? zone.flowM3h : zone.nominalFlowM3h));
  const titles: Record<Recommendation['status'], string> = { irrigate: 'Irrigation recommended today', 'wait-for-rain': 'Waiting for expected rainfall', monitor: 'Your field can wait', blocked: 'Irrigation needs attention', irrigating: 'Irrigation in progress', complete: 'Irrigation plan completed' };
  state.recommendation = { status, title: titles[status], reason, netDepthMm, grossDepthMm, netVolumeLiters: netDepthMm * state.field.areaM2, grossVolumeLiters, estimatedRuntimeMinutes: runtimes.reduce((a, b) => a + b, 0), perZoneRuntimeMinutes: runtimes.reduce((a, b) => a + b, 0) / 4, targetDepletionMm: target, confidence, engineVersion: ENGINE_VERSION, parameterVersion: state.parameters.version, calculatedAt: state.clock, projectedNoRainDepletionMm: projected };
  if (state.status === 'idle' || state.status === 'stopped') for (const zone of state.zones) { zone.targetVolumeLiters = grossVolumeLiters / 4; zone.estimatedRuntimeMinutes = runtimeMinutes(zone.targetVolumeLiters, zone.nominalFlowM3h); }
}
function updateZoneRecommendations(state: SimulationState) {
  synchronizeZoneSummary(state);
  const local = state.soilModel!.zones.map(ledger => { const view = zoneProjectionState(state, ledger); if (state.status === 'running' && state.zones.find(zone => zone.id === ledger.zoneId)!.targetVolumeLiters === 0) view.status = 'idle'; updateRecommendation(view); return { zoneId: ledger.zoneId, recommendation: view.recommendation }; });
  const quality = assessDataQuality(state);
  const status: Recommendation['status'] = quality.status === 'Degraded' || state.control.pauseReason ? 'blocked' : state.status === 'running' ? 'irrigating' : local.some(item => item.recommendation.status === 'irrigate') ? 'irrigate' : local.some(item => item.recommendation.status === 'wait-for-rain') ? 'wait-for-rain' : state.status === 'completed' ? 'complete' : 'monitor';
  const selected = local.find(item => item.recommendation.status === status)?.recommendation ?? local[0].recommendation;
  const grossVolumeLiters = local.reduce((sum, item) => sum + item.recommendation.grossVolumeLiters, 0), netVolumeLiters = local.reduce((sum, item) => sum + item.recommendation.netVolumeLiters, 0);
  const runtime = local.reduce((sum, item) => { const zone = state.zones.find(zone => zone.id === item.zoneId)!; return sum + runtimeMinutes(item.recommendation.grossVolumeLiters, zone.flowM3h > 0 ? zone.flowM3h : zone.nominalFlowM3h); }, 0);
  state.recommendation = { ...selected, status, grossVolumeLiters, netVolumeLiters, grossDepthMm: grossVolumeLiters / state.field.areaM2, netDepthMm: netVolumeLiters / state.field.areaM2, estimatedRuntimeMinutes: runtime, perZoneRuntimeMinutes: runtime / state.zones.length, targetDepletionMm: weightedZoneValue(state, zone => zone.calculation.targetDepletionMm), projectedNoRainDepletionMm: weightedZoneValue(state, zone => local.find(item => item.zoneId === zone.zoneId)!.recommendation.projectedNoRainDepletionMm), parameterVersion: state.soilModel!.version, zoneRecommendations: local, reason: `Explicit zone soil accounting: ${selected.reason}` };
  if (state.status === 'idle' || state.status === 'stopped') for (const zone of state.zones) { zone.targetVolumeLiters = local.find(item => item.zoneId === zone.id)!.recommendation.grossVolumeLiters; zone.estimatedRuntimeMinutes = runtimeMinutes(zone.targetVolumeLiters, zone.nominalFlowM3h); }
}
/** Recompute management outputs without reapplying ET, observed rain or delivery. */
export function recalculateRecommendation(state: SimulationState): SimulationState { const next = structuredClone(state); updateRecommendation(next); return next; }
/** Opt-in only: all four explicit, versioned local states are required. */
export function configureZoneSoil(state: SimulationState, configuration: ZoneSoilConfiguration): SimulationState { const next = configureZoneSoilState(state, configuration); event(next, 'soil-configuration', `Explicit zone soil accounting configured: ${configuration.version}.`); updateRecommendation(next); return next; }

function readings(state: SimulationState) {
  const old = new Map(state.devices.map(device => [device.id, device]));
  const result = simulatedDeviceReadings(state);
  if (state.elapsedSeconds >= 60 && state.scenarioId === 'sensor-offline') {
    const sensor = result.find(item => item.id === 'soil-40')!; const previous = old.get(sensor.id);
    sensor.status = 'offline'; if (previous) { sensor.lastSeen = previous.lastSeen; sensor.datum = { ...previous.datum, quality: 'stale' }; }
  }
  if (state.elapsedSeconds >= 60 && state.scenarioId === 'sensor-outlier') { const sensor = result.find(item => item.id === 'soil-20')!; sensor.status = 'warning'; sensor.datum.value = 97.8; sensor.datum.quality = 'outlier'; }
  if (state.elapsedSeconds >= 60 && state.scenarioId === 'telemetry-conflict') { const sensor = result.find(item => item.id === 'flow-main')!; sensor.status = 'warning'; sensor.datum.value = 12; sensor.datum.quality = 'conflict'; }
  state.devices = result;
}
function historyPoint(state: SimulationState): HistoryPoint { return { at: state.clock, depletionMm: state.soil.rootZoneDepletionMm, rawMm: state.soil.rawMm, etoMm: state.calculation.etoMm, etcMm: state.calculation.etcMm, rainfallMm: state.rain.observedMm, deliveredVolumeLiters: state.control.deliveredVolumeLiters, soilMoisture20Pct: state.soil.moisture20Pct, soilMoisture40Pct: state.soil.moisture40Pct, soilMoisture60Pct: state.soil.moisture60Pct, flowM3h: state.zones.reduce((sum, zone) => sum + zone.flowM3h, 0), pressureBar: Math.max(...state.zones.map(zone => zone.pressureBar)) }; }

export function createSimulation(scenarioId: ScenarioId = 'rain-underperforms'): SimulationState {
  if (!SCENARIOS.some(scenario => scenario.id === scenarioId)) throw new Error('Unknown simulation scenario');
  const golden = calculateGolden(), rainPlanning = scenarioId === 'rain-succeeds' || scenarioId === 'rain-fails';
  const calculation = scenarioId === 'unexpected-storm' ? calculateAgronomy({ ...golden.input, observedRainMm: 0 }) : golden;
  const initialRain = rainPlanning || scenarioId === 'unexpected-storm' ? 0 : 2;
  const depletion = rainPlanning ? 23 : calculation.rootZoneDepletionMm;
  const moisture = 100 * (.3 - depletion / 500);
  const state: SimulationState = {
    schemaVersion: 1, id: `demo-${scenarioId}`, scenarioId, clock: DEMO_CLOCK, version: 0, elapsedSeconds: 0, status: 'idle', field: { ...DEMO_FIELD }, weather: { ...GOLDEN_WEATHER }, parameters: { ...DEFAULT_PARAMETERS }, calculation, surfaceWetting: 'drip', eventSequence: 0, rainWindowObservedMm: initialRain,
    simulationConfiguration: { version: SIMULATION_CONFIGURATION_VERSION, policy: structuredClone(SIMULATION_POLICY), deviceQualityPolicy: structuredClone(DEVICE_QUALITY_POLICY), dripProfile: structuredClone(DEMO_DRIP_PROFILE), cropStageDays: [...POTATO_PARAMETERS.demoStageDays] },
    rain: { forecastMm: scenarioId === 'unexpected-storm' ? .5 : scenarioId === 'rain-fails' ? 8 : rainPlanning || scenarioId === 'rain-underperforms' ? 7 : 2, observedMm: initialRain, scenarioReceivedMm: 0, windowStart: iso(Date.parse(DEMO_CLOCK) - 3600000), windowEnd: iso(Date.parse(DEMO_CLOCK) + (rainPlanning ? 1800000 : -60000)), probabilityPct: rainPlanning ? 80 : 70, reconciled: !rainPlanning, eventOpen: false, lastRainAt: null, eventQuietMinutes: SIMULATION_POLICY.rainQuietMinutes },
    soil: { rootZoneDepletionMm: depletion, surfaceDepletionMm: calculation.surfaceDepletionMm, fieldCapacity: .3, wiltingPoint: .14, tawMm: calculation.tawMm, rawMm: calculation.rawMm, moisture20Pct: moisture - .4, moisture40Pct: moisture + .4, moisture60Pct: moisture + 1.4, deepPercolationMm: 0 },
    zones: (['A', 'B', 'C', 'D'] as const).map((id, index) => ({ id, name: `Zone ${id}`, areaM2: 2500, nominalFlowM3h: DEMO_DRIP_PROFILE.calibratedZoneFlowsM3h[index], flowM3h: 0, pressureBar: 0, targetVolumeLiters: calculation.grossVolumeLiters / 4, deliveredVolumeLiters: 0, estimatedRuntimeMinutes: runtimeMinutes(calculation.grossVolumeLiters / 4, DEMO_DRIP_PROFILE.calibratedZoneFlowsM3h[index]), state: 'idle', valveState: 'CLOSED' })),
    devices: [], alerts: [], recommendation: {} as Recommendation, history: [], events: [],
    control: { activeZoneIndex: 0, activeZoneSeconds: 0, pumpState: 'OFF', pauseReason: null, runStartedAt: null, runTargetLiters: calculation.grossVolumeLiters, deliveredVolumeLiters: 0, rainPaused: false },
    accounting: { day: '2026-04-25', appliedEtMm: calculation.etcMm, observedRainMm: initialRain, netDeliveryMm: 0, historyAt: DEMO_CLOCK },
  };
  if (scenarioId === 'rain-underperforms') alert(state, 'RAIN_UNDER_FORECAST', 'warning', 'Rain was lower than expected', 'Only observed rainfall enters the field balance. Today’s irrigation plan covers the remaining need.', 'Forecast 7.0 mm; received 2.0 mm; difference −5.0 mm.');
  readings(state); updateRecommendation(state);
  // Historical fixtures are generated through the same daily engine, labelled simulated by the product.
  let pastDepletion = 17, pastSurface = 15;
  for (let day = 7; day >= 1; day--) {
    const at = iso(Date.parse(DEMO_CLOCK) - day * 86400000), date = localDate(at);
    const rain = day === 4 ? 4 : day === 2 ? 1 : 0;
    const result = calculateAgronomy({ weather: { ...GOLDEN_WEATHER, date, solarRadiationMjM2Day: 19 + (7 - day) * .2 }, parameters: { ...DEFAULT_PARAMETERS }, rootZoneDepletionMm: pastDepletion, surfaceDepletionMm: pastSurface, observedRainMm: rain });
    pastDepletion = result.irrigationRequired ? result.targetDepletionMm : result.rootZoneDepletionMm;
    pastSurface = Math.max(0, result.surfaceDepletionMm - result.netDepthMm / DEFAULT_PARAMETERS.wettedFraction);
    state.history.push({ at, depletionMm: pastDepletion, rawMm: result.rawMm, etoMm: result.etoMm, etcMm: result.etcMm, rainfallMm: rain, deliveredVolumeLiters: result.grossVolumeLiters, soilMoisture20Pct: 30 - pastDepletion / 5 - .4, soilMoisture40Pct: 30 - pastDepletion / 5 + .4, soilMoisture60Pct: 30 - pastDepletion / 5 + 1.4, flowM3h: 0, pressureBar: 0 });
  }
  state.history.push(historyPoint(state)); event(state, 'scenario', `${SCENARIOS.find(item => item.id === scenarioId)!.name} initialized. All device data is simulated.`);
  return state;
}

function stopHydraulics(state: SimulationState, zoneState: 'paused' | 'stopped' | 'completed') { for (const zone of state.zones) { if (zone.state !== 'completed') zone.state = zoneState; zone.flowM3h = 0; zone.pressureBar = 0; if (zone.valveState !== 'FAILED') zone.valveState = 'CLOSED'; } state.control.pumpState = 'OFF'; }
function pauseForFault(state: SimulationState, reason: string) { state.status = 'paused'; state.control.pauseReason = reason; stopHydraulics(state, 'paused'); event(state, 'control', reason); }
export function applySimulationCommand(state: SimulationState, command: 'start' | 'pause' | 'resume' | 'stop'): SimulationState {
  const next = structuredClone(state); next.version++;
  if (!['start', 'pause', 'resume', 'stop'].includes(command)) throw new Error('Unsupported irrigation command');
  if (command === 'stop') { next.status = 'stopped'; stopHydraulics(next, 'stopped'); next.control.pauseReason = null; event(next, 'control', 'Irrigation stopped. Delivered volume remains in the field balance.'); }
  if (command === 'pause' && next.status === 'running') { next.status = 'paused'; stopHydraulics(next, 'paused'); event(next, 'control', 'Irrigation paused by the operator.'); }
  if (command === 'start' || command === 'resume') {
    updateRecommendation(next);
    if (next.recommendation.confidence === 'Degraded' || next.control.pauseReason) { event(next, 'control-blocked', next.control.pauseReason ?? 'Critical device data prevents control.'); return next; }
    if (command === 'start') {
      if (next.status === 'running' || next.status === 'paused') return next;
      if (next.recommendation.status !== 'irrigate') { event(next, 'control-blocked', 'No irrigation is currently required.'); return next; }
      next.control.activeZoneIndex = 0; next.control.deliveredVolumeLiters = 0; next.control.runTargetLiters = next.recommendation.grossVolumeLiters; next.control.runStartedAt = next.clock;
      for (const zone of next.zones) { zone.deliveredVolumeLiters = 0; zone.targetVolumeLiters = next.soilModel ? next.recommendation.zoneRecommendations!.find(item => item.zoneId === zone.id)!.recommendation.grossVolumeLiters : next.control.runTargetLiters / 4; zone.estimatedRuntimeMinutes = runtimeMinutes(zone.targetVolumeLiters, zone.nominalFlowM3h); zone.state = zone.targetVolumeLiters > 0 ? 'idle' : 'completed'; }
      next.control.activeZoneIndex = next.zones.findIndex(zone => zone.targetVolumeLiters > 0);
    } else if (next.status !== 'paused') return next;
    next.status = 'running'; next.control.activeZoneSeconds = 0; next.control.pumpState = 'STARTING'; next.control.rainPaused = false;
    next.zones[next.control.activeZoneIndex].state = 'opening'; next.zones[next.control.activeZoneIndex].valveState = 'OPENING';
    event(next, 'control', command === 'start' ? 'Sequential irrigation started: A → B → C → D.' : 'Irrigation resumed.');
  }
  readings(next); updateRecommendation(next); return next;
}

function applyRain(state: SimulationState, amountMm: number, observedAt = state.clock) {
  if (amountMm <= 0) return;
  if (state.soilModel) addZoneRain(state, amountMm);
  else {
    const balance = rootWaterBalance(state.soil.rootZoneDepletionMm, amountMm, 0, 0, 0, state.soil.tawMm);
    state.soil.rootZoneDepletionMm = balance.depletionMm; state.soil.deepPercolationMm += balance.deepPercolationMm;
    state.soil.surfaceDepletionMm = Math.max(0, state.soil.surfaceDepletionMm - amountMm); state.accounting.observedRainMm += amountMm;
  }
  if (Date.parse(observedAt) >= Date.parse(state.rain.windowStart) && Date.parse(observedAt) <= Date.parse(state.rain.windowEnd)) state.rainWindowObservedMm = (state.rainWindowObservedMm ?? state.rain.observedMm) + amountMm;
  state.rain.observedMm += amountMm; state.rain.eventOpen = true; state.rain.lastRainAt = observedAt;
  // FAO chapter 7 simplified wetting rule: meaningful rain wets the exposed surface; later drip restores its local pattern.
  if (state.rain.observedMm >= SIMULATION_POLICY.surfaceWettingRainMm) { state.surfaceWetting = 'rain'; if (state.soilModel) for (const zone of state.soilModel.zones) zone.surfaceWetting = 'rain'; }
  if (state.status === 'running') { state.status = 'paused'; state.control.rainPaused = true; stopHydraulics(state, 'paused'); event(state, 'rain', 'Observed rain paused irrigation; the remaining plan will be reassessed.'); }
}
/** Shared observed-rain transition; callers authenticate/deduplicate observations before invoking it. */
export function applyObservedRainfall(state: SimulationState, amountMm: number, observedAt = state.clock): SimulationState {
  if (!Number.isFinite(amountMm) || amountMm < 0 || !Number.isFinite(Date.parse(observedAt)) || localDate(observedAt) !== localDate(state.clock)) throw new Error('Observed rainfall must be nonnegative and belong to the current model day');
  const next = structuredClone(state); applyRain(next, amountMm, observedAt); reviseRainPausedPlan(next); updateRecommendation(next); return next;
}
function scenarioRain(state: SimulationState) {
  const total = state.scenarioId === 'rain-succeeds' ? 7 : state.scenarioId === 'unexpected-storm' ? 12 : 0;
  const target = total * clamp((state.elapsedSeconds - 300) / 900, 0, 1);
  const increment = Math.max(0, target - state.rain.scenarioReceivedMm);
  if (increment > 0) { applyRain(state, increment); state.rain.scenarioReceivedMm = target; }
  if (state.rain.eventOpen && state.rain.lastRainAt && Date.parse(state.clock) - Date.parse(state.rain.lastRainAt) >= state.rain.eventQuietMinutes * 60000) { state.rain.eventOpen = false; event(state, 'rain', 'Rain event closed after the configured dry interval.'); }
  if (!state.rain.reconciled && Date.parse(state.clock) >= Date.parse(state.rain.windowEnd)) {
    state.rain.reconciled = true;
    if (state.rain.observedMm < state.rain.forecastMm - .5) alert(state, 'RAIN_UNDER_FORECAST', 'warning', 'Rain forecast window ended', 'Received rainfall was lower than forecast. The recommendation has been recalculated using observed water only.', `Expected ${state.rain.forecastMm.toFixed(1)} mm; observed ${state.rain.observedMm.toFixed(1)} mm.`);
    event(state, 'forecast-reconciled', 'Forecast and observation reconciled without changing observed rainfall.');
  }
  if (state.scenarioId === 'unexpected-storm' && state.rain.scenarioReceivedMm > 1) alert(state, 'UNEXPECTED_RAIN', 'warning', 'Unexpected rainfall', 'Observed rain is reducing the irrigation requirement.', `Forecast ${state.rain.forecastMm} mm; additional observed rain ${state.rain.scenarioReceivedMm.toFixed(1)} mm.`);
  reviseRainPausedPlan(state);
}
function reviseRainPausedPlan(state: SimulationState) {
  if (state.control.rainPaused) {
    const remainingNet = Math.max(0, state.soil.rootZoneDepletionMm - state.parameters.targetDepletionFraction * state.soil.rawMm);
    let remainingLiters = remainingNet * state.field.areaM2 / state.parameters.applicationEfficiency;
    const unfinished = state.zones.filter(zone => zone.state !== 'completed');
    if (state.soilModel) {
      remainingLiters = 0;
      for (const zone of unfinished) {
        const ledger = state.soilModel.zones.find(item => item.zoneId === zone.id)!;
        const remaining = Math.max(0, ledger.rootZoneDepletionMm - ledger.calculation.targetDepletionMm) * ledger.parameters.fieldAreaM2 / ledger.parameters.applicationEfficiency;
        zone.targetVolumeLiters = zone.deliveredVolumeLiters + remaining; remainingLiters += remaining;
        if (remaining <= 1e-8) zone.state = 'completed';
      }
      const nextZone = state.zones.findIndex(zone => zone.state !== 'completed');
      if (nextZone >= 0) state.control.activeZoneIndex = nextZone;
    } else for (const zone of unfinished) zone.targetVolumeLiters = zone.deliveredVolumeLiters + remainingLiters / unfinished.length;
    state.control.runTargetLiters = sumDelivery(state) + remainingLiters;
    if (remainingLiters <= 1e-8) { state.status = 'completed'; stopHydraulics(state, 'completed'); state.control.rainPaused = false; event(state, 'control', 'Rain supplied the remaining need; the irrigation plan was cancelled.'); }
  }
}

function dailyEt(state: SimulationState) {
  const date = localDate(state.clock);
  if (date !== state.accounting.day) {
    const daysAfterPlanting = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${state.field.plantingDate}T00:00:00Z`)) / 86400000);
    const crop = cropStage(daysAfterPlanting); state.field.daysAfterPlanting = daysAfterPlanting; state.field.growthStage = crop.stage;
    state.parameters.kcb = crop.kcb; state.weather.date = date;
    if (state.soilModel) {
      for (const zone of state.soilModel.zones) {
        zone.parameters.kcb = crop.kcb;
        zone.calculation = calculateAgronomy({ weather: state.weather, parameters: zone.parameters, rootZoneDepletionMm: zone.rootZoneDepletionMm, surfaceDepletionMm: zone.surfaceDepletionMm, observedRainMm: 0, surfaceWetting: zone.surfaceWetting });
        zone.accounting = { day: date, appliedEtMm: 0, observedRainMm: 0, netDeliveryMm: 0, deepPercolationMm: 0 };
      }
      synchronizeZoneSummary(state);
    } else {
      state.calculation = calculateAgronomy({ weather: state.weather, parameters: state.parameters, rootZoneDepletionMm: state.soil.rootZoneDepletionMm, surfaceDepletionMm: state.soil.surfaceDepletionMm, observedRainMm: 0, surfaceWetting: state.surfaceWetting });
      state.soil.rawMm = state.calculation.rawMm;
    }
    state.accounting.day = date; state.accounting.appliedEtMm = 0;
    state.rain.observedMm = 0;
    const forecastDay = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse('2026-04-25T00:00:00Z')) / 86400000);
    state.rain.forecastMm = FORECAST_RAIN_MM[clamp(forecastDay, 0, 6)];
    state.rain.probabilityPct = state.rain.forecastMm > 0 ? 75 : 10;
    state.rain.windowStart = iso(Date.parse(`${date}T00:00:00+05:00`));
    state.rain.windowEnd = iso(Date.parse(state.rain.windowStart) + 86399000);
    state.rain.reconciled = false;
    state.rainWindowObservedMm = 0;
    event(state, 'daily-balance', 'A new daily ET budget was computed from the versioned scientific engine.');
  }
  if (state.soilModel) { addZoneDailyEt(state); return; }
  // Demo allocation: daily ET is uniformly distributed from 06:00 to 18:00 local. This is not an hourly FAO model.
  const local = new Date(Date.parse(state.clock) + 5 * 3600000), seconds = local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds();
  const fraction = clamp((seconds - 6 * 3600) / (12 * 3600), 0, 1);
  const shouldBeApplied = state.calculation.etcMm * fraction;
  const increment = Math.max(0, shouldBeApplied - state.accounting.appliedEtMm);
  if (increment > 0) {
    const balance = rootWaterBalance(state.soil.rootZoneDepletionMm, 0, 0, 0, increment, state.soil.tawMm);
    state.soil.rootZoneDepletionMm = balance.depletionMm;
    const evaporationIncrement = state.calculation.etcMm > 0 ? increment * state.calculation.evaporationMm / state.calculation.etcMm : 0;
    const surface = surfaceWaterBalance(state.soil.surfaceDepletionMm, 0, 0, 0, evaporationIncrement, state.parameters.wettedFraction, state.calculation.exposedWettedFraction, state.calculation.tewMm);
    state.soil.surfaceDepletionMm = surface.depletionMm;
    state.accounting.appliedEtMm += increment;
  }
}
function hydraulicTick(state: SimulationState) {
  if (state.status !== 'running') return;
  const quality = assessDataQuality(state);
  if (quality.status === 'Degraded') { pauseForFault(state, `${quality.reasons[0]}. Automatic delivery paused until the critical channel is restored.`); return; }
  const zone = state.zones[state.control.activeZoneIndex]; state.control.activeZoneSeconds++;
  const seconds = state.control.activeZoneSeconds;
  if (state.scenarioId === 'valve-failure') {
    zone.flowM3h = 0; zone.pressureBar = SIMULATION_POLICY.pressureNominalBar * clamp(seconds / 20, 0, 1);
    if (seconds >= SIMULATION_POLICY.anomalyGraceSeconds) { zone.valveState = 'FAILED'; alert(state, 'VALVE_FAILURE', 'critical', 'Valve did not open', 'The open command was not acknowledged. Automatic delivery is paused.', `Valve ${zone.id}; no acknowledgement after 45 seconds.`, ['Controller fault', 'Valve actuator fault', 'Connection failure']); pauseForFault(state, 'Valve acknowledgement is missing. Inspect the valve before resuming.'); }
    return;
  }
  const previousRamp = clamp((seconds - 1 - SIMULATION_POLICY.pumpRampSeconds) / SIMULATION_POLICY.valveRampSeconds, 0, 1);
  const ramp = clamp((seconds - SIMULATION_POLICY.pumpRampSeconds) / SIMULATION_POLICY.valveRampSeconds, 0, 1);
  const failureFlow = state.scenarioId === 'high-flow' ? 14.1 : state.scenarioId === 'low-flow' ? 7.6 : zone.nominalFlowM3h;
  zone.flowM3h = failureFlow * ramp; zone.pressureBar = (state.scenarioId === 'low-pressure' ? .45 : SIMULATION_POLICY.pressureNominalBar) * clamp(seconds / SIMULATION_POLICY.pumpRampSeconds, 0, 1);
  state.control.pumpState = seconds < SIMULATION_POLICY.pumpRampSeconds ? 'STARTING' : 'ON'; zone.valveState = ramp >= 1 ? 'OPEN' : 'OPENING'; zone.state = ramp >= 1 ? 'running' : 'opening';
  const remaining = Math.max(0, zone.targetVolumeLiters - zone.deliveredVolumeLiters);
  // Integrate the linear ramp exactly; shorten the final timestep at the volume target.
  const delivered = Math.min(remaining, failureFlow * (previousRamp + ramp) / 2 * 1000 / 3600);
  zone.deliveredVolumeLiters += delivered; state.control.deliveredVolumeLiters += delivered;
  if (delivered > 0) state.surfaceWetting = 'drip';
  if (state.soilModel) { if (delivered > 0) addZoneDelivery(state, zone.id, delivered); }
  else {
    const netDepth = delivered * state.parameters.applicationEfficiency / state.field.areaM2;
    const balance = rootWaterBalance(state.soil.rootZoneDepletionMm, 0, 0, netDepth, 0, state.soil.tawMm);
    state.soil.rootZoneDepletionMm = balance.depletionMm; state.soil.deepPercolationMm += balance.deepPercolationMm; state.accounting.netDeliveryMm += netDepth;
    state.soil.surfaceDepletionMm = Math.max(0, state.soil.surfaceDepletionMm - netDepth / state.parameters.wettedFraction);
  }
  if (seconds >= SIMULATION_POLICY.pumpRampSeconds + SIMULATION_POLICY.valveRampSeconds + SIMULATION_POLICY.anomalyGraceSeconds) {
    let type: FieldAlert['type'] | null = null, title = '', reason = '';
    if (zone.flowM3h > zone.nominalFlowM3h * SIMULATION_POLICY.highFlowRatio) { type = 'HIGH_FLOW'; title = 'Abnormally high flow'; reason = 'Possible leak, line failure, or flow-sensor/configuration issue.'; }
    if (zone.flowM3h < zone.nominalFlowM3h * SIMULATION_POLICY.lowFlowRatio) { type = 'LOW_FLOW'; title = 'Lower than expected flow'; reason = 'Possible filter restriction, emitter clogging, incomplete valve opening, or supply issue.'; }
    if (zone.pressureBar < SIMULATION_POLICY.lowPressureBar) { type = 'LOW_PRESSURE'; title = 'Operating pressure is low'; reason = 'Possible pump, supply, valve, or pressure-sensor issue.'; }
    if (type) { alert(state, type, 'critical', title, reason, `Zone ${zone.id}: ${zone.flowM3h.toFixed(1)} m³/h, ${zone.pressureBar.toFixed(2)} bar.`, [reason]); pauseForFault(state, `${title}. Automatic delivery paused for inspection.`); return; }
  }
  if (zone.deliveredVolumeLiters >= zone.targetVolumeLiters - 1e-8) {
    zone.deliveredVolumeLiters = zone.targetVolumeLiters; zone.state = 'completed'; zone.flowM3h = 0; zone.pressureBar = 0; zone.valveState = 'CLOSED';
    event(state, 'zone-completed', `${zone.name} delivered its target volume.`);
    state.control.activeZoneIndex++;
    while (state.control.activeZoneIndex < state.zones.length && state.zones[state.control.activeZoneIndex].state === 'completed') state.control.activeZoneIndex++;
    if (state.control.activeZoneIndex >= state.zones.length) { state.control.activeZoneIndex = state.zones.length - 1; state.status = 'completed'; state.control.pumpState = 'OFF'; event(state, 'run-completed', 'All four zones completed their target volume.'); }
    else { state.control.activeZoneSeconds = 0; state.control.pumpState = 'STARTING'; }
  }
}
function sensorTick(state: SimulationState) {
  const target = meanMoisture(state);
  state.soil.moisture20Pct += (target - .4 - state.soil.moisture20Pct) * (1 - Math.exp(-1 / SIMULATION_POLICY.sensorLagSeconds.shallow));
  state.soil.moisture40Pct += (target + .4 - state.soil.moisture40Pct) * (1 - Math.exp(-1 / SIMULATION_POLICY.sensorLagSeconds.middle));
  state.soil.moisture60Pct += (target + 1.4 - state.soil.moisture60Pct) * (1 - Math.exp(-1 / SIMULATION_POLICY.sensorLagSeconds.deep));
  if (state.elapsedSeconds >= 60 && state.scenarioId === 'sensor-offline') alert(state, 'SENSOR_OFFLINE', 'warning', '40 cm soil sensor offline', 'The water-balance model remains available. Data completeness is reduced.', 'No new valid update from soil-40.', ['Device power', 'Connection loss']);
  if (state.elapsedSeconds >= 60 && state.scenarioId === 'sensor-outlier') alert(state, 'SENSOR_OUTLIER', 'warning', 'Implausible soil reading excluded', 'The 97.8% reading is retained for inspection and excluded from control.', 'soil-20: 97.8% is implausible for the configured loam profile.', ['Sensor fault', 'Calibration issue']);
  if (state.elapsedSeconds >= 60 && state.scenarioId === 'telemetry-conflict') {
    alert(state, 'TELEMETRY_CONFLICT', 'critical', 'Flow conflicts with controller state', 'A reported flow of 12 m³/h conflicts with closed valves and an idle pump.', 'Pump OFF; valve CLOSED; flow 12 m³/h.', ['Flow meter fault', 'Valve feedback fault', 'Incorrect binding']);
    if (!state.control.pauseReason) pauseForFault(state, 'Conflicting flow and valve data blocks automatic control.');
  }
  const stressed = state.soilModel ? state.soilModel.zones.filter(zone => zone.rootZoneDepletionMm >= zone.calculation.rawMm * zone.parameters.actionDepletionFraction) : [];
  const atAction = state.soilModel ? stressed.length > 0 : state.soil.rootZoneDepletionMm >= state.soil.rawMm * state.parameters.actionDepletionFraction;
  const nearAction = state.soilModel ? state.soilModel.zones.some(zone => zone.rootZoneDepletionMm >= zone.calculation.rawMm * zone.parameters.earlyWarningFraction) : state.soil.rootZoneDepletionMm >= state.soil.rawMm * state.parameters.earlyWarningFraction;
  if (atAction) alert(state, 'ROOT_ZONE_STRESS', 'warning', 'Root zone reached the action threshold', 'Use the current recommendation to restore the configured soil-water target.', state.soilModel ? `Zones at their local threshold: ${stressed.map(zone => zone.zoneId).join(', ')}.` : `Depletion ${state.soil.rootZoneDepletionMm.toFixed(2)} mm; RAW ${state.soil.rawMm.toFixed(2)} mm.`);
  else { resolveAlert(state, 'ROOT_ZONE_STRESS', 'Observed water delivery/rain reduced depletion below RAW.'); if (nearAction) alert(state, 'ROOT_ZONE_NEAR_STRESS', 'info', 'Root zone is approaching its threshold', 'Watch the forecast and the next irrigation recommendation.', `Depletion ${state.soil.rootZoneDepletionMm.toFixed(2)} mm.`); else resolveAlert(state, 'ROOT_ZONE_NEAR_STRESS', 'Depletion fell below the warning threshold.'); }
}

/** One-second deterministic integration makes a long step identical to partitioned steps. */
export function advanceSimulation(state: SimulationState, seconds: number): SimulationState {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > SIMULATION_POLICY.maximumStepSeconds) throw new Error('Step must be an integer from 0 to 86400 seconds');
  if (state.schemaVersion !== 1 || !Number.isFinite(Date.parse(state.clock))) throw new Error('Unsupported simulation state');
  const next = structuredClone(state); if (seconds === 0) return next;
  const startTime = Date.parse(next.clock);
  for (let i = 1; i <= seconds; i++) {
    next.clock = iso(startTime + i * 1000); next.elapsedSeconds++;
    dailyEt(next); scenarioRain(next); hydraulicTick(next); sensorTick(next);
    // Keep external observations stable across caller step boundaries; generate on the internal clock.
    if (next.elapsedSeconds % 10 === 0) readings(next);
    if (next.elapsedSeconds % SIMULATION_POLICY.historyIntervalSeconds === 0) { next.history.push(historyPoint(next)); next.accounting.historyAt = next.clock; if (next.history.length > SIMULATION_POLICY.historyLimit) next.history.shift(); }
  }
  next.version += seconds; updateRecommendation(next); return next;
}

export interface ForecastDay { date: string; temperatureMinC: number; temperatureMaxC: number; condition: 'sunny' | 'partly-cloudy' | 'rain'; rainProbabilityPct: number; rainfallMm: number; remainingRainfallMm: number; observedRainMm: number | null; etoMm: number; etcMm: number; projectedDepletionMm: number; projectedSurfaceDepletionMm: number; rawMm: number; grossVolumeLiters: number; status: 'irrigate' | 'wait-for-rain' | 'monitor'; provenance: 'FORECAST'; zones?: Array<{ zoneId: string; forecast: ForecastDay }>; }
/** Seven-day planning copy; forecast precipitation never enters persisted observed balance. */
export function buildForecast(state: SimulationState): ForecastDay[] {
  if (state.soilModel) {
    const zones = state.soilModel.zones.map(zone => ({ zoneId: zone.zoneId, days: buildForecast(zoneProjectionState(state, zone)) }));
    return zones[0].days.map((day, index) => {
      const local = zones.map(zone => ({ zoneId: zone.zoneId, forecast: zone.days[index] }));
      const average = (key: 'etcMm' | 'projectedDepletionMm' | 'projectedSurfaceDepletionMm' | 'rawMm') => weightedZoneValue(state, zone => local.find(item => item.zoneId === zone.zoneId)!.forecast[key]);
      return { ...day, etcMm: average('etcMm'), projectedDepletionMm: average('projectedDepletionMm'), projectedSurfaceDepletionMm: average('projectedSurfaceDepletionMm'), rawMm: average('rawMm'), grossVolumeLiters: local.reduce((sum, item) => sum + item.forecast.grossVolumeLiters, 0), status: local.some(item => item.forecast.status === 'irrigate') ? 'irrigate' : local.some(item => item.forecast.status === 'wait-for-rain') ? 'wait-for-rain' : 'monitor', zones: local };
    });
  }
  const result: ForecastDay[] = []; let depletion = state.soil.rootZoneDepletionMm, surface = state.soil.surfaceDepletionMm, wetting = state.surfaceWetting ?? 'drip';
  for (let index = 0; index < 7; index++) {
    const date = localDate(iso(Date.parse(state.clock) + index * 86400000));
    const forecastRain = index === 0 ? state.rain.forecastMm : FORECAST_RAIN_MM[index];
    const rain = index === 0 ? state.rain.reconciled ? 0 : Math.max(0, forecastRain - (state.rainWindowObservedMm ?? state.rain.observedMm)) : forecastRain;
    const weather = forecastWeather(state, index, date);
    const crop = cropStage(state.field.daysAfterPlanting + index);
    const calculation = calculateAgronomy({ weather, parameters: { ...state.parameters, kcb: crop.kcb }, rootZoneDepletionMm: depletion, surfaceDepletionMm: surface, observedRainMm: rain, surfaceWetting: wetting });
    // index 0 is a remainder-of-day projection; today's ET has already been accounted for at the demo checkpoint.
    if (index === 0) {
      const remainingEt = Math.max(0, state.calculation.etcMm - state.accounting.appliedEtMm);
      const balance = rootWaterBalance(depletion, rain, 0, 0, remainingEt, calculation.tawMm);
      const remainingEvaporation = state.calculation.etcMm > 0 ? remainingEt * state.calculation.evaporationMm / state.calculation.etcMm : 0;
      const surfaceBalance = surfaceWaterBalance(surface, rain, 0, 0, remainingEvaporation, state.parameters.wettedFraction, state.calculation.exposedWettedFraction, state.calculation.tewMm);
      calculation.rootZoneDepletionMm = balance.depletionMm;
      calculation.surfaceDepletionMm = surfaceBalance.depletionMm;
      calculation.netDepthMm = balance.depletionMm >= calculation.rawMm * state.parameters.actionDepletionFraction ? Math.max(0, balance.depletionMm - calculation.targetDepletionMm) : 0;
      calculation.grossVolumeLiters = calculation.netDepthMm / state.parameters.applicationEfficiency * state.field.areaM2;
    }
    const status = calculation.grossVolumeLiters > 0 ? 'irrigate' : rain > 0 ? 'wait-for-rain' : 'monitor';
    result.push({ date, temperatureMinC: weather.temperatureMinC, temperatureMaxC: weather.temperatureMaxC, condition: forecastRain > 0 ? 'rain' : index % 3 === 1 ? 'partly-cloudy' : 'sunny', rainProbabilityPct: forecastRain > 0 ? 75 : 10, rainfallMm: forecastRain, remainingRainfallMm: rain, observedRainMm: index === 0 ? state.rain.observedMm : null, etoMm: calculation.etoMm, etcMm: calculation.etcMm, projectedDepletionMm: calculation.rootZoneDepletionMm, projectedSurfaceDepletionMm: calculation.surfaceDepletionMm, rawMm: calculation.rawMm, grossVolumeLiters: calculation.grossVolumeLiters, status, provenance: 'FORECAST' });
    depletion = calculation.grossVolumeLiters > 0 ? calculation.targetDepletionMm : calculation.rootZoneDepletionMm;
    surface = calculation.surfaceDepletionMm;
    if (rain >= SIMULATION_POLICY.surfaceWettingRainMm) wetting = 'rain';
    if (calculation.grossVolumeLiters > 0) { surface = Math.max(0, surface - calculation.netDepthMm / state.parameters.wettedFraction); wetting = 'drip'; }
  }
  return result;
}
