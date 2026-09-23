import { describe, expect, it } from 'vitest';
import { advanceSimulation, applyObservedRainfall, applySimulationCommand, buildForecast, calculateGolden, configureZoneSoil, createSimulation, DEFAULT_PARAMETERS, projectNoRainWindow, recalculateRecommendation } from '../../src/domain';
import type { SimulationState, ZoneSoilConfiguration } from '../../src/domain';
import { applyMeasuredObservation } from '../../src/lib/server/telemetry-model';

function configuration(depletions = [30, 10, 10, 10]): ZoneSoilConfiguration {
  return { version: 'explicit-zone-test-1', source: 'Explicit test fixture; no inferred probe calibration', zones: (['A', 'B', 'C', 'D'] as const).map((zoneId, index) => ({ zoneId, parameters: { ...DEFAULT_PARAMETERS, version: `soil-${zoneId}-1`, fieldAreaM2: 2500 }, rootZoneDepletionMm: depletions[index], surfaceDepletionMm: 17 })) };
}
function configured(depletions?: number[]): SimulationState { return configureZoneSoil(createSimulation(), configuration(depletions)); }

describe('explicit opt-in zone soil accounting', () => {
  it('preserves the homogeneous golden result and does not infer zone states by default', () => {
    const state = createSimulation();
    expect(state.soilModel).toBeUndefined();
    expect(state.recommendation.grossVolumeLiters).toBeCloseTo(60086.09502236647, 7);
    expect(calculateGolden().grossVolumeLiters).toBeCloseTo(state.recommendation.grossVolumeLiters, 9);
  });
  it('requires four explicit, unique, valid local profiles covering the configured field', () => {
    const state = createSimulation();
    const missing = configuration(); missing.zones.pop();
    expect(() => configureZoneSoil(state, missing)).toThrow(/all four/);
    const duplicate = configuration(); duplicate.zones[3].zoneId = 'A';
    expect(() => configureZoneSoil(state, duplicate)).toThrow(/all four/);
    const area = configuration(); area.zones[0].parameters.fieldAreaM2 = 10000;
    expect(() => configureZoneSoil(state, area)).toThrow(/zone area/);
    const invalid = configuration(); invalid.zones[1].rootZoneDepletionMm = 100;
    expect(() => configureZoneSoil(state, invalid)).toThrow(/available water/);
    expect(() => configureZoneSoil(state, { ...configuration(), source: ' ' })).toThrow(/source/);
    const groundwater = configuration(); groundwater.zones[0].parameters.capillaryRiseMm = 1;
    expect(() => configureZoneSoil(state, groundwater)).toThrow(/capillary rise/);
    expect(() => configureZoneSoil(applySimulationCommand(state, 'start'), configuration())).toThrow(/Stop/);
  });
  it('captures an immutable current-soil baseline without replaying today’s prior ET or rain', () => {
    const state = createSimulation(), original = structuredClone(state), input = configuration(), saved = structuredClone(input);
    const next = configureZoneSoil(state, input);
    expect(state).toEqual(original); expect(input).toEqual(saved);
    expect(next.soilModel!.zones.map(zone => zone.rootZoneDepletionMm)).toEqual([30, 10, 10, 10]);
    expect(next.soilModel!.zones.every(zone => zone.surfaceDepletionMm === 17)).toBe(true);
    expect(next.soil.rootZoneDepletionMm).toBe(15);
    expect(next.calculation.aggregation).toBe('area-weighted-zone-summary');
    expect(Object.keys(next.calculation.zoneCalculations!)).toEqual(['A', 'B', 'C', 'D']);
    const after = advanceSimulation(next, 60);
    expect(after.soilModel!.zones.map(zone => zone.rootZoneDepletionMm)).toEqual([30, 10, 10, 10]);
    expect(after.soil.rootZoneDepletionMm).toBe(15);
  });
  it('uses local RAW and delivery efficiency even when the field mean is safely below its threshold', () => {
    const input = configuration(); input.zones[0].parameters.applicationEfficiency = .75;
    const state = configureZoneSoil(createSimulation(), input), local = state.soilModel!.zones[0];
    expect(state.soil.rootZoneDepletionMm).toBeLessThan(state.soil.rawMm);
    expect(state.recommendation.status).toBe('irrigate');
    const expected = (30 - local.calculation.targetDepletionMm) * 2500 / .75;
    expect(state.recommendation.grossVolumeLiters).toBeCloseTo(expected, 9);
    expect(state.zones[0].targetVolumeLiters).toBeCloseTo(expected, 9);
    expect(state.zones.slice(1).map(zone => zone.targetVolumeLiters)).toEqual([0, 0, 0]);
    const stepped = advanceSimulation(applySimulationCommand(state, 'start'), 120), delivered = stepped.control.deliveredVolumeLiters;
    expect(stepped.soilModel!.zones[0].rootZoneDepletionMm).toBeCloseTo(30 - delivered * .75 / 2500, 10);
    expect(stepped.soilModel!.zones.slice(1).map(zone => zone.rootZoneDepletionMm)).toEqual([10, 10, 10]);
    expect(stepped.soil.rootZoneDepletionMm).toBeCloseTo(15 - delivered * .75 / 10000, 10);
    expect(stepped.accounting.netDeliveryMm).toBeCloseTo(delivered * .75 / 10000, 10);
  });
  it('skips zones with no requirement and completes only the planned local delivery', () => {
    const state = configured([10, 10, 30, 10]), started = applySimulationCommand(state, 'start');
    expect(started.control.activeZoneIndex).toBe(2);
    const done = advanceSimulation(started, 12000);
    expect(done.status).toBe('completed');
    expect(done.control.deliveredVolumeLiters).toBeCloseTo(started.control.runTargetLiters, 6);
    expect(done.zones.filter(zone => zone.id !== 'C').every(zone => zone.deliveredVolumeLiters === 0 && zone.valveState === 'CLOSED')).toBe(true);
    expect(done.soilModel!.zones[2].rootZoneDepletionMm).toBeCloseTo(state.soilModel!.zones[2].calculation.targetDepletionMm, 7);
    expect(done.zones[2].targetVolumeLiters).toBeCloseTo(started.zones[2].targetVolumeLiters, 6);
    expect(done.zones.every(zone => zone.state === 'completed')).toBe(true);
  });
  it('applies field rainfall once to every local depth and conserves overflow as drainage', () => {
    const state = configured([1, 2, 20, 30]), after = applyObservedRainfall(state, 5);
    expect(after.soilModel!.zones.map(zone => zone.rootZoneDepletionMm)).toEqual([0, 0, 15, 25]);
    expect(after.soilModel!.zones.map(zone => zone.accounting.deepPercolationMm)).toEqual([4, 3, 0, 0]);
    expect(after.soilModel!.zones.every(zone => zone.surfaceDepletionMm === 12 && zone.surfaceWetting === 'rain')).toBe(true);
    expect(after.soil.deepPercolationMm).toBe(1.75);
    expect(after.soil.rootZoneDepletionMm).toBe(state.soil.rootZoneDepletionMm - 5 + 1.75);
    expect(after.accounting.observedRainMm).toBe(state.accounting.observedRainMm + 5);
    expect(after.rain.observedMm).toBe(state.rain.observedMm + 5);
    expect(after.accounting.appliedEtMm).toBe(state.accounting.appliedEtMm);
  });
  it('routes commissioned measured rain through the same local balance and preserves measured provenance', () => {
    const state = configured([1, 2, 20, 30]);
    const after = applyMeasuredObservation(state, { version: 1, deviceId: 'rain-01', eventId: 'fe5705cb-a8ed-4e2a-8ab5-7be494a78e91', observedAt: state.clock, measurements: [{ metric: 'rainfallIncrementMm', value: 5, unit: 'mm' }] }, { id: 'rain-01', name: 'Measured rain', kind: 'rain' }, null)!;
    expect(after.soilModel!.zones.map(zone => zone.rootZoneDepletionMm)).toEqual([0, 0, 15, 25]);
    expect(after.devices.find(device => device.id === 'rain-01')!.datum.provenance).toBe('MEASURED');
    expect(after.accounting.appliedEtMm).toBe(state.accounting.appliedEtMm);
    expect(after.control.deliveredVolumeLiters).toBe(0);
  });
  it('pauses and revises each unfinished local target when observed rain supplies the remaining need', () => {
    const started = advanceSimulation(applySimulationCommand(configured([30, 32, 10, 10]), 'start'), 120);
    const after = applyObservedRainfall(started, 15);
    expect(after.status).toBe('completed');
    expect(after.zones.every(zone => zone.valveState === 'CLOSED')).toBe(true);
    expect(after.control.deliveredVolumeLiters).toBe(started.control.deliveredVolumeLiters);
    expect(after.control.runTargetLiters).toBeCloseTo(after.control.deliveredVolumeLiters, 8);
    expect(after.soilModel!.zones.every(zone => zone.rootZoneDepletionMm < zone.calculation.targetDepletionMm)).toBe(true);
  });
  it('checks every local no-rain trajectory instead of letting a wet field average hide a dry zone', () => {
    const state = configured([25, 5, 5, 5]);
    state.rain.windowEnd = new Date(Date.parse(state.clock) + 6 * 3600000).toISOString(); state.rain.forecastMm = 8; state.rain.probabilityPct = 80;
    const trajectory = projectNoRainWindow(state, state.rain.windowEnd);
    expect(trajectory.points.every(point => point.depletionMm < point.actionThresholdMm)).toBe(true);
    expect(trajectory.safe).toBe(false);
    expect(recalculateRecommendation(state).recommendation.status).toBe('irrigate');
  });
  it('projects zone forecasts without charging observations or repeating the current daily budget', () => {
    const state = configured(), before = structuredClone(state), days = buildForecast(state);
    expect(days).toHaveLength(7); expect(days[0].zones).toHaveLength(4);
    expect(days[0].projectedDepletionMm).toBeCloseTo(state.soil.rootZoneDepletionMm, 10);
    expect(days[0].grossVolumeLiters).toBeCloseTo(days[0].zones!.reduce((sum, item) => sum + item.forecast.grossVolumeLiters, 0), 9);
    expect(days[0].zones!.filter(item => item.forecast.grossVolumeLiters > 0).map(item => item.zoneId)).toEqual(['A']);
    expect(state).toEqual(before);
  });
  it('posts each new daily ET budget once and resets local day counters at midnight', () => {
    const state = applyObservedRainfall(configured([10, 12, 14, 16]), 1), tomorrow = advanceSimulation(state, 86400);
    expect(tomorrow.accounting.day).toBe('2026-04-26');
    for (const zone of tomorrow.soilModel!.zones) {
      const before = state.soilModel!.zones.find(item => item.zoneId === zone.zoneId)!;
      expect(zone.accounting.day).toBe('2026-04-26');
      expect(zone.accounting.appliedEtMm).toBeCloseTo(zone.calculation.etcMm, 10);
      expect(zone.rootZoneDepletionMm).toBeCloseTo(before.rootZoneDepletionMm + zone.calculation.etcMm, 7);
      expect(zone.accounting.observedRainMm).toBe(0); expect(zone.accounting.netDeliveryMm).toBe(0); expect(zone.accounting.deepPercolationMm).toBe(0);
    }
    expect(recalculateRecommendation(tomorrow).soilModel).toEqual(tomorrow.soilModel);
    expect(advanceSimulation(tomorrow, 60).soilModel!.zones.map(zone => zone.rootZoneDepletionMm)).toEqual(tomorrow.soilModel!.zones.map(zone => zone.rootZoneDepletionMm));
  });
  it('remains deterministic across step partitions and a persisted JSON roundtrip', () => {
    const started = applySimulationCommand(configured([30, 10, 35, 10]), 'start'), original = structuredClone(started);
    const whole = advanceSimulation(started, 3600);
    let split = JSON.parse(JSON.stringify(started)) as SimulationState;
    for (let minute = 0; minute < 60; minute++) split = advanceSimulation(split, 60);
    expect(split).toEqual(whole); expect(started).toEqual(original);
  });
});
