import { DEVICE_QUALITY_POLICY } from './device-policy';
import type { Datum, DeviceHealthProvider, DeviceReading, FlowProvider, IrrigationController, PressureProvider, RainfallProvider, SimulationState, SoilMoistureProvider, WeatherInput, WeatherProvider } from './types';

/** The simulated acquisition adapter used by the scenario engine. It emits the same normalized contracts as ingestion. */
export function simulatedDeviceReadings(state: SimulationState): DeviceReading[] {
  const result: DeviceReading[] = [];
  const add = (id: string, name: string, kind: DeviceReading['kind'], value: number | string, unit: string, extra: Partial<DeviceReading> = {}) => result.push({ id, name, kind, status: 'online', lastSeen: state.clock, datum: { value, unit, sourceId: id, measuredAt: state.clock, provenance: 'SIMULATED', quality: 'valid' }, ...extra });
  add('weather-01', 'Weather station', 'weather', (state.weather.temperatureMinC + state.weather.temperatureMaxC) / 2, '°C');
  add('rain-01', 'Rain gauge', 'rain', state.rain.observedMm, 'mm');
  for (const [depth, value] of [[20, state.soil.moisture20Pct], [40, state.soil.moisture40Pct], [60, state.soil.moisture60Pct]]) add(`soil-${depth}`, `Soil moisture · ${depth} cm`, 'soil', value, '%', { depthCm: depth });
  add('flow-main', 'Main flow meter', 'flow', state.zones.reduce((sum, zone) => sum + zone.flowM3h, 0), 'm³/h');
  add('pressure-main', 'Pressure sensor', 'pressure', Math.max(...state.zones.map(zone => zone.pressureBar)), 'bar');
  for (const zone of state.zones) add(`valve-${zone.id}`, `Valve ${zone.id}`, 'valve', zone.valveState, 'state', { zoneId: zone.id });
  add('pump-01', 'Pump controller', 'pump', state.control.pumpState, 'state');
  return result;
}
type SnapshotReader = () => SimulationState;
function observed<T>(value: T, source: DeviceReading, at: string): Datum<T> {
  if (!Number.isFinite(Date.parse(at))) throw new Error('Provider read time must be a valid ISO timestamp');
  const copy = structuredClone(source.datum);
  const age = (Date.parse(at) - Date.parse(copy.measuredAt)) / 1000;
  if (copy.quality === 'valid' && (!Number.isFinite(age) || age > DEVICE_QUALITY_POLICY.freshnessSeconds[source.kind] || age < -DEVICE_QUALITY_POLICY.maximumFutureSkewSeconds)) copy.quality = 'stale';
  return { ...copy, value: structuredClone(value) };
}
function findDevice(read: SnapshotReader, kind: DeviceReading['kind'], predicate: (device: DeviceReading) => boolean = () => true): DeviceReading { const device = read().devices.find(item => item.kind === kind && predicate(item)); if (!device) throw new Error(`The ${kind} provider has no bound observation`); return device; }
export class SimulatedWeatherProvider implements WeatherProvider {
  constructor(private readonly readSnapshot: SnapshotReader) {}
  async read(at: string): Promise<Datum<WeatherInput>> { return { ...observed(this.readSnapshot().weather, findDevice(this.readSnapshot, 'weather'), at), unit: 'FAO56 daily weather' }; }
}
export class SimulatedRainfallProvider implements RainfallProvider {
  constructor(private readonly readSnapshot: SnapshotReader) {}
  async read(at: string): Promise<Datum> { return observed(this.readSnapshot().rain.observedMm, findDevice(this.readSnapshot, 'rain'), at); }
}
export class SimulatedSoilMoistureProvider implements SoilMoistureProvider {
  constructor(private readonly readSnapshot: SnapshotReader) {}
  async read(depthCm: number, at: string): Promise<Datum> { const device = findDevice(this.readSnapshot, 'soil', item => item.depthCm === depthCm); if (typeof device.datum.value !== 'number') throw new Error('Soil observation must be numeric'); return observed(device.datum.value, device, at); }
}
export class SimulatedFlowProvider implements FlowProvider {
  constructor(private readonly readSnapshot: SnapshotReader) {}
  async read(zoneId: string, at: string): Promise<Datum> {
    const state = this.readSnapshot(), zone = state.zones.find(item => item.id === zoneId);
    if (!zone) throw new Error('Unknown irrigation zone');
    const device = findDevice(this.readSnapshot, 'flow', item => !item.zoneId || item.zoneId === zoneId);
    // Field meter can represent zone flow only when the sequential topology has no other open zone.
    const otherZoneActive = state.zones.some(item => item.id !== zoneId && item.flowM3h > 0);
    return observed(otherZoneActive ? 0 : typeof device.datum.value === 'number' ? device.datum.value : zone.flowM3h, device, at);
  }
}
export class SimulatedPressureProvider implements PressureProvider {
  constructor(private readonly readSnapshot: SnapshotReader) {}
  async read(zoneId: string, at: string): Promise<Datum> { const zone = this.readSnapshot().zones.find(item => item.id === zoneId); if (!zone) throw new Error('Unknown irrigation zone'); const device = findDevice(this.readSnapshot, 'pressure', item => !item.zoneId || item.zoneId === zoneId); return observed(zone.pressureBar, device, at); }
}
export class SimulatedDeviceHealthProvider implements DeviceHealthProvider {
  constructor(private readonly readSnapshot: SnapshotReader) {}
  async read(deviceId: string, at: string): Promise<Datum<string>> { const device = this.readSnapshot().devices.find(item => item.id === deviceId); if (!device) throw new Error('Unknown device'); return { ...observed(device.status, device, at), unit: 'status' }; }
}
export type ControllerCommand = Parameters<IrrigationController['command']>[0];
export type SimulatedControllerDispatch = (command: ControllerCommand) => Promise<SimulationState>;
/** Authority stays with the caller: browser preview and authenticated server provide distinct dispatch callbacks. */
export class SimulatedIrrigationController implements IrrigationController {
  constructor(private readonly readSnapshot: SnapshotReader, private readonly dispatch?: SimulatedControllerDispatch) {}
  async command(command: ControllerCommand): ReturnType<IrrigationController['command']> {
    const state = this.readSnapshot();
    const issued = Date.parse(command.issuedAt), deadline = Date.parse(command.deadline), now = Date.parse(state.clock);
    if (!command.id || !state.zones.some(zone => zone.id === command.zoneId) || !Number.isFinite(issued) || !Number.isFinite(deadline) || deadline < issued || now > deadline || issued > now) return { commandId: command.id, acknowledged: false, observedState: 'UNKNOWN' };
    if (!this.dispatch) return { commandId: command.id, acknowledged: false, observedState: 'UNKNOWN' };
    const next = await this.dispatch(command), zone = next.zones.find(item => item.id === command.zoneId)!;
    const observedState = zone.valveState === 'OPEN' ? 'OPEN' : zone.valveState === 'CLOSED' ? 'CLOSED' : 'UNKNOWN';
    const acknowledged = command.desiredState === 'OPEN' ? next.status === 'running' && (zone.valveState === 'OPENING' || zone.valveState === 'OPEN') : zone.valveState === 'CLOSED';
    return { commandId: command.id, acknowledged, observedState };
  }
}
export interface FieldProviders { weather: WeatherProvider; rainfall: RainfallProvider; soilMoisture: SoilMoistureProvider; flow: FlowProvider; pressure: PressureProvider; health: DeviceHealthProvider; controller: IrrigationController; }
export function createSimulatedProviders(readSnapshot: SnapshotReader, dispatch?: SimulatedControllerDispatch): FieldProviders { return { weather: new SimulatedWeatherProvider(readSnapshot), rainfall: new SimulatedRainfallProvider(readSnapshot), soilMoisture: new SimulatedSoilMoistureProvider(readSnapshot), flow: new SimulatedFlowProvider(readSnapshot), pressure: new SimulatedPressureProvider(readSnapshot), health: new SimulatedDeviceHealthProvider(readSnapshot), controller: new SimulatedIrrigationController(readSnapshot, dispatch) }; }
