import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { advanceSimulation, applySimulationCommand, createSimulation, SCENARIOS } from '@/domain';
import type { SimulationState } from '@/domain/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_FIELD_ID } from '@/lib/supabase/config';
import { HttpError } from './http';

export function requestHash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function stateBundle(state: SimulationState, action: string) {
  return {
    calculation: {
      engineVersion: state.calculation.engineVersion,
      parameterVersion: state.calculation.parameterVersion,
      inputs: { ...state.calculation.input, evaluationContext: { clock: state.clock, scenarioId: state.scenarioId, parameters: state.parameters, soil: state.soil, soilModel: state.soilModel, simulationConfiguration: state.simulationConfiguration, rain: state.rain, accounting: state.accounting, control: state.control, zones: state.zones, deviceInputs: state.devices } },
      outputs: { ...state.calculation, currentRecommendation: state.recommendation, currentRootZoneDepletionMm: state.soil.rootZoneDepletionMm },
    },
    alerts: state.alerts.map(alert => ({ ...alert, id: `${state.id}:${alert.id}` })),
    events: state.events.map(event => ({ ...event, id: `${state.id}:${event.id}` })),
    telemetry: state.devices.map(device => ({ deviceId: device.id, eventId: `${state.id}:${state.version}:${device.id}`, hash: requestHash(device), at: device.lastSeen, quality: device.datum.quality === 'missing' ? 'invalid' : device.datum.quality, measurements: device.datum })),
    observation: { weather: state.weather, observedRainMm: state.rain.observedMm, provenance: 'SIMULATED' },
    forecasts: [{ validAt: state.rain.windowEnd, rainfallMm: state.rain.forecastMm, probabilityPct: state.rain.probabilityPct, provenance: 'FORECAST' }],
    ...(state.control.runStartedAt ? { irrigation: { id: `${state.id}:${state.control.runStartedAt}`, status: state.status, startedAt: state.control.runStartedAt, zones: state.zones, targetVolumeLiters: state.control.runTargetLiters, deliveredVolumeLiters: state.control.deliveredVolumeLiters, provenance: 'SIMULATED' } } : {}),
    action,
  };
}

export interface StateMutation {
  action: 'run' | 'pause' | 'reset' | 'advance' | 'irrigation';
  expectedVersion: number;
  idempotencyKey: string;
  scenarioId?: string;
  seconds?: number;
  minutes?: number;
  speed?: number;
  command?: 'start' | 'pause' | 'resume' | 'stop';
}

export async function mutateSimulation(client: SupabaseClient, input: StateMutation) {
  const { data, error } = await client.from('product_state').select('state,revision').eq('field_id', DEMO_FIELD_ID).single();
  if (error) throw error;
  let state = data.state as SimulationState;
  if (!state || state.schemaVersion !== 1) throw new HttpError(503, 'The field has not been initialized.');
  if (input.action === 'reset') {
    const scenario = SCENARIOS.find(candidate => candidate.id === (input.scenarioId ?? 'rain-underperforms'));
    if (!scenario) throw new HttpError(400, 'Choose a supported simulation scenario.');
    state = createSimulation(scenario.id);
    state.id = randomUUID(); // Run identity, not physical noise. Input snapshots retain this identifier.
  } else if (input.action === 'advance') {
    state = advanceSimulation(state, input.seconds ?? (input.minutes ?? 1) * 60);
  } else if (input.action === 'irrigation') {
    if (!input.command) throw new HttpError(400, 'An irrigation command is required.');
    state = applySimulationCommand(state, input.command);
  }
  const simulationControl = input.action === 'run' ? { status: 'running', speed: input.speed ?? 1 }
    : input.action === 'pause' || input.action === 'reset' ? { status: 'paused', speed: input.speed ?? 1 } : undefined;
  const { data: committed, error: commitError } = await client.rpc('commit_simulation_state', {
    p_field_id: DEMO_FIELD_ID,
    p_expected_revision: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: requestHash(input),
    p_action: input.action === 'irrigation' ? `irrigation.${input.command}` : `simulation.${input.action}`,
    p_state: state,
    p_bundle: { ...stateBundle(state, input.action), ...(simulationControl ? { simulationControl } : {}) },
  });
  if (commitError) throw commitError;
  return { ...committed, ...(simulationControl ? { simulationControl } : {}) };
}
