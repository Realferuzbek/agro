import { describe, expect, it } from 'vitest';
import { advanceSimulation, applySimulationCommand, assessDataQuality, buildForecast, createSimulation, projectedNoRainDepletion, projectNoRainWindow, recalculateRecommendation, SCENARIOS, zoneRemainingMinutes } from '../../src/domain/simulation';
import type { SimulationState } from '../../src/domain/types';

describe('deterministic simulation and observation accounting', () => {
  it('starts at a frozen clock and preserves the independently verified golden recommendation', () => {
    const state = createSimulation();
    expect(state.clock).toBe('2026-04-25T13:00:00.000Z');
    expect(state.field.daysAfterPlanting).toBe(55);
    expect(state.recommendation.grossVolumeLiters).toBeCloseTo(60086.09502236643, 6);
    expect(state.recommendation.estimatedRuntimeMinutes).toBeCloseTo(348.36584197675984, 6);
    expect(state.devices).toHaveLength(12);
    expect(state.devices.every(device => device.datum.provenance === 'SIMULATED')).toBe(true);
    expect(state.simulationConfiguration?.version).toBe('simulation-demo-1.0.0');
    expect(state.simulationConfiguration?.cropStageDays).toEqual([20, 20, 30, 20]);
  });
  it('replays all twelve scenarios identically without mutating the input', () => {
    expect(SCENARIOS).toHaveLength(12);
    for (const scenario of SCENARIOS) {
      const state = createSimulation(scenario.id), original = structuredClone(state);
      expect(advanceSimulation(state, 120)).toEqual(advanceSimulation(state, 120));
      expect(state).toEqual(original);
    }
  });
  it('is independent of caller step partitioning including ramp integration and sensor lags', () => {
    const started = applySimulationCommand(createSimulation(), 'start');
    const bulk = advanceSimulation(started, 3600);
    let partitioned = started;
    for (let i = 0; i < 60; i++) partitioned = advanceSimulation(partitioned, 60);
    expect(partitioned).toEqual(bulk);
  });
  it('forecast changes and repeated recalculation never enter the observed water balance', () => {
    const state = createSimulation();
    state.rain.forecastMm = 100;
    const updated = recalculateRecommendation(recalculateRecommendation(state));
    expect(updated.soil).toEqual(state.soil);
    expect(updated.rain.observedMm).toBe(2);
    expect(updated.accounting).toEqual(state.accounting);
    const before = structuredClone(updated);
    expect(buildForecast(updated)).toHaveLength(7);
    expect(updated).toEqual(before);
  });
  it('checks the whole rain window rather than just current depletion', () => {
    const safe = createSimulation('rain-succeeds');
    expect(safe.recommendation.status).toBe('wait-for-rain');
    safe.rain.windowEnd = new Date(Date.parse(safe.clock) + 24 * 3600000).toISOString();
    expect(safe.soil.rootZoneDepletionMm).toBeLessThan(safe.soil.rawMm);
    expect(projectedNoRainDepletion(safe, safe.rain.windowEnd)).toBeGreaterThan(safe.soil.rawMm);
    expect(recalculateRecommendation(safe).recommendation.status).toBe('irrigate');
    const trajectory = projectNoRainWindow(safe, safe.rain.windowEnd);
    expect(trajectory.points.length).toBeGreaterThanOrEqual(25);
    expect(new Set(trajectory.points.map(point => point.rawMm)).size).toBeGreaterThan(1);
    expect(trajectory.safe).toBe(false);
  });
  it('reconciles successful and failed forecasts only after the window ends', () => {
    const rain = createSimulation('rain-succeeds');
    const received = advanceSimulation(rain, 1800);
    expect(received.rain.observedMm).toBeCloseTo(7, 10);
    expect(received.soil.rootZoneDepletionMm).toBeCloseTo(rain.soil.rootZoneDepletionMm - 7, 9);
    expect(received.rain.reconciled).toBe(true);
    expect(received.surfaceWetting).toBe('rain');
    const fail = createSimulation('rain-fails');
    expect(advanceSimulation(fail, 1799).alerts.some(alert => alert.type === 'RAIN_UNDER_FORECAST')).toBe(false);
    const after = advanceSimulation(fail, 1800);
    expect(after.rain.observedMm).toBe(0);
    expect(after.alerts.some(alert => alert.type === 'RAIN_UNDER_FORECAST')).toBe(true);
    expect(after.soil.rootZoneDepletionMm).toBe(fail.soil.rootZoneDepletionMm);
  });
  it('projects only unobserved rainfall and unspent surface evaporation in an open window', () => {
    const initial = createSimulation('rain-succeeds');
    const partial = advanceSimulation(initial, 600), partialForecast = buildForecast(partial)[0];
    expect(partialForecast.rainfallMm).toBe(7);
    expect(partialForecast.remainingRainfallMm).toBeCloseTo(7 - partial.rain.observedMm, 10);
    expect(partialForecast.projectedDepletionMm).toBeCloseTo(initial.soil.rootZoneDepletionMm - 7, 9);
    const received = advanceSimulation(initial, 1200), forecast = buildForecast(received)[0];
    expect(received.rain.reconciled).toBe(false);
    expect(forecast.remainingRainfallMm).toBeCloseTo(0, 10);
    expect(forecast.projectedDepletionMm).toBeCloseTo(received.soil.rootZoneDepletionMm, 10);
    expect(forecast.projectedSurfaceDepletionMm).toBeCloseTo(received.soil.surfaceDepletionMm, 10);
    expect(buildForecast(createSimulation())[0].projectedSurfaceDepletionMm).toBeCloseTo(createSimulation().soil.surfaceDepletionMm, 10);
  });
  it('blocks missing, stale, conflicting, and outlier critical channels independently of display status', () => {
    for (const damage of ['missing', 'stale', 'conflict', 'outlier'] as const) {
      const state = createSimulation();
      if (damage === 'missing') state.devices = state.devices.filter(device => device.kind !== 'flow');
      else { const flow = state.devices.find(device => device.kind === 'flow')!; if (damage === 'stale') flow.datum.measuredAt = new Date(Date.parse(state.clock) - 31000).toISOString(); else flow.datum.quality = damage; }
      expect(assessDataQuality(state).status).toBe('Degraded');
      expect(recalculateRecommendation(state).recommendation.status).toBe('blocked');
      expect(applySimulationCommand(state, 'start').status).toBe('idle');
    }
    const optional = createSimulation(); optional.devices = optional.devices.filter(device => device.depthCm !== 40);
    expect(assessDataQuality(optional).status).toBe('Moderate');
    expect(applySimulationCommand(optional, 'start').status).toBe('running');
    const conflict = createSimulation(); conflict.devices.find(device => device.kind === 'flow')!.datum.value = 12;
    expect(assessDataQuality(conflict).status).toBe('Degraded');
    expect(applySimulationCommand(conflict, 'start').status).toBe('idle');
  });
  it('pauses active delivery before integrating another sample when a critical channel disappears', () => {
    const running = advanceSimulation(applySimulationCommand(createSimulation(), 'start'), 120);
    running.devices = running.devices.filter(device => device.kind !== 'flow');
    const paused = advanceSimulation(running, 1);
    expect(paused.status).toBe('paused');
    expect(paused.control.deliveredVolumeLiters).toBe(running.control.deliveredVolumeLiters);
  });
  it('keeps unique deterministic event IDs after external UUID events and legacy state', () => {
    const legacy = createSimulation(); delete legacy.eventSequence;
    legacy.events.push({ id: 'measured:rain-01:b5583d3c-56b5-426e-b201-f50786658119', at: legacy.clock, type: 'measured', message: 'External observation' });
    const first = applySimulationCommand(legacy, 'stop'), second = applySimulationCommand(first, 'stop');
    expect(second.events.at(-1)!.id).not.toContain('NaN');
    expect(new Set(second.events.map(event => event.id)).size).toBe(second.events.length);
    expect(applySimulationCommand(legacy, 'stop')).toEqual(first);
  });
  it('derives zone remaining time from undelivered volume and available flow', () => {
    const zone = createSimulation().zones[0];
    const initial = zoneRemainingMinutes(zone);
    zone.deliveredVolumeLiters = zone.targetVolumeLiters / 2;
    expect(zoneRemainingMinutes(zone)).toBeCloseTo(initial / 2, 10);
    zone.flowM3h = 2 * zone.nominalFlowM3h;
    expect(zoneRemainingMinutes(zone)).toBeCloseTo(initial / 4, 10);
    zone.deliveredVolumeLiters = zone.targetVolumeLiters;
    expect(zoneRemainingMinutes(zone)).toBe(0);
  });
  it('groups rain events using the configured dry interval', () => {
    const state = advanceSimulation(createSimulation('rain-succeeds'), 1200);
    expect(state.rain.eventOpen).toBe(true);
    expect(advanceSimulation(state, 1799).rain.eventOpen).toBe(true);
    expect(advanceSimulation(state, 1800).rain.eventOpen).toBe(false);
  });
  it('integrates actual delivery once and terminates on volume, not elapsed time', () => {
    const started = applySimulationCommand(createSimulation(), 'start');
    const ramped = advanceSimulation(started, 50);
    // 20-second pressure ramp, followed by 30 seconds of linear flow ramp.
    expect(ramped.control.deliveredVolumeLiters).toBeCloseTo(10.5 * 1000 / 3600 * 15, 9);
    const done = advanceSimulation(started, 22000);
    expect(done.status).toBe('completed');
    expect(done.zones.every(zone => zone.state === 'completed' && zone.valveState === 'CLOSED')).toBe(true);
    expect(done.control.deliveredVolumeLiters).toBeCloseTo(started.control.runTargetLiters, 6);
    expect(done.zones.reduce((sum, zone) => sum + zone.deliveredVolumeLiters, 0)).toBeCloseTo(done.control.deliveredVolumeLiters, 6);
    expect(done.soil.rootZoneDepletionMm).toBeCloseTo(started.soil.rootZoneDepletionMm - done.control.deliveredVolumeLiters * .9 / 10000, 7);
    expect(done.accounting.netDeliveryMm).toBeCloseTo(done.control.deliveredVolumeLiters * .9 / 10000, 8);
  });
  it('pauses, resumes, and stops without erasing delivery or applying it twice', () => {
    let state = advanceSimulation(applySimulationCommand(createSimulation(), 'start'), 120);
    const delivered = state.control.deliveredVolumeLiters, depletion = state.soil.rootZoneDepletionMm;
    state = advanceSimulation(applySimulationCommand(state, 'pause'), 300);
    expect(state.control.deliveredVolumeLiters).toBe(delivered);
    expect(state.soil.rootZoneDepletionMm).toBe(depletion);
    state = advanceSimulation(applySimulationCommand(state, 'resume'), 120);
    expect(state.control.deliveredVolumeLiters).toBeGreaterThan(delivered);
    state = applySimulationCommand(state, 'stop');
    expect(advanceSimulation(state, 100).control.deliveredVolumeLiters).toBe(state.control.deliveredVolumeLiters);
  });
  it('permits a fresh irrigation after a completed run when the next day needs water', () => {
    const done = advanceSimulation(applySimulationCommand(createSimulation(), 'start'), 22000);
    const tomorrow = advanceSimulation(done, 86400);
    expect(tomorrow.recommendation.status).toBe('irrigate');
    const restarted = applySimulationCommand(tomorrow, 'start');
    expect(restarted.status).toBe('running');
    expect(restarted.zones.every(zone => zone.deliveredVolumeLiters === 0)).toBe(true);
    expect(restarted.control.runStartedAt).toBe(tomorrow.clock);
    expect(restarted.soil.rootZoneDepletionMm).toBe(tomorrow.soil.rootZoneDepletionMm);
  });
  it('does not charge a second daily ET budget in today’s forecast', () => {
    const state = createSimulation();
    expect(buildForecast(state)[0].projectedDepletionMm).toBeCloseTo(state.soil.rootZoneDepletionMm, 10);
  });
  it('pauses on a storm and cancels the remainder when observed rain supplies the need', () => {
    const started = applySimulationCommand(createSimulation('unexpected-storm'), 'start');
    const storm = advanceSimulation(started, 1200);
    expect(storm.status).toBe('completed');
    expect(storm.control.deliveredVolumeLiters).toBeLessThan(started.control.runTargetLiters);
    expect(storm.rain.scenarioReceivedMm).toBeCloseTo(12, 9);
    expect(storm.rain.observedMm).toBeCloseTo(12, 9);
    expect(storm.soil.rootZoneDepletionMm).toBeLessThan(storm.recommendation.targetDepletionMm);
  });
  it.each(['high-flow', 'low-flow', 'low-pressure', 'valve-failure', 'telemetry-conflict'] as const)('blocks unsafe automatic control for %s', scenario => {
    const state = advanceSimulation(applySimulationCommand(createSimulation(scenario), 'start'), 120);
    expect(state.status).toBe('paused');
    expect(state.recommendation.confidence).toBe('Degraded');
    expect(state.zones.every(zone => zone.flowM3h === 0)).toBe(true);
    const resumed = applySimulationCommand(state, 'resume');
    expect(resumed.status).toBe('paused');
  });
  it.each(['sensor-offline', 'sensor-outlier'] as const)('uses model fallback for %s without contaminating modeled soil', scenario => {
    const healthy = advanceSimulation(createSimulation(), 120), degraded = advanceSimulation(createSimulation(scenario), 120);
    expect(degraded.recommendation.confidence).toBe('Moderate');
    expect(degraded.soil).toEqual(healthy.soil);
    expect(applySimulationCommand(degraded, 'start').status).toBe('running');
  });
  it('posts a new daily budget exactly once across midnight and repeated calls', () => {
    const initial = createSimulation(), nextDay = advanceSimulation(initial, 86400);
    expect(nextDay.accounting.day).toBe('2026-04-26');
    expect(nextDay.accounting.appliedEtMm).toBeCloseTo(nextDay.calculation.etcMm, 10);
    expect(nextDay.soil.rootZoneDepletionMm).toBeCloseTo(initial.soil.rootZoneDepletionMm + nextDay.calculation.etcMm, 7);
    expect(recalculateRecommendation(nextDay).soil).toEqual(nextDay.soil);
    expect(advanceSimulation(nextDay, 0)).toEqual(nextDay);
  });
  it('rejects malformed step sizes and input schema versions', () => {
    for (const seconds of [-1, .1, NaN, Infinity, 86401]) expect(() => advanceSimulation(createSimulation(), seconds)).toThrow();
    expect(() => advanceSimulation({ ...createSimulation(), schemaVersion: 2 } as unknown as SimulationState, 1)).toThrow();
  });
});
