import { describe, expect, it } from 'vitest';
import { actualVaporPressure, adjustBasalCoefficient, calculateAgronomy, calculateEto, calculateGolden, cropStage, dayOfYear, DEFAULT_PARAMETERS, depthToLiters, evaporationCoefficients, GOLDEN_WEATHER, rootWaterBalance, runtimeMinutes, saturationVaporPressure, stressCoefficient, surfaceWaterBalance, totalAvailableWater } from '../../src/domain/agronomy';

describe('FAO-56 independently derived scientific fixtures', () => {
  it('reproduces the complete Tashkent golden chain without rounded intermediate inputs', () => {
    const g = calculateGolden();
    expect(g.etoMm).toBeCloseTo(5.009468525935759, 10);
    expect(g.kcmax).toBeCloseTo(1.2296176254105604, 10);
    expect(g.tewMm).toBe(23);
    expect(g.kr).toBeCloseTo(3 / 7, 12);
    expect(g.ke).toBeCloseTo(.05555041089024013, 12);
    expect(g.ks).toBe(1);
    expect(g.etcMm).toBeCloseTo(5.788693413486792, 10);
    expect(g.tawMm).toBeCloseTo(80, 12);
    expect(g.rawMm).toBeCloseTo(25.476181076842263, 10);
    expect(g.rootZoneDepletionMm).toBeCloseTo(25.78869341348679, 10);
    expect(g.targetDepletionMm).toBeCloseTo(20.38094486147381, 10);
    expect(g.netDepthMm).toBeCloseTo(5.407748552012979, 10);
    expect(g.grossDepthMm).toBeCloseTo(6.008609502236643, 10);
    expect(g.grossVolumeLiters).toBeCloseTo(60086.09502236643, 6);
    expect(runtimeMinutes(g.grossVolumeLiters / 4, 10.5)).toBeCloseTo(85.83727860338061, 8);
  });
  it('matches FAO examples 3 and 5 for vapor pressures', () => {
    expect(saturationVaporPressure(24.5)).toBeCloseTo(3.075, 3);
    expect(saturationVaporPressure(15)).toBeCloseTo(1.705, 3);
    expect(actualVaporPressure(18, 25, 54, 82)).toBeCloseTo(1.70, 2);
  });
  it('matches FAO example 31 falling-rate evaporation', () => {
    const p = { ...DEFAULT_PARAMETERS, fieldCapacity: .27, wiltingPoint: .14, kcb: .15, cropHeightM: .1, wettedFraction: 1 };
    const w = { ...GOLDEN_WEATHER, windSpeedMps: 2, relativeHumidityMinPct: 45 };
    const result = evaporationCoefficients(p, w, 13.98);
    expect(result.tewMm).toBeCloseTo(20, 10);
    expect(result.kr).toBeCloseTo(.54727272727, 10);
    expect(result.ke).toBeCloseTo(.57463636363, 10);
  });
  it('handles stage boundaries continuously for demo and reference seasons', () => {
    expect(cropStage(0).kcb).toBe(.15);
    expect(cropStage(20).kcb).toBe(.15);
    expect(cropStage(30).kcb).toBeCloseTo(.625);
    expect(cropStage(40).stage).toBe('Mid-season');
    expect(cropStage(80).kcb).toBeCloseTo(.875);
    expect(cropStage(90).kcb).toBeCloseTo(.65);
    expect(cropStage(55, [25, 30, 45, 30]).stage).toBe('Mid-season');
    expect(adjustBasalCoefficient(1.1, 2, 45, .6)).toBe(1.1);
  });
  it('clamps stress, models drainage explicitly and conserves water', () => {
    expect(stressCoefficient(20, 80, 28)).toBe(1);
    expect(stressCoefficient(80, 80, 28)).toBe(0);
    expect(stressCoefficient(90, 80, 28)).toBe(0);
    const balance = rootWaterBalance(5, 20, 2, 3, 4, 80);
    expect(balance).toEqual({ depletionMm: 0, deepPercolationMm: 12, unmetEtMm: 0 });
    expect(balance.depletionMm).toBe(5 - (20 - 2) - 3 + 4 + balance.deepPercolationMm);
    expect(rootWaterBalance(79, 0, 0, 0, 5, 80).unmetEtMm).toBe(4);
    expect(surfaceWaterBalance(3, 10, 0, 0, 1, .4, .2, 23)).toEqual({ depletionMm: 0, drainageMm: 2 });
  });
  it('limits Ke by exposed/wetted area and distinguishes rain from drip wetting', () => {
    const parameters = { ...DEFAULT_PARAMETERS, kcb: .4, cropHeightM: .3 };
    const drip = evaporationCoefficients(parameters, GOLDEN_WEATHER, 0, 'drip');
    const rain = evaporationCoefficients(parameters, GOLDEN_WEATHER, 0, 'rain');
    expect(drip.ke).toBeLessThan(rain.ke);
    expect(drip.ke).toBeLessThanOrEqual(drip.exposedWettedFraction * drip.kcmax);
    expect(rain.ke).toBeLessThanOrEqual(rain.exposedWettedFraction * rain.kcmax);
    expect(evaporationCoefficients(parameters, GOLDEN_WEATHER, 23).ke).toBe(0);
  });
  it('applies Ks to transpiration while preserving the independent evaporation term', () => {
    const result = calculateAgronomy({ ...calculateGolden().input, rootZoneDepletionMm: 40, observedRainMm: 0 });
    expect(result.ks).toBeGreaterThan(0);
    expect(result.ks).toBeLessThan(1);
    expect(result.etcMm).toBeCloseTo((result.ks * result.kcb + result.ke) * result.etoMm, 10);
    expect(result.etcMm).not.toBeCloseTo(result.ks * (result.kcb + result.ke) * result.etoMm, 5);
    expect(result.adjustedDepletionFraction).toBeGreaterThanOrEqual(.1);
    expect(result.adjustedDepletionFraction).toBeLessThanOrEqual(.8);
    expect(result.rawMm).toBeLessThan(result.tawMm);
  });
  it('respects units and rejects invalid scientific inputs', () => {
    expect(depthToLiters(1, 10000)).toBe(10000);
    expect(totalAvailableWater(.30, .14, .5)).toBeCloseTo(80);
    expect(() => runtimeMinutes(100, 0)).toThrow();
    expect(() => depthToLiters(-1, 100)).toThrow();
    expect(() => actualVaporPressure(14, 28, 80, 35)).toThrow();
    expect(() => calculateEto({ ...GOLDEN_WEATHER, solarRadiationMjM2Day: -1 })).toThrow();
    expect(() => calculateAgronomy({ ...calculateGolden().input, parameters: { ...DEFAULT_PARAMETERS, applicationEfficiency: 0 } })).toThrow();
    expect(() => dayOfYear('2026-02-30')).toThrow();
    expect(dayOfYear('2024-12-31')).toBe(366);
    expect(Number.isFinite(calculateEto({ ...GOLDEN_WEATHER, temperatureMinC: -5, temperatureMaxC: 5 }).etoMm)).toBe(true);
  });
  it('is deterministic and does not mutate input snapshots', () => {
    const input = calculateGolden().input, before = structuredClone(input);
    expect(calculateAgronomy(input)).toEqual(calculateAgronomy(input));
    expect(input).toEqual(before);
  });
});
