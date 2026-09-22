import { describe, expect, it } from 'vitest';
import { advanceSimulation, applySimulationCommand, createSimulation } from '../../src/domain/simulation';
import { createSimulatedProviders } from '../../src/domain/providers';

describe('replaceable simulated provider adapters', () => {
  it('provides normalized observations through every source interface', async () => {
    const state = createSimulation(), providers = createSimulatedProviders(() => state);
    const weather = await providers.weather.read(state.clock);
    expect(weather.value).toEqual(state.weather);
    expect(weather.provenance).toBe('SIMULATED');
    weather.value.temperatureMaxC = 999;
    expect(state.weather.temperatureMaxC).toBe(28);
    expect((await providers.rainfall.read(state.clock)).value).toBe(2);
    expect((await providers.soilMoisture.read(20, state.clock)).value).toBe(state.soil.moisture20Pct);
    expect((await providers.flow.read('A', state.clock)).unit).toBe('m³/h');
    expect((await providers.pressure.read('A', state.clock)).value).toBe(0);
    expect((await providers.health.read('pump-01', state.clock)).value).toBe('online');
    await expect(providers.flow.read('unknown', state.clock)).rejects.toThrow();
    await expect(providers.soilMoisture.read(90, state.clock)).rejects.toThrow();
  });
  it('preserves outlier quality and reports stale samples instead of pretending to measure again', async () => {
    const state = advanceSimulation(createSimulation('sensor-outlier'), 120), providers = createSimulatedProviders(() => state);
    expect((await providers.soilMoisture.read(20, state.clock)).quality).toBe('outlier');
    const later = new Date(Date.parse(state.clock) + 60000).toISOString();
    const flow = await providers.flow.read('A', later);
    expect(flow.quality).toBe('stale');
    expect(flow.measuredAt).toBe(state.clock);
  });
  it('keeps command dispatch with the caller and distinguishes acknowledgement from observed opening', async () => {
    let state = createSimulation();
    let dispatches = 0;
    const providers = createSimulatedProviders(() => state, async command => { dispatches++; state = applySimulationCommand(state, command.desiredState === 'OPEN' ? 'start' : 'pause'); return state; });
    const open = { id: 'command-01', zoneId: 'A', desiredState: 'OPEN' as const, issuedAt: state.clock, deadline: new Date(Date.parse(state.clock) + 60000).toISOString() };
    expect(await providers.controller.command(open)).toEqual({ commandId: 'command-01', acknowledged: true, observedState: 'UNKNOWN' });
    state = advanceSimulation(state, 50);
    expect(state.zones[0].valveState).toBe('OPEN');
    const closed = await providers.controller.command({ ...open, id: 'command-02', desiredState: 'CLOSED', issuedAt: state.clock });
    expect(closed).toEqual({ commandId: 'command-02', acknowledged: true, observedState: 'CLOSED' });
    expect(await providers.controller.command({ ...open, deadline: '2026-04-24T00:00:00Z' })).toMatchObject({ acknowledged: false });
    expect(dispatches).toBe(2);
    expect(await createSimulatedProviders(() => state).controller.command({ ...open, issuedAt: state.clock })).toMatchObject({ acknowledged: false });
  });
});
